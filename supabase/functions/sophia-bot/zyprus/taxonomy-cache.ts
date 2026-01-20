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
  users: UserItem[];
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
 * Fetch locations from Zyprus API (node--location, NOT taxonomy_term)
 * CRITICAL: Locations are nodes, not taxonomy terms per Postman spec
 */
async function fetchLocations(
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> {
  const items: TaxonomyItem[] = [];
  let nextUrl = `${apiUrl}/jsonapi/node/location?page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`[Taxonomy] Failed to fetch locations: ${response.status}`);
      break;
    }

    const data = await response.json();

    for (const item of data.data || []) {
      items.push({
        id: item.id,
        name: item.attributes?.title || item.attributes?.name || "",
        parentId: item.relationships?.field_town?.data?.id,
      });
    }

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  console.log(`[Taxonomy] Loaded ${items.length} location nodes`);
  return items;
}

/**
 * Fetch users from Zyprus API for reviewer/owner assignment
 */
async function fetchUsers(
  token: string,
  apiUrl: string
): Promise<UserItem[]> {
  const items: UserItem[] = [];
  let nextUrl = `${apiUrl}/jsonapi/user/user?filter[status]=1&page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      console.error(`[Taxonomy] Failed to fetch users: ${response.status}`);
      break;
    }

    const data = await response.json();

    for (const item of data.data || []) {
      if (item.attributes?.mail) {
        items.push({
          id: item.id,
          email: item.attributes.mail.toLowerCase(),
          name: item.attributes.display_name || item.attributes.name || "",
        });
      }
    }

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  console.log(`[Taxonomy] Loaded ${items.length} users`);
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

      const [
        locations,
        propertyTypes,
        listingTypes,
        priceModifiers,
        titleDeeds,
        features,
        indoorFeatures,
        outdoorFeatures,
        users,
      ] = await Promise.all([
        fetchLocations(token, config.apiUrl), // CRITICAL: locations are nodes, not taxonomy
        fetchTaxonomy("property_type", token, config.apiUrl),
        fetchTaxonomy("listing_type", token, config.apiUrl),
        fetchTaxonomy("price_modifier", token, config.apiUrl),
        fetchTaxonomy("title_deed", token, config.apiUrl),
        fetchTaxonomy("property_features", token, config.apiUrl),
        fetchTaxonomy("indoor_property_views", token, config.apiUrl), // Note: uses "views" not "features"
        fetchTaxonomy("outdoor_property_features", token, config.apiUrl),
        fetchUsers(token, config.apiUrl),
      ]);

      cache = {
        locations,
        propertyTypes,
        listingTypes,
        priceModifiers,
        titleDeeds,
        features,
        indoorFeatures,
        outdoorFeatures,
        users,
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
 * MANDATORY field - always returns a valid UUID
 * Default UUID from test: 7dbc931e-90eb-4b89-9ac8-b5e593831cf8 (Acropolis, Strovolos)
 */
export async function findLocationUuid(locationName: string): Promise<string> {
  // HARDCODED FALLBACK - Acropolis, Strovolos (known working UUID)
  const DEFAULT_LOCATION_UUID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";

  try {
    const taxonomy = await loadTaxonomy();
    const normalized = locationName.toLowerCase().trim();

    // Try exact match first
    const exact = taxonomy.locations.find(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exact) {
      return exact.id;
    }

    // Try partial match on words
    const words = normalized.split(/[\s,]+/).filter(w => w.length > 2);
    for (const word of words) {
      const match = taxonomy.locations.find(
        (loc) => loc.name.toLowerCase().includes(word)
      );
      if (match) {
        console.log(`[Taxonomy] Partial match for "${locationName}": ${match.name}`);
        return match.id;
      }
    }

    // Fallback: return first location if available
    if (taxonomy.locations.length > 0) {
      console.log(`[Taxonomy] Using first available location: ${taxonomy.locations[0].name}`);
      return taxonomy.locations[0].id;
    }
  } catch (error) {
    console.error(`[Taxonomy] Error finding location:`, error);
  }

  // Ultimate fallback: use known working UUID
  console.log(`[Taxonomy] Using hardcoded default location UUID for: ${locationName}`);
  return DEFAULT_LOCATION_UUID;
}

/**
 * Find property type UUID by name
 * Now includes a hardcoded fallback for common types if API lookup fails
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string> {
  // HARDCODED FALLBACK UUIDs for common property types (from dev9.zyprus.com)
  const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {
    apartment: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
    villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
    house: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    "detached house": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    "semi-detached": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    studio: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    penthouse: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    bungalow: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    maisonette: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    townhouse: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
  };
  const DEFAULT_PROPERTY_TYPE_UUID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"; // Apartment

  const normalized = typeName.toLowerCase().trim();

  try {
    const taxonomy = await loadTaxonomy();

    // Common aliases
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

    // Fallback: return first property type if available
    if (taxonomy.propertyTypes.length > 0) {
      console.log(`[Taxonomy] Using first available property type: ${taxonomy.propertyTypes[0].name}`);
      return taxonomy.propertyTypes[0].id;
    }
  } catch (error) {
    console.error(`[Taxonomy] Error finding property type:`, error);
  }

  // Ultimate fallback: use hardcoded UUID based on type name
  const fallbackUuid = PROPERTY_TYPE_FALLBACKS[normalized] || DEFAULT_PROPERTY_TYPE_UUID;
  console.log(`[Taxonomy] Using hardcoded fallback property type UUID for: ${typeName}`);
  return fallbackUuid;
}

/**
 * Find listing type UUID (sale/rent)
 * Default UUID from API spec (For Sale): 8f187816-a888-4cda-a937-1cee84b9c0ee
 */
export async function findListingTypeUuid(type: "sale" | "rent"): Promise<string> {
  // HARDCODED FALLBACK from Zyprus API spec (For Sale)
  const DEFAULT_LISTING_TYPE_UUID = "8f187816-a888-4cda-a937-1cee84b9c0ee";

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
      console.log(`[Taxonomy] Using first available listing type: ${taxonomy.listingTypes[0].name}`);
      return taxonomy.listingTypes[0].id;
    }
  } catch (error) {
    console.error(`[Taxonomy] Error finding listing type:`, error);
  }

  // Ultimate fallback: use documented default UUID
  console.log(`[Taxonomy] Using hardcoded default listing type UUID`);
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
 * Production: "Plus VAT", "No VAT", "VAT Included"
 * Dev API: ['Price', 'Guide Price', 'Offers in region of', 'Offers over', 'Negotiable']
 * Default UUID from API spec: ab39af2d-c8f5-4971-9fa5-2df6822ab9a9
 */
export async function findPriceModifierUuid(modifier?: string): Promise<string> {
  // HARDCODED FALLBACK from Zyprus API spec
  const DEFAULT_PRICE_MODIFIER_UUID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";

  try {
    const taxonomy = await loadTaxonomy();

    // Search terms for different environments
    const searchTerms = modifier
      ? [modifier.toLowerCase()]
      : ["no vat", "price", "negotiable", "vat included"];

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
      console.log(`[Taxonomy] Using first available price modifier: ${taxonomy.priceModifiers[0].name}`);
      return taxonomy.priceModifiers[0].id;
    }
  } catch (error) {
    console.error(`[Taxonomy] Error finding price modifier:`, error);
  }

  // Ultimate fallback: use documented default UUID
  console.log(`[Taxonomy] Using hardcoded default price modifier UUID`);
  return DEFAULT_PRICE_MODIFIER_UUID;
}

