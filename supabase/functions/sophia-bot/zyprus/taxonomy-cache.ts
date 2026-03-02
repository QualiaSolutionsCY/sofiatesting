/**
 * Taxonomy Cache for Zyprus API
 * Core caching infrastructure - loads and caches taxonomy data from Zyprus API
 * Specific lookup functions are in property-types.ts, amenities.ts, and locations.ts
 */

import {
  TAXONOMY_CACHE_TTL_MS,
  TAXONOMY_STALE_TTL_MS,
} from "../config/business-rules.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { getAccessToken, getZyprusConfig } from "./client.ts";

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
  propertyViews: TaxonomyItem[]; // Sea View, Mountain View, etc.
  landTypes: TaxonomyItem[]; // Plot, Field, Agricultural
  infrastructure: TaxonomyItem[]; // Electricity, Water, Road Access, etc.
  users: UserItem[];
  lastUpdated: number;
}

// In-memory cache
let cache: TaxonomyCache | null = null;
const CACHE_TTL = TAXONOMY_CACHE_TTL_MS; // 1 hour - fresh
const STALE_TTL = TAXONOMY_STALE_TTL_MS; // 2 hours - serve stale while refreshing

// P2 PERFORMANCE: Singleton promise to prevent cache stampede
let taxonomyLoadPromise: Promise<TaxonomyCache> | null = null;

// Background refresh flag to prevent multiple concurrent background refreshes
let isBackgroundRefreshing = false;

/**
 * Parse taxonomy items from API response
 */
function parseTaxonomyItems(data: {
  data?: Array<Record<string, unknown>>;
}): TaxonomyItem[] {
  const items: TaxonomyItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as Record<string, unknown> | undefined;
    const rels = item.relationships as
      | Record<string, { data?: Array<{ id: string }> | { id: string } }>
      | undefined;
    items.push({
      id: item.id as string,
      name: (attrs?.name as string) || (attrs?.title as string) || "",
      parentId: Array.isArray(rels?.parent?.data)
        ? rels.parent.data[0]?.id
        : undefined,
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
  const firstResponse = await fetch(`${baseUrl}?page[limit]=${PAGE_SIZE}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!firstResponse.ok) {
    logger.error(
      `[Taxonomy] Failed to fetch ${vocabularyName}: ${firstResponse.status}`,
      undefined,
      { category: LogCategory.ZYPRUS }
    );
    return [];
  }

  const firstData = await firstResponse.json();
  const items = parseTaxonomyItems(firstData);

  // Check if there are more pages
  const totalCount = firstData.meta?.count;
  if (!totalCount || totalCount <= PAGE_SIZE) {
    logger.debug(
      `[Taxonomy] Loaded ${items.length} ${vocabularyName} terms (single page)`
    );
    return items;
  }

  // Calculate remaining pages and fetch in parallel
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const remainingPages = totalPages - 1;

  if (remainingPages > 0) {
    const pagePromises = Array.from({ length: remainingPages }, (_, i) =>
      fetch(
        `${baseUrl}?page[limit]=${PAGE_SIZE}&page[offset]=${(i + 1) * PAGE_SIZE}`,
        { headers, signal: AbortSignal.timeout(30_000) }
      )
        .then((res) => (res.ok ? res.json() : null))
        .catch((error) => {
          logger.warn("Taxonomy page fetch failed (non-critical)", {
            category: LogCategory.CACHE,
            operation: "fetchTaxonomy-pagination",
            vocabularyName,
            page: i + 1,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        })
    );

    const pageResults = await Promise.all(pagePromises);
    for (const pageData of pageResults) {
      if (pageData) {
        items.push(...parseTaxonomyItems(pageData));
      }
    }
  }

  logger.debug(
    `[Taxonomy] Loaded ${items.length} ${vocabularyName} terms (${totalPages} pages parallel)`
  );
  return items;
}

/**
 * Parse location items from API response (different structure than taxonomy)
 */
function parseLocationItems(data: {
  data?: Array<Record<string, unknown>>;
}): TaxonomyItem[] {
  const items: TaxonomyItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as Record<string, unknown> | undefined;
    const rels = item.relationships as
      | Record<string, { data?: { id: string } }>
      | undefined;
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
  const firstResponse = await fetch(`${baseUrl}?page[limit]=${PAGE_SIZE}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!firstResponse.ok) {
    logger.error(
      `[Taxonomy] Failed to fetch locations: ${firstResponse.status}`,
      undefined,
      { category: LogCategory.ZYPRUS }
    );
    return [];
  }

  const firstData = await firstResponse.json();
  const items = parseLocationItems(firstData);

  // Check if there are more pages using links.next (meta.count is undefined in Zyprus API)
  const nextLink = firstData.links?.next;
  if (!nextLink) {
    logger.debug(
      `[Taxonomy] Loaded ${items.length} location nodes (single page)`
    );
    return items;
  }

  // Fetch remaining pages by following links sequentially
  const allItems = [...items];
  let nextUrl = (typeof nextLink === "string" ? nextLink : nextLink?.href) as
    | string
    | null;
  let pageCount = 1;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) break;

    const data = await response.json();
    allItems.push(...parseLocationItems(data));
    pageCount++;

    const next = data.links?.next;
    nextUrl = (typeof next === "string" ? next : next?.href) as string | null;

    // Safety limit to prevent infinite loops
    if (pageCount > 100) {
      logger.warn(
        "[Taxonomy] Location pagination exceeded 100 pages, stopping",
        undefined,
        { category: LogCategory.ZYPRUS }
      );
      break;
    }
  }

  logger.debug(
    `[Taxonomy] Loaded ${allItems.length} location nodes (${pageCount} pages)`
  );
  return allItems;
}

