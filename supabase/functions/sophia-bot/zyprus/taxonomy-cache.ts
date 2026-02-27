/**
 * Taxonomy Cache for Zyprus API
 * Caches location, property type, and feature UUIDs
 */

import { getAccessToken, getZyprusConfig } from "./client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";
import {
  SOPHIA_AI_UUID,
  USER_FALLBACKS,
  AGENT_NAME_MAP,
  REGION_LOCATIONS,
  DEFAULT_LOCATION_UUID,
  DEFAULT_PROPERTY_TYPE_UUID,
  DEFAULT_LISTING_TYPE_UUID,
  DEFAULT_PRICE_MODIFIER_UUID,
  DEFAULT_TITLE_DEED_UUID,
  PROPERTY_TYPE_FALLBACKS,
  INDOOR_FEATURE_FALLBACKS,
  OUTDOOR_FEATURE_FALLBACKS,
  VIEW_FALLBACKS,
  INDOOR_FEATURE_ALIASES,
  OUTDOOR_FEATURE_ALIASES,
  OPPOSITE_MODIFIERS,
  TAXONOMY_CACHE_TTL_MS,
  TAXONOMY_STALE_TTL_MS,
} from "../config/business-rules.ts";

// Supabase client for agent lookups
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Lookup agent's Zyprus UUID from Supabase agents table
 * Returns null if not found or no zyprus_user_id set
 */
async function lookupAgentFromSupabase(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("zyprus_user_id, full_name")
      .or(`listing_owner_email.ilike.${email},communication_email.ilike.${email}`)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return null;
    }

    if (data.zyprus_user_id) {
      logger.debug(`[Taxonomy] Found agent "${data.full_name}" in Supabase with Zyprus UUID: ${data.zyprus_user_id}`);
      return data.zyprus_user_id;
    }

    logger.debug(`[Taxonomy] Agent "${data.full_name}" found but no zyprus_user_id set`);
    return null;
  } catch (err) {
    logger.error("[Taxonomy] Error looking up agent from Supabase", err instanceof Error ? err : new Error(String(err)), { category: LogCategory.ZYPRUS });
    return null;
  }
}

export interface TaxonomyItem {
  id: string;
  name: string;
  parentId?: string;
}

export interface UserItem {
  id: string;
  email: string;
  name: string;
}

export interface TaxonomyCache {
  locations: TaxonomyItem[];
  propertyTypes: TaxonomyItem[];
  listingTypes: TaxonomyItem[];
  priceModifiers: TaxonomyItem[];
  titleDeeds: TaxonomyItem[];
  features: TaxonomyItem[];
  indoorFeatures: TaxonomyItem[];
  outdoorFeatures: TaxonomyItem[];
  propertyViews: TaxonomyItem[];  // Sea View, Mountain View, etc.
  landTypes: TaxonomyItem[];      // Plot, Field, Agricultural
  infrastructure: TaxonomyItem[]; // Electricity, Water, Road Access, etc.
  users: UserItem[];
  lastUpdated: number;
}

// In-memory cache
let cache: TaxonomyCache | null = null;
const CACHE_TTL = TAXONOMY_CACHE_TTL_MS;      // 1 hour - fresh
const STALE_TTL = TAXONOMY_STALE_TTL_MS;      // 2 hours - serve stale while refreshing

// P2 PERFORMANCE: Singleton promise to prevent cache stampede
let taxonomyLoadPromise: Promise<TaxonomyCache> | null = null;

// Background refresh flag to prevent multiple concurrent background refreshes
let isBackgroundRefreshing = false;

/**
 * Parse taxonomy items from API response
 */
function parseTaxonomyItems(data: { data?: Array<Record<string, unknown>> }): TaxonomyItem[] {
  const items: TaxonomyItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as Record<string, unknown> | undefined;
    const rels = item.relationships as Record<string, { data?: Array<{ id: string }> | { id: string } }> | undefined;
    items.push({
      id: item.id as string,
      name: (attrs?.name as string) || (attrs?.title as string) || "",
      parentId: Array.isArray(rels?.parent?.data) ? rels.parent.data[0]?.id : undefined,
    });
  }
  return items;
}

/**
 * Fetch taxonomy terms from Zyprus API with PARALLEL pagination
 * P1 PERFORMANCE: Fetches first page to get count, then remaining pages in parallel
 */
async function fetchTaxonomy(
  vocabularyName: string,
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> {
  const baseUrl = `${apiUrl}/jsonapi/taxonomy_term/${vocabularyName}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.api+json",
    "User-Agent": "SophiaAI",
  };
  const PAGE_SIZE = 50;

  // Fetch first page to get total count
  const firstResponse = await fetch(`${baseUrl}?page[limit]=${PAGE_SIZE}`, { headers });

  if (!firstResponse.ok) {
    logger.error(`[Taxonomy] Failed to fetch ${vocabularyName}: ${firstResponse.status}`, undefined, { category: LogCategory.ZYPRUS });
    return [];
  }

  const firstData = await firstResponse.json();
  const items = parseTaxonomyItems(firstData);

  // Check if there are more pages
  const totalCount = firstData.meta?.count;
  if (!totalCount || totalCount <= PAGE_SIZE) {
    logger.debug(`[Taxonomy] Loaded ${items.length} ${vocabularyName} terms (single page)`);
    return items;
  }

  // Calculate remaining pages and fetch in parallel
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const remainingPages = totalPages - 1;

  if (remainingPages > 0) {
    const pagePromises = Array.from({ length: remainingPages }, (_, i) =>
      fetch(`${baseUrl}?page[limit]=${PAGE_SIZE}&page[offset]=${(i + 1) * PAGE_SIZE}`, { headers })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
    );

    const pageResults = await Promise.all(pagePromises);
    for (const pageData of pageResults) {
      if (pageData) {
        items.push(...parseTaxonomyItems(pageData));
      }
    }
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} ${vocabularyName} terms (${totalPages} pages parallel)`);
  return items;
}

/**
 * Parse location items from API response (different structure than taxonomy)
 */
function parseLocationItems(data: { data?: Array<Record<string, unknown>> }): TaxonomyItem[] {
  const items: TaxonomyItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as Record<string, unknown> | undefined;
    const rels = item.relationships as Record<string, { data?: { id: string } }> | undefined;
    items.push({
      id: item.id as string,
      name: (attrs?.title as string) || (attrs?.name as string) || "",
      parentId: rels?.field_town?.data?.id,
    });
  }
  return items;
}

/**
 * Fetch locations from Zyprus API (node--location, NOT taxonomy_term)
 * CRITICAL: Locations are nodes, not taxonomy terms per Postman spec
 * P1 PERFORMANCE: Uses parallel pagination
 */
