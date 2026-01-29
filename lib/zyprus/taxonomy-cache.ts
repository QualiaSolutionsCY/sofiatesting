import { logger } from "../logger";
import { getZyprusLocations, getZyprusTaxonomyTerms } from "./client";

const log = logger.zyprus.child("taxonomy");

export type TaxonomyCache = {
  locations?: Map<string, string>; // name → id
  propertyTypes?: Map<string, string>;
  indoorFeatures?: Map<string, string>;
  outdoorFeatures?: Map<string, string>;
  priceModifiers?: Map<string, string>;
  titleDeeds?: Map<string, string>;
  // NEW: Land-specific taxonomies
  landTypes?: Map<string, string>;
  infrastructure?: Map<string, string>;
  // NEW: Shared taxonomies for property and land
  propertyViews?: Map<string, string>;
  propertyStatus?: Map<string, string>;
  // NEW: Listing types (For Sale, For Rent, Exchange)
  listingTypes?: Map<string, string>;
  lastUpdated: number;
};

const CACHE_TTL_SECONDS = 3600; // 1 hour in seconds

// In-memory cache
let globalCache: TaxonomyCache = {
  lastUpdated: 0,
};

/**
 * Check if cache is stale (older than TTL)
 */
function isCacheStale(cache: TaxonomyCache): boolean {
  const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
  return Date.now() - cache.lastUpdated > CACHE_TTL_MS;
}

/**
 * Check if we're in build/static generation phase
 */
function isBuildTime(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.VERCEL_ENV === "production-build" ||
    (process.env.NODE_ENV === "production" &&
      typeof window === "undefined" &&
      !process.env.ZYPRUS_CLIENT_ID)
  );
}

/**
 * Refresh all taxonomy data from Zyprus API and store in memory
 */
async function refreshCache(): Promise<TaxonomyCache> {
  // During build time, skip API calls and return empty cache
  if (isBuildTime()) {
    log.debug("Build time detected - skipping taxonomy cache refresh");
    return {
      lastUpdated: 0,
    };
  }

  try {
    // Fetch all taxonomies in parallel for performance
    const [
      locations,
      propertyTypes,
      indoorFeatures,
      outdoorFeatures,
      priceModifiers,
      titleDeeds,
      // NEW: Land-specific and shared taxonomies
      landTypes,
      infrastructure,
      propertyViews,
      propertyStatus,
      listingTypes,
    ] = await Promise.all([
      getZyprusLocations(),
      getZyprusTaxonomyTerms("property_type"),
      getZyprusTaxonomyTerms("indoor_property_views"), // NOTE: Drupal uses "indoor_property_views" not "indoor_property_features"
      getZyprusTaxonomyTerms("outdoor_property_features"),
      getZyprusTaxonomyTerms("price_modifier"),
      getZyprusTaxonomyTerms("title_deed"),
      // NEW: Land-specific and shared taxonomies
      getZyprusTaxonomyTerms("land_type"),
      getZyprusTaxonomyTerms("infrastructure_"),
      getZyprusTaxonomyTerms("property_views"),
      getZyprusTaxonomyTerms("property_status"),
      getZyprusTaxonomyTerms("listing_type"),
    ]);

    const newCache: TaxonomyCache = {
      locations: new Map(
        locations.map((loc: any) => [
          loc.attributes.title.toLowerCase(),
          loc.id,
        ])
      ),
      propertyTypes: new Map(
        propertyTypes.map((type: any) => [
          type.attributes.name.toLowerCase(),
          type.id,
        ])
      ),
      indoorFeatures: new Map(
        indoorFeatures.map((feature: any) => [
          feature.attributes.name.toLowerCase(),
          feature.id,
        ])
      ),
      outdoorFeatures: new Map(
        outdoorFeatures.map((feature: any) => [
          feature.attributes.name.toLowerCase(),
          feature.id,
        ])
      ),
      priceModifiers: new Map(
        priceModifiers.map((modifier: any) => [
          modifier.attributes.name.toLowerCase(),
          modifier.id,
        ])
      ),
      titleDeeds: new Map(
        titleDeeds.map((deed: any) => [
          deed.attributes.name.toLowerCase(),
          deed.id,
        ])
      ),
      // NEW: Land-specific taxonomies
      landTypes: new Map(
        landTypes.map((type: any) => [
          type.attributes.name.toLowerCase(),
          type.id,
        ])
      ),
      infrastructure: new Map(
        infrastructure.map((item: any) => [
          item.attributes.name.toLowerCase(),
          item.id,
        ])
      ),
      // NEW: Shared taxonomies for property and land
      propertyViews: new Map(
        propertyViews.map((view: any) => [
          view.attributes.name.toLowerCase(),
          view.id,
        ])
      ),
      propertyStatus: new Map(
        propertyStatus.map((status: any) => [
          status.attributes.name.toLowerCase(),
          status.id,
        ])
      ),
      listingTypes: new Map(
        listingTypes.map((type: any) => [
          type.attributes.name.toLowerCase(),
          type.id,
        ])
      ),
      lastUpdated: Date.now(),
    };

    // Update global cache
    globalCache = newCache;

    return newCache;
  } catch (error) {
    log.error("Failed to refresh taxonomy cache from Zyprus API", error);

    // During build time, return empty cache instead of retrying
    if (isBuildTime()) {
      log.debug("Build time - returning empty cache after API failure");
      return {
        lastUpdated: 0,
      };
    }

    // Return existing cache if available
    if (globalCache.lastUpdated > 0) {
      return globalCache;
    }

    // Last resort: empty cache
    return {
      lastUpdated: 0,
    };
  }
}

