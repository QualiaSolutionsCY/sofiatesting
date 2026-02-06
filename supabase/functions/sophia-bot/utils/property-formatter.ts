/**
 * Property Description Formatter
 *
 * Shared utility for parsing and formatting Cyprus property descriptions.
 * Used by viewing forms, reservation agreements, and marketing agreements.
 *
 * This is the SINGLE SOURCE OF TRUTH for property description formatting.
 * DO NOT duplicate this logic in other files.
 */

/**
 * Cyprus districts (main cities)
 */
export const CYPRUS_DISTRICTS = [
  "paphos",
  "pafos",
  "limassol",
  "larnaca",
  "nicosia",
  "famagusta",
] as const;

/**
 * Cyprus areas/villages/neighborhoods
 */
export const CYPRUS_AREAS = [
  // Paphos District
  "tala",
  "universal",
  "chloraka",
  "geroskipou",
  "kato paphos",
  "konia",
  "coral bay",
  "peyia",
  "kissonerga",
  "emba",
  "mesogi",
  "tremithousa",
  "yeroskipou",
  "tsada",
  "kamares",
  "anarita",
  "kouklia",
  "mandria",
  "aphrodite hills",
  "pegeia",
  "polis",
  "latchi",
  "neo chorio",
  "argaka",
  "pomos",
  // Limassol District
  "agios tychonas",
  "agios theodoros",
  "germasogeia",
  "mouttayiaka",
  "mouttagiaka",
  "parekklisia",
  "pyrgos",
  "erimi",
  "episkopi",
  "kolossi",
  "ypsonas",
  "zakaki",
  "agios athanasios",
  "mesa geitonia",
  "polemidia",
  "souni-zanakia",
  "souni",
  "zanakia",
  "amathounta",
  "amathus",
  "linopetra",
  "potamos germasogeias",
  "kato polemidia",
  "agios nikolaos",
  // Nicosia District
  "strovolos",
  "engomi",
  "lakatamia",
  "latsia",
  "aglantzia",
  "acropolis",
  // Larnaca District
  "oroklini",
  "pervolia",
  "kiti",
  "livadia",
  "aradippou",
  "dromolaxia",
  // Famagusta District
  "paralimni",
  "ayia napa",
  "protaras",
  "sotira",
  "derynia",
] as const;

/**
 * Complex/building name indicators
 */
export const COMPLEX_INDICATORS = [
  "court",
  "complex",
  "tower",
  "building",
  "residence",
  "residences",
  "gardens",
  "heights",
  "village",
  "park",
  "plaza",
  "house",
  "villas",
  "apartments",
] as const;

/**
 * Property type keywords to remove when we have a specific unit number
 */
export const PROPERTY_TYPES = [
  "apartment",
  "flat",
  "house",
  "townhouse",
  "villa",
  "bungalow",
  "penthouse",
  "maisonette",
  "studio",
  "duplex",
  "plot",
  "land",
] as const;

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Smart property description formatter - extracts reg number, location, building name, flat number,
 * sheet/plan, block, and plot info from a raw string. Used by all document templates.
 *
 * Output formats:
 * Apartment: "Registration No. 0/1567, Konia, Paphos (Maroula Court, Flat No. 105)"
 * Land/Plot: "Registration No. 0/1346, Sheet/Plan 44/55, Block 0, Plot No. 122, Amathounta, Agios Athanasios, Limassol"
 */
