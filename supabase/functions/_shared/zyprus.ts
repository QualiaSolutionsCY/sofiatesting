/**
 * Zyprus API Client & Taxonomy Cache
 *
 * Unified module for all Zyprus API operations:
 * - OAuth2 authentication
 * - Property listing creation
 * - Taxonomy caching (locations, property types, features)
 * - UUID resolution for all reference fields
 */

import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

// =============================================================================
// TYPES
// =============================================================================

export interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface ListingData {
  listingType: "sale" | "rent";
  propertyType: string;
  price: number;
  location: string;
  locationUuid?: string;
  bedrooms: number;
  bathrooms: number;
  coveredArea: number;
  plotSize?: number;
  description: string;
  myNotes: string;
  aiNotes?: string;
  images: string[];
  reviewer1: string;
  reviewer2?: string | null;
  listingOwner: string;
  listingInstructor: string;
  features?: string[];
  titleDeedStatus?: string;
  coordinates?: { lat: number; lon: number };
  yearBuilt?: number;
  floor?: string;
  potentialDuplicate?: boolean;
  aiMessage?: string | null;
}

export interface CreateResult {
  listingId: string;
  listingUrl: string;
}

export interface ZyprusConfig {
  apiUrl: string;
  siteUrl: string;
  clientId: string;
  clientSecret: string;
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
  users: UserItem[];
  lastUpdated: number;
}

// =============================================================================
// CONSTANTS & FALLBACKS
// =============================================================================

/** SOPHIA AI user UUID - used as fallback when user lookup fails */
const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";

/** Hardcoded fallback UUIDs for known Zyprus staff */
const USER_FALLBACKS: Record<string, string> = {
  "listings@zyprus.com": "0caa9a75-362a-4156-b11b-b52839243b74",
  "michelle@zyprus.com": "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4",
  "demetra@zyprus.com": "b72a0f7c-62d8-4f69-89f3-aaebee31676a",
  "azinas@zyprus.com": "c8e05e2a-56e6-4d1f-9a20-31235feaec54",
  "requestpaphos@zyprus.com": SOPHIA_AI_UUID,
  "requestlimassol@zyprus.com": SOPHIA_AI_UUID,
  "requestlarnaca@zyprus.com": SOPHIA_AI_UUID,
  "requestnicosia@zyprus.com": SOPHIA_AI_UUID,
  "requestfamagusta@zyprus.com": SOPHIA_AI_UUID,
  "charalambos@zyprus.com": "71ac4784-238f-45b2-ac15-5f74200601ce",
};

/** Property type fallbacks */
const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {
  apartment: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  house: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  "detached house": "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  "semi-detached": "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  studio: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  penthouse: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  bungalow: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
  maisonette: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
  townhouse: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
};

const DEFAULT_LOCATION_UUID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";
const DEFAULT_PROPERTY_TYPE_UUID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44";
const DEFAULT_LISTING_TYPE_UUID = "8f187816-a888-4cda-a937-1cee84b9c0ee";
const DEFAULT_PRICE_MODIFIER_UUID = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9";
const DEFAULT_TITLE_DEED_UUID = "5c553db1-e53d-46a2-b609-093d17e75a7a";

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

// =============================================================================
// CACHES
// =============================================================================

let cachedToken: TokenCache | null = null;
let cache: TaxonomyCache | null = null;
let taxonomyLoadPromise: Promise<TaxonomyCache> | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// =============================================================================
// CONFIG
// =============================================================================

export const getZyprusConfig = (): ZyprusConfig => {
  const apiUrl = Deno.env.get("ZYPRUS_API_URL");
  const siteUrl = Deno.env.get("ZYPRUS_SITE_URL") || "https://zyprus.com";
  const clientId = Deno.env.get("ZYPRUS_CLIENT_ID");
  const clientSecret = Deno.env.get("ZYPRUS_CLIENT_SECRET");

  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error("Zyprus API credentials not configured");
  }

  return { apiUrl, siteUrl, clientId, clientSecret };
};

