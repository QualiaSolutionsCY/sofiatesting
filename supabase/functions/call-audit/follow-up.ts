/**
 * Follow-Up Reminder System
 *
 * Automatically re-alerts for unresolved missing callers after 24 hours.
 * Runs as part of the daily audit pipeline to ensure no leads fall through the cracks.
 *
 * Phase 13, Plan 02
 */

import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";
import {
  getPendingFollowUps,
  updateAlertStatus,
  type CallerAlert,
} from "../_shared/call-tracking.ts";
import {
  formatFollowUpReminder,
  type MissingCallerInfo,
} from "../_shared/telegram-alerts.ts";
import { getTelegramBot } from "../_shared/telegram.ts";
import { ZYPRESS_OTHERS_CHAT_ID } from "../_shared/telegram-search.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowUpResult {
  checked: number;
  remindersSent: number;
  remindersFailed: number;
  skippedReason?: string;
}

// ---------------------------------------------------------------------------
// Follow-Up Processing
// ---------------------------------------------------------------------------

/**
 * Process follow-up reminders for unresolved alerts older than 24 hours.
 *
 * Logic:
 * 1. Query alerts with status=alerted and alerted_at > 24h ago
 * 2. Send reminder message via Telegram
 * 3. Transition status from alerted -> follow_up_sent
 * 4. Rate limit: 1-second delay between messages
 *
 * @returns FollowUpResult with counts and optional skip reason
 */
export async function processFollowUpReminders(): Promise<FollowUpResult> {
  try {
    // Guard: Check Telegram is configured
    if (ZYPRESS_OTHERS_CHAT_ID === 0) {
      logger.warn("[Follow-Up] Telegram not configured - skipping follow-up reminders", {
        category: LogCategory.GENERAL,
        operation: "processFollowUpReminders",
      });

      return {
        checked: 0,
        remindersSent: 0,
        remindersFailed: 0,
        skippedReason: "telegram_not_configured",
      };
    }

    // Query pending follow-ups (alerted > 24h ago)
    logger.info("[Follow-Up] Fetching pending follow-ups", {
      category: LogCategory.GENERAL,
      operation: "processFollowUpReminders",
      threshold: "24h",
    });

    const pendingAlerts = await getPendingFollowUps(24);

    if (pendingAlerts.length === 0) {
      logger.info("[Follow-Up] No pending follow-ups found", {
        category: LogCategory.GENERAL,
        operation: "processFollowUpReminders",
      });

      return {
        checked: 0,
        remindersSent: 0,
        remindersFailed: 0,
      };
    }

    logger.info("[Follow-Up] Processing follow-up reminders", {
      category: LogCategory.GENERAL,
      operation: "processFollowUpReminders",
      alertCount: pendingAlerts.length,
    });

    // Process each alert
    const bot = getTelegramBot();
    let remindersSent = 0;
    let remindersFailed = 0;

    for (const alert of pendingAlerts) {
      try {
        // Calculate days since alert
        const alertedAt = new Date(alert.alerted_at!);
        const daysSinceAlert = Math.floor(
          (Date.now() - alertedAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Create MissingCallerInfo from alert
        const callerInfo: MissingCallerInfo = {
          phoneNumber: alert.caller_phone,
          callTime: "N/A",
          callDate: alert.created_at.split("T")[0],
          searchedGroups: [],
        };

        // Format reminder message
        const reminderText = formatFollowUpReminder(callerInfo, daysSinceAlert);

        // Send via Telegram
        const result = await bot.sendMessage({
          chatId: ZYPRESS_OTHERS_CHAT_ID,
          text: reminderText,
        }) as { message_id: number };

        const messageId = result.message_id;

        // Update alert status
        await updateAlertStatus(alert.id, {
          status: "follow_up_sent",
          follow_up_message_id: String(messageId),
        });

        remindersSent++;

        logger.info("[Follow-Up] Reminder sent successfully", {
          category: LogCategory.GENERAL,
          operation: "processFollowUpReminders",
          alertId: alert.id,
          phone: alert.caller_phone,
          messageId: String(messageId),
          daysSinceAlert,
        });

        // Rate limiting: 1-second delay between messages
        if (pendingAlerts.indexOf(alert) < pendingAlerts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (alertError) {
        remindersFailed++;

        const err = alertError instanceof Error
          ? alertError
          : new Error(String(alertError));

        logger.error("[Follow-Up] Failed to send reminder", err, {
          category: LogCategory.GENERAL,
          operation: "processFollowUpReminders",
          alertId: alert.id,
          phone: alert.caller_phone,
        });

        // Continue to next alert - don't fail the entire batch
      }
    }

    logger.info("[Follow-Up] Follow-up processing complete", {
      category: LogCategory.GENERAL,
      operation: "processFollowUpReminders",
      checked: pendingAlerts.length,
      remindersSent,
      remindersFailed,
    });

    return {
      checked: pendingAlerts.length,
      remindersSent,
      remindersFailed,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    logger.error("[Follow-Up] Fatal error processing follow-ups", err, {
      category: LogCategory.GENERAL,
      operation: "processFollowUpReminders",
    });

    // Return zero result on fatal error
    return {
      checked: 0,
      remindersSent: 0,
      remindersFailed: 0,
    };
  }
}
