/**
 * WhatsApp Bot Analytics Tracking
 *
 * Tracks usage metrics: messages, tool calls, documents, errors, response times.
 * Data stored in whatsapp_analytics table for dashboard visibility.
 */

import { LogCategory, logger } from "../utils/logger.ts";
import { getSupabaseAdmin } from "../../_shared/db.ts";

const supabase = getSupabaseAdmin();

export type AnalyticsEventType =
  | "message_received"
  | "message_sent"
  | "tool_used"
  | "document_generated"
  | "property_uploaded"
  | "error";

interface AnalyticsEvent {
  phoneNumber: string;
  agentId?: string;
  eventType: AnalyticsEventType;
  toolName?: string;
  templateName?: string;
  responseTimeMs?: number;
  tokenCount?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  experimentId?: string;
  experimentVariant?: string;
}

// Cached active experiment (refreshed every 60s)
let cachedExperiment: { id: string; target_key: string } | null = null;
let experimentCacheTime = 0;
const EXPERIMENT_CACHE_TTL = 60_000;

/**
 * Get the currently active experiment (if any) for analytics tagging.
 * Cached for 60s to avoid DB queries on every message.
 */
export async function getActiveExperiment(): Promise<{
  id: string;
  target_key: string;
} | null> {
  const now = Date.now();
  if (cachedExperiment !== undefined && now - experimentCacheTime < EXPERIMENT_CACHE_TTL) {
    return cachedExperiment;
  }

  try {
    const { data } = await supabase
      .from("sophia_experiments")
      .select("id, target_key")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    cachedExperiment = data || null;
    experimentCacheTime = now;
    return cachedExperiment;
  } catch {
    return cachedExperiment;
  }
}

/**
 * Track an analytics event (fire-and-forget, non-blocking)
 */
export function trackEvent(event: AnalyticsEvent): void {
  // Fire and forget - don't await to avoid blocking
  trackEventAsync(event).catch((err) => {
    // Silently fail - analytics should never break main flow
    logger.warn("[Analytics] Failed to track event", {
      category: LogCategory.DATABASE,
      error: err.message,
    });
  });
}

/**
 * Async version for when you need to await
 */
export async function trackEventAsync(event: AnalyticsEvent): Promise<void> {
  try {
    await supabase.from("whatsapp_analytics").insert({
      phone_number: event.phoneNumber,
      agent_id: event.agentId || null,
      event_type: event.eventType,
      tool_name: event.toolName || null,
      template_name: event.templateName || null,
      response_time_ms: event.responseTimeMs || null,
      token_count: event.tokenCount || null,
      error_code: event.errorCode || null,
      error_message: event.errorMessage || null,
      metadata: event.metadata || {},
      experiment_id: event.experimentId || null,
      experiment_variant: event.experimentVariant || null,
    });
  } catch (err) {
    // Log but don't throw - analytics failures shouldn't break main flow
    logger.warn("[Analytics] Insert failed", {
      category: LogCategory.DATABASE,
      error: String(err),
    });
  }
}

/**
 * Helper to track message received
 */
export function trackMessageReceived(
  phoneNumber: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "message_received",
    metadata,
  });
}

/**
 * Helper to track message sent with response time and token usage
 * @param tokenCount - Total tokens from OpenRouter (prompt + completion)
 */
export function trackMessageSent(
  phoneNumber: string,
  responseTimeMs: number,
  tokenCount?: number,
  agentId?: string
): void {
  if (tokenCount !== undefined && tokenCount <= 0) {
    logger.warn("[Analytics] Invalid token count", {
      category: LogCategory.GENERAL,
      tokenCount,
    });
  }
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "message_sent",
    responseTimeMs,
    tokenCount,
  });
}

/**
 * Helper to track tool usage
 */
export function trackToolUsed(
  phoneNumber: string,
  toolName: string,
  responseTimeMs?: number,
  agentId?: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "tool_used",
    toolName,
    responseTimeMs,
    metadata,
  });
}

/**
 * Helper to track document generation
 */
export function trackDocumentGenerated(
  phoneNumber: string,
  templateName: string,
  agentId?: string
): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "document_generated",
    templateName,
  });
}

/**
 * Helper to track property upload
 */
export function trackPropertyUploaded(
  phoneNumber: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "property_uploaded",
    metadata,
  });
}

/**
 * Helper to track errors
 */
export function trackError(
  phoneNumber: string,
  errorCode: string,
  errorMessage: string,
  agentId?: string
): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "error",
    errorCode,
    errorMessage,
  });
}

/**
 * Response time tracker - call start() then end() to get elapsed time
 */
export function createTimer(): { end: () => number } {
  const start = Date.now();
  return {
    end: () => Date.now() - start,
  };
}
