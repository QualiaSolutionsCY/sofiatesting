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

// Cache configuration
// TEMP: Disabled cache for testing image batching fix (Jan 26, 2026)
// Restore to 5 * 60 * 1000 after confirming fix works
const CACHE_TTL_MS = 0; // 5 * 60 * 1000; // 5 minutes

// In-memory cache
let cachedPromptSections: Map<string, string> | null = null;
let cacheTimestamp: number = 0;

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
      .order("priority", { ascending: true });

    if (error) {
      console.error("[PromptLoader] DB error:", error.message);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn("[PromptLoader] No active prompts found in DB");
      return null;
    }

    // Convert to map for easy lookup
    const promptMap = new Map<string, string>();
    for (const row of data as PromptRow[]) {
      promptMap.set(row.key, row.content);
    }

    console.log(`[PromptLoader] Loaded ${promptMap.size} prompts from DB`);
    return promptMap;
  } catch (err) {
    console.error("[PromptLoader] Exception loading prompts:", err);
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

  // Return cached if valid
  if (cachedPromptSections && now - cacheTimestamp < CACHE_TTL_MS) {
    console.log("[PromptLoader] Using cached prompts");
    return cachedPromptSections;
  }

  // Start with fallback prompts (full modular content)
  const mergedPrompts = new Map(Object.entries(FALLBACK_PROMPTS));

  // Try loading from DB and merge (DB takes precedence)
  const dbPrompts = await loadPromptSectionsFromDB(supabase);

  if (dbPrompts && dbPrompts.size > 0) {
    // Override fallback with DB values where available
    for (const [key, value] of dbPrompts) {
      mergedPrompts.set(key, value);
    }
    console.log(`[PromptLoader] Merged ${dbPrompts.size} DB prompts with ${Object.keys(FALLBACK_PROMPTS).length - dbPrompts.size} fallback prompts`);
  } else {
    console.warn("[PromptLoader] Using fallback hardcoded prompts (DB unavailable)");
  }

  // Update cache
  cachedPromptSections = mergedPrompts;
  cacheTimestamp = now;
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

  console.log(
    `[PromptLoader] Assembled system prompt (${fullPrompt.length} chars)`
  );

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
export function invalidateCache(): void {
  cachedPromptSections = null;
  cacheTimestamp = 0;
  console.log("[PromptLoader] Cache invalidated");
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
} {
  return {
    isCached: !!cachedPromptSections,
    age: cachedPromptSections ? Date.now() - cacheTimestamp : 0,
    ttl: CACHE_TTL_MS,
    sectionCount: cachedPromptSections?.size ?? 0,
  };
}
