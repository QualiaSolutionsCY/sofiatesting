/**
 * SOPHIA Dynamic Prompt Loader
 * Loads prompts from sophia_prompts table with 5-minute caching
 *
 * Benefits:
 * - Edit prompts via Supabase Dashboard without redeploying
 * - 5-minute cache TTL for performance
 * - Fallback to hardcoded prompts if DB fails
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logger, LogCategory } from "../utils/logger.ts";

/**
 * Cache TTL: 5 minutes
 *
 * Cache invalidation strategy:
 * 1. Time-based: Cache expires after 5 minutes
 * 2. Version-based: Cache invalidated if DB updated_at > cached version
 * 3. Manual: Admin can POST to /admin/prompts/invalidate
 *
 * This dual-strategy ensures:
 * - Performance: Most requests served from cache
 * - Freshness: DB changes detected within seconds (version check)
 * - Control: Admin can force refresh when needed
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute cache

// Cache miss reason tracking
type CacheMissReason = "first_load" | "expired" | "version_mismatch" | "manual_invalidation";

// In-memory cache
let cachedPromptSections: Map<string, string> | null = null;
let cacheTimestamp: number = 0;
let cacheVersion: string | null = null; // Stores MAX(updated_at) from last load
let lastInvalidationReason: string | null = null;
let lastVersionCheckTime: number = 0;

// Version check interval: Only check DB version every 30 seconds (not every request)
// This reduces DB queries from ~50-100ms per request to once per 30s
const VERSION_CHECK_INTERVAL_MS = 30_000;

// Fallback prompts imported from modular files (used if DB fails)
import { IDENTITY } from "../prompts/core/identity.ts";
import { SAFETY_RULES } from "../prompts/core/safety-rules.ts";
import { DOCUMENT_ROUTING } from "../prompts/behaviors/document-routing.ts";
import { PROPERTY_UPLOAD } from "../prompts/behaviors/property-upload.ts";
import { RESPONSE_FORMAT } from "../prompts/behaviors/response-format.ts";
import { CALCULATOR_CAPABILITIES } from "../prompts/knowledge/calculators.ts";
import { CYPRUS_KNOWLEDGE } from "../prompts/knowledge/cyprus-real-estate.ts";
import { TEMPLATES } from "../prompts/templates/content.ts";

// Fallback map for when DB is unavailable
const FALLBACK_PROMPTS: Record<string, string> = {
  identity: IDENTITY,
  safety_rules: SAFETY_RULES,
  document_routing: DOCUMENT_ROUTING,
  property_upload: PROPERTY_UPLOAD,
  response_format: RESPONSE_FORMAT,
  calculators: CALCULATOR_CAPABILITIES,
  cyprus_knowledge: CYPRUS_KNOWLEDGE,
  templates: TEMPLATES,
};

interface PromptRow {
  key: string;
  content: string;
  priority: number;
}

interface AgentContext {
  agentName: string;
  agentPhone: string;
  currentDate: string;
  tomorrowDate: string;
}

/**
 * Get current database version using MAX(updated_at)
 * Used for version-based cache invalidation
 */
async function getDatabaseVersion(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sophia_prompts")
      .select("updated_at")
      .eq("is_active", true)
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }
    return data.updated_at;
  } catch {
    return null;
  }
}

/**
 * Load prompt sections from database with caching
 */
async function loadPromptSectionsFromDB(
  supabase: SupabaseClient
): Promise<Map<string, string> | null> {
  try {
    const { data, error } = await supabase
      .from("sophia_prompts")
      .select("key, content, priority")
      .eq("is_active", true)
      .eq("is_current", true)
      .order("priority", { ascending: true });

    if (error) {
      logger.error(
        "DB error loading prompts",
        new Error(error.message),
        { category: LogCategory.CACHE, errorMessage: error.message }
      );
      return null;
    }

    if (!data || data.length === 0) {
      logger.warn("No active prompts found in DB", {
        category: LogCategory.CACHE,
      });
      return null;
    }

    // Convert to map for easy lookup
    const promptMap = new Map<string, string>();
    for (const row of data as PromptRow[]) {
      promptMap.set(row.key, row.content);
    }

    logger.info("Loaded prompts from DB", {
      category: LogCategory.CACHE,
      promptCount: promptMap.size,
    });
    return promptMap;
  } catch (err) {
    logger.error("Exception loading prompts", err as Error, {
      category: LogCategory.CACHE,
    });
    return null;
  }
}

/**
 * Get prompt sections with caching
 * Merges DB prompts with fallback for any missing keys
 */
