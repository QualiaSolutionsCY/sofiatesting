/**
 * Property Type Taxonomy Lookups
 * Extracted from taxonomy-cache.ts for better modularity
 */

import {
  DEFAULT_LISTING_TYPE_UUID,
  DEFAULT_PRICE_MODIFIER_UUID,
  DEFAULT_PROPERTY_TYPE_UUID,
  DEFAULT_TITLE_DEED_UUID,
  PROPERTY_TYPE_FALLBACKS,
} from "../config/business-rules.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { loadTaxonomy } from "./taxonomy-cache.ts";

/**
 * Find property type UUID by name
 * Uses hardcoded fallbacks from config for common types if API lookup fails
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string> {
  const normalized = typeName.toLowerCase().trim();
  logger.debug(
    `[Taxonomy] Finding property type UUID for: "${typeName}" (normalized: "${normalized}")`
  );

  // FIRST: Check if we have a hardcoded fallback for this type
  // This ensures common types like "villa" always get the correct UUID
  if (PROPERTY_TYPE_FALLBACKS[normalized]) {
    logger.debug(
      `[Taxonomy] Using hardcoded fallback for "${typeName}": ${PROPERTY_TYPE_FALLBACKS[normalized]}`
    );
    return PROPERTY_TYPE_FALLBACKS[normalized];
  }

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(
      `[Taxonomy] Available property types: ${taxonomy.propertyTypes.map((pt) => pt.name).join(", ")}`
    );

    // Common aliases - maps user input to taxonomy names
    const aliases: Record<string, string[]> = {
      apartment: ["flat", "apt"],
      villa: [
        "detached",
        "detached house",
        "standalone house",
        "independent house",
      ],
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
      logger.debug(
        `[Taxonomy] Exact match for "${typeName}": ${exact.name} (${exact.id})`
      );
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
          logger.debug(
            `[Taxonomy] Alias match: "${typeName}" -> "${canonical}" -> ${match.id}`
          );
          return match.id;
        }
        // If canonical not in taxonomy, use hardcoded fallback
        if (PROPERTY_TYPE_FALLBACKS[canonical]) {
          logger.debug(
            `[Taxonomy] Alias fallback: "${typeName}" -> "${canonical}" -> ${PROPERTY_TYPE_FALLBACKS[canonical]}`
          );
          return PROPERTY_TYPE_FALLBACKS[canonical];
        }
      }
    }

    // Try partial match - but be careful not to match too broadly
    // Only match if the property type is contained in the taxonomy name
    const partial = taxonomy.propertyTypes.find((pt) =>
      pt.name.toLowerCase().includes(normalized)
    );
    if (partial) {
      logger.debug(
        `[Taxonomy] Partial match for "${typeName}": ${partial.name} (${partial.id})`
      );
      return partial.id;
    }

    // Last resort: return first property type if available
    if (taxonomy.propertyTypes.length > 0) {
      logger.debug(
        `[Taxonomy] WARNING: Using first available property type: ${taxonomy.propertyTypes[0].name}`
      );
      return taxonomy.propertyTypes[0].id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding property type",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use default UUID
  logger.debug(`[Taxonomy] Using default property type UUID for: ${typeName}`);
  return DEFAULT_PROPERTY_TYPE_UUID;
}

/**
 * Find listing type UUID (sale/rent)
 * Uses DEFAULT_LISTING_TYPE_UUID from config as fallback
 */
export async function findListingTypeUuid(
  type: "sale" | "rent"
): Promise<string> {
  try {
    const taxonomy = await loadTaxonomy();

    const searchTerms =
      type === "sale"
        ? ["sale", "for sale", "buy"]
        : ["rent", "for rent", "rental"];

    for (const term of searchTerms) {
      const match = taxonomy.listingTypes.find((lt) =>
        lt.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first listing type if available
    if (taxonomy.listingTypes.length > 0) {
      logger.debug(
        `[Taxonomy] Using first available listing type: ${taxonomy.listingTypes[0].name}`
      );
      return taxonomy.listingTypes[0].id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding listing type",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use documented default UUID
  logger.debug("[Taxonomy] Using hardcoded default listing type UUID");
  return DEFAULT_LISTING_TYPE_UUID;
}

/**
 * Find price modifier UUID
 * Live API values: Price, Guide Price, Offers in region of, Offers over, Negotiable
 * Uses DEFAULT_PRICE_MODIFIER_UUID from config as fallback
 */
export async function findPriceModifierUuid(
  modifier?: string,
  negotiable?: boolean
): Promise<string> {
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
    logger.debug(
      `[Taxonomy] Price modifier search: terms=${searchTerms.join(",")}, modifier=${modifier}, negotiable=${negotiable}`,
      { category: LogCategory.CACHE }
    );
    logger.debug(
      `[Taxonomy] Available price modifiers: ${taxonomy.priceModifiers.map((pm) => pm.name).join(", ")}`,
      { category: LogCategory.CACHE }
    );

    for (const term of searchTerms) {
      const match = taxonomy.priceModifiers.find(
        (pm) =>
          pm.name.toLowerCase() === term || pm.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first price modifier if available
    if (taxonomy.priceModifiers.length > 0) {
      logger.debug(
        `[Taxonomy] Using first available price modifier: ${taxonomy.priceModifiers[0].name}`
      );
      return taxonomy.priceModifiers[0].id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding price modifier",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use documented default UUID
  logger.debug("[Taxonomy] Using hardcoded default price modifier UUID");
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
      available: [
        "available",
        "yes",
        "title deed",
        "full ownership",
        "has title",
      ],
      "title deed": ["title deed", "full ownership", "has title", "available"],
      "not available": [
        "not available",
        "no",
        "pending",
        "no title",
        "without title",
        "permits_only",
        "permits only",
      ],
      "on application": [
        "on application",
        "applied",
        "in progress",
        "in process",
        "being issued",
        "in_process",
        "final approval",
      ],
      "share of land": ["share of land", "shared", "fractional"],
    };

    // Default search terms
    let searchTerms: string[] = ["title deed", "available"];

    if (status) {
      const normalizedStatus = status.toLowerCase().trim();
      // Check if status maps to a known term
      for (const [zyprusTerm, aliases] of Object.entries(statusMappings)) {
        if (
          aliases.some(
            (alias) =>
              normalizedStatus.includes(alias) ||
              alias.includes(normalizedStatus)
          )
        ) {
          searchTerms = [zyprusTerm, ...aliases];
          break;
        }
      }
    }

    for (const term of searchTerms) {
      const match = taxonomy.titleDeeds.find(
        (td) =>
          td.name.toLowerCase() === term || td.name.toLowerCase().includes(term)
      );
      if (match) {
        return match.id;
      }
    }

    // Fallback: return first title deed if available
    if (taxonomy.titleDeeds.length > 0) {
      logger.debug(
        `[Taxonomy] Using first available title deed: ${taxonomy.titleDeeds[0].name}`
      );
      return taxonomy.titleDeeds[0].id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding title deed",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use documented default UUID
  logger.debug("[Taxonomy] Using hardcoded default title deed UUID");
  return DEFAULT_TITLE_DEED_UUID;
}