async function fetchLocations(
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> {
  const baseUrl = `${apiUrl}/jsonapi/node/location`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.api+json",
    "User-Agent": "SophiaAI",
  };
  const PAGE_SIZE = 50;

  // Fetch first page to get total count
  const firstResponse = await fetch(`${baseUrl}?page[limit]=${PAGE_SIZE}`, { headers });

  if (!firstResponse.ok) {
    logger.error(`[Taxonomy] Failed to fetch locations: ${firstResponse.status}`, undefined, { category: LogCategory.ZYPRUS });
    return [];
  }

  const firstData = await firstResponse.json();
  const items = parseLocationItems(firstData);

  // Check if there are more pages using links.next (meta.count is undefined in Zyprus API)
  const nextLink = firstData.links?.next;
  if (!nextLink) {
    logger.debug(`[Taxonomy] Loaded ${items.length} location nodes (single page)`);
    return items;
  }

  // Fetch remaining pages by following links sequentially
  const allItems = [...items];
  let nextUrl = (typeof nextLink === 'string' ? nextLink : nextLink?.href) as string | null;
  let pageCount = 1;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) break;

    const data = await response.json();
    allItems.push(...parseLocationItems(data));
    pageCount++;

    const next = data.links?.next;
    nextUrl = (typeof next === 'string' ? next : next?.href) as string | null;

    // Safety limit to prevent infinite loops
    if (pageCount > 100) {
      logger.warn(`[Taxonomy] Location pagination exceeded 100 pages, stopping`, undefined, { category: LogCategory.ZYPRUS });
      break;
    }
  }

  logger.debug(`[Taxonomy] Loaded ${allItems.length} location nodes (${pageCount} pages)`);
  return allItems;
}

/**
 * Parse user items from API response
 */
function parseUserItems(data: { data?: Array<Record<string, unknown>> }): UserItem[] {
  const items: UserItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as Record<string, string | undefined> | undefined;
    if (attrs?.mail) {
      items.push({
        id: item.id as string,
        email: attrs.mail.toLowerCase(),
        name: attrs.display_name || attrs.name || "",
      });
    }
  }
  return items;
}

/**
 * Fetch users from Zyprus API for reviewer/owner assignment
 * P1 PERFORMANCE: Uses parallel pagination
 */
async function fetchUsers(
  token: string,
  apiUrl: string
): Promise<UserItem[]> {
  const baseUrl = `${apiUrl}/jsonapi/user/user`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.api+json",
    "User-Agent": "SophiaAI",
  };
  const PAGE_SIZE = 50;

  // Fetch first page to get total count
  const firstResponse = await fetch(`${baseUrl}?filter[status]=1&page[limit]=${PAGE_SIZE}`, { headers });

  if (!firstResponse.ok) {
    logger.error(`[Taxonomy] Failed to fetch users: ${firstResponse.status}`, undefined, { category: LogCategory.ZYPRUS });
    return [];
  }

  const firstData = await firstResponse.json();
  const items = parseUserItems(firstData);

  // Check if there are more pages using links.next (meta.count is undefined in Zyprus API)
  const nextLink = firstData.links?.next;
  if (!nextLink) {
    logger.debug(`[Taxonomy] Loaded ${items.length} users (single page)`);
    return items;
  }

  // Fetch remaining pages by following links sequentially
  const allItems = [...items];
  let nextUrl = (typeof nextLink === 'string' ? nextLink : nextLink?.href) as string | null;
  let pageCount = 1;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) break;

    const data = await response.json();
    allItems.push(...parseUserItems(data));
    pageCount++;

    const next = data.links?.next;
    nextUrl = (typeof next === 'string' ? next : next?.href) as string | null;

    // Safety limit to prevent infinite loops
    if (pageCount > 100) {
      logger.warn(`[Taxonomy] User pagination exceeded 100 pages, stopping`, undefined, { category: LogCategory.ZYPRUS });
      break;
    }
  }

  logger.debug(`[Taxonomy] Loaded ${allItems.length} users (${pageCount} pages)`);
  return allItems;
}

/**
 * Refresh taxonomy data in background (fire-and-forget)
 * Used by stale-while-revalidate pattern
 */
async function refreshTaxonomyInBackground(): Promise<void> {
  if (isBackgroundRefreshing) {
    logger.debug("[Taxonomy] Background refresh already in progress, skipping", { category: LogCategory.CACHE });
    return;
  }

  isBackgroundRefreshing = true;
  logger.info("[Taxonomy] Starting background refresh...", { category: LogCategory.CACHE });

  try {
    const config = getZyprusConfig();
    const token = await getAccessToken(config);

    const [
      locations,
      propertyTypes,
      listingTypes,
      priceModifiers,
      titleDeeds,
      indoorFeatures,
      outdoorFeatures,
      propertyViews,
      landTypes,
      infrastructure,
      users,
    ] = await Promise.all([
      fetchLocations(token, config.apiUrl),
      fetchTaxonomy("property_type", token, config.apiUrl),
      fetchTaxonomy("listing_type", token, config.apiUrl),
      fetchTaxonomy("price_modifier", token, config.apiUrl),
      fetchTaxonomy("title_deed", token, config.apiUrl),
      fetchTaxonomy("indoor_property_views", token, config.apiUrl),
      fetchTaxonomy("outdoor_property_features", token, config.apiUrl),
      fetchTaxonomy("property_views", token, config.apiUrl),
      fetchTaxonomy("land_type", token, config.apiUrl),
      fetchTaxonomy("infrastructure_", token, config.apiUrl),
      fetchUsers(token, config.apiUrl),
    ]);

    cache = {
      locations,
      propertyTypes,
      listingTypes,
      priceModifiers,
      titleDeeds,
      features: [], // property_features vocab doesn't exist on Zyprus API; indoor/outdoor cover all features
      indoorFeatures,
      outdoorFeatures,
      propertyViews,
      landTypes,
      infrastructure,
      users,
      lastUpdated: Date.now(),
    };

    logger.info("[Taxonomy] Background refresh completed", { category: LogCategory.CACHE });
  } catch (err) {
    logger.error("[Taxonomy] Background refresh failed", err instanceof Error ? err : new Error(String(err)), { category: LogCategory.CACHE });
  } finally {
    isBackgroundRefreshing = false;
  }
}

/**
 * Load all taxonomy data with stale-while-revalidate pattern
 *
 * - Fresh (< CACHE_TTL): Return cache immediately
 * - Stale (CACHE_TTL < age < STALE_TTL): Return cache immediately, refresh in background
 * - Expired (> STALE_TTL): Block and refresh
 */
