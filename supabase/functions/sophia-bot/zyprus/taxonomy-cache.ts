/**
 * Taxonomy Cache for Zyprus API
 * Caches location, property type, and feature UUIDs
 */

import { getAccessToken, getZyprusConfig } from "./client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";

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

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} ${vocabularyName} terms`);
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

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} location nodes`);
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

    // Get next page
    nextUrl = data.links?.next?.href || null;
  }

  logger.debug(`[Taxonomy] Loaded ${items.length} users`);
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
    logger.debug("[Taxonomy] Waiting for existing load operation...", { category: LogCategory.CACHE });
    return taxonomyLoadPromise;
  }

  logger.info("[Taxonomy] Loading taxonomy data...", { category: LogCategory.CACHE });

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
        propertyViews,
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
        fetchTaxonomy("property_views", token, config.apiUrl), // Sea View, Mountain View, etc.
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
        propertyViews,
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

/**
 * Find location UUID by name
 * MANDATORY field - always returns a valid UUID
 * Default UUID from test: 7dbc931e-90eb-4b89-9ac8-b5e593831cf8 (Acropolis, Strovolos)
 *
 * IMPROVED: Scores matches prioritizing exact location name matches
 * e.g., "Peyia, Paphos" should match "Peyia" not "Kato Paphos" even though both are in Paphos
 */
