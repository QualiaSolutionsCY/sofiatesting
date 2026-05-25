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
 * - POST /admin/generate-description - Generate AI property description (for Zyprus)
 */

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { getAgentByEmail } from "../agents/identifier.ts";
import {
  generateDescription,
  type PropertyDetails,
} from "../services/description-generator.ts";
import {
  getCacheStatus,
  getPromptVersionHistory,
  invalidateCache,
  rollbackPrompt,
} from "../services/prompt-loader.ts";
import { handleCreatePropertyListing } from "../tools/handlers/property-listing.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { constantTimeCompare } from "../utils/webhook-auth.ts";
import { loadTaxonomy } from "../zyprus/taxonomy-cache.ts";

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
    logger.warn(
      "Admin endpoint accessed but SOPHIA_ADMIN_SECRET not configured",
      {
        category: LogCategory.GENERAL,
        endpoint: url.pathname,
      }
    );
    return new Response(
      JSON.stringify({
        error: "Admin endpoints not configured",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Use constant-time comparison to prevent timing attacks
  if (!constantTimeCompare(providedSecret || "", ADMIN_SECRET)) {
    logger.warn("Admin endpoint unauthorized access attempt", {
      category: LogCategory.GENERAL,
      endpoint: url.pathname,
    });
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Route to specific admin endpoint
  if (
    url.pathname === "/sophia-bot/admin/prompts/invalidate" &&
    req.method === "POST"
  ) {
    return handleCacheInvalidate();
  }

  if (
    url.pathname === "/sophia-bot/admin/prompts/rollback" &&
    req.method === "POST"
  ) {
    return handlePromptRollback(req, supabase);
  }

  if (
    url.pathname === "/sophia-bot/admin/prompts/history" &&
    req.method === "GET"
  ) {
    return handlePromptHistory(url, supabase);
  }

  if (
    url.pathname === "/sophia-bot/admin/cache/status" &&
    req.method === "GET"
  ) {
    return handleCacheStatus();
  }

  if (
    url.pathname === "/sophia-bot/admin/migrate-templates" &&
    req.method === "POST"
  ) {
    return handleTemplateMigration(supabase);
  }

  if (
    url.pathname === "/sophia-bot/admin/prompts/sync" &&
    req.method === "POST"
  ) {
    return handlePromptSync(req, supabase);
  }

  // Generate property description endpoint (for Zyprus CMS)
  if (
    url.pathname === "/sophia-bot/admin/generate-description" &&
    req.method === "POST"
  ) {
    return handleGenerateDescription(req);
  }

  // Direct tool invocation (bypasses AI pipeline)
  if (
    url.pathname === "/sophia-bot/admin/create-listing" &&
    req.method === "POST"
  ) {
    return handleDirectCreateListing(req);
  }

  // Taxonomy debug endpoint — search locations
  if (
    url.pathname === "/sophia-bot/admin/taxonomy/search" &&
    req.method === "GET"
  ) {
    return handleTaxonomySearch(url);
  }

  // Unknown admin endpoint
  return new Response(
    JSON.stringify({
      error: "Not Found",
      availableEndpoints: [
        "POST /sophia-bot/admin/prompts/invalidate",
        "POST /sophia-bot/admin/prompts/rollback",
        "POST /sophia-bot/admin/prompts/sync",
        "GET /sophia-bot/admin/prompts/history?key=X",
        "GET /sophia-bot/admin/cache/status",
        "POST /sophia-bot/admin/migrate-templates",
        "POST /sophia-bot/admin/generate-description - Generate AI property description (for Zyprus)",
      ],
    }),
    {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }
  );
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

  return new Response(
    JSON.stringify({
      success: true,
      message:
        "Prompt cache invalidated. Next request will reload from database.",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
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

  return new Response(
    JSON.stringify({
      cache: {
        isCached: status.isCached,
        ageMs: status.age,
        ageFormatted:
          status.age > 0 ? `${Math.round(status.age / 1000)}s` : "N/A",
        ttlMs: status.ttl,
        ttlFormatted:
          status.ttl > 0 ? `${Math.round(status.ttl / 60_000)}min` : "disabled",
        sectionCount: status.sectionCount,
        version: status.version,
        isExpired: status.ttl > 0 ? status.age > status.ttl : false,
      },
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
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
        JSON.stringify({
          success: false,
          error: "Missing or invalid 'version' (must be positive integer)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reason || typeof reason !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing or invalid 'reason'",
        }),
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
      JSON.stringify({
        success: false,
        error: "Missing 'key' query parameter",
      }),
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
 * POST /admin/prompts/sync
 * Sync file-based prompt content to DB as new versions
 * Body: { "keys": ["document_routing", "response_format"] } or { "keys": "all" }
 */
async function handlePromptSync(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  try {
    const body = await req.json();

    // Import all fallback prompts
    const { DOCUMENT_ROUTING } = await import(
      "../prompts/behaviors/document-routing.ts"
    );
    const { PROPERTY_UPLOAD } = await import(
      "../prompts/behaviors/property-upload.ts"
    );
    const { RESERVATION_LOAN_VAT_REQUIRED } = await import(
      "../prompts/behaviors/reservation-loan-vat.ts"
    );
    const { RESPONSE_FORMAT } = await import(
      "../prompts/behaviors/response-format.ts"
    );
    const { IDENTITY } = await import("../prompts/core/identity.ts");
    const { SAFETY_RULES } = await import("../prompts/core/safety-rules.ts");
    const { CALCULATOR_CAPABILITIES } = await import(
      "../prompts/knowledge/calculators.ts"
    );
    const { CYPRUS_KNOWLEDGE } = await import(
      "../prompts/knowledge/cyprus-real-estate.ts"
    );
    const { TEMPLATES } = await import("../prompts/templates/content.ts");

    const filePrompts: Record<string, string> = {
      identity: IDENTITY,
      safety_rules: SAFETY_RULES,
      reservation_loan_vat_required: RESERVATION_LOAN_VAT_REQUIRED,
      document_routing: DOCUMENT_ROUTING,
      property_upload: PROPERTY_UPLOAD,
      response_format: RESPONSE_FORMAT,
      calculators: CALCULATOR_CAPABILITIES,
      cyprus_knowledge: CYPRUS_KNOWLEDGE,
      templates: TEMPLATES,
    };

    // Determine which keys to sync
    let keysToSync: string[];
    if (body.keys === "all") {
      keysToSync = Object.keys(filePrompts);
    } else if (Array.isArray(body.keys)) {
      keysToSync = body.keys.filter((k: string) => k in filePrompts);
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Body must have "keys": ["key1", "key2"] or "keys": "all"',
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (keysToSync.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No valid keys to sync",
          validKeys: Object.keys(filePrompts),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ key: string; status: string; newVersion?: number }> =
      [];

    for (const key of keysToSync) {
      const content = filePrompts[key];

      // Get current version
      const { data: current } = await supabase
        .from("sophia_prompts")
        .select("version, priority, category, description, content")
        .eq("key", key)
        .eq("is_current", true)
        .maybeSingle();

      // Skip if content is identical
      if (current && current.content === content) {
        results.push({ key, status: "unchanged" });
        continue;
      }

      if (current) {
        // Mark old version as not current
        await supabase
          .from("sophia_prompts")
          .update({ is_current: false, replaced_at: new Date().toISOString() })
          .eq("key", key)
          .eq("version", current.version);

        // Insert new version
        const newVersion = current.version + 1;
        const { error: insertError } = await supabase
          .from("sophia_prompts")
          .insert({
            key,
            content,
            category: current.category,
            description: current.description,
            priority: current.priority,
            is_active: true,
            is_current: true,
            version: newVersion,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: "file-sync",
          });

        if (insertError) {
          // Restore old version
          await supabase
            .from("sophia_prompts")
            .update({ is_current: true, replaced_at: null })
            .eq("key", key)
            .eq("version", current.version);
          results.push({ key, status: `error: ${insertError.message}` });
        } else {
          results.push({ key, status: "synced", newVersion });
        }
      } else {
        results.push({ key, status: "not_in_db (skipped)" });
      }
    }

    // Invalidate cache
    invalidateCache("file-sync");

    logger.info("Admin: Prompt sync completed", {
      category: LogCategory.CACHE,
      results,
    });

    return new Response(
      JSON.stringify({ success: true, results, cacheInvalidated: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
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

      return new Response(
        JSON.stringify({
          success: false,
          error: "Database check failed",
          details: checkError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (existing) {
      logger.info("Admin: Templates already migrated", {
        category: LogCategory.GENERAL,
        existing,
      });

      return new Response(
        JSON.stringify({
          success: true,
          alreadyExists: true,
          message: "Templates key already exists in database",
          existing: {
            key: existing.key,
            priority: existing.priority,
            active: existing.is_active,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
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
        description:
          "All 43 document templates for Cyprus real estate communications",
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

      return new Response(
        JSON.stringify({
          success: false,
          error: "Database insert failed",
          details: insertError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
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

    return new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    logger.error(
      "Admin: Template migration unexpected error",
      err instanceof Error ? err : undefined,
      {
        category: LogCategory.GENERAL,
        errorDetails: err instanceof Error ? err.message : String(err),
      }
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Unexpected error during migration",
        details: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * POST /admin/generate-description
 * Generate AI property description for Zyprus CMS
 *
 * This endpoint is called by the Zyprus backend "Generate Description" button.
 * It uses Sophia AI's description generator to create professional property descriptions.
 *
 * Request body schema:
 * {
 *   "type": string,           // Property type (e.g., "apartment", "villa", "detached house")
 *   "listingType": "sale" | "rent",
 *   "bedrooms": number,
 *   "bathrooms": number,
 *   "location": string,       // Area name (e.g., "Tala", "Kato Paphos", "Limassol")
 *   "coveredArea": number,    // in square meters
 *   "plotSize"?: number,      // Optional: Plot size in sqm
 *   "coveredVeranda"?: number,
 *   "uncoveredVeranda"?: number,
 *   "features"?: string[],    // Optional: Array of feature strings
 *   "price": number,
 *   "yearBuilt"?: number,
 *   "condition"?: string,
 *   "orientation"?: string,
 *   "parking"?: string,
 *   "storage"?: boolean,
 *   "airConditioning"?: boolean,
 *   "centralHeating"?: boolean,
 *   "pool"?: boolean,
 *   "garden"?: boolean,
 *   "seaView"?: boolean,
 *   "mountainView"?: boolean,
 *   "titleDeedStatus"?: string,
 *   "areaDescription"?: string // Optional: User-provided custom area description
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "description": string,   // Generated description text
 *   "title"?: string         // Generated short title
 * }
 */
async function handleGenerateDescription(req: Request): Promise<Response> {
  try {
    const body = await req.json();

    // Validate required fields
    const requiredFields = [
      "type",
      "listingType",
      "bedrooms",
      "bathrooms",
      "location",
      "coveredArea",
      "price",
    ];
    const missingFields = requiredFields.filter(
      (field) => body[field] === undefined
    );

    if (missingFields.length > 0) {
      logger.warn("Admin: Generate description missing required fields", {
        category: LogCategory.GENERAL,
        missingFields,
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields",
          missingFields,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate listingType
    if (body.listingType !== "sale" && body.listingType !== "rent") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid listingType. Must be 'sale' or 'rent'",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build property details object
    const propertyDetails: PropertyDetails = {
      type: body.type,
      listingType: body.listingType,
      bedrooms: Number(body.bedrooms),
      bathrooms: Number(body.bathrooms),
      location: body.location,
      coveredArea: Number(body.coveredArea),
      price: Number(body.price),
      plotSize: body.plotSize ? Number(body.plotSize) : undefined,
      coveredVeranda: body.coveredVeranda
        ? Number(body.coveredVeranda)
        : undefined,
      uncoveredVeranda: body.uncoveredVeranda
        ? Number(body.uncoveredVeranda)
        : undefined,
      features: Array.isArray(body.features) ? body.features : undefined,
      yearBuilt: body.yearBuilt ? Number(body.yearBuilt) : undefined,
      condition: body.condition,
      orientation: body.orientation,
      parking: body.parking,
      storage: body.storage,
      airConditioning: body.airConditioning,
      centralHeating: body.centralHeating,
      pool: body.pool,
      garden: body.garden,
      seaView: body.seaView,
      mountainView: body.mountainView,
      titleDeedStatus: body.titleDeedStatus,
      areaDescription: body.areaDescription,
    };

    logger.info("Admin: Generate description requested", {
      category: LogCategory.GENERAL,
      propertyType: propertyDetails.type,
      location: propertyDetails.location,
      bedrooms: propertyDetails.bedrooms,
    });

    // Generate the description using Sophia AI's description generator
    const description = generateDescription(propertyDetails);

    logger.info("Admin: Description generated successfully", {
      category: LogCategory.GENERAL,
      descriptionLength: description.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        description,
        title: `${propertyDetails.bedrooms === 0 ? "Studio" : propertyDetails.bedrooms === 1 ? "1 Bed" : `${propertyDetails.bedrooms} Bed`} ${propertyDetails.type.charAt(0).toUpperCase() + propertyDetails.type.slice(1)} in ${propertyDetails.location.charAt(0).toUpperCase() + propertyDetails.location.slice(1)}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    logger.error(
      "Admin: Generate description endpoint error",
      err instanceof Error ? err : undefined,
      {
        category: LogCategory.GENERAL,
        errorDetails: err instanceof Error ? err.message : String(err),
      }
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to generate description",
        details: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /admin/create-listing
 * Directly invoke createPropertyListing tool handler, bypassing AI pipeline.
 * Body: { agentEmail: string, args: { ...tool args } }
 */
async function handleDirectCreateListing(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { agentEmail, args } = body;

    if (!agentEmail || !args) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing agentEmail or args" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Look up agent
    const agent = await getAgentByEmail(agentEmail);
    if (!agent) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Agent not found for ${agentEmail}`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    logger.info(`Admin: Direct create-listing for ${agent.fullName}`, {
      category: LogCategory.GENERAL,
      agentEmail,
      argsPreview: JSON.stringify(args).substring(0, 300),
    });

    const result = await handleCreatePropertyListing(args, agent);

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error(
      "Admin: Direct create-listing error",
      err instanceof Error ? err : undefined,
      {
        category: LogCategory.GENERAL,
      }
    );
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /admin/taxonomy/search?q=episkopi
 * Debug endpoint to inspect taxonomy location nodes
 */
async function handleTaxonomySearch(url: URL): Promise<Response> {
  const query = (url.searchParams.get("q") || "").toLowerCase().trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "Missing ?q= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const taxonomy = await loadTaxonomy();

  // Find matching locations
  const matches = taxonomy.locations.filter((loc) =>
    loc.name.toLowerCase().includes(query)
  );

  // For each match, resolve parent name
  const parentMap = new Map(taxonomy.locations.map((l) => [l.id, l.name]));
  const results = matches.map((loc) => ({
    id: loc.id,
    name: loc.name,
    parentId: loc.parentId || null,
    parentName: loc.parentId ? parentMap.get(loc.parentId) || "UNKNOWN" : null,
  }));

  // Also show all district parent nodes
  const districtTerms = [
    "paphos",
    "pafos",
    "limassol",
    "lemesos",
    "larnaca",
    "larnaka",
    "nicosia",
    "lefkosia",
    "famagusta",
  ];
  const districtNodes = taxonomy.locations
    .filter((loc) =>
      districtTerms.some((t) => loc.name.toLowerCase().includes(t))
    )
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      parentId: loc.parentId || null,
      parentName: loc.parentId
        ? parentMap.get(loc.parentId) || "UNKNOWN"
        : null,
    }));

  return new Response(
    JSON.stringify(
      {
        query,
        matchCount: results.length,
        matches: results,
        totalLocations: taxonomy.locations.length,
        districtNodes,
      },
      null,
      2
    ),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