export async function loadTaxonomy(): Promise<TaxonomyCache> {
  const now = Date.now();

  if (cache) {
    const cacheAge = now - cache.lastUpdated;

    // Fresh cache - return immediately
    if (cacheAge < CACHE_TTL) {
      return cache;
    }

    // Stale but usable - return immediately and refresh in background
    if (cacheAge < STALE_TTL) {
      logger.debug("[Taxonomy] Serving stale cache, refreshing in background", { category: LogCategory.CACHE });
      // Fire-and-forget background refresh
      refreshTaxonomyInBackground().catch(() => {});
      return cache;
    }
  }

  // No cache or expired - need to do blocking refresh
  // P2 PERFORMANCE: Prevent cache stampede - only one concurrent fetch
  if (taxonomyLoadPromise) {
    logger.debug("[Taxonomy] Waiting for existing load operation...", { category: LogCategory.CACHE });
    return taxonomyLoadPromise;
  }

  logger.info("[Taxonomy] Loading taxonomy data (blocking)...", { category: LogCategory.CACHE });

  // Create singleton promise for this load operation
  taxonomyLoadPromise = (async () => {
    try {
      const config = getZyprusConfig();
      const token = await getAccessToken(config);

      const [
        locations,
        propertyTypes,
        listingTypes,
        priceModifiers,
        titleDeeds,
        indoorFeatures,
        outdoorFeatures,
        propertyViews,
        landTypes,
        infrastructure,
        users,
      ] = await Promise.all([
        fetchLocations(token, config.apiUrl), // CRITICAL: locations are nodes, not taxonomy
        fetchTaxonomy("property_type", token, config.apiUrl),
        fetchTaxonomy("listing_type", token, config.apiUrl),
        fetchTaxonomy("price_modifier", token, config.apiUrl),
        fetchTaxonomy("title_deed", token, config.apiUrl),
        fetchTaxonomy("indoor_property_views", token, config.apiUrl), // Note: uses "views" not "features"
        fetchTaxonomy("outdoor_property_features", token, config.apiUrl),
        fetchTaxonomy("property_views", token, config.apiUrl), // Sea View, Mountain View, etc.
        fetchTaxonomy("land_type", token, config.apiUrl),
        fetchTaxonomy("infrastructure_", token, config.apiUrl),
        fetchUsers(token, config.apiUrl),
      ]);

      cache = {
        locations,
        propertyTypes,
        listingTypes,
        priceModifiers,
        titleDeeds,
        features: [], // property_features vocab doesn't exist on Zyprus API; indoor/outdoor cover all features
        indoorFeatures,
        outdoorFeatures,
        propertyViews,
        landTypes,
        infrastructure,
        users,
        lastUpdated: Date.now(),
      };

      logger.info("[Taxonomy] Taxonomy loaded successfully", { category: LogCategory.CACHE });
      return cache;
    } finally {
      // Clear the singleton promise after load completes (success or failure)
      taxonomyLoadPromise = null;
    }
  })();

  return taxonomyLoadPromise;
}

/** Result from location UUID lookup — includes matched taxonomy name for title/description */
export interface LocationResult {
  uuid: string;
  /** The taxonomy name Zyprus uses for this location (e.g., "Strovolos, Nicosia") */
  matchedName: string;
  /** The detected district from the input (e.g., "nicosia") */
  district: string | null;
}

/**
 * Find location UUID by name
 * MANDATORY field - always returns a valid UUID
 *
 * CRITICAL FIX FOR DISTRICT DISAMBIGUATION:
 * When a district is explicitly specified (e.g., "Neapoli, Limassol"),
 * we MUST prioritize locations that are in that district over locations
 * with the same name in other districts.
 *
 * e.g., "Neapoli, Limassol" should match "Neapoli" in Limassol district,
 * NOT "Neapoli" in Nicosia district.
 *
 * Returns LocationResult with uuid, matchedName (taxonomy name), and district.
 */
