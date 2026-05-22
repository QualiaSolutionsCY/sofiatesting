/**
 * Bank Listing Scraper
 *
 * Extracts property data from the four bank / REO marketplaces Zyprus works with:
 *   - ALTIA      (marketplace.altia.com.cy)
 *   - ALTAMIRA   (altamirarealestate.com.cy)
 *   - REMU       (remuproperties.com)
 *   - GOGORDIAN  (gogordian.com)
 *
 * Two-phase approach (mirrors bazaraki-scraper):
 *   1. Direct fetch + HTML parse — works for Altamira & Gogordian (server-rendered).
 *   2. Fall back to the Railway Playwright service `/render` endpoint for sites
 *      protected by a WAF (Altia & Remu return an F5 "Request Rejected" page to
 *      plain server fetches).
 *
 * This tool is ADMIN-ONLY — the handler gates it on agent.canUpload (Lauren / Fawzi).
 */

import { LogCategory, logger } from "../utils/logger.ts";

export type BankId = "Altia" | "Altamira" | "Remu" | "Gogordian";

export interface BankListing {
  url: string;
  bank: BankId;
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
  coveredVeranda?: number;
  uncoveredVeranda?: number;
  yearBuilt?: number;
  energyClass?: string;
  registrationNumber?: string;
  description?: string;
  imageUrls: string[];
  features: string[];
  source: "html" | "rendered" | "partial";
  warnings: string[];
}

interface BankConfig {
  id: BankId;
  hosts: string[];
  /** WAF-protected — a plain server fetch is blocked, needs a real browser. */
  needsBrowser: boolean;
}

const BANKS: BankConfig[] = [
  { id: "Altia", hosts: ["altia.com.cy"], needsBrowser: true },
  { id: "Altamira", hosts: ["altamirarealestate.com.cy"], needsBrowser: false },
  { id: "Remu", hosts: ["remuproperties.com"], needsBrowser: true },
  { id: "Gogordian", hosts: ["gogordian.com"], needsBrowser: false },
];

const MAX_IMAGES = 40;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Identify which bank a URL belongs to (null if none of the four).
 */
export function detectBank(url: string): BankId | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const bank of BANKS) {
      if (bank.hosts.some((h) => host.includes(h))) {
        return bank.id;
      }
    }
  } catch {
    // invalid URL
  }
  return null;
}

/**
 * Check if a URL is one of the four supported bank listing sites.
 */
export function isBankUrl(url: string): boolean {
  return detectBank(url) !== null;
}

/**
 * Main entry point: extract property data from a bank listing URL.
 */
