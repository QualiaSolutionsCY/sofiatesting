/**
 * Bazaraki Listing Scraper
 *
 * Two-phase approach:
 *   1. Call Railway-hosted Playwright scraper (bypasses Cloudflare)
 *   2. Fall back to URL pattern extraction if scraper is unavailable
 *
 * The AI will always ask the agent to confirm/supplement the extracted data.
 */

import { LogCategory, logger } from "../utils/logger.ts";

export interface BazarakiListing {
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
  source: "html" | "url_pattern" | "partial";
  warnings: string[];
}

/**
 * Main entry point: extract property data from a Bazaraki URL
 */
export async function extractFromBazaraki(
  url: string
): Promise<BazarakiListing> {
  const result: BazarakiListing = {
    url,
    imageUrls: [],
    features: [],
    source: "url_pattern",
    warnings: [],
  };

  // Phase 1: Extract what we can from URL structure (always runs — fast)
  extractFromUrl(url, result);

  // Phase 2: Try Railway Playwright scraper (full browser rendering)
  const scraperUrl = Deno.env.get("BAZARAKI_SCRAPER_URL");
  const scraperSecret = Deno.env.get("BAZARAKI_SCRAPER_SECRET");

  if (scraperUrl) {
    try {
      const scraped = await fetchFromScraperService(
        url,
        scraperUrl,
        scraperSecret
      );
      if (scraped) {
        mergeScrapedData(scraped, result);
        result.source = result.title ? "html" : "partial";
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Bazaraki scraper service failed: ${msg}`, {
        category: LogCategory.GENERAL,
      });
      result.warnings.push(
        "Scraper service unavailable. Data extracted from URL pattern only."
      );
    }
  } else {
    logger.warn(
      "BAZARAKI_SCRAPER_URL not configured — using URL pattern only",
      {
        category: LogCategory.GENERAL,
      }
    );
  }

  return result;
}

/**
 * Call the Railway-hosted Playwright scraper service.
 * Returns structured data or null on failure.
 */
async function fetchFromScraperService(
  url: string,
  scraperUrl: string,
  scraperSecret?: string
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000); // 25s — Playwright needs time

  try {
    const endpoint = scraperUrl.startsWith("http")
      ? scraperUrl
      : `https://${scraperUrl}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (scraperSecret) {
      headers["X-Scraper-Secret"] = scraperSecret;
    }

    const response = await fetch(`${endpoint}/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.info(`Scraper service returned ${response.status}`, {
        category: LogCategory.GENERAL,
      });
      return null;
    }

    const json = await response.json();
    if (json.success && json.data) {
      // Detect Cloudflare block — scraper returns but with challenge page content
      const title = (json.data.title as string) || "";
      const desc = (json.data.description as string) || "";
      if (
        title.includes("bazaraki.com") ||
        desc.includes("security service") ||
        desc.includes("malicious bots")
      ) {
        logger.warn(
          "Bazaraki scraper got Cloudflare challenge page instead of listing",
          {
            category: LogCategory.GENERAL,
          }
        );
        return null;
      }

      logger.info(
        `Bazaraki scraper: extracted "${title}" — ${json.data.imageUrls?.length || 0} images`,
        {
          category: LogCategory.GENERAL,
        }
      );
      return json.data;
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info("Bazaraki scraper service timed out", {
        category: LogCategory.GENERAL,
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Merge data from the Playwright scraper into the result.
 * Scraper data takes priority over URL-extracted data.
 */
function mergeScrapedData(
  scraped: Record<string, unknown>,
  result: BazarakiListing
): void {
  if (scraped.title && typeof scraped.title === "string") {
    result.title = scraped.title;
  }
  if (scraped.price && typeof scraped.price === "number" && scraped.price > 0) {
    result.price = scraped.price;
    result.currency = "EUR";
  }
  if (
    scraped.location &&
    typeof scraped.location === "string" &&
    !scraped.location.toLowerCase().includes("all adverts")
  ) {
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
  // Images — collect but the handler will strip them (CDN blocks external access)
  if (Array.isArray(scraped.imageUrls)) {
    result.imageUrls = scraped.imageUrls.filter(
      (u): u is string => typeof u === "string" && u.startsWith("http")
    );
  }
  // Features — merge scraped features + extra fields into features list
  if (Array.isArray(scraped.features)) {
    result.features = scraped.features.filter(
      (f): f is string => typeof f === "string" && f.length > 0
    );
  }
  // Add structured fields as features so the AI can see them
  if (scraped.condition && typeof scraped.condition === "string") {
    result.features.push(`condition: ${scraped.condition}`);
  }
  if (scraped.parking && typeof scraped.parking === "string") {
    result.features.push(`parking: ${scraped.parking}`);
  }
  if (scraped.airConditioning && typeof scraped.airConditioning === "string") {
    result.features.push(`air conditioning: ${scraped.airConditioning}`);
  }
  if (scraped.furnishing && typeof scraped.furnishing === "string") {
    result.features.push(`furnishing: ${scraped.furnishing}`);
  }
  if (scraped.energyClass && typeof scraped.energyClass === "string") {
    result.features.push(`energy class: ${scraped.energyClass}`);
  }
  if (scraped.yearBuilt && typeof scraped.yearBuilt === "number") {
    result.features.push(`built: ${scraped.yearBuilt}`);
  }
}

/**
 * Extract data from the Bazaraki URL pattern.
 * Typical format: https://www.bazaraki.com/adv/12345678_3-bedroom-house-for-sale-in-paphos/
 */
function extractFromUrl(url: string, result: BazarakiListing): void {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();

    // Extract listing type
    if (
      path.includes("-for-sale") ||
      path.includes("/sale/") ||
      path.includes("-sale-")
    ) {
      result.listingType = "sale";
    } else if (
      path.includes("-for-rent") ||
      path.includes("/rent/") ||
      path.includes("-rent-")
    ) {
      result.listingType = "rent";
    }

    // Extract bedrooms from URL slug
    const bedroomMatch = path.match(/(\d+)-bedroom/);
    if (bedroomMatch) {
      result.bedrooms = Number.parseInt(bedroomMatch[1], 10);
    }
    // Studio detection
    if (path.includes("studio")) {
      result.bedrooms = 0;
      result.propertyType = "studio";
    }

    // Extract property type from URL (order matters — specific before general)
    const typePatterns: Array<[RegExp, string]> = [
      [/villa/, "villa"],
      [/apartment/, "apartment"],
      [/penthouse/, "penthouse"],
      [/maisonette/, "maisonette"],
      [/bungalow/, "bungalow"],
      [/townhouse/, "townhouse"],
      [/semi-detached/, "semi-detached"],
      [/detached/, "detached house"],
      [/house/, "house"],
    ];

    for (const [pattern, type] of typePatterns) {
      if (pattern.test(path)) {
        result.propertyType = type;
        break;
      }
    }

    // Extract location from URL slug (last part after "in-")
    const locationMatch = path.match(/-in-([a-z-]+)\/?$/);
    if (locationMatch) {
      result.location = locationMatch[1]
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  } catch {
    // URL parsing failed — non-critical
  }
}

/**
 * Check if a URL is a Bazaraki listing
 */
export function isBazarakiUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname.includes("bazaraki.com") ||
      urlObj.hostname.includes("bazaraki.cy")
    );
  } catch {
    return false;
  }
}

/**
 * Format extracted Bazaraki data as a summary for the AI to use.
 */
export function formatBazarakiSummary(listing: BazarakiListing): string {
  const parts: string[] = [];

  parts.push(
    `Source: Bazaraki (${listing.source === "html" ? "full scrape" : "URL pattern only"})`
  );

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
  // Do NOT mention Bazaraki images — they can't be used and mentioning them confuses agents.

  if (listing.warnings.length > 0) {
    parts.push(
      `\nWarnings:\n${listing.warnings.map((w) => `- ${w}`).join("\n")}`
    );
  }

  // List fields that could NOT be extracted — the AI should check the agent's
  // message for these before asking again (the prompt already instructs this).
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
