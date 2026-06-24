/**
 * Health Check Handler
 *
 * Returns service status and dependency availability.
 * Endpoint: GET /health
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { LogCategory, logger } from "../utils/logger.ts";

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

  // Lightweight OpenRouter KEY check (credential-only via /api/v1/key — NO chat
  // completion, so it costs zero tokens). Detects a revoked/invalid key without
  // burning credits on every health check (a live completion probe would, and that
  // headroom is what ran out and took Sophia down).
  try {
    const orKeyStart = Date.now();
    const keyResp = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY") ?? ""}` },
      signal: AbortSignal.timeout(5000),
    });
    checks.openrouterKey = {
      status: keyResp.ok ? "healthy" : "unhealthy",
      latencyMs: Date.now() - orKeyStart,
      error: keyResp.ok ? undefined : `HTTP ${keyResp.status}`,
    };
  } catch (err) {
    checks.openrouterKey = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }

  // Check Zyprus API
  // Note: /jsonapi returns 403 without auth, but that means the server is responding
  const zyprusUrl = Deno.env.get("ZYPRUS_API_URL");
  if (zyprusUrl) {
    try {
      const zStart = Date.now();
      const zResponse = await fetch(`${zyprusUrl}/jsonapi`, {
        method: "HEAD",
        headers: { "User-Agent": "SophiaAI-HealthCheck" },
        signal: AbortSignal.timeout(5000),
      });
      // 401/403 means the server is responding but we need auth - that's healthy
      // Only mark degraded if 5xx or connection issues
      const isHealthy =
        zResponse.ok || zResponse.status === 401 || zResponse.status === 403;
      checks.zyprus = {
        status: isHealthy
          ? "healthy"
          : zResponse.status >= 500
            ? "unhealthy"
            : "degraded",
        latencyMs: Date.now() - zStart,
      };
    } catch (err) {
      checks.zyprus = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.zyprus = {
      status: "unhealthy",
      error: "ZYPRUS_API_URL not configured",
    };
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
  // WaSender doesn't have a /health endpoint, so we check the main app URL
  const wasendKey = Deno.env.get("WASEND_API_KEY");
  if (wasendKey) {
    try {
      const wStart = Date.now();
      // Check the main WaSender app URL instead of non-existent health endpoint
      const wResponse = await fetch("https://app.wasenderapi.com/", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      // 200 means site is up, which is healthy enough for us
      checks.wasender = {
        status: wResponse.ok
          ? "healthy"
          : wResponse.status >= 500
            ? "unhealthy"
            : "degraded",
        latencyMs: Date.now() - wStart,
      };
    } catch (err) {
      checks.wasender = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.wasender = {
      status: "unhealthy",
      error: "WASEND_API_KEY not configured",
    };
  }

  // Determine overall status
  const statuses = Object.values(checks).map((c) => c.status);
  const overallStatus = statuses.every((s) => s === "healthy")
    ? "healthy"
    : statuses.some((s) => s === "unhealthy")
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
    version: "1.1.4",
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

  const httpStatus =
    overallStatus === "healthy"
      ? 200
      : overallStatus === "degraded"
        ? 200
        : 503;

  return new Response(JSON.stringify(response, null, 2), {
    status: httpStatus,
    headers: { "Content-Type": "application/json" },
  });
}
