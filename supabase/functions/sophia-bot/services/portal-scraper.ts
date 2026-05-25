/**
 * Multi-Portal Property Scraper
 *
 * Extracts property data from bank-owned portals using Firecrawl /v1/scrape
 * with structured extraction. Supports:
 *   - Altia Marketplace (marketplace.altia.com.cy)
 *   - Altamira Real Estate (altamirarealestate.com.cy)
 *   - REMU Properties (remuproperties.com)
 *   - Gordian (gogordian.com)
 *
 * Bazaraki continues using the existing Railway Playwright scraper
 * (bazaraki-scraper.ts) — this module does NOT handle Bazaraki URLs.
 */

import { LogCategory, logger } from "../utils/logger.ts";

export type PortalName =
  | "bazaraki"
  | "altia"
  | "altamira"
  | "remu"
  | "gogordian";

export interface PortalListing {
  url: string;
  title?: string;
  price?: number;
  currency?: string;
  location?: string;
  propertyType?: string;
  listingType?: "sale" | "rent";
  bedrooms?: number;
  bathrooms?: number;
  coveredArea?: number;
  plotSize?: number;
  description?: string;
  imageUrls: string[];
  features: string[];
  source: "firecrawl" | "url_pattern" | "partial";
  warnings: string[];
  portal: PortalName;
}

/** Domain-to-portal mapping */
const PORTAL_DOMAINS: Array<{ hostname: string; portal: PortalName }> = [
  { hostname: "bazaraki.com", portal: "bazaraki" },
  { hostname: "bazaraki.cy", portal: "bazaraki" },
  { hostname: "marketplace.altia.com.cy", portal: "altia" },
  { hostname: "altia.com.cy", portal: "altia" },
  { hostname: "altamirarealestate.com.cy", portal: "altamira" },
  { hostname: "remuproperties.com", portal: "remu" },
  { hostname: "gogordian.com", portal: "gogordian" },
];

/**
 * Detect which portal a URL belongs to.
 * Returns null if not a recognized portal.
 */
export function detectPortal(url: string): PortalName | null {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname.replace(/^www\./, "");
    for (const { hostname, portal } of PORTAL_DOMAINS) {
      if (host === hostname || host.endsWith(`.${hostname}`)) {
        return portal;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true for the 4 bank-owned portals (Altia, Altamira, REMU, Gordian).
 * Returns false for Bazaraki or unrecognized URLs.
 */
export function isBankPortalUrl(url: string): boolean {
  const portal = detectPortal(url);
  return (
    portal === "altia" ||
    portal === "altamira" ||
    portal === "remu" ||
    portal === "gogordian"
  );
}

/**
 * Returns true if the URL belongs to ANY recognized property portal
 * (Bazaraki + the 4 bank portals).
 */
export function isPropertyPortalUrl(url: string): boolean {
  return detectPortal(url) !== null;
}

// ---- Firecrawl extraction ----

/** JSON Schema for Firecrawl structured extraction */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Property listing title" },
    price: {
      type: "number",
      description: "Property price in EUR (number only, no currency symbol)",
    },
    currency: {
      type: "string",
      description: "Currency code, usually EUR",
      default: "EUR",
    },
    location: {
      type: "string",
      description:
        "Property location — city and district/area (e.g. 'Paphos, Kathikas')",
    },
    propertyType: {
      type: "string",
      enum: [
        "villa",
        "apartment",
        "house",
        "townhouse",
        "maisonette",
        "bungalow",
        "penthouse",
        "studio",
        "land",
        "commercial",
        "detached house",
        "semi-detached",
      ],
      description: "Type of property",
    },
    listingType: {
      type: "string",
      enum: ["sale", "rent"],
      description: "Whether the property is for sale or rent",
    },
    bedrooms: { type: "number", description: "Number of bedrooms" },
    bathrooms: { type: "number", description: "Number of bathrooms" },
    coveredArea: {
      type: "number",
      description: "Covered/internal area in square metres",
    },
    plotSize: {
      type: "number",
      description: "Plot/land size in square metres",
    },
    description: {
      type: "string",
      description: "Full property description text",
    },
    imageUrls: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of full absolute https image URLs from the listing gallery",
    },
    features: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of property features/amenities (e.g. 'swimming pool', 'air conditioning', 'parking')",
    },
  },
  required: ["title"],
} as const;

