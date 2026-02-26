/**
 * Call Audit Pipeline Orchestrator
 *
 * Orchestrates the full daily audit pipeline:
 * 1. Claim audit run (prevent duplicates)
 * 2. Extract calls from 3CX
 * 3. Search Telegram groups for each caller
 * 4. Send alerts for missing callers
 * 5. Complete audit run with summary
 *
 * Phase 13, Plan 01
 */

import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";
import { AUDIT_CONFIG, get3CXConfig } from "./config.ts";
import { ThreeCXClient } from "./3cx/client.ts";
import { extractTodayCalls, filterExternalCallers } from "./3cx/call-log-extractor.ts";
import {
  claimAuditRun,
  saveCallRecords,
  createCallerAlert,
  updateAlertStatus,
  completeAuditRun,
  failAuditRun,
} from "../_shared/call-tracking.ts";
import {
  searchPhoneInGroups,
  REGIONAL_GROUP_IDS,
} from "../_shared/telegram-search.ts";
import {
  sendMissingCallerAlert,
  type MissingCallerInfo,
} from "../_shared/telegram-alerts.ts";
import { processFollowUpReminders } from "./follow-up.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditPipelineResult {
  success: boolean;
  auditRunId: string | null;
  date: string;
  totalCalls: number;
  externalCallers: number;
  missingCallers: number;
  alertsSent: number;
  alertsFailed: number;
  skippedReason?: string; // e.g., "duplicate_run", "no_external_callers"
  errors: string[];
  followUp?: {
    checked: number;
    remindersSent: number;
    remindersFailed: number;
    skippedReason?: string;
  };
}

// ---------------------------------------------------------------------------
// Pipeline Orchestrator
// ---------------------------------------------------------------------------

/**
 * Execute the full daily call audit pipeline.
 *
 * @param dateOverride - Optional date override (YYYY-MM-DD format) for testing
 * @returns Pipeline execution result
 */