// =============================================================================
// AUTHENTICATION
// =============================================================================

export const getAccessToken = async (config: ZyprusConfig): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  logger.info("[Zyprus] Fetching new access token...", { category: LogCategory.ZYPRUS });

  const response = await fetch(`${config.apiUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "SophiaAI",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[Zyprus] Token error", new Error(errorText), { category: LogCategory.ZYPRUS, statusCode: response.status });
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info("[Zyprus] Access token obtained successfully", { category: LogCategory.ZYPRUS });
  return data.access_token;
};

// =============================================================================
// TAXONOMY FETCHING
// =============================================================================

const fetchTaxonomy = async (
  vocabularyName: string,
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> => {
  const items: TaxonomyItem[] = [];
  let nextUrl: string | null = `${apiUrl}/jsonapi/taxonomy_term/${vocabularyName}?page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      logger.error(`[Taxonomy] Failed to fetch ${vocabularyName}: ${response.status}`, undefined, { category: LogCategory.ZYPRUS });
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

    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} ${vocabularyName} terms`, { category: LogCategory.CACHE });
  return items;
};

const fetchLocations = async (
  token: string,
  apiUrl: string
): Promise<TaxonomyItem[]> => {
  const items: TaxonomyItem[] = [];
  let nextUrl: string | null = `${apiUrl}/jsonapi/node/location?page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      logger.error(`[Taxonomy] Failed to fetch locations: ${response.status}`, undefined, { category: LogCategory.ZYPRUS });
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

    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} location nodes`, { category: LogCategory.CACHE });
  return items;
};

const fetchUsers = async (
  token: string,
  apiUrl: string
): Promise<UserItem[]> => {
  const items: UserItem[] = [];
  let nextUrl: string | null = `${apiUrl}/jsonapi/user/user?filter[status]=1&page[limit]=50`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "User-Agent": "SophiaAI",
      },
    });

    if (!response.ok) {
      logger.error(`[Taxonomy] Failed to fetch users: ${response.status}`, undefined, { category: LogCategory.ZYPRUS });
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

    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} users`, { category: LogCategory.CACHE });
  return items;
};

export const loadTaxonomy = async (): Promise<TaxonomyCache> => {
  if (cache && Date.now() - cache.lastUpdated < CACHE_TTL) {
    return cache;
  }

  if (taxonomyLoadPromise) {
    logger.debug("[Taxonomy] Waiting for existing load operation...", { category: LogCategory.CACHE });
    return taxonomyLoadPromise;
  }

  logger.info("[Taxonomy] Loading taxonomy data...", { category: LogCategory.CACHE });

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
        fetchLocations(token, config.apiUrl),
        fetchTaxonomy("property_type", token, config.apiUrl),
        fetchTaxonomy("listing_type", token, config.apiUrl),
        fetchTaxonomy("price_modifier", token, config.apiUrl),
        fetchTaxonomy("title_deed", token, config.apiUrl),
        fetchTaxonomy("property_features", token, config.apiUrl),
        fetchTaxonomy("indoor_property_views", token, config.apiUrl),
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

      logger.info("[Taxonomy] Taxonomy loaded successfully", { category: LogCategory.CACHE });
      return cache;
    } finally {
      taxonomyLoadPromise = null;
    }
  })();

  return taxonomyLoadPromise;
};

// =============================================================================
// UUID FINDERS
// =============================================================================