export async function extractFromBank(url: string): Promise<BankListing> {
  const bankId = detectBank(url);
  const result: BankListing = {
    url,
    bank: bankId ?? "Altia",
    imageUrls: [],
    features: [],
    source: "partial",
    warnings: [],
  };

  if (!bankId) {
    result.warnings.push("URL is not a recognised bank listing site.");
    return result;
  }

  const config = BANKS.find((b) => b.id === bankId)!;
  const { html, rendered } = await fetchListingHtml(url, config, result);

  if (!html) {
    result.warnings.push(
      "Could not load the listing page. Please provide the property details directly.",
    );
    return result;
  }

  try {
    parseHtml(bankId, html, url, result);
    result.source = rendered ? "rendered" : "html";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Bank parse failed for ${bankId}: ${msg}`, {
      category: LogCategory.GENERAL,
    });
    result.warnings.push("Some details could not be parsed from the listing.");
  }

  return result;
}

/**
 * Fetch the listing HTML — direct fetch first, render service fallback.
 */
async function fetchListingHtml(
  url: string,
  config: BankConfig,
  result: BankListing,
): Promise<{ html: string | null; rendered: boolean }> {
  // Phase 1: direct fetch (works for non-WAF sites: Altamira, Gogordian)
  const direct = await directFetch(url);
  if (direct && !isBlockedPage(direct)) {
    return { html: direct, rendered: false };
  }

  if (direct && isBlockedPage(direct)) {
    logger.info(`${config.id}: direct fetch blocked by WAF, trying render service`, {
      category: LogCategory.GENERAL,
    });
  }

  // Phase 2: Railway Playwright render service (for WAF-protected: Altia, Remu)
  const rendered = await renderViaService(url);
  if (rendered && !isBlockedPage(rendered)) {
    return { html: rendered, rendered: true };
  }

  if (!direct && !rendered) {
    result.warnings.push(
      "The render service is unavailable — could not bypass the site's bot protection.",
    );
  } else {
    result.warnings.push(
      "The bank site blocked automated access to this listing.",
    );
  }

  // Nothing usable — both the direct fetch and the render service were blocked.
  return { html: null, rendered: false };
}

/**
 * Plain server-side fetch with browser-like headers.
 */
async function directFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok && response.status !== 403 && response.status !== 503) {
      return null;
    }
    return await response.text();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.info(`Bank direct fetch failed: ${msg}`, {
      category: LogCategory.GENERAL,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call the Railway Playwright service `/render` endpoint to get fully
 * browser-rendered HTML (bypasses Cloudflare / F5 WAF challenges).
 * Reuses the same Railway service as the Bazaraki scraper.
 */
async function renderViaService(url: string): Promise<string | null> {
  const scraperUrl = Deno.env.get("BAZARAKI_SCRAPER_URL");
  const scraperSecret = Deno.env.get("BAZARAKI_SCRAPER_SECRET");
  if (!scraperUrl) {
    logger.warn("BANK SCRAPER: render service URL not configured", {
      category: LogCategory.GENERAL,
    });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const endpoint = scraperUrl.startsWith("http")
      ? scraperUrl
      : `https://${scraperUrl}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (scraperSecret) headers["X-Scraper-Secret"] = scraperSecret;

    const response = await fetch(`${endpoint}/render`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.info(`Bank render service returned ${response.status}`, {
        category: LogCategory.GENERAL,
      });
      return null;
    }
    const json = await response.json();
    if (json.success && typeof json.html === "string") {
      return json.html;
    }
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.info(`Bank render service failed: ${msg}`, {
      category: LogCategory.GENERAL,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Detect a WAF / bot-protection block page rather than the real listing.
 */
function isBlockedPage(html: string): boolean {
  if (!html || html.length < 600) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes("request rejected") ||
    lower.includes("checking your browser") ||
    lower.includes("security service to protect itself") ||
    (lower.includes("access denied") && html.length < 3000)
  );
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
// ---------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&euro;/gi, "€")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)));
}

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse an integer out of a messy string, dropping thousands separators.
 * "220,000" -> 220000, "2.342 m²" -> 2342, "171 m2" -> 171
 */
function parseInteger(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const match = s.replace(/&nbsp;/gi, " ").match(/\d[\d.,\s]*/);
  if (!match) return undefined;
  const digits = match[0].replace(/[.,\s]/g, "");
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function absoluteUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
    "i",
  );
  const tag = html.match(re)?.[0];
  if (!tag) return undefined;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content).trim() : undefined;
}

/** Sort image URLs by their trailing "_NN." sequence number, ascending. */
function sortImagesBySequence(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const na = Number.parseInt(a.match(/_(\d+)\.[a-z]+($|\?)/i)?.[1] ?? "0", 10);
    const nb = Number.parseInt(b.match(/_(\d+)\.[a-z]+($|\?)/i)?.[1] ?? "0", 10);
    return na - nb;
  });
}

function extractEnergyClass(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const m = s.match(/(?:energy\s*class|class|epc)\s*[:\-]?\s*([A-G][+]?)\b/i) ||
    s.match(/\b([A-G])\b/);
  return m ? m[1].toUpperCase() : undefined;
}

// ---------------------------------------------------------------------------
// Per-bank parsers
// ---------------------------------------------------------------------------

