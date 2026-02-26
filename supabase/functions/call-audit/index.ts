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
import { extractTodayCalls, filterExternalCallers } from "./3cx/call-log-extractor.ts";

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
    const url = new URL(req.url);
    const isDryRun = url.searchParams.get('dry-run') === 'true';
    const dateOverride = url.searchParams.get('date');

    logger.info("[Call Audit] Function invoked", {
      category: LogCategory.GENERAL,
      method: req.method,
      url: req.url,
      isDryRun,
      dateOverride,
    });

    // 1. Read and validate 3CX config
    let config;
    try {
      config = get3CXConfig();
    } catch (configError) {
      logger.error("[Call Audit] Configuration validation failed", configError instanceof Error ? configError : new Error(String(configError)), {
        category: LogCategory.GENERAL,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Configuration error",
          details: configError instanceof Error ? configError.message : String(configError),
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
      logger.error("[Call Audit] 3CX authentication failed", authError instanceof Error ? authError : new Error(String(authError)), {
        category: LogCategory.GENERAL,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "3CX authentication failed",
          details: authError instanceof Error ? authError.message : String(authError),
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    // If dry-run mode, return auth status only
    if (isDryRun) {
      logger.info("[Call Audit] Dry run completed - authentication successful", {
        category: LogCategory.GENERAL,
        targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
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
        }),
        { headers: responseHeaders, status: 200 }
      );
    }

    // 4. Extract today's call log (or specific date if provided)
    let entries;
    try {
      if (dateOverride) {
        // For testing with specific dates, we'd need to modify extractTodayCalls
        // For now, log the override and proceed with today
        logger.info("[Call Audit] Date override requested (using today for now)", {
          category: LogCategory.GENERAL,
          requestedDate: dateOverride,
        });
      }

      entries = await extractTodayCalls(client);
    } catch (extractError) {
      logger.error("[Call Audit] Call log extraction failed", extractError instanceof Error ? extractError : new Error(String(extractError)), {
        category: LogCategory.GENERAL,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Call log extraction failed",
          details: extractError instanceof Error ? extractError.message : String(extractError),
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    // 5. Filter external callers and deduplicate
    let auditResult;
    try {
      auditResult = filterExternalCallers(entries);
    } catch (filterError) {
      logger.error("[Call Audit] Call filtering failed", filterError instanceof Error ? filterError : new Error(String(filterError)), {
        category: LogCategory.GENERAL,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Call filtering failed",
          details: filterError instanceof Error ? filterError.message : String(filterError),
        }),
        { headers: responseHeaders, status: 500 }
      );
    }

    // 6. Log summary and return result
    logger.info("[Call Audit] Audit completed successfully", {
      category: LogCategory.GENERAL,
      date: auditResult.date,
      totalCalls: auditResult.totalCalls,
      externalCallers: auditResult.externalCallers.length,
      internalFiltered: auditResult.internalFiltered,
      errors: auditResult.errors.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        result: auditResult,
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