/** Portal-specific extraction prompts for Firecrawl */
const PORTAL_PROMPTS: Record<
  Exclude<PortalName, "bazaraki">,
  string
> = {
  altia:
    "Extract property listing details from this Altia Marketplace bank-owned property page. " +
    "The price is in EUR. Look for bedrooms, bathrooms, covered area (sqm), plot size, and location. " +
    "Collect all property gallery image URLs (full https URLs). Features may be listed under amenities or characteristics.",
  altamira:
    "Extract property listing details from this Altamira Real Estate bank-owned property page. " +
    "Price is in EUR. Look for the property type, bedrooms, bathrooms, internal area (sqm), plot size, " +
    "and full location (city + area). Collect all gallery image URLs. Features may be listed under 'characteristics' or similar sections.",
  remu:
    "Extract property listing details from this REMU Properties bank-owned property page. " +
    "Price is in EUR. Extract bedrooms, bathrooms, covered area, plot size, location, and property type. " +
    "Collect all listing photo URLs (full https URLs). Features/amenities may be in a separate section.",
  gogordian:
    "Extract property listing details from this Gordian bank-owned property page. " +
    "Price is in EUR. The URL slug often contains bedrooms and location — cross-check with page content. " +
    "Extract bedrooms, bathrooms, area, plot size, and full location. Collect all gallery image URLs.",
};

/**
 * Extract property data from a bank portal URL using Firecrawl /v1/scrape.
 * Returns a PortalListing with as much data as possible.
 * On failure, falls back to URL-pattern extraction with warnings.
 */
