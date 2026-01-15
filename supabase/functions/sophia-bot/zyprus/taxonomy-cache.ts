/**
 * Taxonomy Cache for Zyprus API
 * Caches location, property type, and feature UUIDs
 */

import { getAccessToken, getZyprusConfig } from "./client.ts";

export interface TaxonomyItem {
  id: string;
  name: string;
  parentId?: string;
}

export interface TaxonomyCache {
  locations: TaxonomyItem[];
  propertyTypes: TaxonomyItem[];
  listingTypes: TaxonomyItem[];
  features: TaxonomyItem[];
  indoorFeatures: TaxonomyItem[];
  outdoorFeatures: TaxonomyItem[];
  lastUpdated: number;
}

// In-memory cache
let cache: TaxonomyCache | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// P2 PERFORMANCE: Singleton promise to prevent cache stampede
let taxonomyLoadPromise: Promise<TaxonomyCache> | null = null;

/**
 * Fetch taxonomy terms from Zyprus API
 */
async function fetchTaxonomy(
  vocabularyName: string,
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> {
  const items: TaxonomyItem[] = [];
  let nextUrl = `${apiUrl}/jsonapi/taxonomy_term/${vocabularyName}?page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`[Taxonomy] Failed to fetch ${vocabularyName}: ${response.status}`);
      break;
    }

    const data = await response.json();

    for (const item of data.data || []) {
      items.push({
        id: item.id,
        name: item.attributes?.name || item.attributes?.title || "",
        parentId: item.relationships?.parent?.data?.[0]?.id,
      });
    }

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  console.log(`[Taxonomy] Loaded ${items.length} ${vocabularyName} terms`);
  return items;
}

/**
 * Load all taxonomy data with stampede protection
 */
export async function loadTaxonomy(): Promise<TaxonomyCache> {
  // Return cache if valid
  if (cache && Date.now() - cache.lastUpdated < CACHE_TTL) {
    return cache;
  }

  // P2 PERFORMANCE: Prevent cache stampede - only one concurrent fetch
  if (taxonomyLoadPromise) {
    console.log("[Taxonomy] Waiting for existing load operation...");
    return taxonomyLoadPromise;
  }

  console.log("[Taxonomy] Loading taxonomy data...");

  // Create singleton promise for this load operation
  taxonomyLoadPromise = (async () => {
    try {
      const config = getZyprusConfig();
      const token = await getAccessToken(config);

      const [locations, propertyTypes, listingTypes, features, indoorFeatures, outdoorFeatures] =
        await Promise.all([
          fetchTaxonomy("location", token, config.apiUrl),
          fetchTaxonomy("property_type", token, config.apiUrl),
          fetchTaxonomy("listing_type", token, config.apiUrl),
          fetchTaxonomy("property_features", token, config.apiUrl),
          fetchTaxonomy("indoor_property_views", token, config.apiUrl), // Note: uses "views" not "features"
          fetchTaxonomy("outdoor_property_features", token, config.apiUrl),
        ]);

      cache = {
        locations,
        propertyTypes,
        listingTypes,
        features,
        indoorFeatures,
        outdoorFeatures,
        lastUpdated: Date.now(),
      };

      console.log("[Taxonomy] Taxonomy loaded successfully");
      return cache;
    } finally {
      // Clear the singleton promise after load completes (success or failure)
      taxonomyLoadPromise = null;
    }
  })();

  return taxonomyLoadPromise;
}

/**
 * Find location UUID by name
 */
export async function findLocationUuid(locationName: string): Promise<string | null> {
  const taxonomy = await loadTaxonomy();
  const normalized = locationName.toLowerCase().trim();

  // Try exact match first
  const exact = taxonomy.locations.find(
    (loc) => loc.name.toLowerCase() === normalized
  );
  if (exact) {
    return exact.id;
  }

  // Try partial match
  const partial = taxonomy.locations.find(
    (loc) =>
      loc.name.toLowerCase().includes(normalized) ||
      normalized.includes(loc.name.toLowerCase())
  );
  if (partial) {
    return partial.id;
  }

  console.log(`[Taxonomy] Location not found: ${locationName}`);
  return null;
}

/**
 * Find property type UUID by name
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string | null> {
  const taxonomy = await loadTaxonomy();
  const normalized = typeName.toLowerCase().trim();

  // Common aliases
  const aliases: Record<string, string[]> = {
    apartment: ["flat", "apt"],
    villa: ["detached", "detached house"],
    house: ["home", "townhouse"],
    maisonette: ["maisonette", "split-level"],
    bungalow: ["single-story", "single storey"],
    penthouse: ["penthouse apartment"],
  };

  // Try exact match
  const exact = taxonomy.propertyTypes.find(
    (pt) => pt.name.toLowerCase() === normalized
  );
  if (exact) {
    return exact.id;
  }

  // Try aliases
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (aliasList.includes(normalized) || normalized === canonical) {
      const match = taxonomy.propertyTypes.find(
        (pt) => pt.name.toLowerCase() === canonical
      );
      if (match) {
        return match.id;
      }
    }
  }

  // Try partial match
  const partial = taxonomy.propertyTypes.find(
    (pt) =>
      pt.name.toLowerCase().includes(normalized) ||
      normalized.includes(pt.name.toLowerCase())
  );
  if (partial) {
    return partial.id;
  }

  console.log(`[Taxonomy] Property type not found: ${typeName}`);
  return null;
}

/**
 * Find listing type UUID (sale/rent)
 */
export async function findListingTypeUuid(type: "sale" | "rent"): Promise<string | null> {
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

  console.log(`[Taxonomy] Listing type not found: ${type}`);
  return null;
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