export async function findLocationUuid(locationName: string): Promise<LocationResult> {
  const normalized = locationName.toLowerCase().trim();
  let specifiedDistrict: string | null = null; // Declare outside try for error logging

  try {
    const taxonomy = await loadTaxonomy();

    // Helper to build LocationResult from a matched location
    const buildResult = (loc: TaxonomyItem, district: string | null): LocationResult => ({
      uuid: loc.id,
      matchedName: loc.name,
      district,
    });

    // Try exact match first
    const exact = taxonomy.locations.find(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(`[Taxonomy] Exact match for "${locationName}": ${exact.name}`);
      return buildResult(exact, null);
    }

    // Extract words from input (filter short words)
    const words = normalized.split(/[\s,]+/).filter(w => w.length > 2);

    if (words.length === 0) {
      // No meaningful words, use default
      logger.debug(`[Taxonomy] No meaningful words in "${locationName}", using default`);
      return { uuid: DEFAULT_LOCATION_UUID, matchedName: locationName, district: null };
    }

    // CRITICAL: Detect the EXPLICITLY SPECIFIED district from input
    // This is the district name that appears AFTER the comma or as one of the words
    for (const [region, locationsList] of Object.entries(REGION_LOCATIONS)) {
      // Check if any region name or aliases appear in the input
      const regionAliases = [region, ...locationsList];
      if (words.some(w => regionAliases.some(alias =>
        w === alias || w.includes(alias) || alias.includes(w)
      ))) {
        specifiedDistrict = region;
        logger.debug(`[Taxonomy] Explicitly specified district "${region}" in input: ${locationName}`);
        break;
      }
    }

    // The FIRST word is usually the specific location (e.g., "Neapoli" in "Neapoli, Limassol")
    const firstWord = words[0];

    // Score all locations by multiple factors
    const scoredMatches: Array<{ location: TaxonomyItem; score: number; matchedWords: string[]; bonusReason: string }> = [];

    for (const loc of taxonomy.locations) {
      const locNameLower = loc.name.toLowerCase();
      const locWords = locNameLower.split(/[\s,]+/).filter(w => w.length > 1);
      const matchedWords: string[] = [];
      let score = 0;
      let bonusReason = "";

      // Check each input word for matches in the location name
      for (const word of words) {
        if (locNameLower.includes(word)) {
          matchedWords.push(word);
          // Exact word match gets more points than substring
          if (locWords.includes(word)) {
            score += 5; // Strong bonus for exact word match
            bonusReason += `exact:${word} `;
          } else {
            score += 1; // Weaker bonus for substring match
          }
        }
      }

      if (matchedWords.length === 0) {
        continue; // Skip locations with no matches
      }

      // CRITICAL: Strong bonus for matching the FIRST word (the specific location)
      // "Neapoli" should match "Neapoli" in the specified district
      if (firstWord && locNameLower.includes(firstWord)) {
        score += 20; // Very strong bonus for matching the specific location name
        bonusReason += `first-word:${firstWord} `;
      }

      // CRITICAL FIX: District-aware scoring
      // If user specified a district, heavily penalize locations NOT in that district
      if (specifiedDistrict) {
        const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];

        // Check if this location is in the specified district
        // CRITICAL: Use EXACT word match, not substring, to avoid "neapoli" matching "neapolis"
        // Also check multi-word entries (e.g., "mesa chorio", "kato paphos") against full name
        const locationIsInDistrict = locWords.some(locWord =>
          regionLocs.some(regLoc => locWord === regLoc)
        ) || regionLocs.some(regLoc => regLoc.includes(" ") && locNameLower.includes(regLoc));

        if (locationIsInDistrict) {
          score += 30; // HUGE bonus for being in the specified district
          bonusReason += `district-match:${specifiedDistrict} `;
        } else {
          // Check if location is in a DIFFERENT district
          let locationInOtherDistrict: string | null = null;
          for (const [otherRegion, otherLocs] of Object.entries(REGION_LOCATIONS)) {
            if (otherRegion === specifiedDistrict) continue;
            if (locWords.some(locWord => otherLocs.some(otherLoc => locWord === otherLoc)) ||
                otherLocs.some(otherLoc => otherLoc.includes(" ") && locNameLower.includes(otherLoc))) {
              locationInOtherDistrict = otherRegion;
              break;
            }
          }

          // HEAVY PENALTY for locations in the wrong district
          if (locationInOtherDistrict) {
            score -= 50; // Massive penalty for wrong district
            bonusReason += `WRONG-DISTRICT:${locationInOtherDistrict} `;
            logger.debug(`[Taxonomy] Penalizing "${loc.name}" - in ${locationInOtherDistrict}, user wants ${specifiedDistrict}`);
          }
        }
      }

      // Region bonus: Give moderate bonus if this location is in a detected region (when no explicit district)
      if (!specifiedDistrict) {
        for (const [region, locationsList] of Object.entries(REGION_LOCATIONS)) {
          const regionLocs = locationsList;
          const locationIsInRegion = locWords.some(locWord =>
            regionLocs.some(regLoc => locWord.includes(regLoc) || regLoc.includes(locWord))
          );

          if (locationIsInRegion) {
            score += 5; // Moderate bonus for being in any region
            bonusReason += `region:${region} `;
            break; // Only count one region bonus
          }
        }
      }

      scoredMatches.push({ location: loc, score, matchedWords, bonusReason });
    }

    // Sort by score descending, return best match
    if (scoredMatches.length > 0) {
      scoredMatches.sort((a, b) => b.score - a.score);
      const best = scoredMatches[0];

      // CRITICAL: When a district is specified, ONLY accept matches in that district
      // If the best match is in the wrong district, discard all matches and use fallback
      if (specifiedDistrict) {
        const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];
        const bestLocWords = best.location.name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 1);
        const bestLocNameLower = best.location.name.toLowerCase();
        // CRITICAL: Use EXACT word match for district detection + multi-word entries
        const bestIsInDistrict = bestLocWords.some(locWord =>
          regionLocs.some(regLoc => locWord === regLoc)
        ) || regionLocs.some(regLoc => regLoc.includes(" ") && bestLocNameLower.includes(regLoc));

        if (!bestIsInDistrict) {
          logger.warn(`[Taxonomy] Best match "${best.location.name}" is NOT in specified district "${specifiedDistrict}" - discarding and using fallback`, { category: LogCategory.ZYPRUS });

          // Don't return - fall through to fallback logic below
        } else {
          logger.debug(`[Taxonomy] Best match for "${locationName}": ${best.location.name} (score: ${best.score}, matched: ${best.matchedWords.join(", ")}, bonus: ${best.bonusReason})`);

          // Log top 3 alternatives for debugging
          for (let i = 1; i < Math.min(4, scoredMatches.length); i++) {
            const alt = scoredMatches[i];
            logger.debug(`[Taxonomy] Alternative ${i}: ${alt.location.name} (score: ${alt.score}, ${alt.bonusReason})`);
          }

          return buildResult(best.location, specifiedDistrict);
        }
      } else {
        logger.debug(`[Taxonomy] Best match for "${locationName}": ${best.location.name} (score: ${best.score}, matched: ${best.matchedWords.join(", ")}, bonus: ${best.bonusReason})`);

        // Log top 3 alternatives for debugging
        for (let i = 1; i < Math.min(4, scoredMatches.length); i++) {
          const alt = scoredMatches[i];
          logger.debug(`[Taxonomy] Alternative ${i}: ${alt.location.name} (score: ${alt.score}, ${alt.bonusReason})`);
        }

        return buildResult(best.location, specifiedDistrict);
      }
    }

    // Fallback: try to find a general location in the detected region
    if (specifiedDistrict && taxonomy.locations.length > 0) {
      // Get all location names that belong to this district from REGION_LOCATIONS
      const regionLocs = REGION_LOCATIONS[specifiedDistrict] || [];

      // First try: direct name match with district name (e.g., "Limassol")
      let regionFallback = taxonomy.locations.find(loc =>
        loc.name.toLowerCase().includes(specifiedDistrict!)
      );

      // Second try: match ANY location name that appears in REGION_LOCATIONS for this district
      // CRITICAL: Use EXACT word match to avoid "neapoli" matching "neapolis" + multi-word entries
      if (!regionFallback && regionLocs.length > 0) {
        regionFallback = taxonomy.locations.find(loc => {
          const locNameLower = loc.name.toLowerCase();
          const locWords = locNameLower.split(/[\s,]+/).filter(w => w.length > 1);
          return locWords.some(locWord => regionLocs.includes(locWord)) ||
                 regionLocs.some(regLoc => regLoc.includes(" ") && locNameLower.includes(regLoc));
        });
      }

      // Third try: just find the first location that STARTS with the district name
      if (!regionFallback) {
        regionFallback = taxonomy.locations.find(loc =>
          loc.name.toLowerCase().startsWith(specifiedDistrict!)
        );
      }

      if (regionFallback) {
        logger.debug(`[Taxonomy] Using region fallback for "${locationName}" (district: ${specifiedDistrict}): ${regionFallback.name}`);
        return buildResult(regionFallback, specifiedDistrict);
      }

      logger.warn(`[Taxonomy] No location found for district "${specifiedDistrict}" in "${locationName}", will use default`, { category: LogCategory.ZYPRUS });
    }

    // Ultimate fallback: return first location if available (ONLY when no district specified)
    if (!specifiedDistrict && taxonomy.locations.length > 0) {
      logger.debug(`[Taxonomy] WARNING: Using first available location for "${locationName}": ${taxonomy.locations[0].name}`);
      return buildResult(taxonomy.locations[0], null);
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding location", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use default location UUID
  // NOTE: Zyprus API REQUIRES field_location to be non-null (422 error if missing)
  // Since Zyprus only has Nicosia locations in the database, we must use Nicosia as fallback
  // even for other districts. The location mismatch will be noted in AI message for manual correction.
  if (specifiedDistrict) {
    logger.warn(`[Taxonomy] No location found for district "${specifiedDistrict}" in "${locationName}" - using Nicosia default as API requires non-null location`, { category: LogCategory.ZYPRUS });
  } else {
    logger.debug(`[Taxonomy] Using hardcoded default location UUID for: ${locationName}`);
  }
  return { uuid: DEFAULT_LOCATION_UUID, matchedName: locationName, district: specifiedDistrict };
}