/**
 * Parse user items from API response
 */
function parseUserItems(data: {
  data?: Array<Record<string, unknown>>;
}): UserItem[] {
  const items: UserItem[] = [];
  for (const item of data.data || []) {
    const attrs = item.attributes as
      | Record<string, string | undefined>
      | undefined;
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
async function fetchUsers(token: string, apiUrl: string): Promise<UserItem[]> {
  const baseUrl = `${apiUrl}/jsonapi/user/user`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.api+json",
    "User-Agent": "SophiaAI",
  };
  const PAGE_SIZE = 50;

  // Fetch first page to get total count
  const firstResponse = await fetch(
    `${baseUrl}?filter[status]=1&page[limit]=${PAGE_SIZE}`,
    { headers, signal: AbortSignal.timeout(30_000) }
  );

  if (!firstResponse.ok) {
    logger.error(
      `[Taxonomy] Failed to fetch users: ${firstResponse.status}`,
      undefined,
      { category: LogCategory.ZYPRUS }
    );
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
  let nextUrl = (typeof nextLink === "string" ? nextLink : nextLink?.href) as
    | string
    | null;
  let pageCount = 1;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) break;

    const data = await response.json();
    allItems.push(...parseUserItems(data));
    pageCount++;

    const next = data.links?.next;
    nextUrl = (typeof next === "string" ? next : next?.href) as string | null;

    // Safety limit to prevent infinite loops
    if (pageCount > 100) {
      logger.warn(
        "[Taxonomy] User pagination exceeded 100 pages, stopping",
        undefined,
        { category: LogCategory.ZYPRUS }
      );
      break;
    }
  }

  logger.debug(
    `[Taxonomy] Loaded ${allItems.length} users (${pageCount} pages)`
  );
  return allItems;
}

/**
 * Refresh taxonomy data in background (fire-and-forget)
 * Used by stale-while-revalidate pattern
 */
async function refreshTaxonomyInBackground(): Promise<void> {
  if (isBackgroundRefreshing) {
    logger.debug(
      "[Taxonomy] Background refresh already in progress, skipping",
      { category: LogCategory.CACHE }
    );
    return;
  }

  isBackgroundRefreshing = true;
  logger.info("[Taxonomy] Starting background refresh...", {
    category: LogCategory.CACHE,
  });

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

    logger.info("[Taxonomy] Background refresh completed", {
      category: LogCategory.CACHE,
    });
  } catch (err) {
    logger.error(
      "[Taxonomy] Background refresh failed",
      err instanceof Error ? err : new Error(String(err)),
      { category: LogCategory.CACHE }
    );
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
      logger.debug("[Taxonomy] Serving stale cache, refreshing in background", {
        category: LogCategory.CACHE,
      });
      // Fire-and-forget background refresh
      refreshTaxonomyInBackground().catch((error) => {
        logger.warn("Background taxonomy refresh failed (non-critical)", {
          category: LogCategory.CACHE,
          operation: "refreshTaxonomyInBackground",
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return cache;
    }
  }

  // No cache or expired - need to do blocking refresh
  // P2 PERFORMANCE: Prevent cache stampede - only one concurrent fetch
  if (taxonomyLoadPromise) {
    logger.debug("[Taxonomy] Waiting for existing load operation...", {
      category: LogCategory.CACHE,
    });
    return taxonomyLoadPromise;
  }

  logger.info("[Taxonomy] Loading taxonomy data (blocking)...", {
    category: LogCategory.CACHE,
  });

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

      logger.info("[Taxonomy] Taxonomy loaded successfully", {
        category: LogCategory.CACHE,
      });
      return cache;
    } finally {
      // Clear the singleton promise after load completes (success or failure)
      taxonomyLoadPromise = null;
    }
  })();

  return taxonomyLoadPromise;
}

// Re-exports for backward compatibility
export { findPropertyTypeUuid, findListingTypeUuid, findPriceModifierUuid, findTitleDeedUuid } from "./property-types.ts";
export { findFeatureUuids, findIndoorFeatureUuids, findOutdoorFeatureUuids, findPropertyViewUuids, findLandTypeUuid, findInfrastructureUuids } from "./amenities.ts";
export { type LocationResult, findLocationUuid, getLocationsByRegion, findUserUuid, findUserUuids } from "./locations.ts";