/**
 * Find title deed UUID
 * Production: "Title Deed", "Final Approval", "Share of Land"
 * Dev API: ['Available', 'Not Available', 'On Application', 'Not Display']
 * Default UUID from API spec: 5c553db1-e53d-46a2-b609-093d17e75a7a
 */
export async function findTitleDeedUuid(status?: string): Promise<string> {
  // HARDCODED FALLBACK from Zyprus API spec
  const DEFAULT_TITLE_DEED_UUID = "5c553db1-e53d-46a2-b609-093d17e75a7a";

  try {
    const taxonomy = await loadTaxonomy();

    // Map common user inputs to actual Zyprus terms (both prod and dev)
    const statusMappings: Record<string, string[]> = {
      "available": ["available", "yes", "title deed", "full ownership", "has title"],
      "title deed": ["title deed", "full ownership", "has title", "available"],
      "not available": ["not available", "no", "pending", "no title", "without title"],
      "on application": ["on application", "applied", "in progress", "final approval"],
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
      console.log(`[Taxonomy] Using first available title deed: ${taxonomy.titleDeeds[0].name}`);
      return taxonomy.titleDeeds[0].id;
    }
  } catch (error) {
    console.error(`[Taxonomy] Error finding title deed:`, error);
  }

  // Ultimate fallback: use documented default UUID
  console.log(`[Taxonomy] Using hardcoded default title deed UUID`);
  return DEFAULT_TITLE_DEED_UUID;
}

/**
 * SOPHIA AI user UUID - used as fallback when user lookup fails
 */
const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";

/**
 * Hardcoded fallback UUIDs for known Zyprus staff
 * Used when API user lookup fails (API doesn't expose mail attribute on dev9)
 * UUIDs retrieved by matching usernames to display_name/name attributes
 */
