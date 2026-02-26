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
import type { AuditAlert } from "./telegram-alerts.ts";
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
 * Find an audit alert by the Telegram message ID it was sent as.
 * Used to match a reply-to-message back to the original alert.
 */
export async function findAlertByReplyMessageId(
  replyToMessageId: number,
  chatId: number,
): Promise<AuditAlert | null> {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("audit_alerts")
      .select("*")
      .eq("telegram_message_id", replyToMessageId)
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

    return (data as AuditAlert) ?? null;
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
 * Update the audit alert based on the parsed response.
 *
 * - found            -> status = 'resolved', store response_text
 * - not_found        -> status = 'pending' (keep for follow-up), store response_text
 * - alternative_number -> status = 'resolved', store alt number in response_text
 * - unknown          -> keep current status, store response_text for manual review
 */
export async function processAlertResponse(
  alertId: string,
  response: ParsedResponse,
  respondedByTelegramId: number,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const updateFields: Record<string, unknown> = {
      response_text: response.rawText,
      responded_by_telegram_id: respondedByTelegramId,
      responded_at: now,
      updated_at: now,
    };

    switch (response.type) {
      case "found":
        updateFields.status = "resolved";
        break;

      case "not_found":
        // Keep as pending for follow-up
        updateFields.status = "pending";
        break;

      case "alternative_number":
        updateFields.status = "resolved";
        // Store the alternative number alongside the raw text
        updateFields.response_text = response.alternativeNumber
          ? `Alternative number: ${response.alternativeNumber} | ${response.rawText}`
          : response.rawText;
        break;

      case "unknown":
        // Don't change status -- leave for manual review
        break;
    }

    const { error } = await supabase
      .from("audit_alerts")
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
  await processAlertResponse(alert.id, parsed, message.from.id);

  logger.info("Audit alert response handled", {
    category: LogCategory.GENERAL,
    operation: "handleAuditAlertResponse",
    alertId: alert.id,
    responseType: parsed.type,
  });

  return true;
}