export async function findLocationUuid(locationName: string): Promise<string> {
  // HARDCODED FALLBACK - Acropolis, Strovolos (known working UUID)
  const DEFAULT_LOCATION_UUID = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8";

  // HARDCODED LOCATION UUIDs for common locations that need exact matching
  // These take priority over fuzzy matching to prevent "Peyia" matching "Coral Bay"
  const LOCATION_FALLBACKS: Record<string, string> = {
    // Paphos region - TODO: Get actual UUIDs from API
    "peyia": "PEYIA-UUID-PLACEHOLDER",
    "pegeia": "PEYIA-UUID-PLACEHOLDER", // Alternative spelling
    "tala": "TALA-UUID-PLACEHOLDER",
    "coral bay": "CORAL-BAY-UUID-PLACEHOLDER",
    "chloraka": "CHLORAKA-UUID-PLACEHOLDER",
    "kato paphos": "KATO-PAPHOS-UUID-PLACEHOLDER",
    "paphos": "PAPHOS-UUID-PLACEHOLDER",
    // Limassol region
    "agios tychonas": "AGIOS-TYCHONAS-UUID-PLACEHOLDER",
    "germasogeia": "GERMASOGEIA-UUID-PLACEHOLDER",
    "limassol": "LIMASSOL-UUID-PLACEHOLDER",
  };

  // Check for exact location match in hardcoded fallbacks FIRST
  const normalizedInput = locationName.toLowerCase().trim();
  const firstWord = normalizedInput.split(/[\s,]+/)[0];

  // Try exact match on first word (the specific location)
  if (LOCATION_FALLBACKS[firstWord] && !LOCATION_FALLBACKS[firstWord].includes("PLACEHOLDER")) {
    logger.debug(`[Taxonomy] Using hardcoded location for "${firstWord}": ${LOCATION_FALLBACKS[firstWord]}`);
    return LOCATION_FALLBACKS[firstWord];
  }

  // Known locations within each region - used to determine if a location is IN a region
  // This helps give bonus to locations that are IN the detected region, not just
  // locations whose NAME contains the region name
  const REGION_LOCATIONS: Record<string, string[]> = {
    paphos: [
      "paphos", "pafos", "tala", "peyia", "chloraka", "kato paphos", "coral bay", "polis",
      "geroskipou", "pegeia", "kissonerga", "emba", "tremithousa", "mesa chorio",
      "kamares", "mandria", "kouklia", "letymvou", "tsada", "mesogi", "koloni",
      "universal", "anavargos", "konia", "tomb of kings", "sea caves"
    ],
    limassol: [
      "limassol", "lemesos", "germasogeia", "agios tychonas", "potamos", "mesa geitonia",
      "zakaki", "columbia", "tourist area", "pareklisia", "pissouri", "erimi",
      "episkopi", "pyrgos", "parekklisia", "mouttagiaka", "agios athanasios",
      "trachoni", "panthea", "ypsonas", "kato polemidia", "polemidia", "agios nikolaos",
      "agia fyla", "omonia", "neapolis", "linopetra", "agios ioannis", "ayios tychonas"
    ],
    larnaca: [
      "larnaca", "larnaka", "oroklini", "pervolia", "livadia", "dekelia", "dhekelia",
      "kamares", "aradippou", "meneou", "dromolaxia", "kiti", "tersefanou", "perivolia",
      "chrysopolitissa"
    ],
    nicosia: [
      "nicosia", "lefkosia", "strovolos", "lakatamia", "engomi", "aglantzia",
      "dasoupoli", "makedonitissa", "kaimakli", "pallouriotissa", "latsia",
      "geri", "dali", "tseri", "kokkinotrimithia", "deftera", "acropolis"
    ],
    famagusta: [
      "famagusta", "ammochostos", "paralimni", "protaras", "ayia napa", "agia napa",
      "deryneia", "sotira", "frenaros", "liopetri", "xylofagou", "vrysoulles",
      "cape greco", "kapparis"
    ],
  };

  try {
    const taxonomy = await loadTaxonomy();
    const normalized = locationName.toLowerCase().trim();

    // Try exact match first
    const exact = taxonomy.locations.find(
      (loc) => loc.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(`[Taxonomy] Exact match for "${locationName}": ${exact.name}`);
      return exact.id;
    }

    // Extract words from input (filter short words like "in", "of", etc.)
    const words = normalized.split(/[\s,]+/).filter(w => w.length > 2);

    // CRITICAL: Try to find a location that EXACTLY matches the FIRST word
    // This handles "Peyia, Paphos" -> should match "Peyia" not "Coral Bay"
    if (words.length > 0) {
      const firstWord = words[0];
      const exactFirstWordMatch = taxonomy.locations.find(
        (loc) => loc.name.toLowerCase() === firstWord ||
                 loc.name.toLowerCase().split(/[\s,]+/)[0] === firstWord
      );
      if (exactFirstWordMatch) {
        logger.debug(`[Taxonomy] Exact first-word match for "${locationName}": ${exactFirstWordMatch.name}`);
        return exactFirstWordMatch.id;
      }
    }

    // Detect region from input - check if ANY word matches a location in a region
    let detectedRegion: string | null = null;
    for (const [region, locationsList] of Object.entries(REGION_LOCATIONS)) {
      if (words.some(w => locationsList.some(loc => loc.includes(w) || w.includes(loc)))) {
        detectedRegion = region;
        logger.debug(`[Taxonomy] Detected region "${region}" from input: ${locationName}`);
        break;
      }
    }

    // Score all locations by how many input words they match
    const scoredMatches: Array<{ location: TaxonomyItem; score: number; matchedWords: string[]; bonusReason: string }> = [];

    // The FIRST word is usually the specific location (e.g., "Tala" in "Tala, Paphos")
    // Later words are usually the region/city (e.g., "Paphos")
    const firstWord = words.length > 0 ? words[0] : "";

    for (const loc of taxonomy.locations) {
      const locNameLower = loc.name.toLowerCase();
      const locWords = locNameLower.split(/[\s,]+/).filter(w => w.length > 1);
      const matchedWords: string[] = [];
      let bonusReason = "";

      // Check each input word
      for (const word of words) {
        // Check if this word appears in the location name
        if (locNameLower.includes(word)) {
          matchedWords.push(word);
        }
      }

      if (matchedWords.length > 0) {
        let score = 0;

        // Strong bonus for exact word match (not substring)
        // e.g., "peyia" should strongly match "Peyia" but not as strongly match "Peyia Village"
        for (const word of matchedWords) {
          if (locWords.includes(word)) {
            score += 3; // Strong bonus for exact word match
            bonusReason += `exact:${word} `;
          } else {
            score += 1; // Weaker bonus for substring match
          }
        }

        // CRITICAL: Strong bonus if location contains the FIRST word of input
        // This prioritizes "Tala" over "Kato Paphos" when input is "Tala, Paphos"
        // The first word is the specific location, not the region
        if (firstWord && locNameLower.includes(firstWord)) {
          score += 10; // Strong bonus for matching the specific location name
          bonusReason += `first-word:${firstWord} `;
        }

        // Region bonus: Give bonus if this location is IN the detected region
        // We check if any of the location's words match our REGION_LOCATIONS list
        if (detectedRegion) {
          const regionLocs = REGION_LOCATIONS[detectedRegion] || [];
          const locationIsInRegion = locWords.some(locWord =>
            regionLocs.some(regLoc => locWord.includes(regLoc) || regLoc.includes(locWord))
          );

          if (locationIsInRegion) {
            score += 2; // Bonus for being in the detected region
            bonusReason += `region:${detectedRegion} `;
          }
        }

        scoredMatches.push({ location: loc, score, matchedWords, bonusReason });
      }
    }

    // Sort by score descending, return best match
    if (scoredMatches.length > 0) {
      scoredMatches.sort((a, b) => b.score - a.score);
      const best = scoredMatches[0];
      logger.debug(`[Taxonomy] Best match for "${locationName}": ${best.location.name} (score: ${best.score}, matched: ${best.matchedWords.join(", ")}, bonus: ${best.bonusReason})`);

      // Log top 3 alternatives for debugging
      for (let i = 1; i < Math.min(4, scoredMatches.length); i++) {
        const alt = scoredMatches[i];
        logger.debug(`[Taxonomy] Alternative ${i}: ${alt.location.name} (score: ${alt.score})`);
      }

      return best.location.id;
    }

    // Fallback: try to find a general location in the detected region
    if (detectedRegion && taxonomy.locations.length > 0) {
      // Try to find a location that contains the region name (e.g., "Limassol" for limassol region)
      const regionFallback = taxonomy.locations.find(loc =>
        loc.name.toLowerCase().includes(detectedRegion)
      );
      if (regionFallback) {
        logger.debug(`[Taxonomy] Using region fallback for "${locationName}": ${regionFallback.name}`);
        return regionFallback.id;
      }
    }

    // Ultimate fallback: return first location if available
    if (taxonomy.locations.length > 0) {
      logger.debug(`[Taxonomy] WARNING: Using first available location for "${locationName}": ${taxonomy.locations[0].name}`);
      return taxonomy.locations[0].id;
    }
  } catch (error) {
    logger.error("[Taxonomy] Error finding location", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.ZYPRUS });
  }

  // Ultimate fallback: use known working UUID
  logger.debug(`[Taxonomy] Using hardcoded default location UUID for: ${locationName}`);
  return DEFAULT_LOCATION_UUID;
}