export async function extractFromBankPortal(
  url: string
): Promise<PortalListing> {
  const portal = detectPortal(url);
  if (!portal || portal === "bazaraki") {
    throw new Error(`Not a bank portal URL: ${url}`);
  }

  const result: PortalListing = {
    url,
    imageUrls: [],
    features: [],
    source: "url_pattern",
    warnings: [],
    portal,
  };

  // Phase 1: Extract from URL slug (fast, always runs)
  extractFromUrlSlug(url, portal, result);

  // Phase 2: Firecrawl structured extraction
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    logger.warn("FIRECRAWL_API_KEY not configured — using URL pattern only", {
      category: LogCategory.GENERAL,
    });
    result.warnings.push(
      "Firecrawl API key not configured. Data extracted from URL pattern only."
    );
    return result;
  }

  try {
    const scraped = await callFirecrawlScrape(url, portal, apiKey);
    if (scraped) {
      mergeFirecrawlData(scraped, result);
      result.source = result.title ? "firecrawl" : "partial";
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Firecrawl scrape failed for ${portal}: ${msg}`, {
      category: LogCategory.GENERAL,
    });
    result.warnings.push(
      `Firecrawl extraction failed. Data extracted from URL pattern only.`
    );
  }

  return result;
}

/**
 * Call Firecrawl /v1/scrape with extract format (synchronous).
 * Returns the extracted data object or null on failure.
 */
async function callFirecrawlScrape(
  url: string,
  portal: Exclude<PortalName, "bazaraki">,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000); // 25s timeout

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["extract"],
        extract: {
          prompt: PORTAL_PROMPTS[portal],
          schema: EXTRACTION_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.info(
        `Firecrawl returned ${response.status} for ${portal}: ${body.slice(0, 200)}`,
        { category: LogCategory.GENERAL }
      );
      return null;
    }

    const json = await response.json();
    if (json.success && json.data?.extract) {
      logger.info(
        `Firecrawl extracted "${json.data.extract.title || "untitled"}" from ${portal} — ` +
          `${json.data.extract.imageUrls?.length || 0} images`,
        { category: LogCategory.GENERAL }
      );
      return json.data.extract;
    }

    logger.info(`Firecrawl response had no extract data for ${portal}`, {
      category: LogCategory.GENERAL,
    });
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info(`Firecrawl scrape timed out for ${portal}`, {
        category: LogCategory.GENERAL,
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Merge Firecrawl extracted data into the result.
 * Firecrawl data takes priority over URL-pattern data.
 */
function mergeFirecrawlData(
  scraped: Record<string, unknown>,
  result: PortalListing
): void {
  if (scraped.title && typeof scraped.title === "string") {
    result.title = scraped.title;
  }
  if (
    scraped.price &&
    typeof scraped.price === "number" &&
    scraped.price > 0
  ) {
    result.price = scraped.price;
    result.currency = "EUR";
  }
  if (scraped.currency && typeof scraped.currency === "string") {
    result.currency = scraped.currency;
  }
  if (scraped.location && typeof scraped.location === "string") {
    result.location = scraped.location;
  }
  if (scraped.description && typeof scraped.description === "string") {
    result.description = scraped.description;
  }
  if (scraped.bedrooms && typeof scraped.bedrooms === "number") {
    result.bedrooms = scraped.bedrooms;
  }
  if (scraped.bathrooms && typeof scraped.bathrooms === "number") {
    result.bathrooms = scraped.bathrooms;
  }
  if (scraped.coveredArea && typeof scraped.coveredArea === "number") {
    result.coveredArea = scraped.coveredArea;
  }
  if (scraped.plotSize && typeof scraped.plotSize === "number") {
    result.plotSize = scraped.plotSize;
  }
  if (scraped.propertyType && typeof scraped.propertyType === "string") {
    result.propertyType = scraped.propertyType;
  }
  if (scraped.listingType && typeof scraped.listingType === "string") {
    const lt = scraped.listingType.toLowerCase();
    if (lt === "sale" || lt === "rent") {
      result.listingType = lt;
    }
  }
  // Images — bank portals don't have CDN blocks, keep them
  if (Array.isArray(scraped.imageUrls)) {
    result.imageUrls = scraped.imageUrls.filter(
      (u): u is string => typeof u === "string" && u.startsWith("https")
    );
  }
  // Features
  if (Array.isArray(scraped.features)) {
    result.features = scraped.features.filter(
      (f): f is string => typeof f === "string" && f.length > 0
    );
  }
}

/**
 * Extract data from the URL slug. Each portal has a different URL structure.
 * This is the fast fallback that always runs before Firecrawl.
 */
function extractFromUrlSlug(
  url: string,
  portal: PortalName,
  result: PortalListing
): void {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();

    // Common patterns across portals
    // Listing type
    if (
      path.includes("-for-sale") ||
      path.includes("/sale/") ||
      path.includes("-sale-") ||
      path.includes("for-sale")
    ) {
      result.listingType = "sale";
    } else if (
      path.includes("-for-rent") ||
      path.includes("/rent/") ||
      path.includes("-rent-") ||
      path.includes("for-rent")
    ) {
      result.listingType = "rent";
    }

    // Bedrooms
    const bedroomMatch = path.match(/(\d+)-bedroom/);
    if (bedroomMatch) {
      result.bedrooms = Number.parseInt(bedroomMatch[1], 10);
    }
    if (path.includes("studio")) {
      result.bedrooms = 0;
      result.propertyType = "studio";
    }

    // Property type (order matters — specific before general)
    const typePatterns: Array<[RegExp, string]> = [
      [/villa/, "villa"],
      [/apartment/, "apartment"],
      [/penthouse/, "penthouse"],
      [/maisonette/, "maisonette"],
      [/bungalow/, "bungalow"],
      [/townhouse/, "townhouse"],
      [/semi-detached/, "semi-detached"],
      [/detached-house|detached/, "detached house"],
      [/house/, "house"],
    ];

    for (const [pattern, type] of typePatterns) {
      if (pattern.test(path)) {
        result.propertyType = type;
        break;
      }
    }

    // Portal-specific location extraction
    switch (portal) {
      case "altia": {
        // e.g. /en/listings/2893 — no location in URL
        break;
      }
      case "altamira": {
        // e.g. /detached-house-for-sale/paphos/kathikas/pre-owned/pr44570/133069/1
        const segments = path.split("/").filter(Boolean);
        // Typically: [type-for-sale, district, area, condition, ref, id, ...]
        if (segments.length >= 3) {
          const district = capitalize(segments[1]);
          const area = capitalize(segments[2]);
          if (
            district &&
            !district.match(/^\d/) &&
            area &&
            !area.match(/^\d/) &&
            area !== "Pre-owned" &&
            area !== "New"
          ) {
            result.location = `${district}, ${area}`;
          } else if (district && !district.match(/^\d/)) {
            result.location = district;
          }
        }
        break;
      }
      case "remu": {
        // e.g. /cyprus/listing-28513 — no location in URL
        break;
      }
      case "gogordian": {
        // e.g. /property/3-bedroom-house-in-agios-theodoros--larnaca-8885
        const locationMatch = path.match(/-in-([a-z-]+?)(?:--([a-z-]+?))?-?\d*\/?$/);
        if (locationMatch) {
          const area = locationMatch[1]
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          const district = locationMatch[2]
            ? locationMatch[2]
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ")
            : undefined;
          result.location = district ? `${district}, ${area}` : area;
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // URL parsing failed — non-critical
  }
}

/** Capitalize a URL segment (replace dashes with spaces, title case) */
function capitalize(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Human-readable portal display names
 */
const PORTAL_DISPLAY_NAMES: Record<PortalName, string> = {
  bazaraki: "Bazaraki",
  altia: "Altia Marketplace",
  altamira: "Altamira Real Estate",
  remu: "REMU Properties",
  gogordian: "Gordian",
};

/**
 * Format a PortalListing as a summary string for the AI.
 * Mirrors the shape of formatBazarakiSummary exactly.
 */
export function formatPortalSummary(listing: PortalListing): string {
  const parts: string[] = [];

  const portalName = PORTAL_DISPLAY_NAMES[listing.portal] || listing.portal;
  const sourceLabel =
    listing.source === "firecrawl"
      ? "full extraction"
      : listing.source === "partial"
        ? "partial extraction"
        : "URL pattern only";
  parts.push(`Source: ${portalName} (${sourceLabel})`);

  if (listing.title) parts.push(`Title: ${listing.title}`);
  if (listing.propertyType) parts.push(`Type: ${listing.propertyType}`);
  if (listing.listingType) parts.push(`For: ${listing.listingType}`);
  if (listing.price) parts.push(`Price: €${listing.price.toLocaleString()}`);
  if (listing.location) parts.push(`Location: ${listing.location}`);
  if (listing.bedrooms !== undefined)
    parts.push(`Bedrooms: ${listing.bedrooms}`);
  if (listing.bathrooms) parts.push(`Bathrooms: ${listing.bathrooms}`);
  if (listing.coveredArea) parts.push(`Area: ${listing.coveredArea} sqm`);
  if (listing.plotSize) parts.push(`Plot: ${listing.plotSize} sqm`);
  if (listing.description) parts.push(`Description: ${listing.description}`);
  if (listing.features.length > 0)
    parts.push(`Features: ${listing.features.join(", ")}`);
  if (listing.imageUrls.length > 0)
    parts.push(`Images: ${listing.imageUrls.length} photo(s) extracted`);

  if (listing.warnings.length > 0) {
    parts.push(
      `\nWarnings:\n${listing.warnings.map((w) => `- ${w}`).join("\n")}`
    );
  }

  // List missing fields
  const missing: string[] = [];
  if (!listing.price) missing.push("Price");
  if (!listing.coveredArea) missing.push("Covered area (m²)");
  if (!listing.location) missing.push("Location");
  if (!listing.bathrooms) missing.push("Bathrooms");

  if (missing.length > 0) {
    parts.push(
      `\nCould not extract from listing: ${missing.join(", ")}. Check the agent's message — they may have already provided some of these. Only ask for what is truly missing.`
    );
  }

  return parts.join("\n");
}