/**
 * Get cached taxonomy data, refresh if stale
 */
export async function getCache(): Promise<TaxonomyCache> {
  // During build time, return empty cache immediately
  if (isBuildTime()) {
    log.debug("Build time - returning empty taxonomy cache");
    return {
      lastUpdated: 0,
    };
  }

  // Check if stale
  if (isCacheStale(globalCache)) {
    // Refresh in background if we have data, otherwise wait
    if (globalCache.lastUpdated > 0) {
      refreshCache().catch((err) =>
        log.error("Background cache refresh failed", err)
      );
      return globalCache;
    }
    return await refreshCache();
  }

  return globalCache;
}

/**
 * Force refresh cache (useful after taxonomy changes)
 */
export async function forceRefreshCache(): Promise<void> {
  await refreshCache();
  log.info("Taxonomy cache force refreshed");
}

/**
 * Find location ID by name (fuzzy match)
 */
export async function findLocationByName(name: string): Promise<string | null> {
  const cache = await getCache();
  if (!cache.locations) {
    return null;
  }

  const searchName = name.toLowerCase().trim();

  // Exact match first
  const exactMatch = cache.locations.get(searchName);
  if (exactMatch) {
    return exactMatch;
  }

  // Partial match (contains)
  for (const [locationName, id] of cache.locations) {
    if (
      locationName.includes(searchName) ||
      searchName.includes(locationName)
    ) {
      return id;
    }
  }

  return null;
}

/**
 * Find property type ID by name
 */
export async function findPropertyTypeByName(
  name: string
): Promise<string | null> {
  const cache = await getCache();
  if (!cache.propertyTypes) {
    return null;
  }

  const searchName = name.toLowerCase().trim();

  const exactMatch = cache.propertyTypes.get(searchName);
  if (exactMatch) {
    return exactMatch;
  }

  return null;
}

/**
 * Find feature IDs by names
 */
export async function findIndoorFeatureIds(names: string[]): Promise<string[]> {
  const cache = await getCache();
  if (!cache.indoorFeatures) {
    return [];
  }

  return names
    .map((name) => name.toLowerCase().trim())
    .map((name) => cache.indoorFeatures?.get(name))
    .filter((id): id is string => id !== undefined);
}

export async function findOutdoorFeatureIds(
  names: string[]
): Promise<string[]> {
  const cache = await getCache();
  if (!cache.outdoorFeatures) {
    return [];
  }

  return names
    .map((name) => name.toLowerCase().trim())
    .map((name) => cache.outdoorFeatures?.get(name))
    .filter((id): id is string => id !== undefined);
}

/**
 * Get all locations for user presentation
 */
