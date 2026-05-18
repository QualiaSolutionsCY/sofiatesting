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
 * Known parent UUIDs that must NEVER be returned — they are category headers,
 * not selectable leaf radios on the Zyprus edit page.
 */
const PARENT_UUIDS = new Set([
  "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44", // Apartment (parent)
  "ddb5ac70-4464-40f8-9f3e-2d06c1e684f4", // House (parent)
  "caad7ee6-ed6d-4f40-87cc-2429e75c73f2", // Building (parent)
]);

/**
 * Aliases that map user-facing terms to leaf taxonomy names.
 * Every canonical target here is a LEAF name (e.g. "flat", not "apartment").
 */
const LEAF_ALIASES: Record<string, string[]> = {
  flat: ["apartment", "apt"],
  "detached house": [
    "villa",
    "detached",
    "detached villa",
    "standalone house",
    "independent house",
  ],
  "semi detached house": ["semi-detached", "semi-detached house"],
  bungalow: ["single-story", "single storey"],
  penthouse: ["penthouse apartment"],
  townhouse: ["town house", "terraced house"],
  "commercial building": ["building"],
  industrial: ["warehouse"],
};

/**
 * Check whether a taxonomy item is a leaf (not a parent category).
 * Uses both the static PARENT_UUIDS set and runtime parentId data from the taxonomy.
 */
function isLeaf(
  item: { id: string; parentId?: string },
  allTypes: { id: string; parentId?: string }[]
): boolean {
  if (PARENT_UUIDS.has(item.id)) return false;
  // A type is a parent if any other type references it as parentId
  return !allTypes.some((t) => t.parentId === item.id);
}

/**
 * Find property type UUID by name
 * Guarantees a LEAF UUID is returned — never a parent category.
 * Uses hardcoded fallbacks from config for common types if API lookup fails.
 */
export async function findPropertyTypeUuid(typeName: string): Promise<string> {
  const normalized = typeName.toLowerCase().trim();
  logger.debug(
    `[Taxonomy] Finding property type UUID for: "${typeName}" (normalized: "${normalized}")`
  );

  // FIRST: Check if we have a hardcoded fallback for this type
  // All values in PROPERTY_TYPE_FALLBACKS are verified leaf UUIDs
  if (PROPERTY_TYPE_FALLBACKS[normalized]) {
    logger.debug(
      `[Taxonomy] Using hardcoded fallback for "${typeName}": ${PROPERTY_TYPE_FALLBACKS[normalized]}`
    );
    return PROPERTY_TYPE_FALLBACKS[normalized];
  }

  // Check aliases — resolve to canonical leaf name, then use fallback
  for (const [leafName, aliasList] of Object.entries(LEAF_ALIASES)) {
    if (aliasList.includes(normalized)) {
      if (PROPERTY_TYPE_FALLBACKS[leafName]) {
        logger.debug(
          `[Taxonomy] Alias resolved: "${typeName}" -> "${leafName}" -> ${PROPERTY_TYPE_FALLBACKS[leafName]}`
        );
        return PROPERTY_TYPE_FALLBACKS[leafName];
      }
    }
  }

  try {
    const taxonomy = await loadTaxonomy();
    logger.debug(
      `[Taxonomy] Available property types: ${taxonomy.propertyTypes.map((pt) => pt.name).join(", ")}`
    );

    // Try exact match — but only accept leaves
    const exact = taxonomy.propertyTypes.find(
      (pt) => pt.name.toLowerCase() === normalized
    );
    if (exact && isLeaf(exact, taxonomy.propertyTypes)) {
      logger.debug(
        `[Taxonomy] Exact leaf match for "${typeName}": ${exact.name} (${exact.id})`
      );
      return exact.id;
    }

    // If exact match was a parent, resolve to its first leaf child
    if (exact && !isLeaf(exact, taxonomy.propertyTypes)) {
      const firstChild = taxonomy.propertyTypes.find(
        (pt) => pt.parentId === exact.id && isLeaf(pt, taxonomy.propertyTypes)
      );
      if (firstChild) {
        logger.debug(
          `[Taxonomy] Parent "${exact.name}" resolved to first leaf child "${firstChild.name}" (${firstChild.id})`
        );
        return firstChild.id;
      }
    }

    // Try aliases against live taxonomy
    for (const [leafName, aliasList] of Object.entries(LEAF_ALIASES)) {
      if (aliasList.includes(normalized)) {
        const match = taxonomy.propertyTypes.find(
          (pt) =>
            pt.name.toLowerCase() === leafName &&
            isLeaf(pt, taxonomy.propertyTypes)
        );
        if (match) {
          logger.debug(
            `[Taxonomy] Live alias match: "${typeName}" -> "${leafName}" -> ${match.id}`
          );
          return match.id;
        }
      }
    }

    // Try partial match — only on leaves
    const partial = taxonomy.propertyTypes.find(
      (pt) =>
        pt.name.toLowerCase().includes(normalized) &&
        isLeaf(pt, taxonomy.propertyTypes)
    );
    if (partial) {
      logger.debug(
        `[Taxonomy] Partial leaf match for "${typeName}": ${partial.name} (${partial.id})`
      );
      return partial.id;
    }

    // Last resort: return first leaf property type if available
    const firstLeaf = taxonomy.propertyTypes.find((pt) =>
      isLeaf(pt, taxonomy.propertyTypes)
    );
    if (firstLeaf) {
      logger.debug(
        `[Taxonomy] WARNING: Using first available leaf property type: ${firstLeaf.name}`
      );
      return firstLeaf.id;
    }
  } catch (error) {
    logger.error(
      "[Taxonomy] Error finding property type",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.ZYPRUS }
    );
  }

  // Ultimate fallback: use default UUID (Flat — a verified leaf)
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
        "final_approval",
        "final approval",
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
      ],
      "share of land": ["share of land", "shared", "fractional"],
      "not display": [
        "not display",
        "do_not_display",
        "do not display",
        "don't display",
        "dont display",
        "hidden",
        "hide",
      ],
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
