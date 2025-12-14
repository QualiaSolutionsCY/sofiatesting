import { tool } from "ai";
import { z } from "zod";

// Greek term mappings for title deed parsing
const GREEK_TERMS = {
  // Area measurements
  "ΚΛΕΙΣΤΟΣ ΧΩΡΟΣ": "indoorArea",
  "Κλειστός χώρος": "indoorArea",
  "ΚΑΛΥΜΜΕΝΕΣ ΒΕΡΑΝΤΕΣ": "coveredVeranda",
  "Καλυμμένες βεράντες": "coveredVeranda",
  "ΑΚΑΛΥΠΤΕΣ ΒΕΡΑΝΤΕΣ": "uncoveredVeranda",
  "Ακαλύπτες βεράντες": "uncoveredVeranda",
  ΟΙΚΟΠΕΔΟ: "plotArea",
  Οικόπεδο: "plotArea",

  // Features
  ΑΠΟΘΗΚΗ: "storageRoom",
  Αποθήκη: "storageRoom",
  ΑΠΟΘΗΚΕΣ: "storageRooms",
  Αποθήκες: "storageRooms",
  "ΚΑΛΥΜΜΕΝΟΣ ΧΩΡΟΣ ΣΤΑΘΜΕΥΣΗΣ": "coveredParking",
  "Καλυμμένος χώρος στάθμευσης": "coveredParking",

  // Property details
  ΟΡΟΦΟΣ: "floor",
  Όροφος: "floor",
  "ΕΤΟΣ ΚΑΤΑΣΚΕΥΗΣ": "yearBuilt",
  "Έτος κατασκευής": "yearBuilt",

  // Registration
  "ΑΡΙΘΜΟΣ ΚΤΗΜΑΤΟΛΟΓΙΟΥ": "deedNumber",
  "Αριθμός Κτηματολογίου": "deedNumber",
  "ΣΥΝΟΛΙΚΟΣ ΑΡΙΘΜΟΣ": "deedNumber",
  "Συνολικός αριθμός": "deedNumber",
};

/**
 * Parse numeric values from Greek text
 * Handles patterns like "76,00 τ.μ." or "76 τετραγωνικά"
 */
function parseGreekNumber(text: string): number | null {
  // Remove common separators and find numbers
  const cleanText = text.replace(/[.,]/g, (match) =>
    match === "," ? "." : ""
  );
  const numberMatch = cleanText.match(/(\d+(?:\.\d+)?)/);

  if (numberMatch) {
    const num = Number.parseFloat(numberMatch[1]);
    // Check if it's in square meters
    if (
      text.includes("τ.μ") ||
      text.includes("τετραγων") ||
      text.includes("μ²")
    ) {
      return num;
    }
  }

  return null;
}

/**
 * Parse floor number from Greek text
 */
function parseFloor(text: string): string | null {
  const floorMap: Record<string, string> = {
    "1ος": "1st Floor",
    "2ος": "2nd Floor",
    "3ος": "3rd Floor",
    "4ος": "4th Floor",
    Πρώτος: "1st Floor",
    Δεύτερος: "2nd Floor",
    Τρίτος: "3rd Floor",
    Τέταρτος: "4th Floor",
    ΙΣΟΓΕΙΟ: "Ground Floor",
    Ισόγειο: "Ground Floor",
    ΗΜΙΟΡΟΦΟΣ: "Mezzanine",
    Ημιόροφος: "Mezzanine",
  };

  for (const [greek, english] of Object.entries(floorMap)) {
    if (text.toLowerCase().includes(greek.toLowerCase())) {
      return english;
    }
  }

  return null;
}

/**
 * Parse district/municipality from address
 */