/**
 * Find property type UUID by name
 * Now includes a hardcoded fallback for common types if API lookup fails
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string> {
  // HARDCODED FALLBACK UUIDs for common property types (from dev9.zyprus.com)
  // These UUIDs are verified to work on dev9.zyprus.com
  const PROPERTY_TYPE_FALLBACKS: Record<string, string> = {
    apartment: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44",
    villa: "76b4fa8e-de7e-4232-85ac-869dca3620f4",
    house: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    "detached house": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    "detached villa": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    "semi-detached": "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    studio: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    penthouse: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    bungalow: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
    maisonette: "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // same as apartment
    townhouse: "76b4fa8e-de7e-4232-85ac-869dca3620f4", // same as villa
  };
  const DEFAULT_PROPERTY_TYPE_UUID = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"; // Apartment

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
 * SOPHIA AI user UUID - used as fallback when user lookup fails
 */
const SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614";

/**
 * Agent email to name mapping for lookup by name when email lookup fails
 * Names based on Zyprus username conventions (usually first name or email prefix)
 */
const AGENT_NAME_MAP: Record<string, string[]> = {
  // Paphos agents
  "evelina@zyprus.com": ["evelina", "evelina neophytou"],
  "marios@zyprus.com": ["marios", "marios polyviou"],
  "dimitris@zyprus.com": ["dimitris", "dimitris panayiotou"],
  "paphos@zyprus.com": ["azinas", "marios azinas"],
  "azinas@zyprus.com": ["azinas", "marios azinas"],

  // Limassol agents
  "limassol@zyprus.com": ["michelle", "michelle longridge"],
  "michelle@zyprus.com": ["michelle", "michelle longridge"],
  "diana@zyprus.com": ["diana", "diana kultaseva"],
  "maria@zyprus.com": ["maria", "maria georgiou"],
  "demetra@zyprus.com": ["demetra", "demetra papademetriou"],
  "christos@zyprus.com": ["christos", "christos minterides"],
  "daga@zyprus.com": ["daga", "daga lawicka"],
  "danae@zyprus.com": ["danae", "danae pirou"],
  "eleni@zyprus.com": ["eleni", "eleni iordanidou"],
  "oz@zyprus.com": ["oz", "olesya", "olesya zheyko"],
  "victoria@zyprus.com": ["victoria", "victoria roberts"],
  "brendan@zyprus.com": ["brendan", "brendan haddad"],
  "susan@zyprus.com": ["susan", "susan taylor"],

  // Larnaca agents
  "larnaca@zyprus.com": ["lysandros", "lysandros ioanni"],
  "natalia.larnaca@zyprus.com": ["natalia", "natalia komarova"],
  "olha@zyprus.com": ["olha", "olha shevchuk"],

  // Nicosia agents
  "nicosia@zyprus.com": ["ivan", "ivan kazakov"],
  "niki@zyprus.com": ["niki", "mir", "mir fathi"],
  "marisa@zyprus.com": ["marisa", "marisa konstantinou"],
  "philippos@zyprus.com": ["philippos", "philippos chrysostomou"],

  // Famagusta agents
  "famagusta@zyprus.com": ["narine", "narine akopyan"],
  "nick@zyprus.com": ["nick", "nick kokotsis"],
  "olga@zyprus.com": ["olga", "olga matushkina"],

  // Management
  "csc@zyprus.com": ["charalambos", "csc"],
  "listings@zyprus.com": ["lauren", "listings"],
};

