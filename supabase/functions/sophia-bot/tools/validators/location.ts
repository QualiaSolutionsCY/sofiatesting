/**
 * Location Validation Utilities
 * Provides functions for validating and parsing location data from various sources.
 */

import { REGION_LOCATIONS } from "../../config/business-rules.ts";

/**
 * Extract area/neighborhood name from a Google Maps URL.
 * Google Maps encodes place names in the !2s... proto buffer segments.
 * E.g., "!2sKato+Paphos,+Paphos,+Cyprus" → "Kato Paphos, Paphos"
 * Returns the first area-level match (not street-level), or null.
 */
export function extractAreaFromGoogleMapsUrl(url: string): string | null {
  if (!url) return null;

  // Greek → English district name mapping
  const greekToEnglish: Record<string, string> = {
    lemesos: "Limassol",
    lefkosia: "Nicosia",
    larnaka: "Larnaca",
    pafos: "Paphos",
    ammochostos: "Famagusta",
  };

  // Street indicators — if a place name contains these, it's a street, not an area
  const streetIndicators =
    /\b(ave|avenue|street|str|road|rd|drive|dr|boulevard|blvd|lane|ln|way|place|crescent|court|terrace|highway|hwy)\b/i;

  // Cyprus district names for validation (English + Greek)
  const cyprusDistricts = [
    "paphos",
    "limassol",
    "larnaca",
    "nicosia",
    "famagusta",
    "lemesos",
    "lefkosia",
    "larnaka",
    "pafos",
    "ammochostos",
  ];

  /** Normalize Greek district names to English */
  function normalizeDistrict(text: string): string {
    const lower = text
      .toLowerCase()
      .replace(/\s*\d+\s*$/, "")
      .trim(); // Remove trailing postcodes
    return greekToEnglish[lower] || text.replace(/\s*\d+\s*$/, "").trim();
  }

  try {
    // Decode any URL encoding first
    const decoded = decodeURIComponent(url);

    // Strategy 1: Extract !2s... segments (place names in Google Maps protobuf data)
    // These contain place names like "Kato Paphos, Paphos, Cyprus"
    const placeMatches = decoded.match(/!2s([^!]+)/g);
    if (placeMatches && placeMatches.length > 0) {
      for (const match of placeMatches) {
        const placeName = match.replace("!2s", "").replace(/\+/g, " ").trim();

        // Skip empty or very short names
        if (placeName.length < 3) continue;

        // Skip if it looks like a street address
        if (streetIndicators.test(placeName)) continue;
        if (/^\d+\s/.test(placeName)) continue; // Starts with house number

        // Check if this contains a Cyprus district
        const parts = placeName.split(",").map((p) => p.trim());
        const hasDistrict = parts.some((p) =>
          cyprusDistricts.some((d) =>
            p
              .toLowerCase()
              .replace(/\s*\d+\s*$/, "")
              .includes(d)
          )
        );

        if (hasDistrict && parts.length >= 2) {
          // Remove "Cyprus" and normalize district names
          const filtered = parts
            .filter((p) => p.toLowerCase() !== "cyprus")
            .map((p) => normalizeDistrict(p));
          if (filtered.length >= 2) {
            return filtered.join(", ");
          }
        }
      }
    }

    // Strategy 2: Parse the /place/ segment from the URL path
    // e.g., /place/Michali+Sougioul+21,+Lemesos+3046,+Cyprus/
    // or /place/Agiou+Panteleimonos,+Erimi+4630,+Cyprus/
    // This often contains the street address, but we can extract the area/district
    const placeSegmentMatch = decoded.match(/\/place\/([^/]+)/);
    if (placeSegmentMatch) {
      const placeText = placeSegmentMatch[1].replace(/\+/g, " ").trim();
      const parts = placeText.split(",").map((p) => p.trim());

      // Use known areas from business rules to match area names (not just districts)
      const allKnownAreas = Object.values(REGION_LOCATIONS).flat();

      // Find area or district parts (skip street name, postcode, and "Cyprus")
      let foundArea: string | null = null;
      let foundDistrict: string | null = null;
      for (const part of parts) {
        const cleaned = part
          .toLowerCase()
          .replace(/\s*\d+\s*$/, "")
          .trim(); // Remove postcodes
        if (cleaned === "cyprus") continue;
        if (cyprusDistricts.includes(cleaned)) {
          foundDistrict = normalizeDistrict(part);
          continue;
        }
        // Check if this part is a known area (e.g., "Erimi", "Prodromi", "Tala")
        if (allKnownAreas.includes(cleaned)) {
          foundArea = part.replace(/\s*\d+\s*$/, "").trim(); // Remove postcode, keep original case
        }
      }

      // If we found a known area + district, return "Area, District"
      if (foundArea && foundDistrict) {
        return `${foundArea}, ${foundDistrict}`;
      }
      // If we found only a known area (no district), return it
      if (foundArea) {
        return foundArea;
      }
      // If we found only a district, it's too vague — return null to ask user
      if (foundDistrict) {
        return null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if the location is just a city/district name without a specific area.
 * "Limassol" or "Paphos" alone is too vague — the agent must specify the neighborhood.
 */
export function isCityOnlyLocation(location: string): boolean {
  const normalized = location
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .trim();
  const cityNames = [
    "paphos",
    "limassol",
    "larnaca",
    "nicosia",
    "famagusta",
    "lemesos",
    "lefkosia",
    "larnaka",
    "pafos",
    "ammochostos",
    // With district suffix duplicated (e.g., "Limassol, Limassol")
    "paphos paphos",
    "limassol limassol",
    "larnaca larnaca",
    "nicosia nicosia",
    "famagusta famagusta",
    // Common vague locations
    "limassol city centre",
    "paphos city centre",
    "larnaca city centre",
    "nicosia city centre",
    "limassol city center",
    "paphos city center",
    "larnaca city center",
    "nicosia city center",
    "paphos town",
    "limassol town",
    "larnaca town",
    "nicosia town",
  ];
  return cityNames.includes(normalized);
}

/**
 * Detect if a location string looks like a street address rather than an area/neighborhood.
 * Street addresses should NOT be used as the listing location — areas like "Kato Paphos" should be.
 */
export function isStreetAddress(location: string): boolean {
  // Street type indicators (English + Greek transliterated)
  const streetIndicators =
    /\b(ave|avenue|street|str|road|rd|drive|dr|boulevard|blvd|lane|ln|way|crescent|court|terrace|highway|hwy|leoforos|odos)\b/i;

  if (streetIndicators.test(location)) return true;

  // Detect "Street Name + house number" patterns like "Apostolou Pavlou 46"
  // but NOT postcodes like "Paphos 8046" (4+ digit numbers are likely postcodes)
  // House numbers are typically 1-3 digits at the end or start
  const houseNumberAtEnd = /\s\d{1,3}$/; // "Pavlou Ave 46"
  const houseNumberAtStart = /^\d{1,3}\s/; // "46 Pavlou Ave"
  if (
    houseNumberAtEnd.test(location.trim()) ||
    houseNumberAtStart.test(location.trim())
  ) {
    // Only flag as street if there are enough words (area names like "Paphos 3" shouldn't trigger)
    const words = location.split(/[\s,]+/).filter((w) => w.length > 1);
    if (words.length >= 3) return true;
  }

  // Known street names — checked before heuristic suffix detection
  const knownStreets = [
    "apostolou pavlou",
    "michali sougioul",
    "georgiou griva",
    "archbishop makarios",
    "spyrou kyprianou",
    "makarios iii",
    "grivas digenis",
    "evagora pallikaridi",
    "nikodimou mylona",
  ];

  // CRITICAL: Detect Greek street name patterns extracted from Google Maps URLs
  // Google Maps uses "Street Name, District" format in /place/ path
  // Common pattern: Two-word name + district (e.g., "Michali Sougioul, Limassol")
  // These are often personal names (street named after a person) rather than area names
  // Area names in Cyprus are typically: single word (Tala, Chloraka) or geographic (Kato Paphos, Mesa Geitonia)
  const parts = location.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const firstPart = parts[0].toLowerCase();

    // Check known streets blocklist first
    if (knownStreets.some((street) => firstPart.includes(street))) {
      return true;
    }

    const firstWords = firstPart.split(/\s+/);

    // Two-word name patterns that suggest street names (Greek personal names)
    // e.g., "Michali Sougioul", "Apostolou Pavlou", "Georgiou Griva"
    if (firstWords.length === 2) {
      // If both words look like Greek names (common suffixes), likely a street
      const looksLikeGreekName = (word: string) => {
        const endings = [
          "ou",
          "os",
          "is",
          "as",
          "es",
          "i",
          "oul",
          "ios",
          "ias",
          "eas",
          "akis",
        ];
        return endings.some((e) => word.toLowerCase().endsWith(e));
      };

      if (
        looksLikeGreekName(firstWords[0]) &&
        looksLikeGreekName(firstWords[1])
      ) {
        // Exception: Known area names that happen to have Greek suffixes
        const knownAreas = [
          "agios tychonas",
          "agios athanasios",
          "agios nikolaos",
          "agios ioannis",
          "agia fyla",
          "agia napa",
          "agia zoni",
          "ayia napa",
          "potamos germasogeias",
          "mesa geitonia",
          "kato polemidia",
          "kato paphos",
          "pano paphos",
          "mesa chorio",
        ];
        if (!knownAreas.some((area) => firstPart.includes(area))) {
          return true; // Likely a street name
        }
      }
    }
  }

  return false;
}

/**
 * Cross-reference the AI's location with the Google Maps URL to detect street names.
 * If the /place/ path in the URL contains the AI's location name followed by a house number,
 * it's a street name (e.g., AI passed "Michali Sougioul, Limassol" and URL has "Michali+Sougioul+21,+Lemesos").
 */
export function isLocationAStreetInUrl(
  location: string,
  googleMapsUrl: string
): boolean {
  try {
    const decoded = decodeURIComponent(googleMapsUrl).replace(/\+/g, " ");
    const placeMatch = decoded.match(/\/place\/([^/]+)/);
    if (!placeMatch) return false;

    const placePath = placeMatch[1].toLowerCase();

    // Extract the location name part (before the district/comma)
    const locationParts = location
      .split(",")
      .map((p) => p.trim().toLowerCase());
    const locationName = locationParts[0]; // e.g., "michali sougioul"

    if (!locationName || locationName.length < 3) return false;

    // Check if the /place/ path contains the location name followed by a number (house number)
    // e.g., "michali sougioul 21" in the place path
    const nameInPath = placePath.includes(locationName);
    if (!nameInPath) return false;

    // Find the position of the name in the path and check what follows
    const nameIndex = placePath.indexOf(locationName);
    const afterName = placePath
      .substring(nameIndex + locationName.length)
      .trim();

    // If what follows the name starts with a number (1-4 digits), it's a house number → street
    if (/^\s*\d{1,4}[,\s]/.test(afterName) || /^\s*\d{1,4}$/.test(afterName)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a URL points to a document file (DOCX, PDF, etc.)
 * Used to filter out document URLs that AI might confuse as images
 */
export function isDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const docExtensions = [
      ".docx",
      ".pdf",
      ".doc",
      ".xlsx",
      ".xls",
      ".pptx",
      ".ppt",
    ];

    // Check pathname (ignoring query string)
    if (docExtensions.some((ext) => pathname.endsWith(ext))) {
      return true;
    }

    // Check for document patterns in path
    if (
      pathname.includes("/documents/") ||
      pathname.includes("wordprocessingml")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
