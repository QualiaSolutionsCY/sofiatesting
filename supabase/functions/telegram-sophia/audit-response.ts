/**
 * Audit Alert Response Handler (Deno / telegram-sophia edge function)
 *
 * Detects when Vasia replies to a missing-caller alert in the Zyprus Others
 * group and resolves the corresponding caller_alerts record.
 *
 * This is the live-path Deno port of lib/telegram/audit-response-handler.ts
 * (which only ran in the legacy Next.js webhook). The live Telegram webhook
 * delivers to THIS edge function, so resolution must live here or it never runs.
 *
 * Wired into lead-router.ts → handleGroupMessage BEFORE the lead check: it
 * returns true ONLY when a message is a Vasia reply to a known alert, otherwise
 * false so normal lead routing is completely unaffected.
 *
 * Phase 12/13 (response tracking) — ported to live edge path 2026-06-25.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Vasia Iakovou — the receptionist who posts/handles leads in the groups.
// Resolved from telegram_group_messages (sender_telegram_id, 290 msgs across all
// groups). Overridable via secret without redeploy.
const VASIA_TELEGRAM_USER_ID = Number(
  Deno.env.get("VASIA_TELEGRAM_USER_ID") ?? "5527210755"
);

// ---------------------------------------------------------------------------
// Response patterns (mirror of the Next.js handler)
// ---------------------------------------------------------------------------

const FOUND_PATTERNS =
  /\b(found|yes|done|ok|handled|resolved|attended|got\s?it)\b/i;
const NOT_FOUND_PATTERNS =
  /\b(not\s+found|no|can'?t\s+find|cannot\s+find|nothing|nobody)\b/i;
const PHONE_PATTERN = /(?:\+|00)?[\d][\d\s-]{5,17}[\d]/;

type ResponseType = "found" | "not_found" | "alternative_number" | "unknown";

interface ParsedResponse {
  type: ResponseType;
  alternativeNumber?: string;
  rawText: string;
}

/** Minimal shape of the fields we read off an incoming Telegram message. */
interface IncomingMessage {
  message_id: number;
  text?: string;
  caption?: string;
  from?: { id: number };
  chat: { id: number };
  reply_to_message?: { message_id: number };
}

/**
 * Parse a reply into a categorised result.
 * Priority: phone number > found > not_found > unknown.
 */
function parseResponse(text: string): ParsedResponse {
  const trimmed = text.trim();

  const phoneMatch = trimmed.match(PHONE_PATTERN);
  if (phoneMatch) {
    const alternativeNumber = phoneMatch[0].replace(/[\s-]/g, "");
    const digitCount = alternativeNumber.replace(/\D/g, "").length;
    if (digitCount >= 7 && digitCount <= 15) {
      return { type: "alternative_number", alternativeNumber, rawText: trimmed };
    }
  }

  if (FOUND_PATTERNS.test(trimmed)) return { type: "found", rawText: trimmed };
  if (NOT_FOUND_PATTERNS.test(trimmed)) {
    return { type: "not_found", rawText: trimmed };
  }
  return { type: "unknown", rawText: trimmed };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * If `message` is Vasia replying to a known missing-caller alert, resolve the
 * caller_alerts row and return true. Returns false for everything else so the
 * caller falls through to normal lead routing.
 *
 * Never sends a Telegram message — it only updates the DB record.
 */
export async function handleAuditAlertResponse(
  message: IncomingMessage
): Promise<boolean> {
  // Gate: disabled if Vasia's ID is unset (0).
  if (!VASIA_TELEGRAM_USER_ID) return false;

  // Must be a reply, from Vasia, with text.
  if (!message.reply_to_message) return false;
  if (!message.from || message.from.id !== VASIA_TELEGRAM_USER_ID) return false;

  const text = message.text || message.caption;
  if (!text) return false;

  try {
    // Find the alert whose Telegram message is the one being replied to.
    const { data: alert, error } = await supabase
      .from("caller_alerts")
      .select("*")
      .eq("alert_message_id", String(message.reply_to_message.message_id))
      .eq("chat_id", message.chat.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[AuditResponse] alert lookup failed:", error.message);
      return false;
    }
    if (!alert) return false; // reply, but not to a known alert → fall through

    const parsed = parseResponse(text);
    const now = new Date().toISOString();
    const updateFields: Record<string, unknown> = { updated_at: now };

    switch (parsed.type) {
      case "found":
        updateFields.status = "resolved";
        updateFields.resolution_type = "found_in_telegram";
        updateFields.resolution_note = parsed.rawText;
        updateFields.resolved_at = now;
        break;
      case "alternative_number":
        updateFields.status = "resolved";
        updateFields.resolution_type = "alternative_phone";
        updateFields.alternative_phone = parsed.alternativeNumber;
        updateFields.resolution_note = parsed.rawText;
        updateFields.resolved_at = now;
        break;
      case "not_found":
        // Keep 'alerted' for follow-up; record the note.
        updateFields.status = "alerted";
        updateFields.resolution_note = parsed.rawText;
        break;
      case "unknown":
        // Unclear reply — store text for manual review, leave status.
        updateFields.resolution_note = parsed.rawText;
        break;
    }

    const { error: updateError } = await supabase
      .from("caller_alerts")
      .update(updateFields)
      .eq("id", (alert as { id: string }).id);

    if (updateError) {
      console.error("[AuditResponse] alert update failed:", updateError.message);
      return false;
    }

    console.log(
      `[AuditResponse] resolved alert ${(alert as { id: string }).id} type=${parsed.type}`
    );
    return true;
  } catch (err) {
    console.error(
      "[AuditResponse] exception:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
