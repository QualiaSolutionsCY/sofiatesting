/**
 * Call Audit Edge Function
 *
 * Extracts call logs from 3CX phone system and identifies external callers
 * to the main Zyprus line (22032770) for lead tracking purposes.
 *
 * Schedule: Daily at 5:00 PM Cyprus time via pg_cron
 * Target: 3CX phone system web API
 *
 * Prerequisites:
 *   1. Set 3CX credentials: CX3_BASE_URL, CX3_USERNAME, CX3_PASSWORD
 *   2. Deploy: supabase functions deploy call-audit --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
 *   3. Set up pg_cron schedule for daily execution
 */

import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";
import { AUDIT_CONFIG, get3CXConfig } from "./config.ts";
import { ThreeCXClient } from "./3cx/client.ts";
import { runDailyAudit } from "./audit-pipeline.ts";

const responseHeaders = {
  "Content-Type": "application/json",
};

/**
 * Error categories for structured error reporting
 */
enum ErrorCategory {
  AUTH_FAILED = "AUTH_FAILED",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  NETWORK_ERROR = "NETWORK_ERROR",
  PARSE_ERROR = "PARSE_ERROR",
  NO_DATA = "NO_DATA",
  CONFIG_ERROR = "CONFIG_ERROR",
  UNKNOWN = "UNKNOWN"
}

/**
 * Check if an error is retryable based on category
 */
function isRetryableError(category: ErrorCategory): boolean {
  switch (category) {
    case ErrorCategory.NETWORK_ERROR:
    case ErrorCategory.SESSION_EXPIRED:
      return true;
    case ErrorCategory.AUTH_FAILED:
    case ErrorCategory.PARSE_ERROR:
    case ErrorCategory.CONFIG_ERROR:
      return false;
    case ErrorCategory.NO_DATA:
    case ErrorCategory.UNKNOWN:
    default:
      return false;
  }
}

/**
 * Classify error by type and message
 */
function classifyError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Authentication errors
  if (
    message.includes("authentication failed") ||
    message.includes("credentials rejected") ||
    message.includes("login failed") ||
    name.includes("auth")
  ) {
    return ErrorCategory.AUTH_FAILED;
  }

  // Session expiry
  if (
    message.includes("session expired") ||
    message.includes("login page") ||
    message.includes("re-authentication failed") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return ErrorCategory.SESSION_EXPIRED;
  }

  // Network errors
  if (
    message.includes("network error") ||
    message.includes("timeout") ||
    message.includes("fetch") ||
    message.includes("econnrefused") ||
    message.includes("cannot reach") ||
    name.includes("network") ||
    name.includes("fetch")
  ) {
    return ErrorCategory.NETWORK_ERROR;
  }

  // Parse errors
  if (
    message.includes("parse") ||
    message.includes("json") ||
    message.includes("format") ||
    message.includes("invalid json") ||
    message.includes("unexpected content type")
  ) {
    return ErrorCategory.PARSE_ERROR;
  }

  // Configuration errors
  if (
    message.includes("configuration") ||
    message.includes("config") ||
    message.includes("environment variable") ||
    message.includes("missing")
  ) {
    return ErrorCategory.CONFIG_ERROR;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Health check - verify configuration and test 3CX connectivity
 */
async function getHealthStatus(includeConnectivityTest = false): Promise<any> {
  const healthResult: any = {
    timestamp: new Date().toISOString(),
  };

  // Test configuration access
  try {
    const config = get3CXConfig();
    healthResult.config = {
      targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
      internalExtensions: AUDIT_CONFIG.INTERNAL_EXTENSIONS,
      timezone: AUDIT_CONFIG.TIMEZONE,
      scheduleHour: AUDIT_CONFIG.SCHEDULE_HOUR,
      scheduleDays: AUDIT_CONFIG.SCHEDULE_DAYS,
      threeCXBaseUrl: config.baseUrl, // Don't expose credentials
      threeCXConfigured: true,
    };
    healthResult.configStatus = "valid";
  } catch (configError) {
    healthResult.configStatus = "invalid";
    healthResult.configError = configError instanceof Error ? configError.message : "Configuration error";
    healthResult.status = "unhealthy";
    return healthResult;
  }

  // Test 3CX reachability if requested
  if (includeConnectivityTest) {
    try {
      const config = get3CXConfig();

      // Simple connectivity test - HEAD request to base URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(config.baseUrl, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "SophiaAI-CallAudit-Health",
        },
      }).finally(() => clearTimeout(timeoutId));

      healthResult.connectivity = {
        reachable: true,
        responseStatus: response.status,
        responseTime: "< 10s",
      };
    } catch (connectError) {
      healthResult.connectivity = {
        reachable: false,
        error: connectError instanceof Error ? connectError.message : "Connection failed",
        responseTime: "timeout",
      };

      if (connectError instanceof Error && connectError.name === "AbortError") {
        healthResult.connectivity.error = "Connection timeout after 10s";
      }
    }
  }

  healthResult.status = healthResult.configStatus === "valid" &&
    (!includeConnectivityTest || healthResult.connectivity?.reachable) ? "healthy" : "unhealthy";

  return healthResult;
}

