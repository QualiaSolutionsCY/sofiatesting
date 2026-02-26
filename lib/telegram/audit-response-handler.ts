import "server-only";

import { createClient } from "@supabase/supabase-js";
import { logger } from "../logger";
import type { TelegramMessage } from "./types";

/**
 * Audit Alert Response Handler (Next.js / Node.js)
 *
 * Detects when Vasya replies to a missing-caller alert in the Zypress Others
 * group and updates the corresponding caller_alerts record.
 *
 * This mirrors the Deno telegram-response-tracker.ts but uses Node.js-compatible
 * Supabase client (process.env, not Deno.env).
 *
 * Phase 12, Plan 03 | Phase 13, Plan 05
 */

const log = logger.telegram.child("audit-response");

// ---------------------------------------------------------------------------
// Config — set to Vasya's actual Telegram user ID when known
// ---------------------------------------------------------------------------

const VASYA_TELEGRAM_USER_ID = 0; // TODO: Replace with actual Vasya's Telegram user ID

// ---------------------------------------------------------------------------
// Response Patterns
// ---------------------------------------------------------------------------

const FOUND_PATTERNS =
  /\b(found|yes|done|ok|handled|resolved|attended|got\s?it)\b/i;
const NOT_FOUND_PATTERNS =
  /\b(not\s+found|no|can'?t\s+find|cannot\s+find|nothing|nobody)\b/i;

/**
 * Matches phone numbers: +357 99 123 456, 0035799123456, 99123456, etc.
 */
const PHONE_PATTERN = /(?:\+|00)?[\d][\d\s\-]{5,17}[\d]/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResponseType = "found" | "not_found" | "alternative_number" | "unknown";

interface ParsedResponse {
  type: ResponseType;
  alternativeNumber?: string;
  rawText: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse response text into a categorised result.
 * Priority: phone number > found > not_found > unknown.
 */
function parseResponse(text: string): ParsedResponse {
  const trimmed = text.trim();

  // 1. Check for phone number first
  const phoneMatch = trimmed.match(PHONE_PATTERN);
  if (phoneMatch) {
    const alternativeNumber = phoneMatch[0].replace(/[\s\-]/g, "");
    const digitCount = alternativeNumber.replace(/\D/g, "").length;
    if (digitCount >= 7 && digitCount <= 15) {
      return { type: "alternative_number", alternativeNumber, rawText: trimmed };
    }
  }

  // 2. Positive / found
  if (FOUND_PATTERNS.test(trimmed)) {
    return { type: "found", rawText: trimmed };
  }

  // 3. Negative / not found
  if (NOT_FOUND_PATTERNS.test(trimmed)) {
    return { type: "not_found", rawText: trimmed };
  }

  // 4. Unknown
  return { type: "unknown", rawText: trimmed };
}

// ---------------------------------------------------------------------------
// Supabase Client (lazy singleton)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

/**
 * Check if an incoming Telegram group message is a reply to a known audit alert
 * from Vasya, and if so, parse the response and update the alert.
 *
 * Returns `true` if the message was handled as an alert response.
 * Returns `false` if the message should continue to normal lead routing.
 */
export async function handleAuditAlertResponse(
  message: TelegramMessage,
): Promise<boolean> {
  // Gate: skip if Vasya's user ID is not configured
  if (VASYA_TELEGRAM_USER_ID === 0) {
    return false;
  }

  // Must be a reply to another message
  if (!message.reply_to_message) {
    return false;
  }

  // Must have a sender
  if (!message.from) {
    return false;
  }

  // Must be from Vasya
  if (message.from.id !== VASYA_TELEGRAM_USER_ID) {
    return false;
  }

  // Must have text
  const text = message.text || message.caption;
  if (!text) {
    return false;
  }

  // Look up the alert by the message being replied to
  try {
    const supabase = getSupabase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped table
    const { data: alert, error } = await (supabase as any)
      .from("caller_alerts")
      .select("*")
      .eq("alert_message_id", String(message.reply_to_message.message_id))
      .eq("chat_id", message.chat.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      log.error("Error looking up alert by reply message ID", error);
      return false;
    }

    if (!alert) {
      // Not a reply to a known alert
      return false;
    }

    // Parse response
    const parsed = parseResponse(text);

    // Build update payload
    const now = new Date().toISOString();
    const updateFields: Record<string, unknown> = {
      updated_at: now,
    };

    switch (parsed.type) {
      case "found":
        updateFields.status = "resolved";
        updateFields.resolution_type = "found_in_telegram";
        updateFields.resolution_note = parsed.rawText;
        updateFields.resolved_at = now;
        break;
      case "not_found":
        // Keep as 'alerted' for follow-up (NOT 'pending' which means pre-alert in caller_alerts)
        updateFields.status = "alerted";
        updateFields.resolution_note = parsed.rawText;
        break;
      case "alternative_number":
        updateFields.status = "resolved";
        updateFields.resolution_type = "alternative_phone";
        updateFields.alternative_phone = parsed.alternativeNumber;
        updateFields.resolution_note = parsed.rawText;
        updateFields.resolved_at = now;
        break;
      case "unknown":
        // Leave status unchanged -- store raw text for manual review
        updateFields.resolution_note = parsed.rawText;
        break;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped table
    const { error: updateError } = await (supabase as any)
      .from("caller_alerts")
      .update(updateFields)
      .eq("id", alert.id);

    if (updateError) {
      log.error("Error updating alert response", updateError, {
        alertId: alert.id,
      });
      return false;
    }

    log.info("Audit alert response processed", {
      alertId: alert.id,
      responseType: parsed.type,
      phone: alert.caller_phone,
    });

    return true;
  } catch (error) {
    log.error("Exception handling audit alert response", error);
    return false;
  }
}