async function getPromptSections(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const now = Date.now();
  let cacheMissReason: CacheMissReason | null = null;
  let detectedDbVersion: string | null = null; // Track version from first check to avoid duplicate DB call

  // Check if cache exists
  if (!cachedPromptSections) {
    cacheMissReason = "first_load";
  } else if (now - cacheTimestamp >= CACHE_TTL_MS) {
    cacheMissReason = "expired";
  } else {
    // Cache exists and within TTL
    // Only check version periodically (every 30s) to avoid DB query on every request
    const shouldCheckVersion = now - lastVersionCheckTime >= VERSION_CHECK_INTERVAL_MS;

    if (shouldCheckVersion) {
      lastVersionCheckTime = now;
      detectedDbVersion = await getDatabaseVersion(supabase);
      if (detectedDbVersion && detectedDbVersion !== cacheVersion) {
        cacheMissReason = "version_mismatch";
        logger.info("Cache version mismatch detected", {
          category: LogCategory.CACHE,
          cachedVersion: cacheVersion?.substring(0, 19) ?? "none",
          dbVersion: detectedDbVersion.substring(0, 19),
        });
      }
    }

    // If no version mismatch (or didn't check), return cached data
    if (!cacheMissReason) {
      const cacheAge = now - cacheTimestamp;
      logger.debug("Cache HIT", {
        category: LogCategory.CACHE,
        cacheAgeMs: cacheAge,
        cacheAgeFormatted: `${Math.round(cacheAge / 1000)}s`,
        ttlRemainingMs: CACHE_TTL_MS - cacheAge,
        sectionCount: cachedPromptSections.size,
        version: cacheVersion?.substring(0, 19) ?? "unknown",
      });
      return cachedPromptSections;
    }
  }

  // Cache miss - log reason and reload
  logger.info("Cache MISS", {
    category: LogCategory.CACHE,
    reason: cacheMissReason,
    previousCacheAge: cachedPromptSections ? now - cacheTimestamp : null,
  });

  // Start with fallback prompts (full modular content)
  const mergedPrompts = new Map(Object.entries(FALLBACK_PROMPTS));

  // Try loading from DB and merge (DB takes precedence)
  const dbPrompts = await loadPromptSectionsFromDB(supabase);

  if (dbPrompts && dbPrompts.size > 0) {
    // Override fallback with DB values where available
    for (const [key, value] of dbPrompts) {
      mergedPrompts.set(key, value);
    }
    const fallbackCount = Object.keys(FALLBACK_PROMPTS).length - dbPrompts.size;
    logger.debug("Merged DB prompts with fallbacks", {
      category: LogCategory.CACHE,
      dbCount: dbPrompts.size,
      fallbackCount: fallbackCount,
    });
  } else {
    logger.warn("Using fallback hardcoded prompts (DB unavailable)", {
      category: LogCategory.CACHE,
    });
  }

  // Store the version - reuse from version check if available, otherwise fetch
  // This avoids a duplicate DB call when we already fetched the version during mismatch detection
  cacheVersion = detectedDbVersion ?? await getDatabaseVersion(supabase);

  // Update cache
  cachedPromptSections = mergedPrompts;
  cacheTimestamp = now;

  // Log cache population
  logger.info("Cache populated", {
    category: LogCategory.CACHE,
    sectionCount: mergedPrompts.size,
    dbPromptCount: dbPrompts?.size ?? 0,
    fallbackPromptCount: Object.keys(FALLBACK_PROMPTS).length,
    version: cacheVersion?.substring(0, 19) ?? "unknown",
    ttlMs: CACHE_TTL_MS,
  });

  return mergedPrompts;
}

/**
 * Inject agent context into prompts
 */
function injectAgentContext(prompt: string, ctx: AgentContext): string {
  return prompt
    .replace(/\{AGENT_NAME\}/g, ctx.agentName)
    .replace(/\{AGENT_PHONE\}/g, ctx.agentPhone)
    .replace(/\{CURRENT_DATE\}/g, ctx.currentDate)
    .replace(/\{TOMORROW_DATE\}/g, ctx.tomorrowDate);
}

/**
 * Build the complete system prompt
 */
export async function loadSystemPrompt(
  supabase: SupabaseClient,
  agentContext: AgentContext
): Promise<string> {
  const sections = await getPromptSections(supabase);

  // Build agent context section
  const agentContextSection = `## Agent Context (Auto-Detected)
- Agent Name: ${agentContext.agentName}
- Agent Phone: ${agentContext.agentPhone}
- Today's Date: ${agentContext.currentDate}
- Tomorrow's Date: ${agentContext.tomorrowDate}`;

  // Assemble sections in priority order
  // The DB returns them sorted by priority, but we also define explicit order
  const orderedKeys = [
    "identity",
    "safety_rules",
    "document_routing",
    "property_upload",
    "response_format",
    "calculators",
    "cyprus_knowledge",
    "templates",
  ];

  const promptParts: string[] = [];

  // Add each section in order
  for (const key of orderedKeys) {
    const content = sections.get(key);
    if (content) {
      // Inject agent context into content
      const processedContent = injectAgentContext(content, agentContext);
      promptParts.push(processedContent);
    }
  }

  // Insert agent context after identity section
  promptParts.splice(1, 0, agentContextSection);

  // Join all sections with separator
  const fullPrompt = promptParts.join("\n\n---\n\n");

  logger.debug("Assembled system prompt", {
    category: LogCategory.CACHE,
    promptLength: fullPrompt.length,
  });

  return fullPrompt;
}

/**
 * Get a specific prompt section by key
 */