function parseHtml(
  bank: BankId,
  html: string,
  url: string,
  result: BankListing,
): void {
  switch (bank) {
    case "Altamira":
      parseAltamira(html, url, result);
      break;
    case "Gogordian":
      parseGogordian(html, url, result);
      break;
    default:
      // Altia & Remu: generic structured-data extraction on rendered HTML.
      parseGeneric(html, url, result);
      break;
  }
  // Generic enrichment fills any gaps a dedicated parser left behind.
  enrichFromMeta(html, url, result);
  capListing(result);
}

/**
 * Altamira — server-rendered, exposes clean hidden form inputs.
 */
function parseAltamira(html: string, url: string, result: BankListing): void {
  const inputs = collectHiddenInputs(html);

  result.bedrooms = parseInteger(inputs.dormitorios) ?? result.bedrooms;
  result.bathrooms = parseInteger(inputs.nbanos) ?? result.bathrooms;
  result.coveredArea = parseInteger(inputs.metros) ?? result.coveredArea;
  result.price = parseInteger(inputs.precio) ?? result.price;
  if (result.price) result.currency = "EUR";

  result.propertyType = (inputs.tipoInmueble || inputs.tipologiaDescripcion ||
    result.propertyType)?.trim();

  const gestion = (inputs.gestionTipo || "").toLowerCase();
  if (gestion.includes("rent")) result.listingType = "rent";
  else if (gestion.includes("sale")) result.listingType = "sale";

  const town = (inputs.poblacion || "").trim();
  const province = (inputs.provincia || "").trim();
  const loc = [town, province].filter(Boolean).join(", ");
  if (loc) result.location = loc;

  if (inputs.referenciaDirecta) {
    result.features.push(`bank ref: ${inputs.referenciaDirecta.trim()}`);
  }

  // Plot size — <li class="superf_land">2,342 m<sup>2</sup> Land</li>
  const plotMatch = html.match(/class="superf_land"[^>]*>([\d.,\s]+)/i);
  if (plotMatch) result.plotSize = parseInteger(plotMatch[1]);

  // Year built — "Year built:&nbsp;2005"
  const yearMatch = html.match(/Year built:\s*(?:&nbsp;|\s)*((?:19|20)\d{2})/i);
  if (yearMatch) result.yearBuilt = Number.parseInt(yearMatch[1], 10);

  // Registration number — <td class="regnumber">0/8216</td>
  const regMatch = html.match(/<td[^>]*class="regnumber"[^>]*>([^<]+)<\/td>/i);
  if (regMatch) result.registrationNumber = regMatch[1].trim();

  // Description — <section class="descripcion">...</section>
  const descMatch = html.match(/<section[^>]*class="[^"]*descripcion[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  if (descMatch) {
    const desc = stripTags(descMatch[1]);
    if (desc.length > 20) result.description = desc;
  }

  // Services & facilities — items with class "nodisp" are NOT present, skip them.
  const servSection =
    html.match(/<ul id="servs_instal_ul"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? "";
  for (const m of servSection.matchAll(/<li class="([^"]*)"[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (/\bnodisp\b/i.test(m[1])) continue;
    const raw = stripTags(m[2]);
    // The veranda <li> also carries its size, e.g. "Veranda : 17 m2 Covered".
    if (/veranda/i.test(raw)) {
      const size = parseInteger(raw);
      if (size) {
        if (/uncovered/i.test(raw)) result.uncoveredVeranda = size;
        else result.coveredVeranda = size;
      }
    }
    const feat = raw.toLowerCase().replace(/\s*:.*$/, "").trim();
    if (feat && feat.length < 40) result.features.push(feat);
  }

  // Images — restrict to this property's id (CInmueble) so the "similar
  // properties" carousel on the page does not leak in.
  const cId = inputs.CInmueble || url.match(/\/(\d{4,})\/\d+\/?$/)?.[1];
  const altamiraPattern = cId
    ? new RegExp(
      `/estaticos/[^"'\\s)]*/grandes/\\d+/${cId}_\\d+\\.(?:jpe?g|png|webp)`,
      "gi",
    )
    : /\/estaticos\/[^"'\s)]*\/grandes\/[^"'\s)]+\.(?:jpe?g|png|webp)/gi;
  collectImagesByPattern(html, url, altamiraPattern, result);
}

/**
 * Gogordian — server-rendered, uses lab/val "moreFeat" blocks.
 */
function parseGogordian(html: string, url: string, result: BankListing): void {
  const fields = collectLabelValuePairs(html);

  result.coveredArea = parseInteger(fields["covered area"]) ?? result.coveredArea;
  result.plotSize = parseInteger(fields["land area"]) ?? result.plotSize;
  result.coveredVeranda = parseInteger(fields["covered verandas"]) ??
    result.coveredVeranda;
  result.uncoveredVeranda = parseInteger(fields["uncovered verandas"]) ??
    result.uncoveredVeranda;
  result.bedrooms = parseInteger(fields["rooms"]) ?? result.bedrooms;
  result.bathrooms = parseInteger(fields["baths"]) ?? result.bathrooms;
  result.yearBuilt = parseInteger(fields["year of construction"]) ??
    result.yearBuilt;
  result.energyClass = extractEnergyClass(fields["epc"]) ?? result.energyClass;
  if (fields["reg. no."]) result.registrationNumber = fields["reg. no."].trim();

  const district = (fields["district"] || "").trim();
  const community = (fields["municipality/community"] || "").trim();
  const loc = [community, district].filter(Boolean).join(", ");
  if (loc) result.location = loc;

  const status = (fields["status"] || "").toLowerCase();
  if (status.includes("rent")) result.listingType = "rent";
  else if (status.includes("sale")) result.listingType = "sale";

  // Price — <span class="precio">€ 165,000</span>
  const priceMatch = html.match(/class="precio"[^>]*>\s*€?\s*([\d.,]+)/i);
  if (priceMatch) {
    result.price = parseInteger(priceMatch[1]);
    if (result.price) result.currency = "EUR";
  }

  // Bedroom / bath fallback from "<span class="textFeat">3 Rooms</span>"
  for (const m of html.matchAll(/class="textFeat"[^>]*>([^<]+)</gi)) {
    const txt = m[1].toLowerCase();
    if (!result.bedrooms && txt.includes("room")) {
      result.bedrooms = parseInteger(txt);
    }
    if (!result.bathrooms && (txt.includes("bath"))) {
      result.bathrooms = parseInteger(txt);
    }
  }

  // Description — <div class="... descripcion ...">...<div class="cuerpo">TEXT</div>
  const descMatch = html.match(/class="cuerpo"[^>]*>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    const desc = stripTags(descMatch[1]);
    if (desc.length > 20) result.description = desc;
  }

  // Images — restrict to this property's id so "similar properties" on the
  // same page do not leak in. Gogordian listing IDs end the URL (…-8885).
  const gId = collectHiddenInputs(html).idInmueble ||
    url.match(/-(\d+)\/?(?:[?#]|$)/)?.[1];
  const gogordianPattern = gId
    ? new RegExp(
      `/inmuebles/fotos/grandes/\\d+/${gId}_\\d+\\.(?:jpe?g|png|webp)`,
      "gi",
    )
    : /\/inmuebles\/fotos\/grandes\/[^"'\s)]+\.(?:jpe?g|png|webp)/gi;
  collectImagesByPattern(html, url, gogordianPattern, result);
}

/**
 * Generic structured-data parser — used for Altia & Remu (rendered HTML)
 * and as a fallback. Relies on og: tags, JSON-LD and labelled text.
 */
function parseGeneric(html: string, url: string, result: BankListing): void {
  const text = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  );

  // Bedrooms / bathrooms from labelled text
  result.bedrooms = result.bedrooms ??
    parseInteger(text.match(/(\d+)\s*(?:bedroom|bed\b)/i)?.[0]);
  result.bathrooms = result.bathrooms ??
    parseInteger(text.match(/(\d+)\s*(?:bathroom|bath\b|wc\b)/i)?.[0]);

  const coveredMatch = text.match(
    /(?:covered area|internal area|indoor area|net area|property area|enclosed area)\D{0,12}?([\d.,]+)\s*(?:m²|m2|sqm|m\b)/i,
  );
  if (coveredMatch) result.coveredArea = result.coveredArea ?? parseInteger(coveredMatch[1]);

  const plotMatch = text.match(
    /(?:plot|land area|land size|plot size)\D{0,12}?([\d.,]+)\s*(?:m²|m2|sqm|m\b)/i,
  );
  if (plotMatch) result.plotSize = result.plotSize ?? parseInteger(plotMatch[1]);

  const priceMatch = text.match(/€\s*([\d][\d.,]{3,})/);
  if (priceMatch) {
    result.price = result.price ?? parseInteger(priceMatch[1]);
    if (result.price) result.currency = "EUR";
  }

  const yearMatch = text.match(/(?:year built|construction year|year of construction)\D{0,6}((?:19|20)\d{2})/i);
  if (yearMatch) result.yearBuilt = result.yearBuilt ?? Number.parseInt(yearMatch[1], 10);

  result.energyClass = result.energyClass ??
    extractEnergyClass(text.match(/energy\s*class\s*[:\-]?\s*[A-G][+]?/i)?.[0]);

  const lower = (url + " " + text.slice(0, 400)).toLowerCase();
  if (!result.listingType) {
    if (lower.includes("for rent") || lower.includes("/rent")) {
      result.listingType = "rent";
    } else if (lower.includes("for sale") || lower.includes("/sale")) {
      result.listingType = "sale";
    }
  }

  // Images — every <img> plus og:image
  collectAllImages(html, url, result);
}

/**
 * Fill remaining gaps from JSON-LD and Open Graph tags (all four banks).
 */
function enrichFromMeta(html: string, url: string, result: BankListing): void {
  if (!result.title) {
    const og = metaContent(html, "og:title");
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    result.title = (og || (h1 ? stripTags(h1) : undefined))?.trim();
  }

  if (!result.description) {
    const ogDesc = metaContent(html, "og:description");
    if (ogDesc && ogDesc.length > 30) result.description = ogDesc;
  }

  // JSON-LD
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const raw = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const json = JSON.parse(raw);
      const offer = json?.about ?? json;
      if (!result.propertyType && typeof offer?.category === "string") {
        result.propertyType = offer.category;
      }
      const region = offer?.availableAtOrFrom?.address?.addressRegion;
      const locality = offer?.availableAtOrFrom?.address?.addressLocality;
      if (!result.location) {
        const loc = [locality, region].filter(Boolean).join(", ");
        if (loc) result.location = loc;
      }
    } catch {
      // malformed JSON-LD — ignore
    }
  }

  // Primary og:image as a last-resort image
  if (result.imageUrls.length === 0) {
    const ogImg = metaContent(html, "og:image") ||
      metaContent(html, "og:image:secure_url");
    if (ogImg) result.imageUrls.push(absoluteUrl(ogImg, url));
  }
}

function capListing(result: BankListing): void {
  if (result.description && result.description.length > 2000) {
    result.description = result.description.slice(0, 2000).trim();
  }
  // Dedupe + cap features
  result.features = [...new Set(result.features.map((f) => f.trim()))]
    .filter((f) => f.length > 0)
    .slice(0, 30);
  result.imageUrls = result.imageUrls.slice(0, MAX_IMAGES);
}

// ---------------------------------------------------------------------------
// Shared extraction primitives
// ---------------------------------------------------------------------------

/** name -> value map of every <input type="hidden"> on the page. */
function collectHiddenInputs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/type=["']hidden["']/i.test(tag)) continue;
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1];
    if (name && value && !(name in out)) {
      out[name] = decodeEntities(value);
    }
  }
  return out;
}

/** Lowercased label -> value map from "<div class=lab>L</div><div class=val>V</div>". */
function collectLabelValuePairs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /<div[^>]*class="[^"]*\blab\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*\bval\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const label = stripTags(m[1]).toLowerCase();
    const value = stripTags(m[2]);
    if (label && value && !(label in out)) out[label] = value;
  }
  return out;
}