export function formatPropertyDescription(rawInput: string): string {
  if (!rawInput || rawInput.length < 3) {
    return "Property as described";
  }

  // Clean the input - remove common prefixes and connectors
  let input = rawInput
    .toLowerCase()
    .replace(/^property\s+(with\s+)?/i, "")
    .replace(/^title\s+deed\s+/i, "")
    .replace(/\bsituated\s+in\b/gi, "")
    .replace(/\bwith\s+registration\s+number\b/gi, "")
    .replace(/\bwith\s+reg\s*(?:no\.?)?\b/gi, "")
    .replace(/\bwith\b/gi, "") // Remove standalone "with"
    .replace(/\bin\s+(?=[a-z])/gi, "")
    .trim();

  // Extract registration number (format: X/XXXX like 0/1234 or 1/12345)
  // Must appear near "reg" prefix OR be the first number/slash pattern
  let regNumber: string | null = null;
  const regMatch = input.match(
    /(?:reg(?:istration)?\.?\s*(?:no\.?|number)?\s*)?(\d+\/\d+)/i
  );
  if (regMatch) {
    regNumber = regMatch[1];
    input = input
      .replace(/reg(?:istration)?\.?\s*(?:no\.?|number)?\s*\d+\/\d+/gi, "")
      .replace(regNumber, "")
      .trim();
  }

  // Extract sheet/plan pattern: "sheet/plan 44/55", "sheet plan 44/55", "sheet 44/55"
  let sheetPlanInfo = "";
  const sheetMatch = input.match(
    /\bsheet\s*\/?\s*plan\s*(\d+\s*\/?\s*\d*)/i
  );
  if (sheetMatch) {
    const spNum = sheetMatch[1].replace(/\s+/g, "");
    sheetPlanInfo = `Sheet/Plan ${spNum}`;
    input = input.replace(sheetMatch[0], " ").trim();
  }

  // Extract block pattern: "block 0", "block 12"
  let blockInfo = "";
  const blockMatch = input.match(/\bblock\s+(\d+)/i);
  if (blockMatch) {
    blockInfo = `Block ${blockMatch[1]}`;
    input = input.replace(blockMatch[0], " ").trim();
  }

  // Extract flat/unit/plot number pattern
  // Supports: "flat no 105", "plot no 122", "unit 5b", etc.
  let unitInfo = "";
  const unitMatch = input.match(
    /\b(flat|unit|apt|apartment|house|townhouse|villa|bungalow|penthouse|maisonette|plot)\s*(?:no\.?|number)?\s*(\d+\s*[A-Za-z]?|\d+-?[A-Za-z])/i
  );
  if (unitMatch) {
    const unitNum = unitMatch[2].replace(/\s+/g, "").toUpperCase();
    const unitType =
      unitMatch[1].charAt(0).toUpperCase() +
      unitMatch[1].slice(1).toLowerCase();
    unitInfo = `${unitType} No. ${unitNum}`;
    input = input.replace(unitMatch[0], " ").trim();
  }

  // Clean up and normalize whitespace
  input = input.replace(/,/g, " ").replace(/\s+/g, " ").trim();

  // Check for multi-word areas BEFORE splitting into individual words
  // This handles "agios theodoros", "kato paphos", "coral bay", etc.
  let area = "";
  for (const multiWordArea of CYPRUS_AREAS.filter((a) => a.includes(" "))) {
    const regex = new RegExp(`\\b${multiWordArea}\\b`, "i");
    if (regex.test(input)) {
      area = titleCase(multiWordArea);
      input = input.replace(regex, " ").trim();
      break;
    }
  }

  // Split into words
  const words = input.split(/\s+/).filter((w) => w.length > 0);

  // Identify district (Paphos, Limassol, etc.)
  let district = "";
  const remainingWords: string[] = [];

  for (const word of words) {
    const wordLower = word.toLowerCase();
    if (CYPRUS_DISTRICTS.includes(wordLower as typeof CYPRUS_DISTRICTS[number])) {
      district = titleCase(word);
    } else {
      remainingWords.push(word);
    }
  }

  // Identify single-word areas - collect all recognized areas
  const additionalAreas: string[] = [];
  const afterAreaWords: string[] = [];

  for (const word of remainingWords) {
    const wordLower = word.toLowerCase();
    if (!area && CYPRUS_AREAS.includes(wordLower as typeof CYPRUS_AREAS[number])) {
      area = titleCase(word);
    } else if (CYPRUS_AREAS.includes(wordLower as typeof CYPRUS_AREAS[number])) {
      additionalAreas.push(titleCase(word));
    } else {
      afterAreaWords.push(word);
    }
  }

  // Identify complex name (contains court, complex, tower, etc.)
  // Build complex name from consecutive words that form a complex
  let complexName = "";
  const finalWords: string[] = [];
  const complexWords: string[] = [];
  let foundComplexIndicator = false;

  for (const word of afterAreaWords) {
    const wordLower = word.toLowerCase();

    // Skip standalone property types when we have a unit number
    if (unitInfo && PROPERTY_TYPES.includes(wordLower as typeof PROPERTY_TYPES[number])) {
      continue;
    }

    if (COMPLEX_INDICATORS.includes(wordLower as typeof COMPLEX_INDICATORS[number])) {
      foundComplexIndicator = true;
      complexWords.push(titleCase(word));
    } else if (foundComplexIndicator) {
      // Word after complex indicator - add to final words
      finalWords.push(word);
    } else {
      // Potential complex name word (before indicator)
      complexWords.push(titleCase(word));
    }
  }

  // If we found a complex indicator, complexWords contains the full complex name
  if (foundComplexIndicator) {
    complexName = complexWords.join(" ");
  }

  // Build location string from all area parts + district
  const locationParts: string[] = [];
  locationParts.push(...additionalAreas);
  if (area) locationParts.push(area);
  if (district) locationParts.push(district);
  const location = locationParts.join(", ");

  // Build description parts (comma-separated)
  const descParts: string[] = [];
  if (regNumber) descParts.push(`Registration No. ${regNumber}`);
  if (sheetPlanInfo) descParts.push(sheetPlanInfo);
  if (blockInfo) descParts.push(blockInfo);
  // Unit info outside parentheses only when no complex name
  if (unitInfo && !complexName) descParts.push(unitInfo);
  if (location) descParts.push(location);

  // Build final description
  let description: string;
  if (descParts.length > 0 && complexName && unitInfo) {
    description = `${descParts.join(", ")} (${complexName}, ${unitInfo})`;
  } else if (descParts.length > 0 && complexName) {
    description = `${descParts.join(", ")} (${complexName})`;
  } else if (descParts.length > 0) {
    description = descParts.join(", ");
  } else if (complexName && unitInfo) {
    description = `${complexName}, ${unitInfo}`;
  } else if (complexName) {
    description = complexName;
  } else if (location) {
    description = location;
  } else {
    // Fallback: title case the original input
    description = titleCase(rawInput);
  }

  return description
    .replace(/,\s*$/, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}
