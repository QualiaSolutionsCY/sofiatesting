/**
 * Amenities & Features Taxonomy Lookups
 * Extracted from taxonomy-cache.ts for better modularity
 */

import {
  INDOOR_FEATURE_ALIASES,
  INDOOR_FEATURE_FALLBACKS,
  OPPOSITE_MODIFIERS,
  OUTDOOR_FEATURE_ALIASES,
  OUTDOOR_FEATURE_FALLBACKS,
  VIEW_FALLBACKS,
} from "../config/business-rules.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { loadTaxonomy } from "./taxonomy-cache.ts";

/**
 * Resolve user input to canonical taxonomy term using aliases
 * Returns the canonical term if found, otherwise returns the original input
 */
function resolveFeatureAlias(
  input: string,
  aliasMap: Record<string, string[]>
): string {
  const normalized = input.toLowerCase().trim();

  // Check if input matches any alias
  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (
      aliases.some(
        (alias) =>
          alias === normalized ||
          normalized.includes(alias) ||
          alias.includes(normalized)
      )
    ) {
      logger.debug(`[Taxonomy] ALIAS: "${input}" -> "${canonical}"`);
      return canonical;
    }
  }

  return normalized;
}

/**
 * Find feature UUIDs by names
 */
export async function findFeatureUuids(
  featureNames: string[]
): Promise<string[]> {
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
 * Find indoor feature UUIDs from feature names
 * IMPROVED: Uses exact matching against taxonomy, with hardcoded fallbacks
 * @param featureNames - Array of feature names to look up
 * @param bathrooms - Optional bathroom count. If >= 2, auto-adds "guest toilet" and "master bed"
 */
export async function findIndoorFeatureUuids(
  featureNames: string[],
  bathrooms?: number
): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  // Auto-add features based on bathroom count
  const effectiveFeatures = [...featureNames];
  if (bathrooms && bathrooms >= 2) {
    logger.debug(
      `[Taxonomy] Bathrooms >= 2 (${bathrooms}), auto-adding guest toilet and master bed`
    );
    if (!effectiveFeatures.some((f) => f.toLowerCase().includes("guest"))) {
      effectiveFeatures.push("guest toilet");
    }
    if (!effectiveFeatures.some((f) => f.toLowerCase().includes("master"))) {
      effectiveFeatures.push("master bed");
    }
  }

  logger.debug(
    `[Taxonomy] Finding indoor features from: ${effectiveFeatures.join(", ")}`
  );
  logger.debug(
    `[Taxonomy] Available indoor features (${taxonomy.indoorFeatures.length}): ${taxonomy.indoorFeatures.map((f) => f.name).join(", ")}`
  );

  for (const name of effectiveFeatures) {
    if (!name) continue;

    // First resolve any aliases (e.g., "laundry room" -> "utility room")
    const normalized = resolveFeatureAlias(name, INDOOR_FEATURE_ALIASES);
    if (!normalized) continue;

    // Skip features that are clearly outdoor-only (pool, garden, etc.)
    // But be careful - "covered parking" is INDOOR in Zyprus taxonomy!
    const isOutdoorOnly = [
      "pool",
      "private pool",
      "communal pool",
      "swimming pool",
      "heated swimming pool",
      "landscape garden",
      "standard garden",
      "rear garden",
      "roof garden",
      "barbecue",
      "bbq",
      "outdoor shower",
      "bore hole",
      "photovoltaic",
      "solar system",
      "solar panels",
      "irrigation",
      "garage",
      "single garage",
      "double garage",
      "electric shutters",
      "carport",
    ].some((kw) => normalized === kw || normalized.includes(kw));

    if (isOutdoorOnly) continue;

    // Strategy 1: Try EXACT match in taxonomy (case-insensitive)
    let match = taxonomy.indoorFeatures.find(
      (f) => f.name.toLowerCase() === normalized
    );

    if (!match) {
      // Strategy 2: Try normalized match (remove hyphens, slashes)
      const normalizedClean = normalized
        .replace(/[-/]/g, " ")
        .replace(/\s+/g, " ");
      match = taxonomy.indoorFeatures.find((f) => {
        const taxClean = f.name
          .toLowerCase()
          .replace(/[-/]/g, " ")
          .replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input (e.g., "parking" in "Covered Parking")
      match = taxonomy.indoorFeatures.find((f) => {
        const taxLower = f.name.toLowerCase();
        // Must be an exact word match, not substring
        return (
          taxLower === normalized ||
          (taxLower.includes(normalized) &&
            !hasContradictoryModifiers(normalized, f.name))
        );
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(
        `[Taxonomy] INDOOR MATCHED: "${name}" -> "${match.name}" (${match.id})`
      );
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = INDOOR_FEATURE_FALLBACKS[normalized];
      if (
        fallbackUuid &&
        !fallbackUuid.includes("placeholder") &&
        !uuids.includes(fallbackUuid)
      ) {
        logger.debug(
          `[Taxonomy] INDOOR FALLBACK: "${name}" -> ${fallbackUuid}`
        );
        uuids.push(fallbackUuid);
      } else {
        logger.warn(
          `[Taxonomy] INDOOR NO MATCH: "${name}" (resolved: "${normalized}")`,
          {
            category: LogCategory.ZYPRUS,
            operation: "findIndoorFeatureUuids",
          }
        );
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
function hasContradictoryModifiers(
  input: string,
  taxonomyTerm: string
): boolean {
  const inputLower = input.toLowerCase();
  const taxLower = taxonomyTerm.toLowerCase();

  for (const [mod1, mod2] of OPPOSITE_MODIFIERS) {
    // Check both directions: input has mod1 & tax has mod2, or input has mod2 & tax has mod1
    if (
      (inputLower.includes(mod1) && taxLower.includes(mod2)) ||
      (inputLower.includes(mod2) && taxLower.includes(mod1))
    ) {
      logger.debug(
        `[Taxonomy] REJECTED: "${input}" vs "${taxonomyTerm}" - contradictory modifiers (${mod1}/${mod2})`
      );
      return true;
    }
  }
  return false;
}

/**
 * Find outdoor feature UUIDs from feature names
 * IMPROVED: Uses exact matching against taxonomy, with hardcoded fallbacks
 */
export async function findOutdoorFeatureUuids(
  featureNames: string[]
): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  logger.debug(
    `[Taxonomy] Finding outdoor features from: ${featureNames.join(", ")}`
  );
  logger.debug(
    `[Taxonomy] Available outdoor features (${taxonomy.outdoorFeatures.length}): ${taxonomy.outdoorFeatures.map((f) => f.name).join(", ")}`
  );

  for (const name of featureNames) {
    if (!name) continue;

    // First resolve any aliases (e.g., "swimming pool" -> "private pool")
    const normalized = resolveFeatureAlias(name, OUTDOOR_FEATURE_ALIASES);
    if (!normalized) continue;

    // Skip features that are clearly indoor-only
    const isIndoorOnly = [
      "air conditioning",
      "central heating",
      "under floor heating",
      "fireplace",
      "elevator",
      "fitted kitchen",
      "electrical appliances",
      "water heater",
      "guest toilet",
      "basement",
      "mezzanine",
      "jacuzzi",
      "internal pool",
      "playroom",
      "conference room",
      "cctv",
      "security system",
      "fire alarm",
      "open-plan",
      "utility room",
      "master bed",
      "fly screens",
      "covered parking",
      "underground parking",
      "furnished",
      "unfurnished",
    ].some((kw) => normalized.includes(kw));

    if (isIndoorOnly) continue;

    // Skip views - they go in property_views, not outdoor features
    const isView = [
      "view",
      "sea view",
      "mountain view",
      "city view",
      "green area view",
    ].some((kw) => normalized.includes(kw));
    if (isView) continue;

    // Strategy 1: Try EXACT match in taxonomy (case-insensitive)
    let match = taxonomy.outdoorFeatures.find(
      (f) => f.name.toLowerCase() === normalized
    );

    if (!match) {
      // Strategy 2: Try normalized match (remove hyphens, slashes)
      const normalizedClean = normalized
        .replace(/[-/]/g, " ")
        .replace(/\s+/g, " ");
      match = taxonomy.outdoorFeatures.find((f) => {
        const taxClean = f.name
          .toLowerCase()
          .replace(/[-/]/g, " ")
          .replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input
      match = taxonomy.outdoorFeatures.find((f) => {
        const taxLower = f.name.toLowerCase();
        return (
          taxLower === normalized ||
          (taxLower.includes(normalized) &&
            !hasContradictoryModifiers(normalized, f.name))
        );
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(
        `[Taxonomy] OUTDOOR MATCHED: "${name}" -> "${match.name}" (${match.id})`
      );
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = OUTDOOR_FEATURE_FALLBACKS[normalized];
      if (
        fallbackUuid &&
        !fallbackUuid.includes("placeholder") &&
        !uuids.includes(fallbackUuid)
      ) {
        logger.debug(
          `[Taxonomy] OUTDOOR FALLBACK: "${name}" -> ${fallbackUuid}`
        );
        uuids.push(fallbackUuid);
      } else {
        logger.warn(
          `[Taxonomy] OUTDOOR NO MATCH: "${name}" (resolved: "${normalized}")`,
          {
            category: LogCategory.ZYPRUS,
            operation: "findOutdoorFeatureUuids",
          }
        );
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
export async function findPropertyViewUuids(
  featureNames: string[]
): Promise<string[]> {
  const taxonomy = await loadTaxonomy();
  const uuids: string[] = [];

  logger.debug(
    `[Taxonomy] Finding property views from: ${featureNames.join(", ")}`
  );
  logger.debug(
    `[Taxonomy] Available property views (${taxonomy.propertyViews.length}): ${taxonomy.propertyViews.map((f) => f.name).join(", ")}`
  );

  for (const name of featureNames) {
    const normalized = name.toLowerCase().trim();
    if (!normalized) continue;

    // Check if it contains "view" keyword
    if (!normalized.includes("view")) continue;

    // Strategy 1: Try EXACT match in property_views taxonomy
    let match = taxonomy.propertyViews.find(
      (f) => f.name.toLowerCase() === normalized
    );

    if (!match) {
      // Strategy 2: Try normalized match
      const normalizedClean = normalized
        .replace(/[-/]/g, " ")
        .replace(/\s+/g, " ");
      match = taxonomy.propertyViews.find((f) => {
        const taxClean = f.name
          .toLowerCase()
          .replace(/[-/]/g, " ")
          .replace(/\s+/g, " ");
        return taxClean === normalizedClean;
      });
    }

    if (!match) {
      // Strategy 3: Check if taxonomy item contains our input
      match = taxonomy.propertyViews.find((f) => {
        const taxLower = f.name.toLowerCase();
        return taxLower.includes(normalized) || normalized.includes(taxLower);
      });
    }

    if (match && !uuids.includes(match.id)) {
      logger.debug(
        `[Taxonomy] VIEW MATCHED: "${name}" -> "${match.name}" (${match.id})`
      );
      uuids.push(match.id);
    } else if (!match) {
      // Strategy 4: Use hardcoded fallback
      const fallbackUuid = VIEW_FALLBACKS[normalized];
      if (
        fallbackUuid &&
        !fallbackUuid.includes("placeholder") &&
        !uuids.includes(fallbackUuid)
      ) {
        logger.debug(`[Taxonomy] VIEW FALLBACK: "${name}" -> ${fallbackUuid}`);
        uuids.push(fallbackUuid);
      } else {
        logger.warn(`[Taxonomy] VIEW NO MATCH: "${name}"`, {
          category: LogCategory.ZYPRUS,
          operation: "findPropertyViewUuids",
        });
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
  logger.debug(
    `[Taxonomy] Finding land type UUID for: "${landType}" (normalized: "${normalized}")`
  );

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(
      `[Taxonomy] Available land types: ${taxonomy.landTypes.map((lt) => lt.name).join(", ")}`
    );

    // Try exact match
    const exact = taxonomy.landTypes.find(
      (lt) => lt.name.toLowerCase() === normalized
    );
    if (exact) {
      logger.debug(
        `[Taxonomy] Exact match for "${landType}": ${exact.name} (${exact.id})`
      );
      return exact.id;
    }

    // Try partial match
    const partial = taxonomy.landTypes.find(
      (lt) =>
        lt.name.toLowerCase().includes(normalized) ||
        normalized.includes(lt.name.toLowerCase())
    );
    if (partial) {
      logger.debug(
        `[Taxonomy] Partial match for "${landType}": ${partial.name} (${partial.id})`
      );
      return partial.id;
    }

    // Return first land type if available
    if (taxonomy.landTypes.length > 0) {
      logger.debug(
        `[Taxonomy] Using first available land type: ${taxonomy.landTypes[0].name}`
      );
      return taxonomy.landTypes[0].id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding land type",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Fallback: empty string (land type is optional in some cases)
  logger.warn(
    `[Taxonomy] No land type found for: "${landType}", using empty fallback`
  );
  return "";
}

/**
 * Find infrastructure UUIDs (electricity, water, road_access, sewage, telephone)
 * Returns array of matched UUIDs
 */
export async function findInfrastructureUuids(
  infrastructure: string[]
): Promise<string[]> {
  if (!infrastructure || infrastructure.length === 0) {
    return [];
  }

  const uuids: string[] = [];

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(
      `[Taxonomy] Finding infrastructure from: ${infrastructure.join(", ")}`
    );
    logger.debug(
      `[Taxonomy] Available infrastructure (${taxonomy.infrastructure.length}): ${taxonomy.infrastructure.map((i) => i.name).join(", ")}`
    );

    for (const name of infrastructure) {
      const normalized = name.toLowerCase().trim().replace(/_/g, " ");
      if (!normalized) continue;

      // Try exact match
      let match = taxonomy.infrastructure.find(
        (i) => i.name.toLowerCase() === normalized
      );

      if (!match) {
        // Try normalized match (replace underscores, hyphens with spaces)
        const normalizedClean = normalized
          .replace(/[-/]/g, " ")
          .replace(/\s+/g, " ");
        match = taxonomy.infrastructure.find((i) => {
          const taxClean = i.name
            .toLowerCase()
            .replace(/[-/]/g, " ")
            .replace(/\s+/g, " ");
          return taxClean === normalizedClean;
        });
      }

      if (!match) {
        // Try partial match
        match = taxonomy.infrastructure.find((i) => {
          const taxLower = i.name.toLowerCase();
          return taxLower.includes(normalized) || normalized.includes(taxLower);
        });
      }

      if (match && !uuids.includes(match.id)) {
        logger.debug(
          `[Taxonomy] INFRASTRUCTURE MATCHED: "${name}" -> "${match.name}" (${match.id})`
        );
        uuids.push(match.id);
      } else if (!match) {
        logger.debug(`[Taxonomy] INFRASTRUCTURE NO MATCH: "${name}"`);
      }
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding infrastructure",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  logger.debug(`[Taxonomy] Found ${uuids.length} infrastructure UUIDs`);
  return uuids;
}
