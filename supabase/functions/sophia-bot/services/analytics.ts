/**
 * WhatsApp Bot Analytics Tracking
 *
 * Tracks usage metrics: messages, tool calls, documents, errors, response times.
 * Data stored in whatsapp_analytics table for dashboard visibility.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
}

/**
 * Track an analytics event (fire-and-forget, non-blocking)
 */
export function trackEvent(event: AnalyticsEvent): void {
  // Fire and forget - don't await to avoid blocking
  trackEventAsync(event).catch((err) => {
    // Silently fail - analytics should never break main flow
    logger.warn("[Analytics] Failed to track event", { category: LogCategory.DATABASE, error: err.message });
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
    });
  } catch (err) {
    // Log but don't throw - analytics failures shouldn't break main flow
    logger.warn("[Analytics] Insert failed", { category: LogCategory.DATABASE, error: String(err) });
  }
}

/**
 * Helper to track message received
 */
export function trackMessageReceived(phoneNumber: string, agentId?: string, metadata?: Record<string, unknown>): void {
  trackEvent({
    phoneNumber,
    agentId,
    eventType: "message_received",
    metadata,
  });
}

/**
 * Helper to track message sent with response time
 */
export function trackMessageSent(
  phoneNumber: string,
  responseTimeMs: number,
  tokenCount?: number,
  agentId?: string
): void {
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
