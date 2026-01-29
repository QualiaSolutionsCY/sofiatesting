/**
 * Admin API Handlers
 *
 * Authenticated endpoints for prompt management, cache control, and migrations.
 *
 * Endpoints:
 * - POST /admin/prompts/invalidate - Clear prompt cache
 * - POST /admin/prompts/rollback - Rollback a prompt to previous version
 * - GET /admin/prompts/history?key=X - Get version history
 * - GET /admin/cache/status - Cache diagnostic info
 * - POST /admin/migrate-templates - One-time template migration
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";
import {
  invalidateCache,
  getCacheStatus,
  rollbackPrompt,
  getPromptVersionHistory,
} from "../services/prompt-loader.ts";

const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");

/**
 * Handle admin API requests
 * Requires SOPHIA_ADMIN_SECRET header for authentication
 */
export async function handleAdminRequest(
  req: Request,
  url: URL,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  // Authenticate admin request
  const providedSecret = req.headers.get("x-admin-secret");

  if (!ADMIN_SECRET) {
    logger.warn("Admin endpoint accessed but SOPHIA_ADMIN_SECRET not configured", {
      category: LogCategory.GENERAL,
      endpoint: url.pathname,
    });
    return new Response(JSON.stringify({
      error: "Admin endpoints not configured"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (providedSecret !== ADMIN_SECRET) {
    logger.warn("Admin endpoint unauthorized access attempt", {
      category: LogCategory.GENERAL,
      endpoint: url.pathname,
    });
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Route to specific admin endpoint
  if (url.pathname === "/sophia-bot/admin/prompts/invalidate" && req.method === "POST") {
    return handleCacheInvalidate();
  }

  if (url.pathname === "/sophia-bot/admin/prompts/rollback" && req.method === "POST") {
    return handlePromptRollback(req, supabase);
  }

  if (url.pathname === "/sophia-bot/admin/prompts/history" && req.method === "GET") {
    return handlePromptHistory(url, supabase);
  }

  if (url.pathname === "/sophia-bot/admin/cache/status" && req.method === "GET") {
    return handleCacheStatus();
  }

  if (url.pathname === "/sophia-bot/admin/migrate-templates" && req.method === "POST") {
    return handleTemplateMigration(supabase);
  }

  // Unknown admin endpoint
  return new Response(JSON.stringify({
    error: "Not Found",
    availableEndpoints: [
      "POST /sophia-bot/admin/prompts/invalidate",
      "POST /sophia-bot/admin/prompts/rollback",
      "GET /sophia-bot/admin/prompts/history?key=X",
      "GET /sophia-bot/admin/cache/status",
      "POST /sophia-bot/admin/migrate-templates",
    ]
  }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/prompts/invalidate
 * Clears the prompt cache, forcing reload on next request
 */
function handleCacheInvalidate(): Response {
  invalidateCache();

  logger.info("Admin: Cache invalidated via API", {
    category: LogCategory.GENERAL,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Prompt cache invalidated. Next request will reload from database.",
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /admin/cache/status
 * Returns cache diagnostic information
 */
function handleCacheStatus(): Response {
  const status = getCacheStatus();

  logger.debug("Admin: Cache status requested", {
    category: LogCategory.GENERAL,
    ...status,
  });

  return new Response(JSON.stringify({
    cache: {
      isCached: status.isCached,
      ageMs: status.age,
      ageFormatted: status.age > 0 ? `${Math.round(status.age / 1000)}s` : "N/A",
      ttlMs: status.ttl,
      ttlFormatted: status.ttl > 0 ? `${Math.round(status.ttl / 60000)}min` : "disabled",
      sectionCount: status.sectionCount,
      version: status.version,
      isExpired: status.ttl > 0 ? status.age > status.ttl : false,
    },
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/prompts/rollback
 * Rollback a prompt to a previous version
 */
async function handlePromptRollback(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  try {
    const body = await req.json();
    const { key, version, reason } = body;

    if (!key || typeof key !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'key'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!version || typeof version !== "number" || version < 1) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'version' (must be positive integer)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reason || typeof reason !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'reason'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    logger.info("Admin: Rollback requested", {
      category: LogCategory.CACHE,
      promptKey: key,
      targetVersion: version,
      reason,
    });

    const result = await rollbackPrompt(supabase, key, version, reason);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("Admin: Rollback endpoint error", err as Error, {
      category: LogCategory.CACHE,
    });
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /admin/prompts/history?key=identity
 * Get version history for a prompt
 */
async function handlePromptHistory(
  url: URL,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing 'key' query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const history = await getPromptVersionHistory(supabase, key);

  logger.debug("Admin: Version history requested", {
    category: LogCategory.CACHE,
    promptKey: key,
    versionCount: history.length,
  });

  return new Response(JSON.stringify({ key, history }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/migrate-templates
 * One-time migration: Insert templates content into sophia_prompts table
 */
async function handleTemplateMigration(
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  try {
    // Check if templates key already exists
    const { data: existing, error: checkError } = await supabase
      .from("sophia_prompts")
      .select("key, priority, is_active")
      .eq("key", "templates")
      .maybeSingle();

    if (checkError) {
      logger.error("Admin: Template migration check failed", undefined, {
        category: LogCategory.GENERAL,
        errorMessage: checkError.message,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Database check failed",
        details: checkError.message,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (existing) {
      logger.info("Admin: Templates already migrated", {
        category: LogCategory.GENERAL,
        existing,
      });

      return new Response(JSON.stringify({
        success: true,
        alreadyExists: true,
        message: "Templates key already exists in database",
        existing: {
          key: existing.key,
          priority: existing.priority,
          active: existing.is_active,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Import templates content from prompts/templates/content.ts
    const { TEMPLATES } = await import("../prompts/templates/content.ts");

    logger.info("Admin: Inserting templates into database", {
      category: LogCategory.GENERAL,
      contentLength: TEMPLATES.length,
    });

    // Insert templates
    const { data, error: insertError } = await supabase
      .from("sophia_prompts")
      .insert({
        key: "templates",
        content: TEMPLATES,
        category: "templates",
        description: "All 43 document templates for Cyprus real estate communications",
        priority: 80,
        is_active: true,
        updated_by: "migration-08-02",
        version: 1,
        is_current: true,
      })
      .select("id, key, priority, is_active")
      .single();

    if (insertError) {
      logger.error("Admin: Template migration insert failed", undefined, {
        category: LogCategory.GENERAL,
        errorMessage: insertError.message,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Database insert failed",
        details: insertError.message,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info("Admin: Templates migrated successfully", {
      category: LogCategory.GENERAL,
      id: data.id,
      key: data.key,
      priority: data.priority,
      contentLength: TEMPLATES.length,
    });

    // Invalidate cache to pick up new templates
    invalidateCache();

    return new Response(JSON.stringify({
      success: true,
      message: "Templates migrated successfully to database",
      data: {
        id: data.id,
        key: data.key,
        priority: data.priority,
        active: data.is_active,
        contentLength: TEMPLATES.length,
      },
      cacheInvalidated: true,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("Admin: Template migration unexpected error", err instanceof Error ? err : undefined, {
      category: LogCategory.GENERAL,
      errorDetails: err instanceof Error ? err.message : String(err),
    });

    return new Response(JSON.stringify({
      success: false,
      error: "Unexpected error during migration",
      details: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
