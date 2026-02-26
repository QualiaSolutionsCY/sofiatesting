/**
 * Telegram Alert Sending Service
 *
 * Posts formatted missing-caller alerts to the "Zypress Others" Telegram group.
 * Used by the call audit pipeline when phone numbers aren't found in any
 * regional group's indexed messages.
 *
 * Phase 12, Plan 02
 */

import { getTelegramBot } from "./telegram.ts";
import { ZYPRESS_OTHERS_CHAT_ID } from "./telegram-search.ts";
import { getSupabaseAdmin } from "./db.ts";
import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MissingCallerInfo {
  phoneNumber: string;
  callTime: string;      // HH:MM format
  callDate: string;      // YYYY-MM-DD format
  searchedGroups: string[]; // Names of groups searched
}

export interface AuditAlert {
  id: string;
  phone_number: string;
  call_date: string;
  call_time: string;
  alert_type: string;
  telegram_message_id: number | null;
  chat_id: number;
  status: string;
  response_text: string | null;
  responded_by_telegram_id: number | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phone Number Formatting
// ---------------------------------------------------------------------------

/**
 * Format a phone number for display with spaces for readability.
 *
 * Examples:
 *   +35722123456  -> +357 22 123 456
 *   35799123456   -> +357 99 123 456
 *   22123456      -> 22 123 456
 *   +4412345678   -> +44 1234 5678
 */
function formatPhoneDisplay(phone: string): string {
  // Strip all non-digit and non-plus characters
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If it's a Cyprus number with +357 prefix
  if (cleaned.startsWith("+357") && cleaned.length === 12) {
    const local = cleaned.slice(4); // 8 digits
    return `+357 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }

  // If it starts with 357 but no +, add it
  if (cleaned.startsWith("357") && cleaned.length === 11) {
    const local = cleaned.slice(3);
    return `+357 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }

  // Local Cyprus number (8 digits starting with 2x or 9x or 7x)
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
  }

