/**
 * Call Tracking Service for 3CX Call Log Audit
 *
 * Provides CRUD operations for call tracking tables:
 * - call_audit_runs: Daily audit execution tracking
 * - call_records: Individual call records from 3CX
 * - caller_alerts: Alert state and follow-up for missing callers
 *
 * Phase 10, Plan 01
 */

import { LogCategory, logger } from "../sophia-bot/utils/logger.ts";
import { withRetry } from "../sophia-bot/utils/retry.ts";
import { getSupabaseAdmin } from "./db.ts";

// =============================================================================
// Types
// =============================================================================

export type AuditRunStatus = "running" | "completed" | "failed";
export type AlertStatus =
  | "pending"
  | "alerted"
  | "follow_up_sent"
  | "resolved"
  | "ignored";
export type ResolutionType =
  | "found_in_telegram"
  | "alternative_phone"
  | "not_client"
  | "manual_ignore";

export type AuditRun = {
  id: string;
  audit_date: string; // ISO date string (YYYY-MM-DD)
  status: AuditRunStatus;
  total_calls: number;
  missing_callers: number;
  error_message: string | null;
  started_at: string; // ISO datetime
  completed_at: string | null; // ISO datetime
  created_at: string; // ISO datetime
};

export type CallRecord = {
  id: string;
  audit_run_id: string;
  caller_phone: string;
  call_time: string; // ISO datetime
  target_number: string;
  is_internal: boolean;
  found_in_telegram: boolean | null;
  telegram_group: string | null;
  created_at: string; // ISO datetime
};

export type CallerAlert = {
  id: string;
  caller_phone: string;
  audit_run_id: string;
  call_record_id: string | null;
  call_time: string | null; // ISO datetime
  status: AlertStatus;
  alert_message_id: string | null;
  follow_up_message_id: string | null;
  chat_id: number | null;
  resolution_type: ResolutionType | null;
  resolution_note: string | null;
  alternative_phone: string | null;
  alerted_at: string | null; // ISO datetime
  follow_up_at: string | null; // ISO datetime
  resolved_at: string | null; // ISO datetime
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
};

export type CreateCallerAlertParams = {
  caller_phone: string;
  audit_run_id: string;
  call_record_id?: string;
  status?: AlertStatus;
  call_time?: string;
  chat_id?: number;
};

export type UpdateAlertStatusParams = {
  status: AlertStatus;
  alert_message_id?: string;
  follow_up_message_id?: string;
  chat_id?: number;
  resolution_type?: ResolutionType;
  resolution_note?: string;
  alternative_phone?: string;
};

// =============================================================================
// Audit Run Operations
// =============================================================================

/**
 * Atomically claim an audit run for a given date.
 * Uses INSERT with unique constraint to prevent duplicate runs.
 *
 * @param auditDate - Date string in YYYY-MM-DD format
 * @returns AuditRun if claimed successfully, null if already exists
 */
export const claimAuditRun = async (
  auditDate: string
): Promise<AuditRun | null> => {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("call_audit_runs")
      .insert([
        {
          audit_date: auditDate,
          status: "running",
          started_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      // Unique constraint violation - another process already claimed this date
      if (error.code === "23505") {
        logger.info("Audit run already exists for date", {
          category: LogCategory.DATABASE,
          operation: "claimAuditRun",
          auditDate,
        });
        return null;
      }

      // Other errors - log and throw
      logger.error("Error claiming audit run", error, {
        category: LogCategory.DATABASE,
        operation: "claimAuditRun",
        auditDate,
      });
      throw error;
    }

    logger.info("Successfully claimed audit run", {
      category: LogCategory.DATABASE,
      operation: "claimAuditRun",
      auditDate,
      runId: data.id,
    });

    return data as AuditRun;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception claiming audit run", err, {
      category: LogCategory.DATABASE,
      operation: "claimAuditRun",
      auditDate,
    });
    throw err;
  }
};

/**
 * Get an audit run by date
 */
export const getAuditRunByDate = async (
  auditDate: string
): Promise<AuditRun | null> => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("call_audit_runs")
    .select("*")
    .eq("audit_date", auditDate)
    .single();

  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      // PGRST116 = not found, expected
      logger.error("Error fetching audit run", error, {
        category: LogCategory.DATABASE,
        operation: "getAuditRunByDate",
        auditDate,
      });
    }
    return null;
  }

  return data as AuditRun;
};

