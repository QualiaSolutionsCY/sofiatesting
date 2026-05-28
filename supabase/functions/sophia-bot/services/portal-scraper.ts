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
    title: { type: "string", description: "Property listing title or headline" },
    price: {
      type: "number",
      description:
        "Property price as a raw integer in EUR. Strip the € symbol, commas, dots used as thousands separators, and any 'EUR'/'€' suffix. Example: '€ 350,000' → 350000. Look in fields labelled 'Price', 'Asking Price', 'Sale Price', or 'Rent'. If the page hides the price behind a 'Show price' button or only shows 'POA', return null.",
    },
    currency: {
      type: "string",
      description: "Currency code (EUR for Cyprus listings)",
      default: "EUR",
    },
    location: {
      type: "string",
      description:
        "Full property location as 'District, Area' (e.g. 'Paphos, Kathikas' or 'Limassol, Agios Athanasios'). Look in breadcrumbs, 'Location' / 'Area' / 'Region' fields, the page title, and the address block. If only city is shown, return just the city.",
    },
    propertyType: {
      type: "string",
      description:
        "Type of property. Use lowercase. Common values: villa, apartment, house, townhouse, maisonette, bungalow, penthouse, studio, detached house, semi-detached, land, plot, field, office, shop, retail, warehouse, industrial, commercial, hotel, building.",
    },
    listingType: {
      type: "string",
      enum: ["sale", "rent"],
      description: "Whether the property is for sale or rent",
    },
    bedrooms: {
      type: "number",
      description:
        "Number of bedrooms as an integer. Look for 'Bedrooms', 'Beds', 'BR', or the room-count icon. Studios = 0. Land/commercial may have no bedrooms — return null then.",
    },
    bathrooms: {
      type: "number",
      description:
        "Number of bathrooms as an integer (round half-baths up). Look for 'Bathrooms', 'Baths', 'WC', 'Toilets', or the bath icon.",
    },
    coveredArea: {
      type: "number",
      description:
        "Internal/covered area in square metres as a raw number. Strip 'm²', 'sqm', 'sq.m', ',', '.' thousands separators. Look in fields labelled 'Covered Area', 'Internal Area', 'Built-up Area', 'Habitable Area', 'Living Area', 'Floor Area', or 'Area'. Example: '125 m²' → 125.",
    },
    plotSize: {
      type: "number",
      description:
        "Plot/land area in square metres as a raw number. Strip units and separators. Look for 'Plot Size', 'Plot Area', 'Land Area', 'Land Size', or 'Lot Size'.",
    },
    description: {
      type: "string",
      description: "Full property description / about / details text",
    },
    imageUrls: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of full absolute https URLs of the property gallery photos (NOT logo, agent avatar, map thumbnail, or share-icon images). Prefer the highest-resolution variant when multiple sizes exist.",
    },
    features: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of property features/amenities (e.g. 'swimming pool', 'air conditioning', 'parking', 'sea view', 'furnished'). Look under 'Features', 'Amenities', 'Characteristics', 'Specifications', or icon lists.",
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
    "Extract every field of the provided schema from this Altia Marketplace listing page (marketplace.altia.com.cy). " +
    "Altia is a Spanish-built portal localised for Cyprus — price is always EUR; strip '€' and any thousands separator. " +
    "The listing's main attributes appear in a 'Property Details' / 'Características' panel: read 'Surface' or 'Built area' → coveredArea, 'Plot' or 'Land surface' → plotSize, 'Bedrooms' / 'Habitaciones' → bedrooms, 'Bathrooms' / 'Baños' → bathrooms. " +
    "Location is usually 'Province, Municipality' or in breadcrumbs above the title — combine into 'District, Area'. " +
    "If the price is hidden behind a 'Solicitar precio' / 'Request price' / 'Show price' button or shows 'A consultar', return price as null. " +
    "Collect every photo URL from the gallery carousel — they are typically on cdn.altia or img.altia.",
  altamira:
    "Extract every field of the provided schema from this Altamira Real Estate listing page (altamirarealestate.com.cy). " +
    "Altamira labels are: 'Covered Area' → coveredArea, 'Plot Area' → plotSize, 'Bedrooms' → bedrooms, 'Bathrooms' → bathrooms. " +
    "Price is shown as '€ 350,000' style — strip € and commas, return integer. " +
    "Location: the breadcrumb 'Home > Properties > {District} > {Area}' and the 'Region/Area' table row both contain location — combine into 'District, Area'. The URL slug also encodes this (e.g. /paphos/kathikas/). " +
    "Property type comes from the URL slug AND the 'Type' table row — prefer the table row. " +
    "Some listings are commercial (offices, shops, warehouses, plots) — use the lowercase type as-is. " +
    "Gather all gallery photo URLs (typically from altamira's CDN) — exclude the agent avatar and the 'Altamira' logo.",
  remu:
    "Extract every field of the provided schema from this REMU Properties listing page (remuproperties.com). " +
    "REMU is a Bank of Cyprus portal and the page is a JS-rendered SPA — make sure to read the rendered 'Property Details' / 'Specifications' table, not just the initial HTML. " +
    "REMU labels: 'Covered Area' or 'Built-up Area' → coveredArea, 'Plot Area' or 'Land Area' → plotSize, 'Bedrooms' → bedrooms, 'Bathrooms' → bathrooms. " +
    "Price is labelled 'Price' or 'Asking Price' in EUR — return integer (strip €, commas). If marked 'POA' / 'Price on Application', return null. " +
    "Location: read the 'Location' table row AND the breadcrumb; combine into 'District, Area' (e.g. 'Limassol, Agios Athanasios'). " +
    "REMU also lists many commercial / land assets — accept any property type, lowercase. " +
    "Gather all gallery image URLs from the photo carousel — ignore the small map thumbnail.",
  gogordian:
    "Extract every field of the provided schema from this Gordian listing page (gogordian.com). Gordian is a JS-rendered SPA — the price and details only appear after the main content loads. " +
    "Gordian labels: 'Covered Area' → coveredArea, 'Land Area' or 'Plot' → plotSize, 'Bedrooms' → bedrooms, 'Bathrooms' → bathrooms. " +
    "Price is shown as '€ 350,000' — strip € and commas to return integer. " +
    "The URL slug encodes bedrooms, type, area and district (e.g. /property/3-bedroom-house-in-agios-theodoros--larnaca-8885). Cross-check the slug with the page's 'Region' / 'District' / 'Location' fields and combine as 'District, Area'. " +
    "Property type: trust the page's 'Type' field over the slug when they disagree (the slug uses 'house' for many subtypes). " +
    "Collect every gallery photo URL — Gordian uses its own CDN. Exclude any agent avatar.",
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
        onlyMainContent: true,
        waitFor: 2500,
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
  const price = coerceNumber(scraped.price);
  if (price && price > 0) {
    result.price = price;
    result.currency = "EUR";
  }
  if (scraped.currency && typeof scraped.currency === "string") {
    result.currency = scraped.currency;
  }
  if (scraped.location && typeof scraped.location === "string") {
    result.location = scraped.location.trim();
  }
  if (scraped.description && typeof scraped.description === "string") {
    result.description = scraped.description;
  }
  const bedrooms = coerceNumber(scraped.bedrooms);
  if (bedrooms !== null && bedrooms >= 0) {
    result.bedrooms = Math.round(bedrooms);
  }
  const bathrooms = coerceNumber(scraped.bathrooms);
  if (bathrooms !== null && bathrooms > 0) {
    result.bathrooms = Math.round(bathrooms);
  }
  const coveredArea = coerceNumber(scraped.coveredArea);
  if (coveredArea && coveredArea > 0) {
    result.coveredArea = coveredArea;
  }
  const plotSize = coerceNumber(scraped.plotSize);
  if (plotSize && plotSize > 0) {
    result.plotSize = plotSize;
  }
  if (scraped.propertyType && typeof scraped.propertyType === "string") {
    result.propertyType = scraped.propertyType.toLowerCase().trim();
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

/**
 * Coerce a Firecrawl-returned value into a positive number.
 * Accepts numbers, or strings like "€ 350,000", "350.000", "125 m²", "3 beds".
 * Returns null if no valid number can be parsed.
 */
function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    // Strip currency symbols, units, and thousands separators.
    // Keep digits, minus sign, and one decimal point.
    const cleaned = value
      .replace(/[€$£,]/g, "")
      .replace(/\b(eur|usd|gbp|sqm|sq\.?m|m²|m2|beds?|baths?|rooms?)\b/gi, "")
      .replace(/[^\d.\-]/g, "")
      .trim();
    if (!cleaned) return null;
    // If multiple dots (e.g. "350.000" european thousands), drop them all
    const dotCount = (cleaned.match(/\./g) || []).length;
    const normalized = dotCount > 1 ? cleaned.replace(/\./g, "") : cleaned;
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