  // Fallback: return as-is with + prefix if it looks international
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Message Formatting
// ---------------------------------------------------------------------------

/**
 * Format a missing-caller alert message for Telegram.
 */
export function formatMissingCallerAlert(call: MissingCallerInfo): string {
  const displayPhone = formatPhoneDisplay(call.phoneNumber);
  const groupList = call.searchedGroups.length > 0
    ? call.searchedGroups.join(", ")
    : "all regional groups";

  return [
    "\u26a0\ufe0f MISSING CALLER ALERT",
    "",
    `Phone: ${displayPhone}`,
    `Call Time: ${call.callTime}`,
    `Date: ${call.callDate}`,
    "",
    "This number was NOT found in any regional Telegram group.",
    `Groups searched: ${groupList}`,
    "",
    "Please check if this caller has been attended to.",
  ].join("\n");
}

/**
 * Format a follow-up reminder for an unresolved alert.
 */
export function formatFollowUpReminder(
  call: MissingCallerInfo,
  daysSinceAlert: number,
): string {
  const displayPhone = formatPhoneDisplay(call.phoneNumber);

  return [
    "\ud83d\udd14 REMINDER: Unresolved Missing Caller",
    "",
    `Phone: ${displayPhone}`,
    `Original Call: ${call.callDate} at ${call.callTime}`,
    `Days since alert: ${daysSinceAlert}`,
    "",
    "This caller has not been confirmed as attended to.",
    "Please respond if this number has been handled.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Alert Sending
// ---------------------------------------------------------------------------

/**
 * Send a single missing-caller alert to the Zypress Others group.
 *
 * Returns the Telegram message ID on success (needed for response tracking).
 * Persists the alert in the audit_alerts table.
 */
export async function sendMissingCallerAlert(
  call: MissingCallerInfo,
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  // Guard: fail loudly if chat ID is unconfigured
  if (ZYPRESS_OTHERS_CHAT_ID === 0) {
    throw new Error(
      "ZYPRESS_OTHERS_CHAT_ID is 0 (unconfigured) — configure before sending alerts",
    );
  }

  try {
    const message = formatMissingCallerAlert(call);
    const bot = getTelegramBot();

    const result = await bot.sendMessage({
      chatId: ZYPRESS_OTHERS_CHAT_ID,
      text: message,
    }) as { message_id: number };

    const messageId = result.message_id;

    logger.info("Sent missing caller alert", {
      category: LogCategory.GENERAL,
      operation: "sendMissingCallerAlert",
      messageId: String(messageId),
      callDate: call.callDate,
    });

    // Persist alert in database
    await persistAlert(call, messageId, "initial");

    return { success: true, messageId };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to send missing caller alert", err, {
      category: LogCategory.GENERAL,
      operation: "sendMissingCallerAlert",
      callDate: call.callDate,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Send alerts for multiple missing callers with rate-limit-safe delays.
 *
 * Telegram Bot API allows ~20 messages/min to the same group.
 * We add a 1-second delay between messages to stay well within limits.
 */
export async function sendBatchMissingCallerAlerts(
  calls: MissingCallerInfo[],
): Promise<{ sent: number; failed: number; messageIds: number[] }> {
  let sent = 0;
  let failed = 0;
  const messageIds: number[] = [];

  for (let i = 0; i < calls.length; i++) {
    const result = await sendMissingCallerAlert(calls[i]);

    if (result.success && result.messageId) {
      sent++;
      messageIds.push(result.messageId);
    } else {
      failed++;
    }

    // Rate limit: 1-second delay between messages (except after the last one)
    if (i < calls.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.info("Batch alert sending complete", {
    category: LogCategory.GENERAL,
    operation: "sendBatchMissingCallerAlerts",
    sent: String(sent),
    failed: String(failed),
    total: String(calls.length),
  });

  return { sent, failed, messageIds };
}

// ---------------------------------------------------------------------------
// Database Persistence
// ---------------------------------------------------------------------------

/**
 * Persist an alert record in audit_alerts.
 * Handles duplicate gracefully (unique constraint on phone_number+call_date+alert_type).
 */
async function persistAlert(
  call: MissingCallerInfo,
  telegramMessageId: number,
  alertType: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("audit_alerts").insert({
      phone_number: call.phoneNumber,
      call_date: call.callDate,
      call_time: call.callTime,
      alert_type: alertType,
      telegram_message_id: telegramMessageId,
      chat_id: ZYPRESS_OTHERS_CHAT_ID,
      status: "pending",
    });

    if (error) {
      // 23505 = unique constraint violation (duplicate alert)
      if (error.code === "23505") {
        logger.info("Alert already exists for this phone+date+type", {
          category: LogCategory.DATABASE,
          operation: "persistAlert",
          callDate: call.callDate,
        });
        return;
      }

      logger.error("Error persisting alert", error, {
        category: LogCategory.DATABASE,
        operation: "persistAlert",
      });
    }
  } catch (error) {
    // Non-critical: log but don't fail the alert send
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception persisting alert", err, {
      category: LogCategory.DATABASE,
      operation: "persistAlert",
    });
  }
}

// ---------------------------------------------------------------------------
// Alert Query Helpers
// ---------------------------------------------------------------------------

/**
 * Get unresolved alerts older than the specified number of hours.
 * Used for follow-up reminder logic.
 */
export async function getUnresolvedAlerts(
  olderThanHours: number,
): Promise<AuditAlert[]> {
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("audit_alerts")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true });

    if (error) {
      logger.error("Error fetching unresolved alerts", error, {
        category: LogCategory.DATABASE,
        operation: "getUnresolvedAlerts",
      });
      return [];
    }

    return (data || []) as AuditAlert[];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception fetching unresolved alerts", err, {
      category: LogCategory.DATABASE,
      operation: "getUnresolvedAlerts",
    });
    return [];
  }
}

/**
 * Mark an alert as resolved with response details.
 */
export async function markAlertResolved(
  alertId: string,
  responseText: string,
  respondedBy: number,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("audit_alerts")
      .update({
        status: "resolved",
        response_text: responseText,
        responded_by_telegram_id: respondedBy,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", alertId);

    if (error) {
      logger.error("Error marking alert resolved", error, {
        category: LogCategory.DATABASE,
        operation: "markAlertResolved",
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception marking alert resolved", err, {
      category: LogCategory.DATABASE,
      operation: "markAlertResolved",
    });
  }
}
