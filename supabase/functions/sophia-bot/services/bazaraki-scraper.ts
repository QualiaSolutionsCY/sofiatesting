/**
 * Bazaraki Listing Scraper
 *
 * Extracts property details from Bazaraki listing URLs.
 * Two-phase approach:
 *   1. Try HTML fetch + parse (may fail due to Cloudflare)
 *   2. Fall back to URL pattern extraction
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

  // Phase 1: Extract what we can from URL structure
  extractFromUrl(url, result);

  // Phase 2: Try fetching the HTML page
  try {
    const html = await fetchBazarakiPage(url);
    if (html) {
      extractFromHtml(html, result);
      result.source = result.title ? "html" : "partial";
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Bazaraki HTML fetch failed: ${msg}`, {
      category: LogCategory.GENERAL,
    });
    result.warnings.push(
      "Could not fully scrape listing page (Cloudflare protection). Data extracted from URL pattern only."
    );
  }

  // Always warn about Bazaraki watermarks on images
  if (result.imageUrls.length > 0) {
    result.warnings.push(
      "Images from Bazaraki may have watermarks. Consider requesting original photos from the owner."
    );
  }

  return result;
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

    // Extract property type from URL
    const typePatterns: Array<[RegExp, string]> = [
      [/villa/, "villa"],
      [/apartment/, "apartment"],
      [/house/, "house"],
      [/penthouse/, "penthouse"],
      [/maisonette/, "maisonette"],
      [/bungalow/, "bungalow"],
      [/townhouse/, "townhouse"],
      [/detached/, "detached house"],
      [/semi-detached/, "semi-detached"],
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
 * Attempt to fetch the Bazaraki page HTML.
 * Returns null if blocked (403/503) or fails.
 */
async function fetchBazarakiPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.info(`Bazaraki returned ${response.status}`, {
        category: LogCategory.GENERAL,
      });
      return null;
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.info("Bazaraki fetch timed out", {
        category: LogCategory.GENERAL,
      });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract structured data from Bazaraki HTML.
 * Uses regex-based extraction (no DOM parser in Deno edge functions).
 * Selectors based on common Bazaraki page patterns.
 */
function extractFromHtml(html: string, result: BazarakiListing): void {
  // Extract title from <h1> or og:title
  const titleMatch =
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Extract price
  const priceMatch =
    html.match(/data-price="(\d+)"/i) ||
    html.match(/class="[^"]*price[^"]*"[^>]*>[\s€]*([0-9,.]+)/i) ||
    html.match(/€\s*([0-9,.]+)/);
  if (priceMatch) {
    result.price = Number.parseInt(priceMatch[1].replace(/[,.]/g, ""), 10);
    result.currency = "EUR";
  }

  // Extract description from og:description or content area
  const descMatch = html.match(
    /<meta\s+property="og:description"\s+content="([^"]+)"/i
  );
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  // Extract images from og:image and gallery
  const imageMatches = html.matchAll(
    /<meta\s+property="og:image"\s+content="([^"]+)"/gi
  );
  for (const match of imageMatches) {
    if (!result.imageUrls.includes(match[1])) {
      result.imageUrls.push(match[1]);
    }
  }

  // Also try to find gallery images
  const galleryMatches = html.matchAll(
    /data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
  );
  for (const match of galleryMatches) {
    if (!result.imageUrls.includes(match[1])) {
      result.imageUrls.push(match[1]);
    }
  }

  // Extract area (sqm)
  const areaMatch = html.match(/(\d+)\s*(?:m²|sq\.?\s*m|sqm)/i);
  if (areaMatch) {
    result.coveredArea = Number.parseInt(areaMatch[1], 10);
  }

  // Extract bathrooms
  const bathMatch = html.match(/(\d+)\s*(?:bathroom|bath)/i);
  if (bathMatch && !result.bathrooms) {
    result.bathrooms = Number.parseInt(bathMatch[1], 10);
  }

  // Extract bedrooms (supplement URL data)
  const bedMatch = html.match(/(\d+)\s*(?:bedroom|bed)/i);
  if (bedMatch && !result.bedrooms) {
    result.bedrooms = Number.parseInt(bedMatch[1], 10);
  }

  // Extract location from breadcrumbs or data attributes
  const locationMatch =
    html.match(/data-location="([^"]+)"/i) ||
    html.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([^<]+)/i);
  if (locationMatch && !result.location) {
    result.location = locationMatch[1].trim();
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
  if (listing.imageUrls.length > 0)
    parts.push(`Images found: ${listing.imageUrls.length}`);

  if (listing.warnings.length > 0) {
    parts.push(
      `\nWarnings:\n${listing.warnings.map((w) => `- ${w}`).join("\n")}`
    );
  }

  parts.push(
    "\nStill needed from agent: Owner name, Owner phone, Title deed status, Confirmation of details"
  );

  return parts.join("\n");
}