/** Collect image URLs matching a site-specific path pattern. */
function collectImagesByPattern(
  html: string,
  base: string,
  pattern: RegExp,
  result: BankListing,
): void {
  const seen = new Set<string>();
  for (const m of html.matchAll(pattern)) {
    const abs = absoluteUrl(m[0], base);
    if (!seen.has(abs)) seen.add(abs);
  }
  if (seen.size > 0) {
    result.imageUrls = sortImagesBySequence([...seen]);
  }
}

/** Collect every <img> on the page, filtering UI chrome. */
function collectAllImages(
  html: string,
  base: string,
  result: BankListing,
): void {
  const seen = new Set<string>(result.imageUrls);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bdata-lazy=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const low = src.toLowerCase();
    if (
      low.endsWith(".svg") ||
      low.includes("logo") ||
      low.includes("icon") ||
      low.includes("avatar") ||
      low.includes("flag") ||
      low.includes("placeholder") ||
      low.startsWith("data:")
    ) {
      continue;
    }
    const abs = absoluteUrl(src, base);
    if (!seen.has(abs)) seen.add(abs);
  }
  result.imageUrls = [...seen];
}

/**
 * Format extracted bank data as a summary for the AI to process.
 */
export function formatBankSummary(listing: BankListing): string {
  const parts: string[] = [];
  parts.push(
    `Source: ${listing.bank} bank listing (${
      listing.source === "partial" ? "limited data" : "full extract"
    })`,
  );
  if (listing.title) parts.push(`Title: ${listing.title}`);
  if (listing.propertyType) parts.push(`Type: ${listing.propertyType}`);
  if (listing.listingType) parts.push(`For: ${listing.listingType}`);
  if (listing.price) parts.push(`Price: €${listing.price.toLocaleString()}`);
  if (listing.location) parts.push(`Location: ${listing.location}`);
  if (listing.bedrooms !== undefined) parts.push(`Bedrooms: ${listing.bedrooms}`);
  if (listing.bathrooms) parts.push(`Bathrooms: ${listing.bathrooms}`);
  if (listing.coveredArea) parts.push(`Covered area: ${listing.coveredArea} m²`);
  if (listing.plotSize) parts.push(`Plot size: ${listing.plotSize} m²`);
  if (listing.coveredVeranda) {
    parts.push(`Covered veranda: ${listing.coveredVeranda} m²`);
  }
  if (listing.uncoveredVeranda) {
    parts.push(`Uncovered veranda: ${listing.uncoveredVeranda} m²`);
  }
  if (listing.yearBuilt) parts.push(`Year built: ${listing.yearBuilt}`);
  if (listing.energyClass) parts.push(`Energy class: ${listing.energyClass}`);
  if (listing.registrationNumber) {
    parts.push(`Registration number: ${listing.registrationNumber}`);
  }
  if (listing.description) parts.push(`Description: ${listing.description}`);
  if (listing.features.length > 0) {
    parts.push(`Features: ${listing.features.join(", ")}`);
  }
  parts.push(`Photos found: ${listing.imageUrls.length}`);

  if (listing.warnings.length > 0) {
    parts.push(`\nWarnings:\n${listing.warnings.map((w) => `- ${w}`).join("\n")}`);
  }

  const missing: string[] = [];
  if (!listing.price) missing.push("Price");
  if (!listing.coveredArea) missing.push("Covered area (m²)");
  if (!listing.location) missing.push("Location");
  if (!listing.bedrooms && listing.bedrooms !== 0) missing.push("Bedrooms");
  if (missing.length > 0) {
    parts.push(
      `\nCould not extract: ${missing.join(", ")}. ` +
        `Ask the agent for any details still missing before uploading.`,
    );
  }

  return parts.join("\n");
}
