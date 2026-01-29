/**
 * Health Check Handler
 *
 * Returns service status and dependency availability.
 * Endpoint: GET /health
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";

interface HealthCheck {
  status: "healthy" | "unhealthy" | "degraded";
  latencyMs?: number;
  error?: string;
}

/**
 * Health check endpoint - returns service status and dependency availability
 */
export async function handleHealthCheck(
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const startTime = Date.now();

  logger.info("Health check requested", {
    category: LogCategory.WEBHOOK,
    operation: "healthCheck",
  });

  const checks: Record<string, HealthCheck> = {};

  // Check OpenRouter (AI provider)
  try {
    const orStart = Date.now();
    const orResponse = await fetch("https://openrouter.ai/api/v1/models", {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    checks.openrouter = {
      status: orResponse.ok ? "healthy" : "degraded",
      latencyMs: Date.now() - orStart,
    };
  } catch (err) {
    checks.openrouter = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }

  // Check Zyprus API
  const zyprusUrl = Deno.env.get("ZYPRUS_API_URL");
  if (zyprusUrl) {
    try {
      const zStart = Date.now();
      const zResponse = await fetch(`${zyprusUrl}/jsonapi`, {
        method: "HEAD",
        headers: { "User-Agent": "SophiaAI-HealthCheck" },
        signal: AbortSignal.timeout(5000),
      });
      checks.zyprus = {
        status: zResponse.ok || zResponse.status === 401 ? "healthy" : "degraded",
        latencyMs: Date.now() - zStart,
      };
    } catch (err) {
      checks.zyprus = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.zyprus = { status: "unhealthy", error: "ZYPRUS_API_URL not configured" };
  }

  // Check Supabase (database)
  try {
    const dbStart = Date.now();
    const { error } = await supabase.from("chat_history").select("id").limit(1);
    checks.supabase = {
      status: error ? "degraded" : "healthy",
      latencyMs: Date.now() - dbStart,
      error: error?.message,
    };
  } catch (err) {
    checks.supabase = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }

  // Check WaSender API
  const wasendKey = Deno.env.get("WASEND_API_KEY");
  if (wasendKey) {
    try {
      const wStart = Date.now();
      const wResponse = await fetch("https://app.wasenderapi.com/api/v1/health", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      checks.wasender = {
        status: wResponse.ok || wResponse.status === 401 ? "healthy" : "degraded",
        latencyMs: Date.now() - wStart,
      };
    } catch (err) {
      checks.wasender = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.wasender = { status: "unhealthy", error: "WASEND_API_KEY not configured" };
  }

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  const overallStatus = statuses.every(s => s === "healthy")
    ? "healthy"
    : statuses.some(s => s === "unhealthy")
      ? "unhealthy"
      : "degraded";

  // Log warnings for unhealthy dependencies
  for (const [name, check] of Object.entries(checks)) {
    if (check.status === "unhealthy") {
      logger.warn(`Dependency unhealthy: ${name}`, {
        category: LogCategory.WEBHOOK,
        operation: "healthCheck",
        dependency: name,
        error: check.error,
      });
    }
  }

  logger.info("Health check completed", {
    category: LogCategory.WEBHOOK,
    operation: "healthCheck",
    status: overallStatus,
    totalLatencyMs: Date.now() - startTime,
    unhealthyDeps: Object.entries(checks)
      .filter(([_, v]) => v.status === "unhealthy")
      .map(([k, _]) => k),
  });

  const response = {
    service: "sophia-bot",
    version: "1.1.0",
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    dependencies: checks,
    config: {
      openrouterConfigured: !!Deno.env.get("OPENROUTER_API_KEY"),
      wasenderConfigured: !!Deno.env.get("WASEND_API_KEY"),
      resendConfigured: !!Deno.env.get("RESEND_API_KEY"),
      adminSecretConfigured: !!Deno.env.get("SOPHIA_ADMIN_SECRET"),
    },
  };

  const httpStatus = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(response, null, 2), {
    status: httpStatus,
    headers: { "Content-Type": "application/json" },
  });
}