const USER_FALLBACKS: Record<string, string> = {
  // Found by username match in dev9.zyprus.com user list
  "listings@zyprus.com": "0caa9a75-362a-4156-b11b-b52839243b74", // Lauren (username: listings)
  "michelle@zyprus.com": "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4", // Michelle
  "demetra@zyprus.com": "b72a0f7c-62d8-4f69-89f3-aaebee31676a", // Demetra
  "azinas@zyprus.com": "c8e05e2a-56e6-4d1f-9a20-31235feaec54", // Azinas

  // Regional request accounts - not found in dev9, using SOPHIA_AI_UUID
  "requestpaphos@zyprus.com": SOPHIA_AI_UUID,
  "requestlimassol@zyprus.com": SOPHIA_AI_UUID,
  "requestlarnaca@zyprus.com": SOPHIA_AI_UUID,
  "requestnicosia@zyprus.com": SOPHIA_AI_UUID,
  "requestfamagusta@zyprus.com": SOPHIA_AI_UUID,

  // Management
  "charalambos@zyprus.com": "71ac4784-238f-45b2-ac15-5f74200601ce", // Charalambos Emiliou
};

/**
 * Find user UUID by email address
 * Used for field_ai_listing_instructor and field_ai_listing_reviewer
 */
export async function findUserUuid(email: string): Promise<string> {
  if (!email) {
    console.log("[Taxonomy] No email provided, using SOPHIA_AI_UUID");
    return SOPHIA_AI_UUID;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const taxonomy = await loadTaxonomy();

    // Search for user by email
    const user = taxonomy.users.find(u => u.email === normalizedEmail);
    if (user) {
      console.log(`[Taxonomy] Found user UUID for ${normalizedEmail}: ${user.id}`);
      return user.id;
    }

    console.log(`[Taxonomy] User not found for ${normalizedEmail}, checking fallbacks`);
  } catch (error) {
    console.error(`[Taxonomy] Error finding user:`, error);
  }

  // Check hardcoded fallbacks
  const fallback = USER_FALLBACKS[normalizedEmail];
  if (fallback) {
    console.log(`[Taxonomy] Using hardcoded fallback for ${normalizedEmail}`);
    return fallback;
  }

  // Ultimate fallback: use SOPHIA_AI_UUID
  console.log(`[Taxonomy] Using SOPHIA_AI_UUID fallback for ${normalizedEmail}`);
  return SOPHIA_AI_UUID;
}

/**
 * Find multiple user UUIDs for reviewers
 */
export async function findUserUuids(emails: string[]): Promise<string[]> {
  const uuids: string[] = [];
  for (const email of emails) {
    if (email) {
      const uuid = await findUserUuid(email);
      if (!uuids.includes(uuid)) {
        uuids.push(uuid);
      }
    }
  }
  return uuids;
}

/**
 * Categorize features into indoor vs outdoor
 */
const INDOOR_FEATURE_KEYWORDS = [
  "air conditioning", "a/c", "ac", "central heating", "heating",
  "fireplace", "elevator", "lift", "storage", "fitted wardrobes",
  "double glazing", "alarm", "intercom", "underfloor", "jacuzzi",
  "sauna", "gym", "wine cellar", "office", "maid room", "laundry"
];

const OUTDOOR_FEATURE_KEYWORDS = [
  "pool", "swimming", "garden", "parking", "garage", "carport",
  "covered parking", "uncovered parking", "private parking",
  "bbq", "barbecue", "terrace", "balcony", "veranda", "patio",
  "gated", "security", "sea view", "mountain view", "city view",
  "solar", "photovoltaic", "well", "borehole", "irrigation"
];

/**
 * Find indoor feature UUIDs from feature names
 */
export async function findIndoorFeatureUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();

    // Check if it's likely an indoor feature
    const isIndoor = INDOOR_FEATURE_KEYWORDS.some(kw => normalized.includes(kw));
    if (!isIndoor) continue;

    // Search in indoor features
    const match = taxonomy.indoorFeatures.find(
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
 * Find outdoor feature UUIDs from feature names
 */
export async function findOutdoorFeatureUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();

    // Check if it's likely an outdoor feature
    const isOutdoor = OUTDOOR_FEATURE_KEYWORDS.some(kw => normalized.includes(kw));
    if (!isOutdoor) continue;

    // Search in outdoor features
    const match = taxonomy.outdoorFeatures.find(
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
 * Find view UUIDs from feature names (sea view, mountain view, etc.)
 */
export async function findPropertyViewUuids(featureNames: string[]): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  const viewKeywords = ["view", "sea", "mountain", "city", "garden", "pool", "panoramic"];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();

    // Check if it's likely a view feature
    const isView = viewKeywords.some(kw => normalized.includes(kw));
    if (!isView) continue;

    // Search in outdoor features (views are usually outdoor)
    const match = taxonomy.outdoorFeatures.find(
      (f) =>
        f.name.toLowerCase().includes("view") &&
        (f.name.toLowerCase() === normalized ||
         f.name.toLowerCase().includes(normalized) ||
         normalized.includes(f.name.toLowerCase()))
    );

    if (match && !uuids.includes(match.id)) {
      uuids.push(match.id);
    }
  }

  return uuids;
}