export async function getAllLocations(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.locations) {
    return [];
  }

  return Array.from(cache.locations.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all property types
 */
export async function getAllPropertyTypes(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.propertyTypes) {
    return [];
  }

  return Array.from(cache.propertyTypes.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all features
 */
export async function getAllIndoorFeatures(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.indoorFeatures) {
    return [];
  }

  return Array.from(cache.indoorFeatures.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

export async function getAllOutdoorFeatures(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.outdoorFeatures) {
    return [];
  }

  return Array.from(cache.outdoorFeatures.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all price modifiers
 */
export async function getAllPriceModifiers(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.priceModifiers) {
    return [];
  }

  return Array.from(cache.priceModifiers.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all title deeds
 */
export async function getAllTitleDeeds(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.titleDeeds) {
    return [];
  }

  return Array.from(cache.titleDeeds.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

// =====================================================
// NEW: Land-specific taxonomy helpers
// =====================================================

/**
 * Find land type ID by name
 */
export async function findLandTypeByName(name: string): Promise<string | null> {
  const cache = await getCache();
  if (!cache.landTypes) {
    return null;
  }

  const searchName = name.toLowerCase().trim();

  const exactMatch = cache.landTypes.get(searchName);
  if (exactMatch) {
    return exactMatch;
  }

  // Partial match
  for (const [typeName, id] of cache.landTypes) {
    if (typeName.includes(searchName) || searchName.includes(typeName)) {
      return id;
    }
  }

  return null;
}

/**
 * Find infrastructure IDs by names (Electricity, Water, Road Access, etc.)
 */
export async function findInfrastructureIds(
  names: string[]
): Promise<string[]> {
  const cache = await getCache();
  if (!cache.infrastructure) {
    return [];
  }

  return names
    .map((name) => name.toLowerCase().trim())
    .map((name) => cache.infrastructure?.get(name))
    .filter((id): id is string => id !== undefined);
}

/**
 * Find property view IDs by names (Sea View, Mountain View, City View, etc.)
 */
export async function findPropertyViewIds(names: string[]): Promise<string[]> {
  const cache = await getCache();
  if (!cache.propertyViews) {
    return [];
  }

  return names
    .map((name) => name.toLowerCase().trim())
    .map((name) => cache.propertyViews?.get(name))
    .filter((id): id is string => id !== undefined);
}

/**
 * Find property status ID by name (Under Construction, Resale, Off Plan, etc.)
 */
export async function findPropertyStatusByName(
  name: string
): Promise<string | null> {
  const cache = await getCache();
  if (!cache.propertyStatus) {
    return null;
  }

  const searchName = name.toLowerCase().trim();

  const exactMatch = cache.propertyStatus.get(searchName);
  if (exactMatch) {
    return exactMatch;
  }

  // Partial match
  for (const [statusName, id] of cache.propertyStatus) {
    if (statusName.includes(searchName) || searchName.includes(statusName)) {
      return id;
    }
  }

  return null;
}

/**
 * Find listing type ID by name (For Sale, For Rent, Exchange, etc.)
 */
export async function findListingTypeByName(
  name: string
): Promise<string | null> {
  const cache = await getCache();
  if (!cache.listingTypes) {
    return null;
  }

  const searchName = name.toLowerCase().trim();

  const exactMatch = cache.listingTypes.get(searchName);
  if (exactMatch) {
    return exactMatch;
  }

  // Partial match
  for (const [typeName, id] of cache.listingTypes) {
    if (typeName.includes(searchName) || searchName.includes(typeName)) {
      return id;
    }
  }

  return null;
}

/**
 * Get all land types
 */
export async function getAllLandTypes(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.landTypes) {
    return [];
  }

  return Array.from(cache.landTypes.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all infrastructure options
 */
export async function getAllInfrastructure(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.infrastructure) {
    return [];
  }

  return Array.from(cache.infrastructure.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all property views
 */
export async function getAllPropertyViews(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.propertyViews) {
    return [];
  }

  return Array.from(cache.propertyViews.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all property status options
 */
export async function getAllPropertyStatus(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.propertyStatus) {
    return [];
  }

  return Array.from(cache.propertyStatus.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Get all listing types
 */
export async function getAllListingTypes(): Promise<
  Array<{ name: string; id: string }>
> {
  const cache = await getCache();
  if (!cache.listingTypes) {
    return [];
  }

  return Array.from(cache.listingTypes.entries()).map(([name, id]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id,
  }));
}

/**
 * Check if cache has data (even if stale)
 */
export function hasCacheData(): boolean {
  return globalCache.lastUpdated > 0;
}