export async function runDailyAudit(dateOverride?: string): Promise<AuditPipelineResult> {
  const errors: string[] = [];

  // Step 1: Calculate audit date
  const auditDate = dateOverride || calculateAuditDate();
  logger.info("[Audit Pipeline] Starting daily audit", {
    category: LogCategory.GENERAL,
    operation: "runDailyAudit",
    auditDate,
  });

  // Step 2: Claim audit run (atomic, prevents duplicates)
  const auditRun = await claimAuditRun(auditDate);

  if (!auditRun) {
    logger.info("[Audit Pipeline] Audit already run for this date", {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      auditDate,
    });

    return {
      success: true,
      auditRunId: null,
      date: auditDate,
      totalCalls: 0,
      externalCallers: 0,
      missingCallers: 0,
      alertsSent: 0,
      alertsFailed: 0,
      skippedReason: "duplicate_run",
      errors: [],
    };
  }

  const runId = auditRun.id;

  // Wrap remaining steps in try/catch - call failAuditRun on error
  try {
    // Step 3: Authenticate and extract calls from 3CX
    logger.info("[Audit Pipeline] Authenticating with 3CX", {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      runId,
    });

    const config = get3CXConfig();
    const client = new ThreeCXClient(config);
    await client.login();

    logger.info("[Audit Pipeline] Extracting today's calls", {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      runId,
    });

    const entries = await extractTodayCalls(client);
    const auditResult = filterExternalCallers(entries);
    const { callTimeMap } = auditResult;

    // Save all call records
    const callRecords = auditResult.externalCallers.map((phone) => ({
      caller_phone: phone,
      call_time: callTimeMap[phone] || new Date().toISOString(),
      target_number: AUDIT_CONFIG.TARGET_NUMBER,
      is_internal: false,
    }));

    await saveCallRecords(runId, callRecords);

    logger.info("[Audit Pipeline] Call records saved", {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      runId,
      totalCalls: auditResult.totalCalls,
      externalCallers: auditResult.externalCallers.length,
    });

    // Step 4: Search Telegram groups for each external caller
    const missingCallers: MissingCallerInfo[] = [];
    // Check if Telegram is configured
    const groupIds = Object.values(REGIONAL_GROUP_IDS);
    if (groupIds.some((id) => id === 0)) {
      logger.warn("[Audit Pipeline] REGIONAL_GROUP_IDS contains unconfigured (0) values - skipping Telegram search", {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
        runId,
      });

      // Mark all callers as missing since we can't search
      for (const phone of auditResult.externalCallers) {
        missingCallers.push({
          phoneNumber: phone,
          callTime: formatCallTimeDisplay(callTimeMap[phone] || new Date().toISOString()),
          callDate: auditDate,
          searchedGroups: [],
        });
      }
    } else {
      // Perform Telegram search for each caller
      logger.info("[Audit Pipeline] Searching Telegram groups", {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
        runId,
        callerCount: auditResult.externalCallers.length,
      });

      for (const phone of auditResult.externalCallers) {
        try {
          const searchResults = await searchPhoneInGroups(phone, groupIds);

          if (searchResults.length > 0) {
            // Found in Telegram - log success
            logger.info("[Audit Pipeline] Caller found in Telegram", {
              category: LogCategory.GENERAL,
              operation: "runDailyAudit",
              runId,
              phone,
              groupName: searchResults[0].groupName,
            });

            // TODO: Update call_record telegram status once we have record IDs
            // await updateCallRecordTelegramStatus(recordId, true, searchResults[0].groupName);
          } else {
            // Not found - add to missing callers
            missingCallers.push({
              phoneNumber: phone,
              callTime: formatCallTimeDisplay(callTimeMap[phone] || new Date().toISOString()),
              callDate: auditDate,
              searchedGroups: Object.keys(REGIONAL_GROUP_IDS),
            });

            logger.info("[Audit Pipeline] Caller not found in any group", {
              category: LogCategory.GENERAL,
              operation: "runDailyAudit",
              runId,
              phone,
            });
          }
        } catch (searchError) {
          const err = searchError instanceof Error ? searchError : new Error(String(searchError));
          logger.error("[Audit Pipeline] Error searching for caller", err, {
            category: LogCategory.GENERAL,
            operation: "runDailyAudit",
            runId,
            phone,
          });

          errors.push(`Search error for ${phone}: ${err.message}`);

          // Treat search failure as "not found" - safer to alert
          missingCallers.push({
            phoneNumber: phone,
            callTime: formatCallTimeDisplay(callTimeMap[phone] || new Date().toISOString()),
            callDate: auditDate,
            searchedGroups: [],
          });
        }
      }
    }

    // Step 5: Send alerts for missing callers
    let alertsSent = 0;
    let alertsFailed = 0;

    if (missingCallers.length > 0) {
      logger.info("[Audit Pipeline] Sending alerts for missing callers", {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
        runId,
        missingCount: missingCallers.length,
      });

      for (const caller of missingCallers) {
        try {
          // Create alert record in DB
          const alert = await createCallerAlert({
            caller_phone: caller.phoneNumber,
            audit_run_id: runId,
            status: "pending",
            call_time: callTimeMap[caller.phoneNumber] || undefined,
          });

          if (!alert) {
            logger.info("[Audit Pipeline] Alert already exists for caller", {
              category: LogCategory.GENERAL,
              operation: "runDailyAudit",
              runId,
              phone: caller.phoneNumber,
            });
            continue;
          }

          // Send Telegram alert
          const result = await sendMissingCallerAlert(caller);

          if (result.success && result.messageId) {
            // Update alert status with message ID
            await updateAlertStatus(alert.id, {
              status: "alerted",
              alert_message_id: String(result.messageId),
            });

            alertsSent++;

            logger.info("[Audit Pipeline] Alert sent successfully", {
              category: LogCategory.GENERAL,
              operation: "runDailyAudit",
              runId,
              phone: caller.phoneNumber,
              messageId: String(result.messageId),
            });
          } else {
            alertsFailed++;
            errors.push(`Failed to send alert for ${caller.phoneNumber}: ${result.error}`);
          }

          // Rate limiting: 1 second delay between alerts
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (alertError) {
          const err = alertError instanceof Error ? alertError : new Error(String(alertError));

          // Check if this is an unconfigured chat ID error
          if (err.message.includes("ZYPRESS_OTHERS_CHAT_ID is 0")) {
            logger.warn("[Audit Pipeline] Alert sending skipped - ZYPRESS_OTHERS_CHAT_ID not configured", {
              category: LogCategory.GENERAL,
              operation: "runDailyAudit",
              runId,
            });
            // Skip all remaining alerts
            break;
          }

          logger.error("[Audit Pipeline] Error sending alert", err, {
            category: LogCategory.GENERAL,
            operation: "runDailyAudit",
            runId,
            phone: caller.phoneNumber,
          });

          alertsFailed++;
          errors.push(`Alert error for ${caller.phoneNumber}: ${err.message}`);
        }
      }
    } else {
      logger.info("[Audit Pipeline] No missing callers - no alerts needed", {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
        runId,
      });
    }

    // Step 6: Complete audit run
    await completeAuditRun(runId, auditResult.totalCalls, missingCallers.length);

    logger.info("[Audit Pipeline] Audit completed successfully", {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      runId,
      totalCalls: auditResult.totalCalls,
      externalCallers: auditResult.externalCallers.length,
      missingCallers: missingCallers.length,
      alertsSent,
      alertsFailed,
    });

    // Step 7: Process follow-up reminders for stale alerts from previous days
    const result: AuditPipelineResult = {
      success: true,
      auditRunId: runId,
      date: auditDate,
      totalCalls: auditResult.totalCalls,
      externalCallers: auditResult.externalCallers.length,
      missingCallers: missingCallers.length,
      alertsSent,
      alertsFailed,
      errors,
    };

    try {
      const followUpResult = await processFollowUpReminders();
      result.followUp = followUpResult;
      logger.info("[Audit Pipeline] Follow-up reminders processed", {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
        ...followUpResult,
      });
    } catch (followUpError) {
      // Follow-up failures should NOT fail the entire audit
      logger.error("[Audit Pipeline] Follow-up processing failed", followUpError instanceof Error ? followUpError : new Error(String(followUpError)), {
        category: LogCategory.GENERAL,
        operation: "runDailyAudit",
      });
    }

    // Step 8: Return result
    return result;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("[Audit Pipeline] Fatal error", err, {
      category: LogCategory.GENERAL,
      operation: "runDailyAudit",
      runId,
    });

    // Mark audit as failed in DB
    await failAuditRun(runId, err.message);

    // Return error result (don't rethrow - Edge Function should always return JSON)
    return {
      success: false,
      auditRunId: runId,
      date: auditDate,
      totalCalls: 0,
      externalCallers: 0,
      missingCallers: 0,
      alertsSent: 0,
      alertsFailed: 0,
      errors: [err.message],
    };
  }
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format ISO timestamp to HH:MM display format in Cyprus timezone.
 */
function formatCallTimeDisplay(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString("en-GB", {
      timeZone: AUDIT_CONFIG.TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "Unknown";
  }
}

/**
 * Calculate today's date in Cyprus timezone (YYYY-MM-DD format).
 */
function calculateAuditDate(): string {
  const cyprusNow = new Date().toLocaleString("en-CA", {
    timeZone: AUDIT_CONFIG.TIMEZONE,
  });
  return cyprusNow.split(",")[0]; // Extract YYYY-MM-DD part
}