/**
 * Mark an audit run as completed
 */
export const completeAuditRun = async (
  runId: string,
  totalCalls: number,
  missingCallers: number
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const { error } = await withRetry(
    async () => {
      const result = await supabase
        .from("call_audit_runs")
        .update({
          status: "completed",
          total_calls: totalCalls,
          missing_callers: missingCallers,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      if (result.error) throw result.error;
      return result;
    },
    { maxRetries: 2, baseDelayMs: 200 },
    "completeAuditRun"
  );

  if (error) {
    logger.error("Error completing audit run", error, {
      category: LogCategory.DATABASE,
      operation: "completeAuditRun",
      runId,
    });
    throw error;
  }

  logger.info("Audit run completed", {
    category: LogCategory.DATABASE,
    operation: "completeAuditRun",
    runId,
    totalCalls,
    missingCallers,
  });
};

/**
 * Mark an audit run as failed
 */
export const failAuditRun = async (
  runId: string,
  errorMessage: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("call_audit_runs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    logger.error("Error marking audit run as failed", error, {
      category: LogCategory.DATABASE,
      operation: "failAuditRun",
      runId,
    });
    throw error;
  }

  logger.info("Audit run marked as failed", {
    category: LogCategory.DATABASE,
    operation: "failAuditRun",
    runId,
    errorMessage,
  });
};

// =============================================================================
// Call Record Operations
// =============================================================================

/**
 * Bulk insert call records for an audit run
 */
export const saveCallRecords = async (
  auditRunId: string,
  records: Array<{
    caller_phone: string;
    call_time: string;
    target_number?: string;
    is_internal?: boolean;
  }>
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const recordsToInsert = records.map((r) => ({
    audit_run_id: auditRunId,
    caller_phone: r.caller_phone,
    call_time: r.call_time,
    target_number: r.target_number || "22032770",
    is_internal: r.is_internal ?? false,
  }));

  const { error } = await withRetry(
    async () => {
      const result = await supabase
        .from("call_records")
        .insert(recordsToInsert);
      if (result.error) throw result.error;
      return result;
    },
    { maxRetries: 2, baseDelayMs: 200 },
    "saveCallRecords"
  );

  if (error) {
    logger.error("Error saving call records", error, {
      category: LogCategory.DATABASE,
      operation: "saveCallRecords",
      auditRunId,
      recordCount: records.length,
    });
    throw error;
  }

  logger.info("Call records saved", {
    category: LogCategory.DATABASE,
    operation: "saveCallRecords",
    auditRunId,
    recordCount: records.length,
  });
};

/**
 * Update a call record's Telegram status
 */
export const updateCallRecordTelegramStatus = async (
  recordId: string,
  found: boolean,
  groupName?: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("call_records")
    .update({
      found_in_telegram: found,
      telegram_group: groupName || null,
    })
    .eq("id", recordId);

  if (error) {
    logger.error("Error updating call record Telegram status", error, {
      category: LogCategory.DATABASE,
      operation: "updateCallRecordTelegramStatus",
      recordId,
    });
    throw error;
  }
};

// =============================================================================
// Caller Alert Operations
// =============================================================================

/**
 * Create a new caller alert.
 * Uses INSERT with unique constraint to prevent duplicate alerts per caller/run.
 *
 * @returns CallerAlert if created, null if duplicate
 */
export const createCallerAlert = async (
  params: CreateCallerAlertParams
): Promise<CallerAlert | null> => {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("caller_alerts")
      .insert([
        {
          caller_phone: params.caller_phone,
          audit_run_id: params.audit_run_id,
          call_record_id: params.call_record_id || null,
          status: params.status || "pending",
          call_time: params.call_time || null,
          chat_id: params.chat_id || null,
        },
      ])
      .select()
      .single();

    if (error) {
      // Unique constraint violation - alert already exists for this caller + run
      if (error.code === "23505") {
        logger.info("Caller alert already exists", {
          category: LogCategory.DATABASE,
          operation: "createCallerAlert",
          callerPhone: params.caller_phone,
        });
        return null;
      }

      logger.error("Error creating caller alert", error, {
        category: LogCategory.DATABASE,
        operation: "createCallerAlert",
        callerPhone: params.caller_phone,
      });
      throw error;
    }

    logger.info("Caller alert created", {
      category: LogCategory.DATABASE,
      operation: "createCallerAlert",
      alertId: data.id,
      callerPhone: params.caller_phone,
    });

    return data as CallerAlert;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception creating caller alert", err, {
      category: LogCategory.DATABASE,
      operation: "createCallerAlert",
    });
    throw err;
  }
};

