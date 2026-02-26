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

const responseHeaders = {
  "Content-Type": "application/json",
};

/**
 * Health check - verify configuration is accessible
 */
function getHealthStatus() {
  try {
    // Test configuration access
    const config = get3CXConfig();

    return {
      status: "healthy",
      config: {
        targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
        internalExtensions: AUDIT_CONFIG.INTERNAL_EXTENSIONS,
        timezone: AUDIT_CONFIG.TIMEZONE,
        scheduleHour: AUDIT_CONFIG.SCHEDULE_HOUR,
        scheduleDays: AUDIT_CONFIG.SCHEDULE_DAYS,
        threeCXBaseUrl: config.baseUrl, // Don't expose credentials
        threeCXConfigured: true,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Configuration error",
      timestamp: new Date().toISOString(),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    logger.info("[Call Audit] Function invoked", {
      category: LogCategory.GENERAL,
      method: req.method,
      url: req.url,
    });

    // For now, return health status and configuration info
    // Actual audit execution will be implemented in plan 11-02
    const healthStatus = getHealthStatus();

    if (healthStatus.status === "unhealthy") {
      logger.error("[Call Audit] Configuration error", new Error(healthStatus.error || "Unknown config error"), {
        category: LogCategory.GENERAL,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuration error",
          message: healthStatus.error,
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    logger.info("[Call Audit] Health check passed", {
      category: LogCategory.GENERAL,
      targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
      baseUrl: healthStatus.config.threeCXBaseUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Call audit function ready",
        ...healthStatus,
      }),
      { headers: responseHeaders, status: 200 }
    );

  } catch (error) {
    logger.error("[Call Audit] Fatal error", error instanceof Error ? error : new Error(String(error)), {
      category: LogCategory.GENERAL,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: "Call audit failed",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { headers: responseHeaders, status: 500 }
    );
  }
});