/**
 * Server-side regex parser for extracting property listing fields from email body text.
 *
 * This runs BEFORE the AI sees the email, so that pre-extracted values can be injected
 * into the prompt. This prevents the AI from hallucinating field values.
 */

import { LogCategory, logger } from "../utils/logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreExtractedFields {
  price?: number;
  location?: string;
  district?: string;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  listingType?: "sale" | "rent";
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  titleDeedStatus?: string;
  coveredArea?: number;
  uncoveredVeranda?: number;
  coveredVeranda?: number;
  plotSize?: number;
  locationUrl?: string;
  features?: string[];
  floor?: string;
  yearBuilt?: number;
  condition?: string;
  furnished?: string;
}

// ---------------------------------------------------------------------------
// Known Cyprus locations grouped by district
// ---------------------------------------------------------------------------

const REGION_LOCATIONS: Record<string, string[]> = {
  paphos: [
    "paphos", "pafos", "tala", "peyia", "chloraka", "kato paphos", "coral bay", "polis",
    "geroskipou", "pegeia", "kissonerga", "emba", "tremithousa", "mesa chorio",
    "kamares", "mandria", "kouklia", "letymvou", "tsada", "mesogi", "koloni",
    "universal", "anavargos", "konia", "tomb of kings", "sea caves",
    "kallepia", "peristerona", "letymbou", "letymvou", "stroumbi", "kathikas",
    "polemi", "choulou", "simou", "drouseia", "ineia", "arodes", "akourdaleia",
    "prodromi",
  ],
  limassol: [
    "limassol", "lemesos", "germasogeia", "agios tychonas", "potamos", "mesa geitonia",
    "zakaki", "columbia", "tourist area", "pareklisia", "pissouri", "erimi",
    "episkopi", "pyrgos", "parekklisia", "mouttagiaka", "agios athanasios",
    "trachoni", "panthea", "ypsonas", "kato polemidia", "polemidia", "agios nikolaos",
    "agia fyla", "omonia", "neapolis", "linopetra", "agios ioannis", "ayios tychonas",
    "neapoli", "agia zoni", "kapsalos", "enaerios", "pentadromos", "naafi",
  ],
  larnaca: [
    "larnaca", "larnaka", "oroklini", "pervolia", "livadia", "dekelia", "dhekelia",
    "kamares", "aradippou", "meneou", "dromolaxia", "kiti", "tersefanou", "perivolia",
    "chrysopolitissa", "pyla", "mosfiloti", "mosfilioti", "softades", "kivisili",
    "anglisides", "alethriko", "klavdia", "mazotos", "psematismenos",
  ],
  nicosia: [
    "nicosia", "lefkosia", "strovolos", "lakatamia", "engomi", "aglantzia",
    "dasoupoli", "makedonitissa", "kaimakli", "pallouriotissa", "latsia",
    "geri", "dali", "tseri", "kokkinotrimithia", "deftera", "acropolis",
  ],
  famagusta: [
    "famagusta", "ammochostos", "paralimni", "protaras", "ayia napa", "agia napa",
    "deryneia", "sotira", "frenaros", "liopetri", "xylofagou", "vrysoulles",
    "cape greco", "kapparis",
  ],
};

// District-level names (less specific — used only if no sub-area matched)
const DISTRICT_NAMES: Record<string, string[]> = {
  paphos: ["paphos", "pafos"],
  limassol: ["limassol", "lemesos"],
  larnaca: ["larnaca", "larnaka"],
  nicosia: ["nicosia", "lefkosia"],
  famagusta: ["famagusta", "ammochostos"],
};

// ---------------------------------------------------------------------------
// Known features to scan for
// ---------------------------------------------------------------------------

