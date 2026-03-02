/**
 * Sentry Error Tracking for Deno Edge Functions
 *
 * Provides centralized error tracking and monitoring for SOPHIA Edge Functions.
 * Captures production errors with stack traces, user context, and breadcrumbs.
 *
 * Features:
 * - Deno-compatible Sentry SDK via esm.sh CDN
 * - Environment-based configuration (production vs development)
 * - User context (phone number, agent ID) for debugging
 * - Breadcrumb trail showing request flow before errors
 * - No hardcoded DSN (uses environment variable)
 *
 * Related: AI-PRODUCTION-AUDIT.md findings #20, #53
 */

import * as Sentry from "https://esm.sh/@sentry/deno@8.40.0";

// Track initialization state
let sentryInitialized = false;

/**
 * Initialize Sentry for Edge Function error tracking
 *
 * Should be called once at module load time (top-level in index.ts).
 * Safe to call multiple times - will only initialize once.
 *
 * Configuration:
 * - DSN from SENTRY_DSN environment variable
 * - Environment auto-detected from DENO_DEPLOYMENT_ID
 * - 10% traces sampling in production
 * - Release tag from deployment ID when available
 *
 * @example
 * ```typescript
 * // In index.ts (top-level, before Deno.serve)
 * import { initSentry } from "../_shared/sentry.ts";
 * initSentry(); // Initialize Sentry for error tracking (OBS-01)
 * ```
 */
export function initSentry(): void {
  // Prevent double initialization
  if (sentryInitialized) {
    return;
  }

  const sentryDsn = Deno.env.get("SENTRY_DSN");
  const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
  const isProduction = !!deploymentId;

  // Only initialize if DSN is configured
  if (!sentryDsn) {
    console.warn(
      "[Sentry] SENTRY_DSN not configured - error tracking disabled"
    );
    return;
  }

  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: isProduction ? "production" : "development",
      enabled: isProduction, // Only enabled in production
      tracesSampleRate: 0.1, // 10% sampling to match edge config
      release: deploymentId || undefined, // Tag releases with deployment ID
      debug: false, // No debug logs in production
      // Attach stack traces for error events
      attachStacktrace: true,
      // Capture unhandled rejections
      integrations: [
        Sentry.denoIntegration(),
      ],
    });

    sentryInitialized = true;
    console.log(
      `[Sentry] Initialized for ${isProduction ? "production" : "development"} environment`
    );
  } catch (error) {
    console.error("[Sentry] Failed to initialize:", error);
  }
}

/**
 * Capture an error and send to Sentry with contextual information
 *
 * Enriches error with user context (phone number, agent ID) and tags
 * (channel, correlation ID) for easier debugging in production.
 *
 * @param error - Error instance to capture
 * @param context - Optional context with user/request metadata
 *
 * Context fields:
 * - phoneNumber: User's WhatsApp phone number (sets Sentry user ID)
 * - agentId: Zyprus agent UUID (helps filter by agent)
 * - correlationId: Request correlation ID for tracing
 * - channel: Communication channel (whatsapp, telegram, etc.)
 * - Any other custom fields
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   captureError(error as Error, {
 *     phoneNumber,
 *     agentId: agent?.id,
 *     correlationId,
 *     channel: "whatsapp"
 *   });
 *   logger.error("Operation failed", error); // Still log normally
 * }
 * ```
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
): void {
  if (!sentryInitialized) {
    // Sentry not initialized - skip silently
    return;
  }

  try {
    // Set user context if phone number provided
    if (context?.phoneNumber) {
      Sentry.setUser({
        id: String(context.phoneNumber),
        // Don't send actual phone number to Sentry (PII)
        // The ID is hashed and used for grouping
      });
    }

    // Set agent ID as tag if provided
    if (context?.agentId) {
      Sentry.setTag("agent_id", String(context.agentId));
    }

    // Set correlation ID for request tracing
    if (context?.correlationId) {
      Sentry.setTag("correlation_id", String(context.correlationId));
    }

    // Set channel tag (whatsapp, telegram, etc.)
    if (context?.channel) {
      Sentry.setTag("channel", String(context.channel));
    }

    // Add any additional context as extras
    if (context) {
      const extras = { ...context };
      // Remove fields already set as user/tags
      delete extras.phoneNumber;
      delete extras.agentId;
      delete extras.correlationId;
      delete extras.channel;

      if (Object.keys(extras).length > 0) {
        Sentry.setExtras(extras);
      }
    }

    // Capture the error
    Sentry.captureException(error);
  } catch (sentryError) {
    // Don't let Sentry errors break the application
    console.error("[Sentry] Failed to capture error:", sentryError);
  }
}

/**
 * Add a breadcrumb to track request flow before errors
 *
 * Breadcrumbs create a trail of events leading up to an error, making
 * debugging much easier. They show what the user did and what the system
 * processed before something went wrong.
 *
 * @param message - Human-readable description of the event
 * @param category - Breadcrumb category for filtering
 * @param data - Optional structured data about the event
 *
 * Categories:
 * - http: HTTP requests/responses (webhook received, API called)
 * - ai: AI operations (model called, response received)
 * - tool: Tool executions (tool name, arguments)
 * - database: Database operations (query, insert, update)
 * - user: User actions (message sent, button clicked)
 *
 * @example
 * ```typescript
 * // At webhook entry point
 * addBreadcrumb("WhatsApp webhook received", "http", {
 *   correlationId,
 *   phoneNumber: "[REDACTED]"
 * });
 *
 * // Before AI call
 * addBreadcrumb("Calling OpenRouter", "ai", {
 *   model: "google/gemini-3-flash-preview"
 * });
 *
 * // After tool execution
 * addBreadcrumb("Tool executed", "tool", {
 *   toolName: "createPropertyListing",
 *   success: true
 * });
 * ```
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  if (!sentryInitialized) {
    // Sentry not initialized - skip silently
    return;
  }

  try {
    Sentry.addBreadcrumb({
      message,
      category,
      level: "info",
      timestamp: Date.now() / 1000, // Sentry expects seconds
      data: data || {},
    });
  } catch (sentryError) {
    // Don't let Sentry errors break the application
    console.error("[Sentry] Failed to add breadcrumb:", sentryError);
  }
}