export const findLocationUuid = async (locationName: string): Promise<string> => {
  try {
    const taxonomy = await loadTaxonomy();
    const normalized = locationName.toLowerCase().trim();

    const exact = taxonomy.locations.find(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exact) return exact.id;

    const words = normalized.split(/[\s,]+/).filter(w => w.length > 2);
    for (const word of words) {
      const match = taxonomy.locations.find(
        (loc) => loc.name.toLowerCase().includes(word)
      );
      if (match) {
        logger.debug(`[Taxonomy] Partial match for "${locationName}": ${match.name}`, { category: LogCategory.ZYPRUS });
        return match.id;
      }
    }

    if (taxonomy.locations.length > 0) {
      logger.debug(`[Taxonomy] Using first available location: ${taxonomy.locations[0].name}`, { category: LogCategory.ZYPRUS });
      return taxonomy.locations[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding location", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  logger.debug(`[Taxonomy] Using hardcoded default location UUID for: ${locationName}`, { category: LogCategory.ZYPRUS });
  return DEFAULT_LOCATION_UUID;
};

export const findPropertyTypeUuid = async (typeName: string): Promise<string> => {
  const normalized = typeName.toLowerCase().trim();

  try {
    const taxonomy = await loadTaxonomy();

    const aliases: Record<string, string[]> = {
      apartment: ["flat", "apt"],
      villa: ["detached", "detached house", "standalone house", "independent house"],
      house: ["home", "detached house"],
      maisonette: ["maisonette", "split-level"],
      bungalow: ["single-story", "single storey"],
      penthouse: ["penthouse apartment"],
      townhouse: ["town house", "terraced house", "semi-detached"],
    };

    const exact = taxonomy.propertyTypes.find(
      (pt) => pt.name.toLowerCase() === normalized
    );
    if (exact) return exact.id;

    for (const [canonical, aliasList] of Object.entries(aliases)) {
      if (aliasList.includes(normalized) || normalized === canonical) {
        const match = taxonomy.propertyTypes.find(
          (pt) => pt.name.toLowerCase() === canonical
        );
        if (match) return match.id;
      }
    }

    const partial = taxonomy.propertyTypes.find(
      (pt) =>
        pt.name.toLowerCase().includes(normalized) ||
        normalized.includes(pt.name.toLowerCase())
    );
    if (partial) return partial.id;

    if (taxonomy.propertyTypes.length > 0) {
      logger.debug(`[Taxonomy] Using first available property type: ${taxonomy.propertyTypes[0].name}`, { category: LogCategory.ZYPRUS });
      return taxonomy.propertyTypes[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding property type", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  const fallbackUuid = PROPERTY_TYPE_FALLBACKS[normalized] || DEFAULT_PROPERTY_TYPE_UUID;
  logger.debug(`[Taxonomy] Using hardcoded fallback property type UUID for: ${typeName}`, { category: LogCategory.ZYPRUS });
  return fallbackUuid;
};

export const findListingTypeUuid = async (type: "sale" | "rent"): Promise<string> => {
  try {
    const taxonomy = await loadTaxonomy();

    const searchTerms = type === "sale" ? ["sale", "for sale", "buy"] : ["rent", "for rent", "rental"];

    for (const term of searchTerms) {
      const match = taxonomy.listingTypes.find(
        (lt) => lt.name.toLowerCase().includes(term)
      );
      if (match) return match.id;
    }

    if (taxonomy.listingTypes.length > 0) {
      logger.debug(`[Taxonomy] Using first available listing type: ${taxonomy.listingTypes[0].name}`, { category: LogCategory.ZYPRUS });
      return taxonomy.listingTypes[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding listing type", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  logger.debug("[Taxonomy] Using hardcoded default listing type UUID", { category: LogCategory.ZYPRUS });
  return DEFAULT_LISTING_TYPE_UUID;
};

export const findPriceModifierUuid = async (modifier?: string): Promise<string> => {
  try {
    const taxonomy = await loadTaxonomy();

    const searchTerms = modifier
      ? [modifier.toLowerCase()]
      : ["no vat", "price", "negotiable", "vat included"];

    for (const term of searchTerms) {
      const match = taxonomy.priceModifiers.find(
        (pm) => pm.name.toLowerCase() === term || pm.name.toLowerCase().includes(term)
      );
      if (match) return match.id;
    }

    if (taxonomy.priceModifiers.length > 0) {
      logger.debug(`[Taxonomy] Using first available price modifier: ${taxonomy.priceModifiers[0].name}`, { category: LogCategory.ZYPRUS });
      return taxonomy.priceModifiers[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding price modifier", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  logger.debug("[Taxonomy] Using hardcoded default price modifier UUID", { category: LogCategory.ZYPRUS });
  return DEFAULT_PRICE_MODIFIER_UUID;
};

export const findTitleDeedUuid = async (status?: string): Promise<string> => {
  try {
    const taxonomy = await loadTaxonomy();

    const statusMappings: Record<string, string[]> = {
      "available": ["available", "yes", "title deed", "full ownership", "has title"],
      "title deed": ["title deed", "full ownership", "has title", "available"],
      "not available": ["not available", "no", "pending", "no title", "without title"],
      "on application": ["on application", "applied", "in progress", "final approval"],
      "share of land": ["share of land", "shared", "fractional"],
    };

    let searchTerms: string[] = ["title deed", "available"];

    if (status) {
      const normalizedStatus = status.toLowerCase().trim();
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
      if (match) return match.id;
    }

    if (taxonomy.titleDeeds.length > 0) {
      logger.debug(`[Taxonomy] Using first available title deed: ${taxonomy.titleDeeds[0].name}`, { category: LogCategory.ZYPRUS });
      return taxonomy.titleDeeds[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding title deed", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  logger.debug("[Taxonomy] Using hardcoded default title deed UUID", { category: LogCategory.ZYPRUS });
  return DEFAULT_TITLE_DEED_UUID;
};

export const findUserUuid = async (email: string): Promise<string> => {
  if (!email) {
    logger.debug("[Taxonomy] No email provided, using SOPHIA_AI_UUID", { category: LogCategory.ZYPRUS });
    return SOPHIA_AI_UUID;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const taxonomy = await loadTaxonomy();
    const user = taxonomy.users.find(u => u.email === normalizedEmail);
    if (user) {
      logger.debug(`[Taxonomy] Found user UUID for ${normalizedEmail}: ${user.id}`, { category: LogCategory.ZYPRUS });
      return user.id;
    }
    logger.debug(`[Taxonomy] User not found for ${normalizedEmail}, checking fallbacks`, { category: LogCategory.ZYPRUS });
  } catch (error) {
    logger.error("[Taxonomy] Error finding user", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  const fallback = USER_FALLBACKS[normalizedEmail];
  if (fallback) {
    logger.debug(`[Taxonomy] Using hardcoded fallback for ${normalizedEmail}`, { category: LogCategory.ZYPRUS });
    return fallback;
  }

  logger.debug(`[Taxonomy] Using SOPHIA_AI_UUID fallback for ${normalizedEmail}`, { category: LogCategory.ZYPRUS });
  return SOPHIA_AI_UUID;
};

export const findUserUuids = async (emails: string[]): Promise<string[]> => {
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
};

export const findIndoorFeatureUuids = async (featureNames: string[]): Promise<string[]> => {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();
    const isIndoor = INDOOR_FEATURE_KEYWORDS.some(kw => normalized.includes(kw));
    if (!isIndoor) continue;

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
};

export const findOutdoorFeatureUuids = async (featureNames: string[]): Promise<string[]> => {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();
    const isOutdoor = OUTDOOR_FEATURE_KEYWORDS.some(kw => normalized.includes(kw));
    if (!isOutdoor) continue;

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
};

export const findPropertyViewUuids = async (featureNames: string[]): Promise<string[]> => {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];
  const viewKeywords = ["view", "sea", "mountain", "city", "garden", "pool", "panoramic"];

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();
    const isView = viewKeywords.some(kw => normalized.includes(kw));
    if (!isView) continue;

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
};

export const findFeatureUuids = async (featureNames: string[]): Promise<string[]> => {
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
};

export const getLocationsByRegion = async (region: string): Promise<TaxonomyItem[]> => {
  const taxonomy = await loadTaxonomy();

  const regionParents: Record<string, string[]> = {
    paphos: ["paphos", "pafos"],
    limassol: ["limassol", "lemesos"],
    larnaca: ["larnaca", "larnaka"],
    nicosia: ["nicosia", "lefkosia"],
    famagusta: ["famagusta", "ammochostos"],
  };

  const parentTerms = regionParents[region.toLowerCase()] || [];

  const parentIds = taxonomy.locations
    .filter((loc) =>
      parentTerms.some((term) => loc.name.toLowerCase().includes(term))
    )
    .map((loc) => loc.id);

  return taxonomy.locations.filter(
    (loc) => loc.parentId && parentIds.includes(loc.parentId)
  );
};

// =============================================================================
// HELPERS
// =============================================================================

const addPrivacyOffset = (coords: { lat: number; lon: number }): { lat: number; lon: number } => {
  const offset = 0.002;
  return {
    lat: coords.lat + (Math.random() - 0.5) * offset,
    lon: coords.lon + (Math.random() - 0.5) * offset,
  };
};

const generateDraftReferenceId = (propertyType: string): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const typeCode = propertyType.substring(0, 3).toUpperCase();
  return `SOPHIA-${date}-${time}-${typeCode}`;
};

// =============================================================================
// LISTING CREATION
// =============================================================================

const buildJsonApiPayload = (
  listing: ListingData,
  imageFileIds: string[],
  listingTypeUuid: string,
  propertyTypeUuid: string,
  priceModifierUuid: string,
  titleDeedUuid: string,
  instructorUuid: string,
  reviewerUuids: string[],
  listingOwnerUuid: string,
  indoorFeatureUuids: string[],
  outdoorFeatureUuids: string[],
  viewUuids: string[]
): Record<string, unknown> => {
  const draftReferenceId = generateDraftReferenceId(listing.propertyType);

  const attributes: Record<string, unknown> = {
    title: `${listing.bedrooms} Bed ${listing.propertyType} in ${listing.location}`,
    status: false,
    field_price: listing.price,
    field_no_bedrooms: listing.bedrooms,
    field_no_bathrooms: listing.bathrooms,
    field_covered_area: listing.coveredArea,
    body: {
      value: listing.description,
      format: "plain_text",
    },
    field_my_notes: listing.myNotes,
    // NOTE: field_ai_assistant_notes does NOT exist on live API (verified Feb 2026)
    // aiNotes content is merged into field_ai_message instead
    field_ai_generated: true,
    field_ai_state: "draft",
    field_negotiable: true,
    field_ai_draft_own_reference_id: draftReferenceId,
  };

  if (listing.plotSize) {
    attributes.field_land_size = listing.plotSize;
  }
  if (listing.yearBuilt) {
    attributes.field_year_built = listing.yearBuilt;
  }
  if (listing.floor) {
    attributes.field_floor = listing.floor;
  }
  if (listing.potentialDuplicate) {
    attributes.field_potential_duplicate = true;
  }
  // Merge aiNotes into aiMessage since field_ai_assistant_notes doesn't exist on live API
  const aiMessageParts = [listing.aiMessage, listing.aiNotes].filter(Boolean);
  if (aiMessageParts.length > 0) {
    attributes.field_ai_message = aiMessageParts.join("\n\n");
  }

  if (listing.coordinates) {
    const offsetCoords = addPrivacyOffset(listing.coordinates);
    attributes.field_map = {
      value: `POINT (${offsetCoords.lon} ${offsetCoords.lat})`,
      geo_type: "Point",
      lat: offsetCoords.lat,
      lon: offsetCoords.lon,
      latlon: `${offsetCoords.lat},${offsetCoords.lon}`,
    };
  }

  const relationships: Record<string, unknown> = {};

  relationships.field_listing_type = {
    data: { type: "taxonomy_term--listing_type", id: listingTypeUuid },
  };

  relationships.field_property_type = {
    data: { type: "taxonomy_term--property_type", id: propertyTypeUuid },
  };

  relationships.field_price_modifier = {
    data: { type: "taxonomy_term--price_modifier", id: priceModifierUuid },
  };

  relationships.field_title_deed = {
    data: { type: "taxonomy_term--title_deed", id: titleDeedUuid },
  };

  relationships.field_location = {
    data: { type: "node--location", id: listing.locationUuid || DEFAULT_LOCATION_UUID },
  };

  if (imageFileIds.length > 0) {
    relationships.field_gallery_ = {
      data: imageFileIds.map((id) => ({
        type: "file--file",
        id,
      })),
    };
  }

  if (indoorFeatureUuids.length > 0) {
    relationships.field_indoor_property_features = {
      data: indoorFeatureUuids.map((id) => ({
        type: "taxonomy_term--indoor_property_views",
        id,
      })),
    };
  }

  if (outdoorFeatureUuids.length > 0) {
    relationships.field_outdoor_property_features = {
      data: outdoorFeatureUuids.map((id) => ({
        type: "taxonomy_term--outdoor_property_features",
        id,
      })),
    };
  }

  relationships.field_ai_listing_instructor = {
    data: { type: "user--user", id: instructorUuid },
  };

  if (reviewerUuids.length > 0) {
    relationships.field_ai_listing_reviewer = {
      data: reviewerUuids.map((id) => ({ type: "user--user", id })),
    };
  }

  // NOTE: field_listing_owner does NOT exist on live API (verified Feb 2026)
  // The `uid` field (set by API based on OAuth token) determines the listing author/owner

  if (viewUuids.length > 0) {
    relationships.field_property_views = {
      data: viewUuids.map((id) => ({
        type: "taxonomy_term--property_views",
        id,
      })),
    };
  }

  return {
    data: {
      type: "node--property",
      attributes,
      relationships,
    },
  };
};

const uploadSingleImage = async (
  url: string,
  index: number,
  token: string,
  config: ZyprusConfig
): Promise<string | null> => {
  try {
    // Download image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      logger.error(`[Zyprus] Failed to download image ${index}: ${url}`, undefined, { category: LogCategory.ZYPRUS });
      return null;
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    const urlParts = url.split("/");
    let filename = urlParts[urlParts.length - 1].split("?")[0];
    if (!filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      filename = `property_image_${index + 1}.jpg`;
    }

    const uploadResponse = await fetch(
      `${config.apiUrl}/jsonapi/node/property/field_gallery_`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `file; filename="${filename}"`,
          "User-Agent": "SophiaAI",
        },
        body: imageBuffer,
      }
    );

    if (!uploadResponse.ok) {
      logger.error(`[Zyprus] Failed to upload image ${index}: ${uploadResponse.status}`, undefined, { category: LogCategory.ZYPRUS });
      return null;
    }

    const uploadResult = await uploadResponse.json();
    if (uploadResult.data?.id) {
      logger.debug(`[Zyprus] Uploaded image ${index + 1}`, { category: LogCategory.ZYPRUS });
      return uploadResult.data.id;
    }
    return null;
  } catch (error) {
    logger.error(`[Zyprus] Image upload error for ${url}`, error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
    return null;
  }
};

const uploadImages = async (
  imageUrls: string[],
  token: string,
  config: ZyprusConfig
): Promise<string[]> => {
  logger.info(`[Zyprus] Uploading ${imageUrls.length} images in parallel...`, { category: LogCategory.ZYPRUS });

  const results = await Promise.all(
    imageUrls.map((url, index) => uploadSingleImage(url, index, token, config))
  );

  const fileIds = results.filter((id): id is string => id !== null);

  logger.info(`[Zyprus] Successfully uploaded ${fileIds.length}/${imageUrls.length} images`, { category: LogCategory.ZYPRUS });
  return fileIds;
};

export const createDraftListing = async (
  listing: ListingData
): Promise<CreateResult> => {
  const config = getZyprusConfig();
  const token = await getAccessToken(config);

  logger.info("[Zyprus] Creating draft listing...", { category: LogCategory.ZYPRUS });

  const reviewerEmails: string[] = [];
  if (listing.reviewer1) reviewerEmails.push(listing.reviewer1);
  if (listing.reviewer2) reviewerEmails.push(listing.reviewer2);

  const [
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerUuids,
    listingOwnerUuid,
    indoorFeatureUuids,
    outdoorFeatureUuids,
    viewUuids,
  ] = await Promise.all([
    findListingTypeUuid(listing.listingType),
    findPropertyTypeUuid(listing.propertyType),
    findPriceModifierUuid(),
    findTitleDeedUuid(),
    findUserUuid(listing.listingInstructor),
    findUserUuids(reviewerEmails),
    findUserUuid(listing.listingOwner),
    findIndoorFeatureUuids(listing.features || []),
    findOutdoorFeatureUuids(listing.features || []),
    findPropertyViewUuids(listing.features || []),
  ]);

  logger.debug("[Zyprus] Resolved UUIDs", {
    category: LogCategory.ZYPRUS,
    listingType: listingTypeUuid,
    propertyType: propertyTypeUuid,
    priceModifier: priceModifierUuid,
    titleDeed: titleDeedUuid,
    instructor: instructorUuid,
    reviewers: reviewerUuids,
    listingOwner: listingOwnerUuid,
    indoorFeatures: indoorFeatureUuids.length,
    outdoorFeatures: outdoorFeatureUuids.length,
    views: viewUuids.length,
  });

  const imageFileIds = await uploadImages(listing.images, token, config);
  logger.debug(`[Zyprus] Uploaded ${imageFileIds.length} images`, { category: LogCategory.ZYPRUS });

  const payload = buildJsonApiPayload(
    listing,
    imageFileIds,
    listingTypeUuid,
    propertyTypeUuid,
    priceModifierUuid,
    titleDeedUuid,
    instructorUuid,
    reviewerUuids,
    listingOwnerUuid,
    indoorFeatureUuids,
    outdoorFeatureUuids,
    viewUuids
  );

  const response = await fetch(`${config.apiUrl}/jsonapi/node/property`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[Zyprus] Create listing error", new Error(errorText), { category: LogCategory.ZYPRUS, statusCode: response.status });
    let errorDetail = "";
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.errors) {
        errorDetail = errorJson.errors.map((e: Record<string, unknown>) => e.detail || e.title || JSON.stringify(e)).join("; ");
      }
    } catch {
      errorDetail = errorText.substring(0, 200);
    }
    throw new Error(`Failed to create listing (${response.status}): ${errorDetail || "Unknown error"}`);
  }

  const result = await response.json();
  const listingId = result.data.id;

  logger.info(`[Zyprus] Created listing: ${listingId}`, { category: LogCategory.ZYPRUS });

  return {
    listingId,
    listingUrl: `${config.siteUrl}/property/${listingId}`,
  };
};

export const searchProperties = async (
  query: string,
  filters?: Record<string, string>
): Promise<unknown[]> => {
  const config = getZyprusConfig();
  const token = await getAccessToken(config);

  let url = `${config.apiUrl}/jsonapi/node/property?page[limit]=10`;

  if (query) {
    url += `&filter[title][operator]=CONTAINS&filter[title][value]=${encodeURIComponent(query)}`;
  }

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      url += `&filter[${key}]=${encodeURIComponent(value)}`;
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.api+json",
      "User-Agent": "SophiaAI",
    },
  });

  if (!response.ok) {
    logger.error(`[Zyprus] Search error: ${response.status}`, undefined, { category: LogCategory.ZYPRUS });
    return [];
  }

  const data = await response.json();
  return data.data || [];
};