const KNOWN_FEATURES = [
  "private pool", "communal pool", "pool",
  "garden", "sea view", "mountain view",
  "air conditioning", "a/c", "central heating",
  "parking", "garage", "storeroom", "storage",
  "fireplace", "jacuzzi", "bbq",
  "photovoltaic", "solar", "cctv",
  "furnished", "electrical appliances",
  "elevator", "lift", "security system",
  "gym", "sauna",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a string for use in a RegExp */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a word-boundary pattern for a multi-word location name */
function locationRegex(name: string): RegExp {
  return new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
}

// ---------------------------------------------------------------------------
// Individual extractors
// ---------------------------------------------------------------------------

function extractPrice(text: string): number | undefined {
  // Million patterns: €1.5m, 1.5 million, €1,500,000
  const millionPatterns = [
    /€\s*(\d+(?:\.\d+)?)\s*m(?:illion)?/i,
    /(\d+(?:\.\d+)?)\s*m(?:illion)?\s*(?:eur(?:os?)?)/i,
    /(\d+(?:\.\d+)?)\s*million/i,
  ];
  for (const re of millionPatterns) {
    const m = text.match(re);
    if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  }

  // K patterns: €250k, 250K
  const kPatterns = [
    /€\s*(\d+(?:\.\d+)?)\s*k\b/i,
    /(\d+(?:\.\d+)?)\s*k\s*(?:eur(?:os?)?)/i,
  ];
  for (const re of kPatterns) {
    const m = text.match(re);
    if (m) return Math.round(parseFloat(m[1]) * 1_000);
  }

  // Full number patterns: €250,000 / €250.000 / 250,000 EUR / 250000 euros
  const fullPatterns = [
    /€\s*([\d]{1,3}(?:[,.][\d]{3})+)/,
    /€\s*(\d{4,})/,
    /([\d]{1,3}(?:[,.][\d]{3})+)\s*(?:eur(?:os?)?)/i,
    /(\d{4,})\s*(?:eur(?:os?)?)/i,
  ];
  for (const re of fullPatterns) {
    const m = text.match(re);
    if (m) {
      const cleaned = m[1].replace(/[,.\s]/g, "");
      const val = parseInt(cleaned, 10);
      if (val >= 1000 && val <= 100_000_000) return val;
    }
  }

  return undefined;
}

function extractLocation(text: string): { location?: string; district?: string } {
  // Try most-specific (longest) names first
  const allLocations: { name: string; district: string; len: number }[] = [];

  for (const [district, names] of Object.entries(REGION_LOCATIONS)) {
    for (const name of names) {
      allLocations.push({ name, district, len: name.length });
    }
  }
  // Sort by length DESC so more-specific matches come first
  allLocations.sort((a, b) => b.len - a.len);

  let bestMatch: { name: string; district: string } | undefined;

  for (const loc of allLocations) {
    if (locationRegex(loc.name).test(text)) {
      bestMatch = loc;
      break;
    }
  }

  if (!bestMatch) return {};

  // Capitalise the location name nicely
  const displayName = bestMatch.name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const districtDisplay =
    bestMatch.district.charAt(0).toUpperCase() + bestMatch.district.slice(1);

  // If the matched name IS the district-level name, just return district
  const isDistrictLevel = DISTRICT_NAMES[bestMatch.district]?.some(
    (d) => d.toLowerCase() === bestMatch!.name.toLowerCase(),
  );

  const location = isDistrictLevel
    ? districtDisplay
    : `${displayName}, ${districtDisplay}`;

  return { location, district: bestMatch.district };
}

function extractBedrooms(text: string): number | undefined {
  if (/\bstudio\b/i.test(text)) return 0;

  const wordMap: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  };
  const wordPat = new RegExp(
    `\\b(${Object.keys(wordMap).join("|")})\\s*(?:-\\s*)?(?:bed(?:room)?s?)\\b`,
    "i",
  );
  const wm = text.match(wordPat);
  if (wm) return wordMap[wm[1].toLowerCase()];

  const numPat = /(\d+)\s*(?:-\s*)?(?:bed(?:room)?s?|br)\b/i;
  const nm = text.match(numPat);
  if (nm) return parseInt(nm[1], 10);

  return undefined;
}

