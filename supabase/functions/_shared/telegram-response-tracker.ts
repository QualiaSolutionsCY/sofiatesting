/**
 * Telegram Alert Response Tracker
 *
 * Parses Vasya's replies to missing-caller alerts in the "Zypress Others" group
 * and updates the corresponding audit_alerts record. This closes the feedback loop:
 *   alert sent -> Vasya replies -> status updated.
 *
 * Phase 12, Plan 03
 */

import { getSupabaseAdmin } from "./db.ts";
import { VASYA_TELEGRAM_USER_ID } from "./telegram-search.ts";
import type { CallerAlert } from "./call-tracking.ts";
import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResponseType =
  | "found"
  | "not_found"
  | "alternative_number"
  | "unknown";

export interface ParsedResponse {
  type: ResponseType;
  alternativeNumber?: string;
  rawText: string;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const FOUND_PATTERNS =
  /\b(found|yes|done|ok|handled|resolved|attended|got\s?it)\b/i;
const NOT_FOUND_PATTERNS =
  /\b(not\s+found|no|can'?t\s+find|cannot\s+find|nothing|nobody)\b/i;

/**
 * Matches Cyprus and international phone numbers:
 *   +357 99 123 456, 0035799123456, 99123456, +44 1234 567890
 * Captures 7-15 digits (ignoring spaces/dashes).
 */
const PHONE_PATTERN =
  /(?:\+|00)?[\d][\d\s\-]{5,17}[\d]/;

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse Vasya's reply text to determine the response type.
 *
 * Priority:
 *   1. Phone number present -> alternative_number
 *   2. "found" / positive keyword -> found
 *   3. "not found" / negative keyword -> not_found
 *   4. None of the above -> unknown
 */
export function parseVasyaResponse(messageText: string): ParsedResponse {
  const trimmed = messageText.trim();

  // 1. Check for a phone number first (highest priority)
  const phoneMatch = trimmed.match(PHONE_PATTERN);
  if (phoneMatch) {
    // Extract the matched number and strip spaces/dashes
    const alternativeNumber = phoneMatch[0].replace(/[\s\-]/g, "");
    // Only treat as phone if it has enough digits
    const digitCount = alternativeNumber.replace(/\D/g, "").length;
    if (digitCount >= 7 && digitCount <= 15) {
      return {
        type: "alternative_number",
        alternativeNumber,
        rawText: trimmed,
      };
    }
  }

  // 2. Check for positive / "found" patterns
  if (FOUND_PATTERNS.test(trimmed)) {
    return { type: "found", rawText: trimmed };
  }

  // 3. Check for negative / "not found" patterns
  if (NOT_FOUND_PATTERNS.test(trimmed)) {
    return { type: "not_found", rawText: trimmed };
  }

  // 4. Nothing matched
  return { type: "unknown", rawText: trimmed };
}

// ---------------------------------------------------------------------------
// Alert Lookup
// ---------------------------------------------------------------------------

/**
 * Find a caller alert by the Telegram message ID it was sent as.
 * Used to match a reply-to-message back to the original alert.
 */
export async function findAlertByReplyMessageId(
  replyToMessageId: number,
  chatId: number,
): Promise<CallerAlert | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("caller_alerts")
      .select("*")
      .eq("alert_message_id", String(replyToMessageId))
      .eq("chat_id", chatId)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error("Error finding alert by reply message ID", error, {
        category: LogCategory.DATABASE,
        operation: "findAlertByReplyMessageId",
        replyToMessageId: String(replyToMessageId),
      });
      return null;
    }

    return (data as CallerAlert) ?? null;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception finding alert by reply message ID", err, {
      category: LogCategory.DATABASE,
      operation: "findAlertByReplyMessageId",
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Alert State Updater
// ---------------------------------------------------------------------------

/**
 * Update the caller alert based on the parsed response.
 *
 * - found            -> status = 'resolved', resolution_type = 'found_in_telegram'
 * - not_found        -> status = 'alerted' (keep for follow-up - NOT 'pending' which means pre-alert)
 * - alternative_number -> status = 'resolved', resolution_type = 'alternative_phone', store number
 * - unknown          -> keep current status, store in resolution_note for manual review
 */
export async function processAlertResponse(
  alertId: string,
  response: ParsedResponse,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const updateFields: Record<string, unknown> = {
      updated_at: now,
    };

    switch (response.type) {
      case "found":
        updateFields.status = "resolved";
        updateFields.resolution_type = "found_in_telegram";
        updateFields.resolution_note = response.rawText;
        updateFields.resolved_at = now;
        break;

      case "not_found":
        // Keep as 'alerted' for follow-up (NOT 'pending' which means pre-alert in caller_alerts)
        updateFields.status = "alerted";
        updateFields.resolution_note = response.rawText;
        break;

      case "alternative_number":
        updateFields.status = "resolved";
        updateFields.resolution_type = "alternative_phone";
        updateFields.alternative_phone = response.alternativeNumber;
        updateFields.resolution_note = response.rawText;
        updateFields.resolved_at = now;
        break;

      case "unknown":
        // Don't change status -- store raw text for manual review
        updateFields.resolution_note = response.rawText;
        break;
    }

    const { error } = await supabase
      .from("caller_alerts")
      .update(updateFields)
      .eq("id", alertId);

    if (error) {
      logger.error("Error updating alert response", error, {
        category: LogCategory.DATABASE,
        operation: "processAlertResponse",
        alertId,
        responseType: response.type,
      });
      return;
    }

    logger.info("Alert response processed", {
      category: LogCategory.GENERAL,
      operation: "processAlertResponse",
      alertId,
      responseType: response.type,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception processing alert response", err, {
      category: LogCategory.DATABASE,
      operation: "processAlertResponse",
      alertId,
    });
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point (for Edge Function webhook handler)
// ---------------------------------------------------------------------------

/**
 * Handle a potential reply to an audit alert in the Zypress Others group.
 *
 * Returns `true` if the message was recognized as an alert response and handled,
 * `false` otherwise (caller should continue normal processing).
 *
 * The message parameter matches the shape of a Telegram Update.message.
 */
export async function handleAuditAlertResponse(
  message: {
    text?: string;
    from?: { id: number };
    reply_to_message?: { message_id: number };
    chat: { id: number };
  },
): Promise<boolean> {
  // 1. Must be a reply to another message
  if (!message.reply_to_message) {
    return false;
  }

  // 2. Must have a sender
  if (!message.from) {
    return false;
  }

  // 3. Must be from Vasya (skip if user ID is not configured)
  if (VASYA_TELEGRAM_USER_ID === 0) {
    return false;
  }
  if (message.from.id !== VASYA_TELEGRAM_USER_ID) {
    return false;
  }

  // 4. Must have text to parse
  if (!message.text) {
    return false;
  }

  // 5. Look up the alert that the reply is referencing
  const alert = await findAlertByReplyMessageId(
    message.reply_to_message.message_id,
    message.chat.id,
  );

  if (!alert) {
    // Not replying to a known alert -- ignore
    return false;
  }

  // 6. Parse and process the response
  const parsed = parseVasyaResponse(message.text);
  await processAlertResponse(alert.id, parsed);

  logger.info("Audit alert response handled", {
    category: LogCategory.GENERAL,
    operation: "handleAuditAlertResponse",
    alertId: alert.id,
    responseType: parsed.type,
  });

  return true;
}