/**
 * Hardcoded fallback UUIDs for known Zyprus staff
 * Used when API user lookup fails (API doesn't expose mail attribute on dev9)
 * UUIDs retrieved by matching usernames to display_name/name attributes
 */
const USER_FALLBACKS: Record<string, string> = {
  // Found by username match in dev9.zyprus.com user list
  "listings@zyprus.com": "0caa9a75-362a-4156-b11b-b52839243b74", // Lauren (username: listings)
  "michelle@zyprus.com": "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4", // Michelle
  "limassol@zyprus.com": "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4", // Michelle (via limassol@)
  "demetra@zyprus.com": "b72a0f7c-62d8-4f69-89f3-aaebee31676a", // Demetra
  "azinas@zyprus.com": "c8e05e2a-56e6-4d1f-9a20-31235feaec54", // Azinas
  "paphos@zyprus.com": "c8e05e2a-56e6-4d1f-9a20-31235feaec54", // Azinas (via paphos@)

  // Regional request accounts - not found in dev9, using SOPHIA_AI_UUID
  "requestpaphos@zyprus.com": SOPHIA_AI_UUID,
  "requestlimassol@zyprus.com": SOPHIA_AI_UUID,
  "requestlarnaca@zyprus.com": SOPHIA_AI_UUID,
  "requestnicosia@zyprus.com": SOPHIA_AI_UUID,
  "requestfamagusta@zyprus.com": SOPHIA_AI_UUID,

  // Management
  "charalambos@zyprus.com": "71ac4784-238f-45b2-ac15-5f74200601ce", // Charalambos Emiliou
  "csc@zyprus.com": "71ac4784-238f-45b2-ac15-5f74200601ce", // Charalambos (via csc@)
};

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
  const uuids: string[] = [];
  for (const email of emails) {
    if (email) {
      const uuid = await findUserUuid(email);
      // Skip SOPHIA_AI_UUID - we don't want "Sophia AI" showing as a reviewer
      // The regional request emails (requestlimassol@zyprus.com, etc.) don't have real user accounts
      if (uuid !== SOPHIA_AI_UUID && !uuids.includes(uuid)) {
        uuids.push(uuid);
      } else if (uuid === SOPHIA_AI_UUID) {
        logger.debug(`[Taxonomy] Skipping SOPHIA_AI_UUID for reviewer email: ${email}`);
      }
    }
  }
  return uuids;
}

/**
 * HARDCODED FEATURE FALLBACK UUIDs
 * These ensure features are ALWAYS matched correctly even if API lookup fails
 * UUIDs verified from dev9.zyprus.com taxonomy endpoints
 */

