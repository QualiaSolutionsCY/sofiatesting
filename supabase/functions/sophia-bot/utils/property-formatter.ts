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
  "agia paraskevi",
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
  "agios vasilios",
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
  // Limassol neighborhoods/localities
  "katholiki",
  "agios ioannis",
  "potamos germasogeias",
  "tsirio",
  "columbia",
  "agia zoni",
  "omonia",
  "agios georgios",
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
 * Lightweight property description formatter.
 *
 * Philosophy: PRESERVE the user's exact input (spacing, commas, numbering, order).
 * Only apply minimal normalizations:
 *   1. Normalize "reg no" / "reg. no" / "registration no" → "Reg. No."
 *   2. Capitalize recognized Cyprus place names (districts + areas)
 *   3. Keep parentheses and all other structure as-is
 *
 * This is the SINGLE SOURCE OF TRUTH — used by viewing forms, reservation agreements,
 * and marketing agreements (via styles.ts re-export).
 */
export function formatPropertyDescription(rawInput: string): string {
  if (!rawInput || rawInput.length < 3) {
    return "Property as described";
  }

  let result = rawInput.trim();

  // 1. Normalize registration number prefix → "Reg No."
  //    Handles: "reg no", "reg. no", "reg no.", "Reg No", "registration no",
  //    "registration no.", "Registration Number", etc.
  result = result.replace(
    /\breg(?:istration)?\.?\s*(?:no\.?|number)\b\.?/gi,
    "Reg No."
  );
  // Clean up any double dots from "Reg No.." edge cases
  result = result.replace(/Reg\s*No\.\./g, "Reg No.");

  // 1b. Detect bare registration numbers at the start (e.g., "0/1456, Dimos...")
  //     and prepend "Reg No." prefix — universal for all templates
  result = result.replace(/^(\d+\/\d+)/, "Reg No. $1");

  // 2. Capitalize recognized Cyprus place names (districts and areas)
  //    Process multi-word names first (longer matches before shorter)
  //    e.g., "kato paphos" → "Kato Paphos", "agios theodoros" → "Agios Theodoros"
  const allAreas = [...CYPRUS_AREAS].sort((a, b) => b.length - a.length);
  for (const areaName of allAreas) {
    const regex = new RegExp(`\\b${areaName}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, titleCase(areaName));
    }
  }

  // Capitalize district names
  for (const district of CYPRUS_DISTRICTS) {
    const regex = new RegExp(`\\b${district}\\b`, "gi");
    if (regex.test(result)) {
      result = result.replace(regex, titleCase(district));
    }
  }

  // 3. Capitalize "Flat No.", "Plot No.", "Unit No.", "Block" etc. if lowercase
  result = result.replace(
    /\b(flat|plot|unit|apt|apartment|block|sheet|plan)\b/gi,
    (match) => {
      return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
    }
  );

  // 4. Normalize "no" / "no." after Flat/Plot/Unit/Apt → "No."
  result = result.replace(
    /\b(Flat|Plot|Unit|Apt|Apartment)\s+no\.?\b/gi,
    (_, type) => {
      return `${type} No.`;
    }
  );

  // 5. Universal "Dimos" (municipality prefix) — capitalize and keep as one unit with following word
  result = result.replace(/\bdimos\b/gi, "Dimos");

  // 6. Universal title-case: capitalize first letter of every word in location/area parts
  //    This ensures even unrecognized locations get proper capitalization
  //    Apply to each comma-separated segment after the reg number
  const regNoMatch = result.match(/^(Reg No\.\s*\d+\/\d+)(.*)$/);
  if (regNoMatch) {
    const regPart = regNoMatch[1];
    let rest = regNoMatch[2];
    // Title-case each comma-separated part (but preserve already-capitalized words)
    rest = rest.replace(/(?:^|,\s*)([a-z])/g, (match, letter) => {
      return match.slice(0, -1) + letter.toUpperCase();
    });
    // Also capitalize first letter of any lowercase word (excluding common connectors)
    rest = rest.replace(/\b([a-z])/g, (match) => match.toUpperCase());
    result = regPart + rest;
  } else {
    // No reg number — just title-case everything
    result = result.replace(/\b([a-z])/g, (match) => match.toUpperCase());
  }

  // Universal double-dot cleanup (e.g., "Flat No.. 105" → "Flat No. 105")
  result = result.replace(/\.{2,}/g, ".");

  // Clean up any extra whitespace (but preserve commas, parentheses, etc.)
  result = result.replace(/ {2,}/g, " ").trim();

  return result;
}