function extractBathrooms(text: string): number | undefined {
  const numPat = /(\d+)\s*(?:-\s*)?(?:bath(?:room)?s?|wc)\b/i;
  const m = text.match(numPat);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

function extractPropertyType(text: string): string | undefined {
  const types = [
    "residential building", "semi-detached", "detached house", "town house", "townhouse",
    "penthouse", "maisonette", "bungalow", "apartment", "warehouse", "building",
    "duplex", "office", "house", "villa", "studio", "shop",
  ];
  for (const t of types) {
    const re = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
    if (re.test(text)) return t.toLowerCase();
  }
  return undefined;
}

function extractListingType(text: string): "sale" | "rent" | undefined {
  if (/\b(?:for\s+sale|selling)\b/i.test(text)) return "sale";
  if (/\b(?:for\s+rent|to\s+let|to\s+rent|rental|renting)\b/i.test(text)) return "rent";
  // Bare "sale" only if not part of another word
  if (/\bsale\b/i.test(text)) return "sale";
  return undefined;
}

function extractOwnerPhone(text: string): string | undefined {
  // Cyprus mobile: optional +357 or 00357, then 9[4-7,9] followed by 6 digits
  const re =
    /(?:\+357|00357)?\s*9[4-79]\s*[\d\s-]{6,8}\d/g;
  const matches = text.match(re);
  if (!matches) return undefined;

  // Normalise: strip spaces, dashes, leading +357/00357
  const normalised = matches[0]
    .replace(/[\s-]/g, "")
    .replace(/^(?:\+357|00357)/, "");
  // Should be 8 digits starting with 9[4-79]
  if (/^9[4-79]\d{6}$/.test(normalised)) return normalised;
  return undefined;
}

function extractOwnerEmail(text: string): string | undefined {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const m = text.match(re);
  if (m) {
    // Skip common non-owner emails
    const skip = ["zyprus.com", "sophia", "noreply", "no-reply"];
    const email = m[0].toLowerCase();
    if (skip.some((s) => email.includes(s))) return undefined;
    return m[0];
  }
  return undefined;
}

function extractOwnerName(text: string): string | undefined {
  const patterns = [
    /(?:owner(?:\s+name)?|seller|contact)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }

  // Try: line with a name followed immediately by a Cyprus phone number
  const namePhonePat =
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*[-–:]?\s*(?:\+357|00357)?9[4-79][\d\s-]{6,8}\d/m;
  const np = text.match(namePhonePat);
  if (np) return np[1].trim();

  return undefined;
}

function extractTitleDeedStatus(text: string): string | undefined {
  if (/\bseparate\s+title\s+deed/i.test(text)) return "separate";
  if (/\btitle\s+deeds?\s+in\s+process/i.test(text)) return "in_process";
  if (/\bbeing\s+issued\b/i.test(text)) return "in_process";
  if (/\bfinal\s+approval\b/i.test(text)) return "final_approval";
  if (/\bpending\s+title\b/i.test(text)) return "pending";
  if (/\bno\s+title\s+deeds?\b/i.test(text)) return "permits_only";
  if (/\bpermits\s+only\b/i.test(text)) return "permits_only";
  return undefined;
}

function extractGoogleMapsUrl(text: string): string | undefined {
  const re =
    /https?:\/\/(?:(?:www\.)?google\.com\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s)>"']*/i;
  const m = text.match(re);
  return m ? m[0] : undefined;
}

function extractCoveredArea(text: string): number | undefined {
  // Specific label patterns
  const labelPats = [
    /(?:covered\s+area|net\s+indoor|indoor\s+area)\s*[:\-]?\s*(\d+)/i,
  ];
  for (const re of labelPats) {
    const m = text.match(re);
    if (m) return parseInt(m[1], 10);
  }

  // Generic sqm pattern (first occurrence — likely the main area)
  const sqmPat = /(\d+)\s*(?:sq\.?\s*m\.?|m[²2]|sqm)\b/i;
  const m = text.match(sqmPat);
  if (m) return parseInt(m[1], 10);

  return undefined;
}

function extractUncoveredVeranda(text: string): number | undefined {
  const re = /uncovered\s+verand(?:a|ah)\s*[:\-]?\s*(\d+)/i;
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractCoveredVeranda(text: string): number | undefined {
  const re = /covered\s+verand(?:a|ah)\s*[:\-]?\s*(\d+)/i;
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractPlotSize(text: string): number | undefined {
  const re = /(?:plot|land)\s*(?:size|area)?\s*[:\-]?\s*(\d+)\s*(?:sq\.?\s*m\.?|m[²2]|sqm)?\b/i;
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
}

function extractFeatures(text: string): string[] | undefined {
  const found: string[] = [];
  for (const feat of KNOWN_FEATURES) {
    const re = new RegExp(`\\b${escapeRegex(feat)}\\b`, "i");
    if (re.test(text)) {
      // Deduplicate: "pool" shouldn't be added if "private pool" or "communal pool" already matched
      if (feat === "pool" && found.some((f) => f.includes("pool"))) continue;
      if (feat === "a/c" && found.includes("air conditioning")) continue;
      if (feat === "lift" && found.includes("elevator")) continue;
      // "furnished" as a feature conflicts with the dedicated furnished field — skip here
      if (feat === "furnished") continue;
      found.push(feat);
    }
  }
  return found.length > 0 ? found : undefined;
}

function extractFloor(text: string): string | undefined {
  const re =
    /\b(ground\s+floor|1st\s+floor|2nd\s+floor|3rd\s+floor|4th\s+floor|5th\s+floor|top\s+floor|entire\s+floor)\b/i;
  const m = text.match(re);
  return m ? m[1].toLowerCase() : undefined;
}

function extractYearBuilt(text: string): number | undefined {
  const re = /\b(?:built\s+(?:in\s+)?|year\s+built\s*[:\-]?\s*|constructed\s+)(\d{4})\b/i;
  const m = text.match(re);
  if (m) {
    const yr = parseInt(m[1], 10);
    if (yr >= 1900 && yr <= 2030) return yr;
  }
  return undefined;
}

function extractCondition(text: string): string | undefined {
  const conditions: [RegExp, string][] = [
    [/\bunder\s+construction\b/i, "under construction"],
    [/\boff\s+plan\b/i, "off plan"],
    [/\bbrand\s+new\b/i, "brand new"],
    [/\bnew\s+condition\b/i, "new condition"],
    [/\bnewly\s+built\b/i, "newly built"],
    [/\bneeds?\s+renovation\b/i, "needs renovation"],
    [/\brenovated\b/i, "renovated"],
    [/\bresale\b/i, "resale"],
  ];
  for (const [re, label] of conditions) {
    if (re.test(text)) return label;
  }
  return undefined;
}

function extractFurnished(text: string): string | undefined {
  if (/\bfully\s+furnished\b/i.test(text)) return "fully furnished";
  if (/\bsemi[- ]furnished\b/i.test(text)) return "semi-furnished";
  if (/\bunfurnished\b/i.test(text)) return "unfurnished";
  if (/\bfurnished\b/i.test(text)) return "furnished";
  return undefined;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

export function parseEmailFields(
  body: string,
  subject: string,
): PreExtractedFields {
  const text = `${subject}\n${body}`;
  const fields: PreExtractedFields = {};

  fields.price = extractPrice(text);

  const loc = extractLocation(text);
  fields.location = loc.location;
  fields.district = loc.district;

  fields.bedrooms = extractBedrooms(text);
  fields.bathrooms = extractBathrooms(text);
  fields.propertyType = extractPropertyType(text);
  fields.listingType = extractListingType(text);
  fields.ownerName = extractOwnerName(text);
  fields.ownerPhone = extractOwnerPhone(text);
  fields.ownerEmail = extractOwnerEmail(text);
  fields.titleDeedStatus = extractTitleDeedStatus(text);
  fields.coveredArea = extractCoveredArea(text);
  fields.uncoveredVeranda = extractUncoveredVeranda(text);
  fields.coveredVeranda = extractCoveredVeranda(text);
  fields.plotSize = extractPlotSize(text);
  fields.locationUrl = extractGoogleMapsUrl(text);
  fields.features = extractFeatures(text);
  fields.floor = extractFloor(text);
  fields.yearBuilt = extractYearBuilt(text);
  fields.condition = extractCondition(text);
  fields.furnished = extractFurnished(text);

  // Strip undefined keys
  const cleaned: PreExtractedFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      (cleaned as Record<string, unknown>)[k] = v;
    }
  }

  const fieldCount = Object.keys(cleaned).length;
  logger.info(
    `Email parser extracted ${fieldCount} fields: ${Object.keys(cleaned).join(", ")}`,
    { category: LogCategory.GENERAL, fields: cleaned },
  );

  return cleaned;
}

// ---------------------------------------------------------------------------
// Format extracted fields into a prompt block
// ---------------------------------------------------------------------------

export function formatPreExtractedBlock(fields: PreExtractedFields): string {
  const entries = Object.entries(fields).filter(
    ([_, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return "";

  const lines: string[] = [
    "[PRE-EXTRACTED FIELDS — Use these values, do NOT re-extract from email]",
  ];

  const labelMap: Record<string, string> = {
    price: "Price",
    location: "Location",
    district: "District",
    bedrooms: "Bedrooms",
    bathrooms: "Bathrooms",
    propertyType: "Property Type",
    listingType: "Listing Type",
    ownerName: "Owner Name",
    ownerPhone: "Owner Phone",
    ownerEmail: "Owner Email",
    titleDeedStatus: "Title Deed Status",
    coveredArea: "Covered Area",
    uncoveredVeranda: "Uncovered Veranda",
    coveredVeranda: "Covered Veranda",
    plotSize: "Plot Size",
    locationUrl: "Google Maps URL",
    features: "Features",
    floor: "Floor",
    yearBuilt: "Year Built",
    condition: "Condition",
    furnished: "Furnished",
  };

  for (const [key, value] of entries) {
    const label = labelMap[key] || key;
    let display: string;

    if (key === "price") {
      display = `€${(value as number).toLocaleString("en-US")}`;
    } else if (key === "coveredArea" || key === "uncoveredVeranda" || key === "coveredVeranda" || key === "plotSize") {
      display = `${value} sqm`;
    } else if (Array.isArray(value)) {
      display = value.join(", ");
    } else {
      display = String(value);
    }

    lines.push(`${label}: ${display}`);
  }

  lines.push("[END PRE-EXTRACTED FIELDS]");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parse a pre-extracted block BACK into structured fields
// ---------------------------------------------------------------------------

export function parsePreExtractedBlock(
  message: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const blockMatch = message.match(
    /\[PRE-EXTRACTED FIELDS[^\]]*\]([\s\S]*?)\[END PRE-EXTRACTED FIELDS\]/,
  );
  if (!blockMatch) return result;

  const block = blockMatch[1];

  // Reverse label map
  const reverseMap: Record<string, string> = {
    "Price": "price",
    "Location": "location",
    "District": "district",
    "Bedrooms": "bedrooms",
    "Bathrooms": "bathrooms",
    "Property Type": "propertyType",
    "Listing Type": "listingType",
    "Owner Name": "ownerName",
    "Owner Phone": "ownerPhone",
    "Owner Email": "ownerEmail",
    "Title Deed Status": "titleDeedStatus",
    "Covered Area": "coveredArea",
    "Uncovered Veranda": "uncoveredVeranda",
    "Covered Veranda": "coveredVeranda",
    "Plot Size": "plotSize",
    "Google Maps URL": "locationUrl",
    "Features": "features",
    "Floor": "floor",
    "Year Built": "yearBuilt",
    "Condition": "condition",
    "Furnished": "furnished",
  };

  // Numeric fields that should be parsed as numbers
  const numericFields = new Set([
    "price", "bedrooms", "bathrooms", "coveredArea",
    "uncoveredVeranda", "coveredVeranda", "plotSize", "yearBuilt",
  ]);

  // Array fields
  const arrayFields = new Set(["features"]);

  const lines = block.split("\n");
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;

    const label = match[1].trim();
    const rawValue = match[2].trim();
    const fieldKey = reverseMap[label];

    if (!fieldKey) continue;

    if (numericFields.has(fieldKey)) {
      // Strip currency symbols, "sqm", commas
      const cleaned = rawValue.replace(/[€,\s]|sqm/gi, "").trim();
      const num = parseFloat(cleaned);
      if (!isNaN(num)) result[fieldKey] = num;
    } else if (arrayFields.has(fieldKey)) {
      result[fieldKey] = rawValue.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else {
      result[fieldKey] = rawValue;
    }
  }

  return result;
}
