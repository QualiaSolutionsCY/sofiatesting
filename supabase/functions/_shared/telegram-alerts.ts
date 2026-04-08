/**
 * Telegram Alert Sending Service
 *
 * Posts formatted missing-caller alerts to the "Zypress Others" Telegram group.
 * Used by the call audit pipeline when phone numbers aren't found in any
 * regional group's indexed messages.
 *
 * Phase 12, Plan 02
 */

import { LogCategory, logger } from "../sophia-bot/utils/logger.ts";
import { getTelegramBot } from "./telegram.ts";
import { ALERT_TARGET_CHAT_ID } from "./telegram-search.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MissingCallerInfo {
  phoneNumber: string;
  callTime: string; // HH:MM format
  callDate: string; // YYYY-MM-DD format
  searchedGroups: string[]; // Names of groups searched
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
  const cleaned = phone.replace(/[^\d+]/g, "");

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
  const groupList =
    call.searchedGroups.length > 0
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
  daysSinceAlert: number
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
 */
export async function sendMissingCallerAlert(
  call: MissingCallerInfo
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  // Guard: skip silently if alert target is disabled (set to 0)
  if (ALERT_TARGET_CHAT_ID === 0) {
    logger.info("Alert sending disabled (ALERT_TARGET_CHAT_ID = 0)", {
      category: LogCategory.GENERAL,
      operation: "sendMissingCallerAlert",
      callDate: call.callDate,
    });
    return { success: true, messageId: undefined };
  }

  try {
    const message = formatMissingCallerAlert(call);
    const bot = getTelegramBot();

    const result = (await bot.sendMessage({
      chatId: ALERT_TARGET_CHAT_ID,
      text: message,
    })) as { message_id: number };

    const messageId = result.message_id;

    logger.info("Sent missing caller alert", {
      category: LogCategory.GENERAL,
      operation: "sendMissingCallerAlert",
      messageId: String(messageId),
      callDate: call.callDate,
    });

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
  calls: MissingCallerInfo[]
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