Deno.serve(async (req: Request) => {
  const startTime = performance.now();
  const startTimestamp = new Date().toISOString();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const isHealthCheck = url.searchParams.get('health') !== null;
    const isDryRun = url.searchParams.get('dry-run') === 'true';
    const dateOverride = url.searchParams.get('date');
    const isCronInvocation = req.headers.get('x-cron') === 'true';

    logger.info("[Call Audit] Function invoked", {
      category: LogCategory.GENERAL,
      method: req.method,
      url: req.url,
      isHealthCheck,
      isDryRun,
      dateOverride,
      isCronInvocation,
      trigger: isCronInvocation ? "pg_cron" : "manual",
    });

    // Handle health check
    if (isHealthCheck) {
      const includeConnectivity = url.searchParams.get('connectivity') === 'true';
      const healthStatus = await getHealthStatus(includeConnectivity);
      const executionMs = Math.round(performance.now() - startTime);

      return new Response(
        JSON.stringify({
          ...healthStatus,
          executionMs,
        }),
        {
          headers: responseHeaders,
          status: healthStatus.status === "healthy" ? 200 : 503
        }
      );
    }

    // Handle follow-up-only mode
    const isFollowUpOnly = url.searchParams.get('follow-up-only') === 'true';
    if (isFollowUpOnly) {
      const { processFollowUpReminders } = await import("./follow-up.ts");
      const followUpResult = await processFollowUpReminders();
      const executionMs = Math.round(performance.now() - startTime);

      logger.info("[Call Audit] Follow-up-only mode completed", {
        category: LogCategory.GENERAL,
        ...followUpResult,
      });

      return new Response(
        JSON.stringify({
          success: true,
          result: {
            ...followUpResult,
            timestamp: new Date().toISOString(),
            executionMs,
          },
        }),
        { headers: responseHeaders, status: 200 }
      );
    }

    // 1. Read and validate 3CX config
    let config;
    try {
      config = get3CXConfig();
    } catch (configError) {
      const errorCategory = classifyError(configError instanceof Error ? configError : new Error(String(configError)));
      const executionMs = Math.round(performance.now() - startTime);

      logger.error("[Call Audit] Configuration validation failed", configError instanceof Error ? configError : new Error(String(configError)), {
        category: LogCategory.GENERAL,
        auditErrorCategory: errorCategory,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorCategory,
          message: configError instanceof Error ? configError.message : String(configError),
          timestamp: new Date().toISOString(),
          retryable: isRetryableError(errorCategory),
          executionMs,
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    // 2. Create ThreeCXClient instance
    const client = new ThreeCXClient(config);

    // 3. Authenticate to 3CX
    try {
      await client.login();
    } catch (authError) {
      const errorCategory = classifyError(authError instanceof Error ? authError : new Error(String(authError)));
      const executionMs = Math.round(performance.now() - startTime);

      logger.error("[Call Audit] 3CX authentication failed", authError instanceof Error ? authError : new Error(String(authError)), {
        category: LogCategory.GENERAL,
        auditErrorCategory: errorCategory,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorCategory,
          message: authError instanceof Error ? authError.message : String(authError),
          timestamp: new Date().toISOString(),
          retryable: isRetryableError(errorCategory),
          executionMs,
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    // If dry-run mode, return auth status only
    if (isDryRun) {
      const executionMs = Math.round(performance.now() - startTime);

      logger.info("[Call Audit] Dry run completed - authentication successful", {
        category: LogCategory.GENERAL,
        targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
        executionMs,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Dry run successful - 3CX authentication working",
          config: {
            targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
            internalExtensions: AUDIT_CONFIG.INTERNAL_EXTENSIONS,
            timezone: AUDIT_CONFIG.TIMEZONE,
            threeCXBaseUrl: config.baseUrl,
          },
          timestamp: new Date().toISOString(),
          executionMs,
        }),
        { headers: responseHeaders, status: 200 }
      );
    }

    // Run the full audit pipeline
    const result = await runDailyAudit(dateOverride || undefined);
    const executionMs = Math.round(performance.now() - startTime);

    return new Response(
      JSON.stringify({
        success: result.success,
        result: {
          ...result,
          trigger: isCronInvocation ? "pg_cron" : "manual",
          timestamp: new Date().toISOString(),
          executionMs,
        },
      }),
      {
        headers: responseHeaders,
        status: result.success ? 200 : 500,
      }
    );

  } catch (error) {
    const errorCategory = classifyError(error instanceof Error ? error : new Error(String(error)));
    const executionMs = Math.round(performance.now() - startTime);

    logger.error("[Call Audit] Fatal error", error instanceof Error ? error : new Error(String(error)), {
      category: LogCategory.GENERAL,
      auditErrorCategory: errorCategory,
      executionMs,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: errorCategory,
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        retryable: isRetryableError(errorCategory),
        executionMs,
      }),
      { headers: responseHeaders, status: 500 }
    );
  }
});