/**
 * Find property type UUID by name
 * Uses hardcoded fallbacks from config for common types if API lookup fails
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string> {
  const normalized = typeName.toLowerCase().trim();
  logger.debug(`[Taxonomy] Finding property type UUID for: "${typeName}" (normalized: "${normalized}")`);

  // FIRST: Check if we have a hardcoded fallback for this type
  // This ensures common types like "villa" always get the correct UUID
  if (PROPERTY_TYPE_FALLBACKS[normalized]) {
    logger.debug(`[Taxonomy] Using hardcoded fallback for "${typeName}": ${PROPERTY_TYPE_FALLBACKS[normalized]}`);
    return PROPERTY_TYPE_FALLBACKS[normalized];
  }

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(`[Taxonomy] Available property types: ${taxonomy.propertyTypes.map(pt => pt.name).join(", ")}`);

    // Common aliases - maps user input to taxonomy names
    const aliases: Record<string, string[]> = {
      apartment: ["flat", "apt"],
      villa: ["detached", "detached house", "standalone house", "independent house"],
      house: ["home", "detached house"],
      maisonette: ["maisonette", "split-level"],
      bungalow: ["single-story", "single storey"],
      penthouse: ["penthouse apartment"],
      townhouse: ["town house", "terraced house", "semi-detached"],
    };

    // Try exact match
    const exact = taxonomy.propertyTypes.find(
      (pt) => pt.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(`[Taxonomy] Exact match for "${typeName}": ${exact.name} (${exact.id})`);
      return exact.id;
    }

    // Try aliases - find what canonical type this alias maps to
    for (const [canonical, aliasList] of Object.entries(aliases)) {
      if (aliasList.includes(normalized)) {
        // User used an alias, find the canonical type in taxonomy
        const match = taxonomy.propertyTypes.find(
          (pt) => pt.name.toLowerCase() === canonical
        );
        if (match) {
          logger.debug(`[Taxonomy] Alias match: "${typeName}" -> "${canonical}" -> ${match.id}`);
          return match.id;
        }
        // If canonical not in taxonomy, use hardcoded fallback
        if (PROPERTY_TYPE_FALLBACKS[canonical]) {
          logger.debug(`[Taxonomy] Alias fallback: "${typeName}" -> "${canonical}" -> ${PROPERTY_TYPE_FALLBACKS[canonical]}`);
          return PROPERTY_TYPE_FALLBACKS[canonical];
        }
      }
    }

    // Try partial match - but be careful not to match too broadly
    // Only match if the property type is contained in the taxonomy name
    const partial = taxonomy.propertyTypes.find(
      (pt) => pt.name.toLowerCase().includes(normalized)
    );
    if (partial) {
      logger.debug(`[Taxonomy] Partial match for "${typeName}": ${partial.name} (${partial.id})`);
      return partial.id;
    }

    // Last resort: return first property type if available
    if (taxonomy.propertyTypes.length > 0) {
      logger.debug(`[Taxonomy] WARNING: Using first available property type: ${taxonomy.propertyTypes[0].name}`);
      return taxonomy.propertyTypes[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding property type", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use default UUID
  logger.debug(`[Taxonomy] Using default property type UUID for: ${typeName}`);
  return DEFAULT_PROPERTY_TYPE_UUID;
}

/**
 * Find listing type UUID (sale/rent)
 * Uses DEFAULT_LISTING_TYPE_UUID from config as fallback
 */