// Indoor Features - taxonomy_term--indoor_property_views
const INDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "air conditioning": "f577829f-8cbe-4ba8-9ce8-e67a30b6fe76",
  "basement": "a1b2c3d4-basement-uuid-placeholder",  // TODO: Get from API
  "cctv system": "a1b2c3d4-cctv-uuid-placeholder",   // TODO: Get from API
  "central heating": "4f2523f7-9fde-4390-b532-c0da52644632",
  "underfloor heating": "a1b2c3d4-ufh-uuid-placeholder",  // TODO: Get real UUID from API - using placeholder to skip
  "conference room": "a1b2c3d4-conf-uuid-placeholder", // TODO: Get from API
  "covered parking": "432ac572-ed64-4107-a818-19a8a22c5371",
  "electrical appliances": "a1b2c3d4-elec-uuid-placeholder", // TODO: Get from API
  "elevator": "a1b2c3d4-elev-uuid-placeholder",      // TODO: Get from API
  "fire alarm system": "a1b2c3d4-fire-uuid-placeholder", // TODO: Get from API
  "fireplace": "a1b2c3d4-firep-uuid-placeholder",    // TODO: Get from API
  "fitted kitchen": "a1b2c3d4-fitk-uuid-placeholder", // TODO: Get from API
  "fly screens": "a1b2c3d4-flys-uuid-placeholder",   // TODO: Get from API
  "furnished": "a1b2c3d4-furn-uuid-placeholder",     // TODO: Get from API
  "guest toilet": "5e2a90da-6836-444b-8d72-a5f810d3a9e5",
  "internal pool": "a1b2c3d4-intpool-uuid-placeholder", // TODO: Get from API
  "jacuzzi": "a1b2c3d4-jacuzzi-uuid-placeholder",    // TODO: Get from API
  "male and female w/c": "a1b2c3d4-mfwc-uuid-placeholder", // TODO: Get from API
  "master bed": "a1b2c3d4-mbed-uuid-placeholder",    // TODO: Get from API
  "mezzanine": "a1b2c3d4-mezz-uuid-placeholder",     // TODO: Get from API
  "open-plan": "a1b2c3d4-openplan-uuid-placeholder", // TODO: Get from API
  "pet friendly": "a1b2c3d4-petf-uuid-placeholder",  // TODO: Get from API
  "playroom": "a1b2c3d4-playr-uuid-placeholder",     // TODO: Get from API
  "pressurised water system": "a1b2c3d4-press-uuid-placeholder", // TODO: Get from API
  "utility room": "a1b2c3d4-util-uuid-placeholder",  // TODO: Get from API
  "water heater": "a1b2c3d4-waterh-uuid-placeholder", // TODO: Get from API
};

// Outdoor Features - taxonomy_term--outdoor_property_features
const OUTDOOR_FEATURE_FALLBACKS: Record<string, string> = {
  "barbecue area": "a1b2c3d4-bbq-uuid-placeholder",  // TODO: Get from API
  "bore hole": "a1b2c3d4-bore-uuid-placeholder",     // TODO: Get from API
  "communal pool": "a1b2c3d4-compool-uuid-placeholder", // TODO: Get from API
  "double garage": "a1b2c3d4-dgarage-uuid-placeholder", // TODO: Get from API
  "electric shutters": "a1b2c3d4-elecshut-uuid-placeholder", // TODO: Get from API
  "heated swimming pool": "a1b2c3d4-heatpool-uuid-placeholder", // TODO: Get from API
  "irrigation system": "a1b2c3d4-irrig-uuid-placeholder", // TODO: Get from API
  "landscape garden": "a1b2c3d4-landg-uuid-placeholder", // TODO: Get from API
  "on street parking": "695d4e05-83df-4345-8f03-911302e96784",  // Verified
  "outdoor shower": "a1b2c3d4-outshower-uuid-placeholder", // TODO: Get from API
  "photovoltaic system": "cf0e9658-bd22-4d8d-988e-b579f7139c1a", // Verified
  "private pool": "c3f02ad5-4275-4cb5-acaa-359673e2b0ac", // Verified
  "roof garden": "a1b2c3d4-roofg-uuid-placeholder",  // TODO: Get from API
  "single garage": "a1b2c3d4-sgarage-uuid-placeholder", // TODO: Get from API
  "solar system": "a1b2c3d4-solar-uuid-placeholder", // TODO: Get from API
  "standard garden": "a1b2c3d4-stdg-uuid-placeholder", // TODO: Get from API
  "uncovered parking": "695d4e05-83df-4345-8f03-911302e96784", // Verified
  "no pool": "a1b2c3d4-nopool-uuid-placeholder",     // TODO: Get from API
};