/**
 * Update alert status with appropriate timestamp logic
 */
export const updateAlertStatus = async (
  alertId: string,
  params: UpdateAlertStatusParams
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: params.status,
    updated_at: now,
  };

  // Set appropriate timestamps based on status
  if (params.status === "alerted" && !params.alert_message_id) {
    updates.alerted_at = now;
  }
  if (params.status === "follow_up_sent") {
    updates.follow_up_at = now;
  }
  if (params.status === "resolved" || params.status === "ignored") {
    updates.resolved_at = now;
  }

  // Add optional fields
  if (params.alert_message_id)
    updates.alert_message_id = params.alert_message_id;
  if (params.follow_up_message_id)
    updates.follow_up_message_id = params.follow_up_message_id;
  if (params.chat_id) updates.chat_id = params.chat_id;
  if (params.resolution_type) updates.resolution_type = params.resolution_type;
  if (params.resolution_note) updates.resolution_note = params.resolution_note;
  if (params.alternative_phone)
    updates.alternative_phone = params.alternative_phone;

  const { error } = await withRetry(
    async () => {
      const result = await supabase
        .from("caller_alerts")
        .update(updates)
        .eq("id", alertId);

      if (result.error) throw result.error;
      return result;
    },
    { maxRetries: 2, baseDelayMs: 200 },
    "updateAlertStatus"
  );

  if (error) {
    logger.error("Error updating alert status", error, {
      category: LogCategory.DATABASE,
      operation: "updateAlertStatus",
      alertId,
      status: params.status,
    });
    throw error;
  }

  logger.info("Alert status updated", {
    category: LogCategory.DATABASE,
    operation: "updateAlertStatus",
    alertId,
    status: params.status,
  });
};

/**
 * Get all unresolved alerts (pending, alerted, follow_up_sent)
 */
export const getUnresolvedAlerts = async (): Promise<CallerAlert[]> => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("caller_alerts")
    .select("*")
    .in("status", ["pending", "alerted", "follow_up_sent"])
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Error fetching unresolved alerts", error, {
      category: LogCategory.DATABASE,
      operation: "getUnresolvedAlerts",
    });
    throw error;
  }

  return (data || []) as CallerAlert[];
};

/**
 * Get alerts pending follow-up (alerted > N hours ago, no follow-up sent yet)
 */
export const getPendingFollowUps = async (
  hoursThreshold = 24
): Promise<CallerAlert[]> => {
  const supabase = getSupabaseAdmin();

  const thresholdTime = new Date(
    Date.now() - hoursThreshold * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("caller_alerts")
    .select("*")
    .eq("status", "alerted")
    .lt("alerted_at", thresholdTime)
    .order("alerted_at", { ascending: true });

  if (error) {
    logger.error("Error fetching pending follow-ups", error, {
      category: LogCategory.DATABASE,
      operation: "getPendingFollowUps",
      hoursThreshold,
    });
    throw error;
  }

  return (data || []) as CallerAlert[];
};

/**
 * Get a specific alert by caller phone and audit run
 */
export const getAlertByPhone = async (
  callerPhone: string,
  auditRunId: string
): Promise<CallerAlert | null> => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("caller_alerts")
    .select("*")
    .eq("caller_phone", callerPhone)
    .eq("audit_run_id", auditRunId)
    .single();

  if (error || !data) {
    if (error && error.code !== "PGRST116") {
      logger.error("Error fetching alert by phone", error, {
        category: LogCategory.DATABASE,
        operation: "getAlertByPhone",
        callerPhone,
      });
    }
    return null;
  }

  return data as CallerAlert;
};