export async function findListingTypeUuid(type: "sale" | "rent"): Promise<string> {
  try {
    const taxonomy = await loadTaxonomy();

    const searchTerms = type === "sale" ? ["sale", "for sale", "buy"] : ["rent", "for rent", "rental"];

    for (const term of searchTerms) {
      const match = taxonomy.listingTypes.find(
        (lt) => lt.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first listing type if available
    if (taxonomy.listingTypes.length > 0) {
      logger.debug(`[Taxonomy] Using first available listing type: ${taxonomy.listingTypes[0].name}`);
      return taxonomy.listingTypes[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding listing type", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use documented default UUID
  logger.debug(`[Taxonomy] Using hardcoded default listing type UUID`);
  return DEFAULT_LISTING_TYPE_UUID;
}

/**
 * Find feature UUIDs by names
 */
export async function findFeatureUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const allFeatures = [
    ...taxonomy.features,
    ...taxonomy.indoorFeatures,
    ...taxonomy.outdoorFeatures,
  ];

  const uuids: string[] = [];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();

    const match = allFeatures.find(
      (f) =>
        f.name.toLowerCase() === normalized ||
        f.name.toLowerCase().includes(normalized) ||
        normalized.includes(f.name.toLowerCase())
    );

    if (match && !uuids.includes(match.id)) {
      uuids.push(match.id);
    }
  }

  return uuids;
}

/**
 * Get all locations for a region
 */
export async function getLocationsByRegion(region: string): Promise<TaxonomyItem[]> {
  const taxonomy = await loadTaxonomy();

  // Region to parent location mapping
  const regionParents: Record<string, string[]> = {
    paphos: ["paphos", "pafos"],
    limassol: ["limassol", "lemesos"],
    larnaca: ["larnaca", "larnaka"],
    nicosia: ["nicosia", "lefkosia"],
    famagusta: ["famagusta", "ammochostos"],
  };

  const parentTerms = regionParents[region.toLowerCase()] || [];

  // Find parent location IDs
  const parentIds = taxonomy.locations
    .filter((loc) =>
      parentTerms.some((term) => loc.name.toLowerCase().includes(term))
    )
    .map((loc) => loc.id);

  // Return all locations that have these parents
  return taxonomy.locations.filter(
    (loc) => loc.parentId && parentIds.includes(loc.parentId)
  );
}

/**
 * Find price modifier UUID
 * Live API values: Price, Guide Price, Offers in region of, Offers over, Negotiable
 * Uses DEFAULT_PRICE_MODIFIER_UUID from config as fallback
 */
export async function findPriceModifierUuid(modifier?: string, negotiable?: boolean): Promise<string> {
  try {
    const taxonomy = await loadTaxonomy();

    // price_modifier taxonomy contains BOTH display types AND VAT terms:
    // Display: "Negotiable", "Price", "Guide Price", "Offers in region of", "Offers over"
    // VAT: "No VAT", "Plus VAT", "VAT Included"
    //
    // PRIORITY: "Negotiable" display is the MOST important for listings.
    // Lauren's rule: "Set Negotiable to YES by default"
    // Only use VAT-specific terms when agent says "+VAT" AND price is non-negotiable.
    //
    // For no_vat + negotiable (most common): use "Negotiable"
    // For plus_vat: use "Plus VAT" (VAT status matters more here)
    // For non-negotiable: use "Price"

    let searchTerms: string[];

    if (modifier === "plus_vat") {
      // +VAT is always shown — overrides negotiable display
      searchTerms = ["plus vat", "+vat"];
    } else if (modifier === "vat_included") {
      searchTerms = ["vat included"];
    } else if (negotiable === false) {
      // Explicitly non-negotiable
      searchTerms = ["price"];
    } else {
      // Default: "Negotiable" — most common case (including no_vat)
      // "No VAT" status is communicated via description text, not this field
      searchTerms = ["negotiable"];
    }

    // Log available terms for debugging
    logger.debug(`[Taxonomy] Price modifier search: terms=${searchTerms.join(",")}, modifier=${modifier}, negotiable=${negotiable}`, { category: LogCategory.CACHE });
    logger.debug(`[Taxonomy] Available price modifiers: ${taxonomy.priceModifiers.map(pm => pm.name).join(", ")}`, { category: LogCategory.CACHE });

    for (const term of searchTerms) {
      const match = taxonomy.priceModifiers.find(
        (pm) => pm.name.toLowerCase() === term || pm.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first price modifier if available
    if (taxonomy.priceModifiers.length > 0) {
      logger.debug(`[Taxonomy] Using first available price modifier: ${taxonomy.priceModifiers[0].name}`);
      return taxonomy.priceModifiers[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding price modifier", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use documented default UUID
  logger.debug(`[Taxonomy] Using hardcoded default price modifier UUID`);
  return DEFAULT_PRICE_MODIFIER_UUID;
}

/**
 * Find title deed UUID
 * Live API values: Available, Not Available, On Application, Not Display
 * Uses DEFAULT_TITLE_DEED_UUID from config as fallback
 */
export async function findTitleDeedUuid(status?: string): Promise<string> {
  try {
    const taxonomy = await loadTaxonomy();

    // Map common user inputs to actual Zyprus terms (both prod and dev)
    const statusMappings: Record<string, string[]> = {
      "available": ["available", "yes", "title deed", "full ownership", "has title"],
      "title deed": ["title deed", "full ownership", "has title", "available"],
      "not available": ["not available", "no", "pending", "no title", "without title", "permits_only", "permits only"],
      "on application": ["on application", "applied", "in progress", "in process", "being issued", "in_process", "final approval"],
      "share of land": ["share of land", "shared", "fractional"],
    };

    // Default search terms
    let searchTerms: string[] = ["title deed", "available"];

    if (status) {
      const normalizedStatus = status.toLowerCase().trim();
      // Check if status maps to a known term
      for (const [zyprusTerm, aliases] of Object.entries(statusMappings)) {
        if (aliases.some(alias => normalizedStatus.includes(alias) || alias.includes(normalizedStatus))) {
          searchTerms = [zyprusTerm, ...aliases];
          break;
        }
      }
    }

    for (const term of searchTerms) {
      const match = taxonomy.titleDeeds.find(
        (td) => td.name.toLowerCase() === term || td.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first title deed if available
    if (taxonomy.titleDeeds.length > 0) {
      logger.debug(`[Taxonomy] Using first available title deed: ${taxonomy.titleDeeds[0].name}`);
      return taxonomy.titleDeeds[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding title deed", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use documented default UUID
  logger.debug(`[Taxonomy] Using hardcoded default title deed UUID`);
  return DEFAULT_TITLE_DEED_UUID;
}

/**
 * Find user UUID by email address
 * Uses multiple lookup strategies:
 * 0. Supabase agents table (NEW - highest priority)
 * 1. Direct email match from Zyprus API
 * 2. Name/display_name match using AGENT_NAME_MAP
 * 3. Hardcoded UUID fallbacks
 * 4. SOPHIA_AI_UUID as ultimate fallback
 */
export async function findUserUuid(email: string): Promise<string> {
  if (!email) {
    logger.debug("[Taxonomy] No email provided, using SOPHIA_AI_UUID", { category: LogCategory.ZYPRUS });
    return SOPHIA_AI_UUID;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Strategy 0: Check Supabase agents table FIRST (most reliable)
  const supabaseUuid = await lookupAgentFromSupabase(normalizedEmail);
  if (supabaseUuid) {
    return supabaseUuid;
  }

  try {
    const taxonomy = await loadTaxonomy();

    // Strategy 1: Direct email match from Zyprus API
    const userByEmail = taxonomy.users.find(u => u.email === normalizedEmail);
    if (userByEmail) {
      logger.debug(`[Taxonomy] Found user by email ${normalizedEmail}: ${userByEmail.id}`);
      return userByEmail.id;
    }

    // Strategy 2: Match by name/display_name using AGENT_NAME_MAP
    const possibleNames = AGENT_NAME_MAP[normalizedEmail];
    if (possibleNames && possibleNames.length > 0) {
      for (const name of possibleNames) {
        const normalizedName = name.toLowerCase();
        const userByName = taxonomy.users.find(u =>
          u.name.toLowerCase() === normalizedName ||
          u.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(u.name.toLowerCase())
        );
        if (userByName) {
          logger.debug(`[Taxonomy] Found user by name "${name}" for ${normalizedEmail}: ${userByName.id}`);
          return userByName.id;
        }
      }
    }

    // Strategy 3: Try matching just the username part of email (e.g., "evelina" from "evelina@zyprus.com")
    const emailUsername = normalizedEmail.split("@")[0];
    if (emailUsername && emailUsername.length > 2) {
      const userByUsername = taxonomy.users.find(u =>
        u.name.toLowerCase() === emailUsername ||
        u.name.toLowerCase().includes(emailUsername)
      );
      if (userByUsername) {
        logger.debug(`[Taxonomy] Found user by username "${emailUsername}" for ${normalizedEmail}: ${userByUsername.id}`);
        return userByUsername.id;
      }
    }

    logger.debug(`[Taxonomy] User not found in API for ${normalizedEmail}, checking fallbacks`);
  } catch (error) {
    logger.error("[Taxonomy] Error finding user", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Strategy 4: Check hardcoded fallbacks
  const fallback = USER_FALLBACKS[normalizedEmail];
  if (fallback) {
    logger.debug(`[Taxonomy] Using hardcoded fallback for ${normalizedEmail}: ${fallback}`);
    return fallback;
  }

  // Ultimate fallback: use SOPHIA_AI_UUID
  logger.debug(`[Taxonomy] Using SOPHIA_AI_UUID fallback for ${normalizedEmail}`);
  return SOPHIA_AI_UUID;
}

/**
 * Find multiple user UUIDs for reviewers
 * IMPORTANT: Excludes SOPHIA_AI_UUID from results to prevent "Sophia AI ()" showing as reviewer
 * Only returns UUIDs for emails that can be resolved to actual users
 */
export async function findUserUuids(emails: string[]): Promise<string[]> {
  const validEmails = emails.filter(Boolean);
  const results = await Promise.all(validEmails.map(email => findUserUuid(email)));

  const uuids: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const uuid = results[i];
    if (uuid !== SOPHIA_AI_UUID && !uuids.includes(uuid)) {
      uuids.push(uuid);
    } else if (uuid === SOPHIA_AI_UUID) {
      logger.debug(`[Taxonomy] Skipping SOPHIA_AI_UUID for reviewer email: ${validEmails[i]}`);
    }
  }
  return uuids;
}

// NOTE: Feature fallbacks, aliases, and modifiers are now imported from config/business-rules.ts

/**
 * Resolve user input to canonical taxonomy term using aliases
 * Returns the canonical term if found, otherwise returns the original input
 */
function resolveFeatureAlias(input: string, aliasMap: Record<string, string[]>): string {
  const normalized = input.toLowerCase().trim();

  // Check if input matches any alias
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (aliases.some(alias => alias === normalized || normalized.includes(alias) || alias.includes(normalized))) {
      logger.debug(`[Taxonomy] ALIAS: "${input}" -> "${canonical}"`);
      return canonical;
    }
  }

  return normalized;
}

/**
 * Find indoor feature UUIDs from feature names
 * IMPROVED: Uses exact matching against taxonomy, with hardcoded fallbacks
 * @param featureNames - Array of feature names to look up
 * @param bathrooms - Optional bathroom count. If >= 2, auto-adds "guest toilet" and "master bed"
 */
export async function findIndoorFeatureUuids(featureNames: string[], bathrooms?: number): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  // Auto-add features based on bathroom count
  const effectiveFeatures = [...featureNames];
  if (bathrooms && bathrooms >= 2) {
    logger.debug(`[Taxonomy] Bathrooms >= 2 (${bathrooms}), auto-adding guest toilet and master bed`);
    if (!effectiveFeatures.some(f => f.toLowerCase().includes("guest"))) {
      effectiveFeatures.push("guest toilet");
    }
    if (!effectiveFeatures.some(f => f.toLowerCase().includes("master"))) {
      effectiveFeatures.push("master bed");
    }
  }

  logger.debug(`[Taxonomy] Finding indoor features from: ${effectiveFeatures.join(", ")}`);
  logger.debug(`[Taxonomy] Available indoor features (${taxonomy.indoorFeatures.length}): ${taxonomy.indoorFeatures.map(f => f.name).join(", ")}`);

  for (const name of effectiveFeatures) {
    if (!name) continue;

    // First resolve any aliases (e.g., "laundry room" -> "utility room")
    const normalized = resolveFeatureAlias(name, INDOOR_FEATURE_ALIASES);
    if (!normalized) continue;

    // Skip features that are clearly outdoor-only (pool, garden, etc.)
    // But be careful - "covered parking" is INDOOR in Zyprus taxonomy!
    const isOutdoorOnly = [
      "private pool", "communal pool", "swimming pool", "heated swimming pool",
      "landscape garden", "standard garden", "roof garden",
      "barbecue", "bbq", "outdoor shower", "bore hole",
      "photovoltaic", "solar system", "irrigation"
    ].some(kw => normalized.includes(kw));

    if (isOutdoorOnly) continue;

    // Strategy 1: Try EXACT match in taxonomy (case-insensitive)
    let match = taxonomy.indoorFeatures.find(f => f.name.toLowerCase() === normalized);

    if (!match) {
      // Strategy 2: Try normalized match (remove hyphens, slashes)
      const normalizedClean = normalized.replace(/[-\/]/g, " ").replace(/\s+/g, " ");
      match = taxonomy.indoorFeatures.find(f => {
        const taxClean = f.name.toLowerCase().replace(/[-\/]/g, " ").replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input (e.g., "parking" in "Covered Parking")
      match = taxonomy.indoorFeatures.find(f => {
        const taxLower = f.name.toLowerCase();
        // Must be an exact word match, not substring
        return taxLower === normalized ||
               taxLower.includes(normalized) && !hasContradictoryModifiers(normalized, f.name);
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(`[Taxonomy] INDOOR MATCHED: "${name}" -> "${match.name}" (${match.id})`);
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = INDOOR_FEATURE_FALLBACKS[normalized];
      if (fallbackUuid && !fallbackUuid.includes("placeholder") && !uuids.includes(fallbackUuid)) {
        logger.debug(`[Taxonomy] INDOOR FALLBACK: "${name}" -> ${fallbackUuid}`);
        uuids.push(fallbackUuid);
      } else {
        logger.debug(`[Taxonomy] INDOOR NO MATCH: "${name}"`);
      }
    }
  }

  logger.debug(`[Taxonomy] Found ${uuids.length} indoor feature UUIDs`);
  return uuids;
}

/**
 * Check if input and taxonomy term have contradictory modifiers
 * Returns true if they contradict (should NOT match)
 */
function hasContradictoryModifiers(input: string, taxonomyTerm: string): boolean {
  const inputLower = input.toLowerCase();
  const taxLower = taxonomyTerm.toLowerCase();

  for (const [mod1, mod2] of OPPOSITE_MODIFIERS) {
    // Check both directions: input has mod1 & tax has mod2, or input has mod2 & tax has mod1
    if ((inputLower.includes(mod1) && taxLower.includes(mod2)) ||
        (inputLower.includes(mod2) && taxLower.includes(mod1))) {
      logger.debug(`[Taxonomy] REJECTED: "${input}" vs "${taxonomyTerm}" - contradictory modifiers (${mod1}/${mod2})`);
      return true;
    }
  }
  return false;
}

// Note: findBestMatch was removed in favor of simpler inline matching in each function

/**
 * Find outdoor feature UUIDs from feature names
 * IMPROVED: Uses exact matching against taxonomy, with hardcoded fallbacks
 */
export async function findOutdoorFeatureUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  logger.debug(`[Taxonomy] Finding outdoor features from: ${featureNames.join(", ")}`);
  logger.debug(`[Taxonomy] Available outdoor features (${taxonomy.outdoorFeatures.length}): ${taxonomy.outdoorFeatures.map(f => f.name).join(", ")}`);

  for (const name of featureNames) {
    if (!name) continue;

    // First resolve any aliases (e.g., "swimming pool" -> "private pool")
    const normalized = resolveFeatureAlias(name, OUTDOOR_FEATURE_ALIASES);
    if (!normalized) continue;

    // Skip features that are clearly indoor-only
    const isIndoorOnly = [
      "air conditioning", "central heating", "fireplace", "elevator",
      "fitted kitchen", "electrical appliances", "water heater",
      "guest toilet", "basement", "mezzanine", "jacuzzi",
      "internal pool", "playroom", "conference room", "cctv"
    ].some(kw => normalized.includes(kw));

    if (isIndoorOnly) continue;

    // Skip views - they go in property_views, not outdoor features
    const isView = ["view", "sea view", "mountain view", "city view", "green area view"].some(kw => normalized.includes(kw));
    if (isView) continue;

    // Strategy 1: Try EXACT match in taxonomy (case-insensitive)
    let match = taxonomy.outdoorFeatures.find(f => f.name.toLowerCase() === normalized);

    if (!match) {
      // Strategy 2: Try normalized match (remove hyphens, slashes)
      const normalizedClean = normalized.replace(/[-\/]/g, " ").replace(/\s+/g, " ");
      match = taxonomy.outdoorFeatures.find(f => {
        const taxClean = f.name.toLowerCase().replace(/[-\/]/g, " ").replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input
      match = taxonomy.outdoorFeatures.find(f => {
        const taxLower = f.name.toLowerCase();
        return taxLower === normalized ||
               taxLower.includes(normalized) && !hasContradictoryModifiers(normalized, f.name);
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(`[Taxonomy] OUTDOOR MATCHED: "${name}" -> "${match.name}" (${match.id})`);
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = OUTDOOR_FEATURE_FALLBACKS[normalized];
      if (fallbackUuid && !fallbackUuid.includes("placeholder") && !uuids.includes(fallbackUuid)) {
        logger.debug(`[Taxonomy] OUTDOOR FALLBACK: "${name}" -> ${fallbackUuid}`);
        uuids.push(fallbackUuid);
      } else {
        logger.debug(`[Taxonomy] OUTDOOR NO MATCH: "${name}"`);
      }
    }
  }

  logger.debug(`[Taxonomy] Found ${uuids.length} outdoor feature UUIDs`);
  return uuids;
}

/**
 * Find view UUIDs from feature names (sea view, mountain view, etc.)
 * Views have their own taxonomy: taxonomy_term--property_views
 * IMPROVED: Uses correct property_views taxonomy, not outdoor_property_features
 */
export async function findPropertyViewUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  logger.debug(`[Taxonomy] Finding property views from: ${featureNames.join(", ")}`);
  logger.debug(`[Taxonomy] Available property views (${taxonomy.propertyViews.length}): ${taxonomy.propertyViews.map(f => f.name).join(", ")}`);

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();
    if (!normalized) continue;

    // Check if it contains "view" keyword
    if (!normalized.includes("view")) continue;

    // Strategy 1: Try EXACT match in property_views taxonomy
    let match = taxonomy.propertyViews.find(f => f.name.toLowerCase() === normalized);

    if (!match) {
      // Strategy 2: Try normalized match
      const normalizedClean = normalized.replace(/[-\/]/g, " ").replace(/\s+/g, " ");
      match = taxonomy.propertyViews.find(f => {
        const taxClean = f.name.toLowerCase().replace(/[-\/]/g, " ").replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input
      match = taxonomy.propertyViews.find(f => {
        const taxLower = f.name.toLowerCase();
        return taxLower.includes(normalized) || normalized.includes(taxLower);
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(`[Taxonomy] VIEW MATCHED: "${name}" -> "${match.name}" (${match.id})`);
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = VIEW_FALLBACKS[normalized];
      if (fallbackUuid && !fallbackUuid.includes("placeholder") && !uuids.includes(fallbackUuid)) {
        logger.debug(`[Taxonomy] VIEW FALLBACK: "${name}" -> ${fallbackUuid}`);
        uuids.push(fallbackUuid);
      } else {
        logger.debug(`[Taxonomy] VIEW NO MATCH: "${name}"`);
      }
    }
  }

  logger.debug(`[Taxonomy] Found ${uuids.length} property view UUIDs`);
  return uuids;
}

/**
 * Find land type UUID (plot, field, agricultural)
 * Returns empty string as fallback if not found
 */
export async function findLandTypeUuid(landType: string): Promise<string> {
  if (!landType) return "";
  const normalized = landType.toLowerCase().trim();
  logger.debug(`[Taxonomy] Finding land type UUID for: "${landType}" (normalized: "${normalized}")`);

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(`[Taxonomy] Available land types: ${taxonomy.landTypes.map(lt => lt.name).join(", ")}`);

    // Try exact match
    const exact = taxonomy.landTypes.find(
      (lt) => lt.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(`[Taxonomy] Exact match for "${landType}": ${exact.name} (${exact.id})`);
      return exact.id;
    }

    // Try partial match
    const partial = taxonomy.landTypes.find(
      (lt) => lt.name.toLowerCase().includes(normalized) || normalized.includes(lt.name.toLowerCase())
    );
    if (partial) {
      logger.debug(`[Taxonomy] Partial match for "${landType}": ${partial.name} (${partial.id})`);
      return partial.id;
    }

    // Return first land type if available
    if (taxonomy.landTypes.length > 0) {
      logger.debug(`[Taxonomy] Using first available land type: ${taxonomy.landTypes[0].name}`);
      return taxonomy.landTypes[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding land type", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Fallback: empty string (land type is optional in some cases)
  logger.warn(`[Taxonomy] No land type found for: "${landType}", using empty fallback`);
  return "";
}

/**
 * Find infrastructure UUIDs (electricity, water, road_access, sewage, telephone)
 * Returns array of matched UUIDs
 */
export async function findInfrastructureUuids(infrastructure: string[]): Promise<string[]> {
  if (!infrastructure || infrastructure.length === 0) {
    return [];
  }

  const uuids: string[] = [];

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(`[Taxonomy] Finding infrastructure from: ${infrastructure.join(", ")}`);
    logger.debug(`[Taxonomy] Available infrastructure (${taxonomy.infrastructure.length}): ${taxonomy.infrastructure.map(i => i.name).join(", ")}`);

    for (const name of infrastructure) {
      const normalized = name.toLowerCase().trim().replace(/_/g, " ");
      if (!normalized) continue;

      // Try exact match
      let match = taxonomy.infrastructure.find(i => i.name.toLowerCase() === normalized);

      if (!match) {
        // Try normalized match (replace underscores, hyphens with spaces)
        const normalizedClean = normalized.replace(/[-\/]/g, " ").replace(/\s+/g, " ");
        match = taxonomy.infrastructure.find(i => {
          const taxClean = i.name.toLowerCase().replace(/[-\/]/g, " ").replace(/\s+/g, " ");
          return taxClean === normalizedClean;
        });
      }

      if (!match) {
        // Try partial match
        match = taxonomy.infrastructure.find(i => {
          const taxLower = i.name.toLowerCase();
          return taxLower.includes(normalized) || normalized.includes(taxLower);
        });
      }

      if (match && !uuids.includes(match.id)) {
        logger.debug(`[Taxonomy] INFRASTRUCTURE MATCHED: "${name}" -> "${match.name}" (${match.id})`);
        uuids.push(match.id);
      } else if (!match) {
        logger.debug(`[Taxonomy] INFRASTRUCTURE NO MATCH: "${name}"`);
      }
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding infrastructure", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  logger.debug(`[Taxonomy] Found ${uuids.length} infrastructure UUIDs`);
  return uuids;
}