// Property Views - taxonomy_term--property_views
const VIEW_FALLBACKS: Record<string, string> = {
  "sea view": "a1b2c3d4-seaview-uuid-placeholder",   // TODO: Get from API
  "mountain view": "a1b2c3d4-mtnview-uuid-placeholder", // TODO: Get from API
  "city view": "a1b2c3d4-cityview-uuid-placeholder", // TODO: Get from API
  "garden view": "a1b2c3d4-gardenview-uuid-placeholder", // TODO: Get from API
  "green area view": "a1b2c3d4-greenview-uuid-placeholder", // TODO: Get from API
  "pool view": "a1b2c3d4-poolview-uuid-placeholder", // TODO: Get from API
  "panoramic view": "a1b2c3d4-panview-uuid-placeholder", // TODO: Get from API
};

// NOTE: Feature categorization is now done inline in findIndoorFeatureUuids/findOutdoorFeatureUuids
// using explicit lists of indoor-only and outdoor-only features for better accuracy

/**
 * FEATURE ALIASES - Maps common user terms to Zyprus taxonomy terms
 * Handles variations like "swimming pool" -> "private pool"
 */
const OUTDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "private pool": ["swimming pool", "pool", "private swimming pool"],
  "communal pool": ["shared pool", "common pool"],
  "landscape garden": ["landscaped garden", "landscaping"],
  "standard garden": ["basic garden", "simple garden", "garden"],
  "roof garden": ["rooftop garden", "terrace garden"],
  "photovoltaic system": ["pv system", "photovoltaic", "pv panels", "solar panels"],
  "solar system": ["solar water heater", "solar panels", "solar"],
  "double garage": ["2 car garage", "two car garage"],
  "single garage": ["1 car garage", "one car garage", "garage"],
  "irrigation system": ["irrigation", "sprinkler system", "sprinklers"],
  "barbecue area": ["bbq", "bbq area", "barbecue", "barbeque"],
  "electric shutters": ["electric blinds", "motorized shutters"],
  "cul-de-sac": ["cul de sac", "culdesac", "dead end", "dead-end street"],
};

const INDOOR_FEATURE_ALIASES: Record<string, string[]> = {
  "air conditioning": ["ac", "a/c", "aircon", "air con"],
  "central heating": ["central heat"],
  "underfloor heating": ["under floor heating", "floor heating", "radiant floor", "heated floors", "ufh"],
  "fitted kitchen": ["built-in kitchen", "modern kitchen"],
  "covered parking": ["indoor parking", "garage parking"],
  "guest toilet": ["guest wc", "powder room", "guest bathroom", "second bathroom", "2nd bathroom"],
  "electrical appliances": ["appliances", "white goods"],
  "fly screens": ["flyscreen", "fly screen", "insect screens", "mosquito screens"],
  "water heater": ["boiler", "hot water"],
  "open-plan": ["open plan", "openplan", "open layout"],
  "utility room": ["laundry room", "laundry", "storage room", "storeroom", "store room"],
  "master bed": ["master bedroom", "master suite", "en-suite", "ensuite"],
};

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
 * OPPOSITE MODIFIERS - words that negate each other
 * If input contains one modifier and taxonomy contains the opposite, REJECT the match
 * e.g., "covered parking" should NOT match "uncovered parking"
 */
const OPPOSITE_MODIFIERS: Array<[string, string]> = [
  ["covered", "uncovered"],
  ["private", "communal"],
  ["private", "shared"],
  ["indoor", "outdoor"],
  ["heated", "unheated"],
  ["furnished", "unfurnished"],
  ["separate", "shared"],
  ["single", "double"],
  ["front", "rear"],
  ["open", "closed"],
];

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

