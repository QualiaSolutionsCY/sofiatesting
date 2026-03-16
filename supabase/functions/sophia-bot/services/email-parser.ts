/**
 * Server-side Email Parser
 *
 * Deterministically extracts property/land listing fields from structured agent emails.
 * This runs BEFORE the AI sees the email — the AI receives pre-extracted fields
 * so it cannot hallucinate basic facts like price, location, owner, etc.
 *
 * Pattern examples:
 *   "2 Bedroom Bungalow For Sale in Peyia 400k"
 *   "Owner - Matt Le Blanc - 94 949596 - joey@gmail.com"
 *   "76m2 covered area"
 *   "Notes: Owner is living inside"
 */

export interface ParsedEmailFields {
  // Core fields
  listingType?: "sale" | "rent";
  isLand?: boolean;
  propertyType?: string;
  landType?: string;
  price?: number;
  priceNegotiable?: boolean;
  location?: string;
  bedrooms?: number;
  bathrooms?: number;

  // Sizes
  coveredArea?: number;
  coveredVeranda?: number;
  uncoveredVeranda?: number;
  plotSize?: number;
  landSize?: number;

  // Owner
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;

  // Title deeds
  titleDeedStatus?: string;

  // Land-specific
  buildingDensity?: number;
  siteCoverage?: number;
  maxFloors?: number;
  maxHeight?: number;

  // Other
  features: string[];
  locationUrl?: string;
  specialNotes?: string;
  coordinates?: { lat: number; lon: number };
  energyClass?: string;
  yearBuilt?: number;
  poolType?: string;
  bathroomBreakdown?: string;
  floor?: string;
}

/**
 * Parse a structured agent email and extract all property/land fields.
 * Returns only fields that were confidently extracted — missing fields are omitted.
 */