function parseLocation(
  text: string
): { district?: string; municipality?: string } | null {
  const districts = [
    "ΛΕΜΕΣΟΣ",
    "ΛΕΥΚΩΣΙΑ",
    "ΠΑΦΟΣ",
    "ΛΑΡΝΑΚΑ",
    "ΑΜΜΟΧΩΣΤΟΣ",
    "ΛΕΦΚΩΣΙΑ",
  ];
  const municipalities = [
    "ΓΕΡΜΑΣΟΓΕΙΑ",
    "ΛΙΜΑΣΣΟΛ",
    "ΜΕΣΑ ΓΕΙΤΩΝΙΑ",
    "ΑΓΛΑΝΤΖΙΑ",
    "ΚΑΤΟ ΠΟΛΕΜΙΔΙΑ",
    "ΛΑΤΣΙΑ",
    "ΓΕΡΙ",
    "ΣΤΡΟΒΟΛΟΣ",
    "ΑΓΙΟΣ ΔΟΜΕΤΡΙΟΣ",
    "ΕΓΚΟΜΗ",
    "ΓΕΡΟΣΚΙΠΟΥ",
    "ΠΕΓΕΙΑ",
    "ΠΟΛΙΣ ΧΡΥΣΟΧΟΥΣ",
    "ΚΟΡΝΟΣ",
  ];

  const result: { district?: string; municipality?: string } = {};

  // Check for district
  for (const district of districts) {
    if (text.includes(district)) {
      // Map Greek names to English
      const districtMap: Record<string, string> = {
        ΛΕΜΕΣΟΣ: "Limassol",
        ΛΕΥΚΩΣΙΑ: "Nicosia",
        ΠΑΦΟΣ: "Paphos",
        ΛΑΡΝΑΚΑ: "Larnaca",
        ΑΜΜΟΧΩΣΤΟΣ: "Famagusta",
        ΛΕΦΚΩΣΙΑ: "Nicosia",
      };
      result.district = districtMap[district] || district;
      break;
    }
  }

  // Check for municipality
  for (const municipality of municipalities) {
    if (text.includes(municipality)) {
      // Map to common English names
      const municipalityMap: Record<string, string> = {
        ΓΕΡΜΑΣΟΓΕΙΑ: "Germasogeia",
        ΛΑΤΣΙΑ: "Latsia",
        ΓΕΡΙ: "Geri",
        ΣΤΡΟΒΟΛΟΣ: "Strovolos",
        "ΑΓΙΟΣ ΔΟΜΕΤΡΙΟΣ": "Agios Dimitrios",
        ΕΓΚΟΜΗ: "Engomi",
        ΠΕΓΕΙΑ: "Peyia",
        "ΠΟΛΙΣ ΧΡΥΣΟΧΟΥΣ": "Polis Chrysochous",
      };
      result.municipality = municipalityMap[municipality] || municipality;
      break;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Parse owner information from deed
 */
function parseOwner(text: string): string | null {
  // Look for patterns like "Ιδιοκτήτης: [Name]" or "Κάτοχος: [Name]"
  const patterns = [
    /Ιδιοκτήτης[:\s]+([A-Z][Α-Ω\s]+)(?=\s|$)/i,
    /Κάτοχος[:\s]+([A-Z][Α-Ω\s]+)(?=\s|$)/i,
    /Κάτοχος\s+([A-Z][Α-Ω\s]+)(?=\s|$)/i,
    /Owner[:\s]+([A-Za-z\s]+)(?=\s|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract structured data from title deed text (OCR or user input)
 */
// Temporarily commented out due to TypeScript issue
// TODO: Fix tool definition for AI v5
/*
export const parseTitleDeedTool = tool({
  description: "Parse property details from a title deed text or OCR result. Extracts area measurements, features, owner info, and registration details from Greek/English title deeds.",
  parameters: z.object({
    deedText: z
      .string()
      .describe("The text content of the title deed (from OCR or user input). Can be in Greek or English.")
  }),
  execute: async ({ deedText }: { deedText: string }) => {
    try {
      const result: any = {
        indoorArea: null,
        coveredVeranda: null,
        uncoveredVeranda: null,
        plotArea: null,
        storageRoom: false,
        coveredParking: false,
        floor: null,
        yearBuilt: null,
        deedNumber: null,
        owner: null,
        district: null,
        municipality: null,
        extractedData: {}
      };

      const lines = deedText.split('\n');

      for (const line of lines) {
        const cleanLine = line.trim();

        // Parse area measurements
        for (const [greekTerm, field] of Object.entries(GREEK_TERMS)) {
          if (cleanLine.includes(greekTerm)) {
            if (field === 'storageRoom' || field === 'storageRooms' || field === 'coveredParking') {
              if (field === 'storageRoom' || field === 'storageRooms') {
                result.storageRoom = true;
              } else if (field === 'coveredParking') {
                result.coveredParking = true;
              }
              result.extractedData[field] = true;
            } else if (field === 'floor') {
              const floor = parseFloor(cleanLine);
              if (floor) {
                result.floor = floor;
                result.extractedData[field] = floor;
              }
            } else if (field === 'yearBuilt') {
              const yearMatch = cleanLine.match(/(19|20)\d{2}/);
              if (yearMatch) {
                result.yearBuilt = parseInt(yearMatch[0]);
                result.extractedData[field] = result.yearBuilt;
              }
            } else if (field === 'deedNumber') {
              const deedMatch = cleanLine.match(/(\d+\/\d+)/);
              if (deedMatch) {
                result.deedNumber = deedMatch[0];
                result.extractedData[field] = result.deedNumber;
              }
            } else {
              // Area measurements
              const area = parseGreekNumber(cleanLine);
              if (area) {
                result[field] = area;
                result.extractedData[field] = area;
              }
            }
          }
        }

        // Parse location
        const location = parseLocation(cleanLine);
        if (location) {
          if (location.district) {
            result.district = location.district;
            result.extractedData.district = location.district;
          }
          if (location.municipality) {
            result.municipality = location.municipality;
            result.extractedData.municipality = location.municipality;
          }
        }

        // Parse owner
        const owner = parseOwner(cleanLine);
        if (owner && !result.owner) {
          result.owner = owner;
          result.extractedData.owner = owner;
        }
      }

      return {
        success: true,
        data: result,
        summary: `Extracted ${Object.keys(result.extractedData).length} details from title deed`
      };
    } catch (error) {
      console.error("Error parsing title deed:", error);
      return {
        success: false,
        error: "Failed to parse title deed text",
        data: null
      };
    }
  },
});
*/