export async function getPromptSection(
  supabase: SupabaseClient,
  key: string
): Promise<string | null> {
  const sections = await getPromptSections(supabase);
  return sections.get(key) ?? null;
}

/**
 * Force refresh the cache (useful after Dashboard edits)
 */
export function invalidateCache(reason: string = "manual"): void {
  cachedPromptSections = null;
  cacheTimestamp = 0;
  cacheVersion = null;
  lastInvalidationReason = reason;
  logger.info("Cache invalidated", {
    category: LogCategory.CACHE,
    reason,
  });
}

/**
 * Check if cache is currently valid
 */
export function isCacheValid(): boolean {
  if (!cachedPromptSections) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Get cache status info (for debugging)
 */
export function getCacheStatus(): {
  isCached: boolean;
  age: number;
  ttl: number;
  sectionCount: number;
  version: string | null;
  lastInvalidationReason: string | null;
  isExpired: boolean;
} {
  const age = cachedPromptSections ? Date.now() - cacheTimestamp : 0;
  return {
    isCached: !!cachedPromptSections,
    age,
    ttl: CACHE_TTL_MS,
    sectionCount: cachedPromptSections?.size ?? 0,
    version: cacheVersion,
    lastInvalidationReason,
    isExpired: age > CACHE_TTL_MS,
  };
}

/**
 * Get version history for a prompt key (for admin UI)
 */
export async function getPromptVersionHistory(
  supabase: SupabaseClient,
  key: string
): Promise<Array<{version: number, created_at: string, replaced_at: string | null, is_current: boolean}>> {
  const { data, error } = await supabase
    .from("sophia_prompts")
    .select("version, created_at, replaced_at, is_current")
    .eq("key", key)
    .order("version", { ascending: false });

  if (error || !data) {
    logger.error("Failed to get version history", new Error(error?.message || "Unknown"), {
      category: LogCategory.CACHE,
      promptKey: key,
    });
    return [];
  }
  return data;
}

interface RollbackResult {
  success: boolean;
  message: string;
  newVersion?: number;
  error?: string;
}

/**
 * Rollback a prompt to a previous version
 *
 * Strategy:
 * 1. Find the target version's content
 * 2. Mark current version as not current (replaced_at = NOW())
 * 3. Create new version with target's content (version = current + 1)
 * 4. Invalidate cache
 *
 * This is append-only - we never delete or mutate historical versions.
 */
export async function rollbackPrompt(
  supabase: SupabaseClient,
  key: string,
  targetVersion: number,
  reason: string
): Promise<RollbackResult> {
  try {
    // 1. Get the target version's content
    const { data: targetData, error: targetError } = await supabase
      .from("sophia_prompts")
      .select("content, priority, category, description")
      .eq("key", key)
      .eq("version", targetVersion)
      .single();

    if (targetError || !targetData) {
      return {
        success: false,
        message: `Target version ${targetVersion} not found for key '${key}'`,
        error: targetError?.message,
      };
    }

    // 2. Get current version number
    const { data: currentData, error: currentError } = await supabase
      .from("sophia_prompts")
      .select("version")
      .eq("key", key)
      .eq("is_current", true)
      .single();

    if (currentError || !currentData) {
      return {
        success: false,
        message: `No current version found for key '${key}'`,
        error: currentError?.message,
      };
    }

    const currentVersion = currentData.version;
    const newVersion = currentVersion + 1;

    // 3. Mark current version as not current
    const { error: updateError } = await supabase
      .from("sophia_prompts")
      .update({
        is_current: false,
        replaced_at: new Date().toISOString(),
      })
      .eq("key", key)
      .eq("version", currentVersion);

    if (updateError) {
      return {
        success: false,
        message: "Failed to mark current version as replaced",
        error: updateError.message,
      };
    }

    // 4. Insert new version with target's content
    const { error: insertError } = await supabase
      .from("sophia_prompts")
      .insert({
        key,
        content: targetData.content,
        category: targetData.category,
        description: targetData.description,
        priority: targetData.priority,
        is_active: true,
        is_current: true,
        version: newVersion,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: `rollback:${reason}`,
      });

    if (insertError) {
      // Try to restore current version flag
      await supabase
        .from("sophia_prompts")
        .update({ is_current: true, replaced_at: null })
        .eq("key", key)
        .eq("version", currentVersion);

      return {
        success: false,
        message: "Failed to create rollback version",
        error: insertError.message,
      };
    }

    // 5. Invalidate cache
    invalidateCache(`rollback:${key}:v${targetVersion}`);

    logger.info("Prompt rolled back", {
      category: LogCategory.CACHE,
      promptKey: key,
      fromVersion: currentVersion,
      toVersion: newVersion,
      targetVersion,
      reason,
    });

    return {
      success: true,
      message: `Rolled back '${key}' from v${currentVersion} to content of v${targetVersion} (now v${newVersion})`,
      newVersion,
    };
  } catch (err) {
    logger.error("Rollback failed", err as Error, {
      category: LogCategory.CACHE,
      promptKey: key,
      targetVersion,
    });
    return {
      success: false,
      message: "Rollback failed with exception",
      error: String(err),
    };
  }
}