export function parsePropertyEmail(textBody: string, subject: string): ParsedEmailFields {
  const text = textBody || "";
  const subjectLower = (subject || "").toLowerCase();
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);

  const result: ParsedEmailFields = { features: [] };

  // --- Listing type ---
  if (/\bfor\s+rent\b|\bto\s+rent\b|\brental\b/i.test(text) || /\brent\b/i.test(subjectLower)) {
    result.listingType = "rent";
  } else {
    // Default to "sale" — the vast majority of email uploads are sales listings
    // Only override to "rent" if explicitly mentioned
    result.listingType = "sale";
  }

  // --- Is this a land listing? ---
  const isLand = /\bland\b.*\bfor\s+(sale|rent)\b|\bplot\b.*\bfor\s+(sale|rent)\b/i.test(text) ||
    /\bland\s+(listing|upload)\b|\bplot\s+(listing|upload)\b/i.test(subjectLower);
  if (isLand) {
    result.isLand = true;
    // Land type
    if (/\bagricultural\b/i.test(text)) result.landType = "agricultural";
    else if (/\bfield\b/i.test(text)) result.landType = "field";
    else result.landType = "plot";
  }

  // --- Property type (non-land) ---
  if (!isLand) {
    const typePatterns: [RegExp, string][] = [
      [/\bbungalow\b/i, "bungalow"],
      [/\btownhouse\b|\btown\s*house\b/i, "townhouse"],
      [/\bpenthouse\b/i, "penthouse"],
      [/\bmaisonette\b/i, "maisonette"],
      [/\bstudio\b/i, "studio"],
      [/\bvilla\b/i, "villa"],
      [/\bsemi[- ]?detached\b/i, "semi-detached house"],
      [/\bdetached\s+house\b/i, "detached house"],
      [/\bapartment\b|\bflat\b/i, "apartment"],
      [/\bresidential\s+building\b/i, "residential building"],
      [/\bentire\s+floor\b/i, "entire floor apartment"],
      [/\bmixed[\s-]*use\s+building\b|\bresidential\s*\/?\s*commercial\b/i, "building"],
      [/\bbuilding\b/i, "building"],
      [/\boffice\b/i, "office"],
      [/\bshop\b/i, "shop"],
      [/\bwarehouse\b/i, "warehouse"],
      [/\bhotel\b/i, "hotel"],
      [/\bhouse\b/i, "detached house"], // fallback: "house" → detached house
    ];
    for (const [pattern, type] of typePatterns) {
      if (pattern.test(text)) {
        result.propertyType = type;
        break;
      }
    }
  }

  // --- Price ---
  // Patterns: "400k", "€400,000", "400,000", "400000", "400K not negotiable"
  // Look for price on a dedicated line OR in the first line
  // First try dedicated price line (line that starts with a number or €)
  // Skip lines that look like phone numbers, m² values, percentages, or years
  for (const line of lines) {
    // Skip non-price lines: phone numbers (6+ digits with spaces), m2 values, percentages, owner lines
    if (/^\d[\d\s]{5,}$/.test(line.trim())) continue; // bare phone number
    if (/\bm2\b|%|owner|kind\s+regards/i.test(line)) continue;
    // Check for millions first: "1.2m", "€1.5m", "2m"
    const mMatch = line.match(/^(?:€\s*)?(\d+(?:\.\d+)?)\s*m\b/i);
    if (mMatch && parseFloat(mMatch[1]) < 100) { // < 100 to avoid matching "582m2"
      result.price = Math.round(parseFloat(mMatch[1]) * 1_000_000);
      if (/not\s+negotiable|fixed\s+price/i.test(line)) result.priceNegotiable = false;
      break;
    }
    const kMatch = line.match(/^(?:€\s*)?(\d{2,4})\s*k\b/i);
    if (kMatch) {
      result.price = parseInt(kMatch[1]) * 1000;
      if (/not\s+negotiable|fixed\s+price/i.test(line)) result.priceNegotiable = false;
      break;
    }
    const fullMatch = line.match(/^(?:€\s*)?([\d,]{4,})\s*(?:€|eur)?\s*(?:not\s+negotiable)?/i);
    if (fullMatch) {
      result.price = parseInt(fullMatch[1].replace(/,/g, ""));
      if (/not\s+negotiable|fixed\s+price/i.test(line)) result.priceNegotiable = false;
      break;
    }
  }

  // Fallback: search first line for price
  if (!result.price && lines.length > 0) {
    const firstLine = lines[0];
    const mMatch = firstLine.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (mMatch && parseFloat(mMatch[1]) < 100) {
      result.price = Math.round(parseFloat(mMatch[1]) * 1_000_000);
    } else {
      const kMatch = firstLine.match(/(\d{2,4})\s*k\b/i);
      if (kMatch) {
        result.price = parseInt(kMatch[1]) * 1000;
      } else {
        const numMatch = firstLine.match(/(?:€\s*)?([\d,]{5,})/);
        if (numMatch) result.price = parseInt(numMatch[1].replace(/,/g, ""));
      }
    }
    if (/not\s+negotiable|fixed\s+price/i.test(firstLine)) result.priceNegotiable = false;
  }

  // --- Bedrooms ---
  const bedMatch = text.match(/(\d+)\s*(?:bed(?:room)?s?)\b/i);
  if (bedMatch) result.bedrooms = parseInt(bedMatch[1]);

  // --- Bathrooms ---
  const bathMatch = text.match(/(\d+)\s*(?:bathroom|bathrooms)\b/i);
  if (bathMatch) result.bathrooms = parseInt(bathMatch[1]);
  // Check for complex breakdown: "2 bathrooms, 1 ensuite + 1 family bathroom"
  // or "1 bathroom + 1 guest w/c"
  const bathLine = lines.find((l) => /bathroom|ensuite|guest\s*w\/?c/i.test(l));
  if (bathLine) {
    result.bathroomBreakdown = bathLine;
    // Count only full bathrooms (not guest w/c)
    const ensuiteCount = (bathLine.match(/(\d+)\s*ensuite/i) || [])[1];
    const familyCount = (bathLine.match(/(\d+)\s*family\s*bathroom/i) || [])[1];
    const guestWC = /guest\s*w\/?c/i.test(bathLine);
    if (ensuiteCount || familyCount) {
      result.bathrooms = (parseInt(ensuiteCount || "0") || 0) + (parseInt(familyCount || "0") || 0);
    }
    if (guestWC && !result.features.includes("guest w/c")) {
      result.features.push("guest w/c");
    }
  }

  // --- Location ---
  // Pattern 1: "... for sale/rent in [Location]"
  const locationMatch = text.match(/(?:for\s+(?:sale|rent)\s+in\s+)([^,\n]+(?:,\s*[^,\n]+){0,2})/i);
  if (locationMatch) {
    let loc = locationMatch[1].trim();
    loc = loc.replace(/\s+with\s+.*/i, "").replace(/\s+\d+k?\s*$/i, "").trim();
    result.location = loc;
  }

  // Pattern 2: Standalone location line — a line that contains a known Cyprus district
  // but isn't a feature, size, owner, or other structured line
  // e.g., "Universal Kato Paphos", "Coral Bay, Paphos", "Mesa Geitonia, Limassol"
  if (!result.location) {
    const districtPattern = /\b(paphos|pafos|limassol|lemesos|larnaca|nicosia|lefkosia|famagusta|ammochostos)\b/i;
    for (const line of lines) {
      // Skip lines that are clearly not locations
      if (/^\d|^owner|^title|^note|^kind|^http|^energy|^built|m2\b|bathroom|bedroom|parking|%/i.test(line)) continue;
      if (/\bfor\s+(sale|rent)\b/i.test(line)) continue; // already handled by Pattern 1
      if (districtPattern.test(line) && line.length < 60) {
        result.location = line.trim();
        break;
      }
    }
  }

  // --- Sizes ---
  // "76m2 covered area" or "76m2 indoor area" or "122m2 indoor"
  const coveredMatch = text.match(/(\d+)\s*m2?\s*(?:covered\s+area|indoor\s+area|indoor|net\s+indoor)/i);
  if (coveredMatch) result.coveredArea = parseInt(coveredMatch[1]);

  // "20m2 covered veranda" or "20m2 of covered veranda"
  const cvMatch = text.match(/(\d+)\s*m2?\s*(?:of\s+)?covered\s+veranda/i);
  if (cvMatch) result.coveredVeranda = parseInt(cvMatch[1]);

  // "9m2 uncovered veranda"
  const uvMatch = text.match(/(\d+)\s*m2?\s*(?:of\s+)?uncovered\s+veranda/i);
  if (uvMatch) result.uncoveredVeranda = parseInt(uvMatch[1]);

  // "599m2 plot" or "582m2 plot area" or "350m2 plot"
  const plotMatch = text.match(/(\d[\d,]*)\s*m2?\s*(?:plot|land)\s*(?:area|size)?/i);
  if (plotMatch) {
    const size = parseInt(plotMatch[1].replace(/,/g, ""));
    if (isLand) {
      result.landSize = size;
    } else {
      result.plotSize = size;
    }
  }
  // Also check "X of land area" for land
  if (isLand && !result.landSize) {
    const landAreaMatch = text.match(/([\d,]+)\s*m2?\s*(?:of\s+)?land\s*area/i);
    if (landAreaMatch) result.landSize = parseInt(landAreaMatch[1].replace(/,/g, ""));
  }

  // --- Title deeds ---
  if (/\btitle\s+deeds?\b/i.test(text)) {
    result.titleDeedStatus = "separate";
  } else {
    // Default to "unknown" — the tool requires this field
    result.titleDeedStatus = "unknown";
  }

  // --- Owner ---
  // Pattern 1: "Owner - Name - Phone - email" (full)
  // Pattern 2: "Owner - Name - Phone" (no email)
  // Pattern 3: "Owner - Name - email" (no phone)
  const ownerWithPhone = text.match(
    /owner\s*[-:–]\s*(.+?)\s*[-–]\s*([\d\s]{6,}?)(?:\s*[-–]\s*(\S+@\S+))?$/im
  );
  if (ownerWithPhone) {
    result.ownerName = ownerWithPhone[1].trim();
    result.ownerPhone = ownerWithPhone[2].trim();
    if (ownerWithPhone[3]) result.ownerEmail = ownerWithPhone[3].trim();
  } else {
    // Pattern 3: "Owner - Name - email@domain.com" (no phone number)
    const ownerWithEmail = text.match(
      /owner\s*[-:–]\s*(.+?)\s*[-–]\s*(\S+@\S+)/im
    );
    if (ownerWithEmail) {
      result.ownerName = ownerWithEmail[1].trim();
      result.ownerEmail = ownerWithEmail[2].trim();
    } else {
      // Pattern 4: "Owner - Name" (just name, nothing else)
      const ownerNameOnly = text.match(/owner\s*[-:–]\s*([A-Z][a-zA-Z\s'-]+)/m);
      if (ownerNameOnly) {
        result.ownerName = ownerNameOnly[1].trim();
      }
    }
  }

  // --- Google Maps URL ---
  const mapsMatch = text.match(/(https?:\/\/(?:www\.)?google\.com\/maps\/\S+)/i) ||
    text.match(/(https?:\/\/maps\.app\.goo\.gl\/\S+)/i) ||
    text.match(/(https?:\/\/goo\.gl\/maps\/\S+)/i);
  if (mapsMatch) {
    result.locationUrl = mapsMatch[1].trim();
    // Extract coordinates from @lat,lon
    const coordMatch = result.locationUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      result.coordinates = {
        lat: parseFloat(coordMatch[1]),
        lon: parseFloat(coordMatch[2]),
      };
    }
  }

  // --- Notes ---
  // Support multi-line notes: collect everything from "Notes:" until the next section
  // (Owner, Kind Regards, Google Maps URL, or blank line followed by signature)
  const noteLineIdx = lines.findIndex((l) => /^notes?\s*:/i.test(l));
  if (noteLineIdx >= 0) {
    const noteLines: string[] = [lines[noteLineIdx].replace(/^notes?\s*:\s*/i, "").trim()];
    // Collect subsequent lines that are part of the note
    for (let i = noteLineIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop at: Owner line, Kind Regards, Google Maps URL, email signature patterns
      if (/^owner\s*[-:–]/i.test(line)) break;
      if (/^kind\s+regards/i.test(line)) break;
      if (/^https?:\/\//i.test(line)) break;
      if (/^(real\s+estate|zyprus\s+property|tombs\s+of)/i.test(line)) break;
      noteLines.push(line);
    }
    result.specialNotes = noteLines.filter(Boolean).join(" ").trim();
  }

  // --- Land-specific fields ---
  if (isLand) {
    const densityMatch = text.match(/(\d+)\s*%?\s*(?:build(?:ing)?\s+)?density/i);
    if (densityMatch) result.buildingDensity = parseInt(densityMatch[1]);

    const coverageMatch = text.match(/(\d+)\s*%?\s*coverage/i);
    if (coverageMatch) result.siteCoverage = parseInt(coverageMatch[1]);

    const floorsMatch = text.match(/(\d+)\s*floors?\b/i);
    if (floorsMatch) result.maxFloors = parseInt(floorsMatch[1]);

    const heightMatch = text.match(/(\d+(?:\.\d+)?)\s*m?\s*height/i);
    if (heightMatch) result.maxHeight = parseFloat(heightMatch[1]);
  }

  // --- Energy class ---
  const energyMatch = text.match(/energy\s+(?:class\s+)?([a-d])\b/i);
  if (energyMatch) result.energyClass = energyMatch[1].toUpperCase();

  // --- Year built ---
  const yearMatch = text.match(/built\s*:?\s*(\d{4})/i);
  if (yearMatch) result.yearBuilt = parseInt(yearMatch[1]);

  // --- Floor level ---
  if (/\bground\s+floor\b/i.test(text)) result.floor = "ground";
  else {
    const floorMatch = text.match(/(\d+)(?:st|nd|rd|th)\s+floor/i);
    if (floorMatch) result.floor = `${floorMatch[1]}${floorMatch[0].match(/(st|nd|rd|th)/i)?.[0]}`;
  }

  // --- Pool ---
  if (/\bcommunal\s+(?:swimming\s+)?pool\b|\bcommon\s+pool\b|\bshared\s+pool\b/i.test(text)) result.poolType = "communal";
  else if (/\bprivate\s+pool\b/i.test(text)) result.poolType = "private";
  else if (/\bprovisions?\s+for\s+(?:a\s+)?pool\b/i.test(text)) result.poolType = "provisions";

  // --- Features ---
  const featureMap: [RegExp, string][] = [
    [/\ba\/?c\b|\bair\s*condition/i, "air conditioning"],
    [/\bprovisions?\s+for\s+a\/?c\b/i, "provision for A/C"],
    [/\bcentral\s+heating\b/i, "central heating"],
    [/\bunderfloor\s+heating\b/i, "underfloor heating"],
    [/\bfireplace\b/i, "fireplace"],
    [/\bphotovoltaic\b|\bsolar\s+(?:system|panels?)\b/i, "solar system"],
    [/\bfly\s+screens?\b/i, "fly screens"],
    [/\bjacuzzi\b/i, "jacuzzi"],
    [/\bcctv\b/i, "CCTV"],
    [/\bsecurity\s+system\b|\balarm\s+system\b/i, "security system"],
    [/\bstoreroom\b|\bstorage\s+room\b/i, "storage room"],
    [/\bcovered\s+parking\b/i, "covered parking"],
    [/\buncovered\s+parking\b/i, "open parking"],
    [/\bgarage\b/i, "garage"],
    [/\blandscape\s+garden\b/i, "landscape garden"],
    [/\broof\s+garden\b/i, "roof garden"],
    [/\bsea\s+view\b/i, "sea view"],
    [/\bmountain\s+view\b/i, "mountain view"],
    [/\bcity\s+view\b/i, "city view"],
    [/\bfurnished\b/i, "furnished"],
    [/\belectrical\s+appliances?\b/i, "electrical appliances"],
    [/\bbbq\s+area?\b/i, "BBQ area"],
    [/\bgarden\b(?!\s*complex)(?!s\b)/i, "garden"], // Avoid "Gardens Complex", "Melania Gardens"
    [/\bseparate\s+kitchen\b/i, "separate kitchen"],
    [/\bfitted\s+kitchen\b/i, "fitted kitchen"],
    [/\bopen\s+plan\b/i, "open plan"],
    [/\bwater\s+heater\b|\bsolar\s+water\b/i, "water heater"],
    [/\belevator\b|\blift\b/i, "elevator"],
    [/\bimmaculate\s+condition\b/i, "immaculate condition"],
  ];

  for (const [pattern, feature] of featureMap) {
    if (pattern.test(text)) {
      // Don't add "provision for A/C" if "a/c" was already added
      if (feature === "air conditioning" && /\bprovisions?\s+for\s+a\/?c\b/i.test(text)) continue;
      // Don't add generic "garden" if "landscape garden" or "roof garden" already matched
      if (feature === "garden" && (result.features.includes("landscape garden") || result.features.includes("roof garden"))) continue;
      if (!result.features.includes(feature)) {
        result.features.push(feature);
      }
    }
  }

  // Merge bathroom breakdown into specialNotes if present
  if (result.bathroomBreakdown) {
    const breakdown = `Bathroom breakdown: ${result.bathroomBreakdown}`;
    result.specialNotes = result.specialNotes
      ? `${result.specialNotes}\n${breakdown}`
      : breakdown;
  }

  return result;
}

/**
 * Format pre-extracted fields as a structured block for the AI prompt.
 * The AI should use these values directly — not re-parse the email.
 */
export function formatExtractedFields(parsed: ParsedEmailFields): string {
  const lines: string[] = ["PRE-EXTRACTED FIELDS (use these EXACT values — do NOT re-parse the email):"];

  if (parsed.isLand) lines.push(`  Tool: createLandListing`);
  else lines.push(`  Tool: createPropertyListing`);

  if (parsed.listingType) lines.push(`  listingType: "${parsed.listingType}"`);
  if (parsed.isLand && parsed.landType) lines.push(`  landType: "${parsed.landType}"`);
  if (parsed.propertyType) lines.push(`  propertyType: "${parsed.propertyType}"`);
  if (parsed.price) lines.push(`  price: ${parsed.price}`);
  if (parsed.priceNegotiable === false) lines.push(`  priceNegotiable: false`);
  if (parsed.location) lines.push(`  location: "${parsed.location}"`);
  if (parsed.bedrooms != null) lines.push(`  bedrooms: ${parsed.bedrooms}`);
  if (parsed.bathrooms != null) lines.push(`  bathrooms: ${parsed.bathrooms}`);
  if (parsed.coveredArea) lines.push(`  coveredArea: ${parsed.coveredArea}`);
  if (parsed.coveredVeranda) lines.push(`  coveredVeranda: ${parsed.coveredVeranda}`);
  if (parsed.uncoveredVeranda) lines.push(`  uncoveredVeranda: ${parsed.uncoveredVeranda}`);
  if (parsed.plotSize) lines.push(`  plotSize: ${parsed.plotSize}`);
  if (parsed.landSize) lines.push(`  landSize: ${parsed.landSize}`);
  if (parsed.ownerName) lines.push(`  ownerName: "${parsed.ownerName}"`);
  if (parsed.ownerPhone) lines.push(`  ownerPhone: "${parsed.ownerPhone}"`);
  if (parsed.ownerEmail) lines.push(`  ownerEmail: "${parsed.ownerEmail}"`);
  if (parsed.titleDeedStatus) lines.push(`  titleDeedStatus: "${parsed.titleDeedStatus}"`);
  if (parsed.buildingDensity) lines.push(`  buildingDensity: ${parsed.buildingDensity}`);
  if (parsed.siteCoverage) lines.push(`  siteCoverage: ${parsed.siteCoverage}`);
  if (parsed.maxFloors) lines.push(`  maxFloors: ${parsed.maxFloors}`);
  if (parsed.maxHeight) lines.push(`  maxHeight: ${parsed.maxHeight}`);
  if (parsed.features.length > 0) lines.push(`  features: ${JSON.stringify(parsed.features)}`);
  if (parsed.locationUrl) lines.push(`  locationUrl: "${parsed.locationUrl}"`);
  if (parsed.coordinates) lines.push(`  coordinates: { lat: ${parsed.coordinates.lat}, lon: ${parsed.coordinates.lon} }`);
  if (parsed.specialNotes) lines.push(`  specialNotes: "${parsed.specialNotes}"`);
  if (parsed.energyClass) lines.push(`  energyClass: "${parsed.energyClass}"`);
  if (parsed.yearBuilt) lines.push(`  yearBuilt: ${parsed.yearBuilt}`);
  if (parsed.poolType) lines.push(`  poolType: "${parsed.poolType}"`);
  if (parsed.floor) lines.push(`  floor: "${parsed.floor}"`);

  return lines.join("\n");
}
