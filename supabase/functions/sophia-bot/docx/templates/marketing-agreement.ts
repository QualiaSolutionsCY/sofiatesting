/**
 * Non-Exclusive Marketing Agreement - DOCX Generator
 *
 * Template 15: Generates a non-exclusive marketing agreement
 * matching the official ZPG document format.
 *
 * FIXES APPLIED (Feb 2026):
 * - Consistent Calibri font throughout (no mixed fonts)
 * - Proper paragraph structure for seller info
 * - Heading spacing before Service/General sections
 * - Currency formatting with € symbol and thousand separators
 * - Consistent numbered list spacing
 * - Adequate signature space in table
 * - Single page fit optimization
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";

import { FONTS } from "../styles.ts";
import { logger, LogCategory } from "../../utils/logger.ts";

/**
 * Structured property info for single line display
 * Format: "Cynthiana Complex Flat No. 105, Agios Theodoros, Paphos (Registration No 0/1547)"
 */
export interface PropertyInfo {
  description: string;  // Full single line with address, flat no, and registration
}

/**
 * Marketing Agreement Data
 */
export interface MarketingAgreementData {
  agreementDate: string; // e.g., "1st March 2026"
  sellerFullName: string; // Matches registry.ts requiredFields
  propertyRegistration: string; // e.g., "Reg No. 0/12345 Tala, Paphos" (raw input)
  marketingPrice: string; // e.g., "350000" or "350,000"
  agentName: string; // Auto-filled from agent record
  propertyInfo?: PropertyInfo; // Structured property data for two-line display
}

/**
 * Format date as ordinal (e.g., "1st March 2026")
 */
function formatOrdinalDate(date: Date = new Date()): string {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  const suffix = getOrdinalSuffix(day);
  return `${day}${suffix} ${month} ${year}`;
}

/**
 * Get ordinal suffix for a number
 */
function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Format price with euro symbol and thousand separators
 * Input: "400000" or "400,000" or "€400,000"
 * Output: "€400,000"
 */
function formatPrice(price: string): string {
  if (!price) return "[PRICE]";

  // Remove any existing currency symbols, spaces, and commas
  const cleanPrice = price.replace(/[€$\s,]/g, "");

  // Parse as number
  const numericPrice = parseInt(cleanPrice, 10);

  if (isNaN(numericPrice)) {
    return price; // Return original if can't parse
  }

  // Format with euro symbol and thousand separators
  return `€${numericPrice.toLocaleString("en-IE")}`;
}

/**
 * Format property information into single line format
 *
 * Target format (matches reservation agreement with "in"):
 * "Registration No. 0/654 in Tala, Paphos (Cynthiana Complex, Flat No. 103B)"
 *
 * Input examples:
 * - "0/1547 Cynthiana Complex Agios Theodoros, Paphos Flat No. 105"
 * - "Flat No. 103, Cynthiana Complex, Tala, Paphos reg no 0/1234"
 * - "Limas Building 1045 Limassol"
 */
function formatPropertyInfo(rawInput: string): PropertyInfo {
  if (!rawInput || rawInput.length < 3) {
    return {
      description: "[Property Information]",
    };
  }

  // Clean the input
  let input = rawInput
    .replace(/^Property\s+(with\s+)?/i, '')
    .replace(/^Title\s+Deed\s+/i, '')
    .replace(/\bsituated\s+in\b/gi, '')
    .replace(/\bwith\s+Registration\s+Number\b/gi, '')
    .replace(/\bwith\s+reg\s*(?:no\.?)?\b/gi, '')
    .replace(/\b(penthouse|townhouse|detached|semi-detached|maisonette|bungalow|villa)\s+(apartment|house|property)?\b/gi, '$1')
    .replace(/\bin\s+(?=[A-Z])/g, '')
    .trim();

  // Extract registration number (format: 0/1234 or 1/12345)
  const regMatch = input.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?|Number)?\s*)?(\d+\/\d+)/i);
  const regNumber = regMatch ? regMatch[1] : null;

  // Remove registration number and related text from input
  if (regNumber) {
    input = input
      .replace(/Reg(?:istration)?\.?\s*(?:No\.?|Number)?\s*\d+\/\d+/gi, '')
      .replace(regNumber, '')
      .trim();
  }

  // Clean up remaining input
  input = input
    .replace(/^,\s*/, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  // ===== EXTRACT FLAT/UNIT AND COMPLEX/BUILDING BEFORE location detection =====
  // This prevents building names from being swallowed into location text

  // Extract Flat No, Unit No, House No (including letter suffixes like "103B", "103 B")
  let flatInfo = "";
  const flatNoMatch = input.match(/\b(flat|unit|apt|apartment|house|townhouse|villa|bungalow|penthouse|maisonette)\s*(?:no\.?|number)?\s*(\d+\s*[A-Za-z]?|\d+-?[A-Za-z])/i);
  if (flatNoMatch) {
    const flatNum = flatNoMatch[2].replace(/\s+/g, '').toUpperCase();
    const flatType = flatNoMatch[1].charAt(0).toUpperCase() + flatNoMatch[1].slice(1).toLowerCase();
    flatInfo = `${flatType} No. ${flatNum}`;
    input = input.replace(flatNoMatch[0], '').trim();
  }

  // Extract complex/building name (e.g., "Marion Court", "Limas Building", "Cynthiana Complex")
  // Only ONE word before indicator to avoid capturing location names (e.g., "nicosia marion court" → just "Marion Court")
  // Also capture optional "Block X" suffix (e.g., "Arion Court Block 2")
  let complexInfo = "";
  const complexIndicators = 'Court|Complex|Tower|Building|Residence|Residences|Gardens|Heights|Village|Park|Plaza|Villas|Apartments';
  const complexMatch = input.match(new RegExp(`\\b([A-Za-z]+\\s+(?:${complexIndicators}))(?:\\s+(Block\\s*\\d+[A-Za-z]?))?\\b`, 'i'));
  if (complexMatch) {
    let name = complexMatch[1].replace(/\b\w/g, c => c.toUpperCase());
    if (complexMatch[2]) {
      name += `, ${complexMatch[2].replace(/\b\w/g, c => c.toUpperCase())}`;
    }
    complexInfo = name;
    input = input.replace(complexMatch[0], '').trim();
  } else {
    // Try standalone "Block X" (e.g., "Block 2", "Block A")
    const blockMatch = input.match(/\b(Block\s*\d+[A-Za-z]?)\b/i);
    if (blockMatch) {
      complexInfo = blockMatch[1].replace(/\b\w/g, c => c.toUpperCase());
      input = input.replace(blockMatch[0], '').trim();
    }
  }

  // Clean up after extractions (including trailing commas)
  input = input.replace(/^,\s*/, '').replace(/,\s*$/, '').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

  // ===== NOW do location detection on the remaining clean text =====

  // Major districts/cities - insert comma before these when preceded by a town name
  const majorDistricts = [
    'paphos', 'pafos', 'limassol', 'larnaca', 'nicosia', 'famagusta',
    'lakatamia', 'strovolos', 'engomi', 'latsia', 'aglantzia', // Nicosia municipalities
    'germasogeia', 'agios tychonas', 'mesa geitonia', // Limassol municipalities
  ];

  // Insert comma before major district names when they follow a word (town name)
  for (const district of majorDistricts) {
    const pattern = new RegExp(`(\\b[A-Za-z]+)\\s+(${district})\\b`, 'gi');
    input = input.replace(pattern, '$1, $2');
  }

  // Cyprus locations for identifying the location part
  const cyprusLocations = [
    // Major districts
    'paphos', 'pafos', 'limassol', 'larnaca', 'nicosia', 'famagusta',
    // Paphos areas
    'tala', 'universal', 'chloraka', 'geroskipou', 'kato paphos',
    'coral bay', 'peyia', 'kissonerga', 'emba', 'mesogi', 'tremithousa',
    'yeroskipou', 'konia', 'mandria', 'kouklia', 'polis', 'latchi',
    // Limassol areas
    'agios tychonas', 'agios theodoros', 'germasogeia', 'mouttayiaka',
    'mesa geitonia', 'zakaki', 'potamos germasogeia', 'columbia', 'polemidia',
    'souni-zanakia', 'souni', 'zanakia', 'parekklisia', 'pyrgos', 'mouttagiaka',
    'erimi', 'episkopi', 'kolossi', 'ypsonas', 'agios athanasios',
    // Nicosia areas
    'strovolos', 'engomi', 'lakatamia', 'latsia', 'aglantzia',
    'anthoupoli', 'acropolis', 'makedonitissa', 'kaimakli', 'pallouriotissa',
    'agios dometios', 'agios andreas', 'dasoupolis', 'aglanzia',
    // Larnaca areas
    'oroklini', 'livadia', 'pervolia', 'kiti', 'mazotos', 'aradippou',
    'kamares', 'vergina', 'finikoudes', 'drosia', 'chrysopolitissa',
    // Famagusta areas
    'paralimni', 'ayia napa', 'protaras', 'sotira', 'derynia',
    'kapparis', 'pernera', 'vrysoulles', 'liopetri',
  ];

  // Split by comma to identify parts (filter empty strings from trailing commas)
  const parts = input.split(/,\s*/).filter(p => p.trim());

  // Find location parts (from the end)
  let locationStartIdx = parts.length;
  for (let i = parts.length - 1; i >= 0; i--) {
    const partLower = parts[i].toLowerCase().trim();
    const isLocation = cyprusLocations.some(loc => partLower === loc || partLower.includes(loc));
    if (isLocation) {
      locationStartIdx = i;
    } else {
      break;
    }
  }

  // Extract property description and location
  const propertyParts = parts.slice(0, locationStartIdx);
  let locationParts = parts.slice(locationStartIdx);

  // If no location found, try to extract from the property parts
  if (locationParts.length === 0 && propertyParts.length > 0) {
    const lastPart = propertyParts[propertyParts.length - 1].toLowerCase();
    if (cyprusLocations.some(loc => lastPart === loc || lastPart.includes(loc))) {
      locationParts = [propertyParts.pop()!];
    }
  }

  // Remaining propertyParts: if we already have complexInfo AND known locations,
  // unrecognized parts before the location are likely village/area names (e.g., "Souni-Zanakia")
  // Prepend them to locationParts so they're not lost
  if (propertyParts.length > 0 && locationParts.length > 0 && complexInfo) {
    locationParts = [...propertyParts.map(p => p.trim()).filter(p => p), ...locationParts];
  } else {
    // Pick up any extra complex/property info from propertyParts not already captured
    for (const part of propertyParts) {
      if (part.trim() && !complexInfo) {
        complexInfo = part.trim().replace(/\b\w/g, c => c.toUpperCase());
      } else if (part.trim() && complexInfo) {
        // If complexInfo already set, treat as location
        locationParts = [part.trim(), ...locationParts];
      }
    }
  }

  // Build location string
  const location = locationParts.join(', ').trim();

  // Build building/flat info (without location)
  const buildingParts: string[] = [];
  if (complexInfo) buildingParts.push(complexInfo);
  if (flatInfo) buildingParts.push(flatInfo);
  const buildingInfo = buildingParts.join(', ').replace(/,\s*,/g, ',').trim();

  // Format: "Registration No. 0/654 in Tala, Paphos (Cynthiana Complex, Flat No. 103B)"
  // Always use "in" before location/building, always include flat numbers
  let description: string;
  if (regNumber && location && buildingInfo) {
    description = `Registration No. ${regNumber} in ${location} (${buildingInfo})`;
  } else if (regNumber && location) {
    // Add flat info if we have it even without building
    if (flatInfo) {
      description = `Registration No. ${regNumber} in ${location} (${flatInfo})`;
    } else {
      description = `Registration No. ${regNumber} in ${location}`;
    }
  } else if (regNumber && buildingInfo) {
    // Use "in" for building/complex names
    description = `Registration No. ${regNumber} in ${buildingInfo}`;
  } else if (regNumber && flatInfo) {
    // Just flat number with reg
    description = `Registration No. ${regNumber} (${flatInfo})`;
  } else if (regNumber) {
    description = `Registration No. ${regNumber}`;
  } else if (buildingInfo && location) {
    description = `${buildingInfo} in ${location}`;
  } else {
    description = buildingInfo || location || input;
  }

  return {
    description: description.replace(/,\s*$/, '').replace(/\(\s*\)/g, '').trim(),
  };
}

/**
 * Creates a Non-Exclusive Marketing Agreement document
 * Clean format: no outer border, no red text, fits on one page
 */
export function createMarketingAgreement(
  data: MarketingAgreementData
): Document {
  // Use provided date or default to today
  const agreementDate = data.agreementDate || formatOrdinalDate();

  // Format placeholders - use brackets for empty/missing values
  const sellerDisplay = data.sellerFullName || "[Seller's Name]";
  const rawPropertyInfo = data.propertyRegistration || "[Property Information]";

  // Get property info (single line format)
  // Use provided propertyInfo if available, otherwise parse from raw input
  const structuredProperty = data.propertyInfo || formatPropertyInfo(rawPropertyInfo);
  const propertyDisplay = structuredProperty.description || rawPropertyInfo;

  const priceDisplay = formatPrice(data.marketingPrice);
  const agentDisplay = data.agentName || "[Agent's Name]";
  const dateDisplay = agreementDate || "[Date]";

  // Border style for signature table only
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: "000000",
  };

  const noBorder = {
    style: BorderStyle.NONE,
    size: 0,
    color: "FFFFFF",
  };

  // Font settings - consistent throughout
  const fontFamily = FONTS.PRIMARY; // Calibri
  const bodySize = 22; // 11pt in half-points
  const titleSize = 28; // 14pt in half-points

  // Spacing constants (in twips - twentieths of a point)
  const clauseSpacing = 80; // Space after each numbered clause
  const sectionSpacing = 240; // Space before section headings (Service, General)
  const paragraphSpacing = 160; // Standard paragraph spacing

  return new Document({
    // Set default styles to ensure font consistency
    styles: {
      default: {
        document: {
          run: {
            font: fontFamily,
            size: bodySize,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,    // 0.5 inch
              bottom: 720, // 0.5 inch
              left: 1080,  // 0.75 inch
              right: 1080, // 0.75 inch
            },
          },
        },
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: "Marketing Agreement",
                bold: true,
                size: titleSize,
                font: fontFamily,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: paragraphSpacing },
          }),

          // Agreement date line
          new Paragraph({
            children: [
              new TextRun({
                text: `This agreement made on the: ${dateDisplay}`,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: paragraphSpacing },
          }),

          // BETWEEN clause
          new Paragraph({
            children: [
              new TextRun({
                text: "BETWEEN: CSC Zyprus Property Group LTD",
                bold: true,
                size: bodySize,
                font: fontFamily,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the \"Agent\")",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: paragraphSpacing },
          }),

          // And
          new Paragraph({
            children: [
              new TextRun({
                text: "And",
                bold: true,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: paragraphSpacing },
          }),

          // Seller and property info - SINGLE paragraph to avoid line breaks
          new Paragraph({
            children: [
              new TextRun({
                text: sellerDisplay,
                bold: true,
                size: bodySize,
                font: fontFamily,
              }),
              new TextRun({
                text: " (Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property: ",
                size: bodySize,
                font: fontFamily,
              }),
              new TextRun({
                text: propertyDisplay,
                size: bodySize,
                font: fontFamily,
              }),
              new TextRun({
                text: " (hereinafter referred to as 'the Property') which the seller wishes to promote for sale. The Seller gives to the agent the right to market and advertise the sale of the Property based upon the following terms and conditions.",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: sectionSpacing },
          }),

          // SERVICE section header - with proper spacing before
          new Paragraph({
            children: [
              new TextRun({
                text: "Service",
                bold: true,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { before: sectionSpacing, after: clauseSpacing },
          }),

          // Clause 1
          new Paragraph({
            children: [
              new TextRun({
                text: "1. The Agent may advertise the Property. This is a NON-EXCLUSIVE agreement.",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Clause 2
          new Paragraph({
            children: [
              new TextRun({
                text: "2. If the Property is sold to a purchaser introduced to the Seller by the Agent, then the Agent will receive the fee as mentioned in clause 4 (four).",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Clause 3
          new Paragraph({
            children: [
              new TextRun({
                text: "3. If, at any time following the termination of this agreement, the Property, is sold to any person having been Introduced by the Agent to the Seller prior to the termination of this agreement, then the Agent will receive the fee as mentioned in clause 4 (four).",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Clause 4
          new Paragraph({
            children: [
              new TextRun({
                text: "4. The Agent's fee is hereby agreed to be an amount equal to 5.0% plus (Value Added Tax), of the agreed sale value of the Property.",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Clause 5 - Marketing Price with proper currency formatting
          new Paragraph({
            children: [
              new TextRun({
                text: `5. The initial agreed marketing price is ${priceDisplay}`,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Clause 6
          new Paragraph({
            children: [
              new TextRun({
                text: "6. In the unusual case that any registered client of the Agent gets into direct communication with the Seller, then the Seller acknowledges that is legally bound to stop such communication, inform immediately the Agent, and inform the client that any communication must be continued only via the Agent.",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: sectionSpacing },
          }),

          // GENERAL section header - with proper spacing before
          new Paragraph({
            children: [
              new TextRun({
                text: "General",
                bold: true,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { before: sectionSpacing, after: clauseSpacing },
          }),

          // Agent contact clause - single paragraph
          new Paragraph({
            children: [
              new TextRun({
                text: `It is clearly agreed that the Seller was brought into contact with the CSC Zyprus Property Group LTD represented by ${agentDisplay}.`,
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: clauseSpacing },
          }),

          // Termination clause
          new Paragraph({
            children: [
              new TextRun({
                text: "This agreement shall continue for 30 days after either party receives written notice to terminate from the other.",
                size: bodySize,
                font: fontFamily,
              }),
            ],
            spacing: { after: sectionSpacing },
          }),

          // Signature table with adequate space for signatures
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Row 1: Signed labels
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Signed:",
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                    ],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: tableBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: noBorder,
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Signed:",
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                    ],
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: tableBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: noBorder,
                    },
                  }),
                ],
              }),
              // Row 2: Empty space for signatures (3 blank lines worth)
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                    ],
                    borders: {
                      top: noBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: noBorder,
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                      new Paragraph({ children: [], spacing: { after: 200 } }),
                    ],
                    borders: {
                      top: noBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: noBorder,
                    },
                  }),
                ],
              }),
              // Row 3: On behalf of The Agent / The Seller
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "On behalf of The Agent:",
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Charalambos Pitros",
                            bold: true,
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                    ],
                    borders: {
                      top: noBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: tableBorder,
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "The Seller:",
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: sellerDisplay,
                            bold: true,
                            size: bodySize,
                            font: fontFamily,
                          }),
                        ],
                      }),
                    ],
                    borders: {
                      top: noBorder,
                      left: tableBorder,
                      right: tableBorder,
                      bottom: tableBorder,
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
}

/**
 * Parse AI response to extract marketing agreement data
 */
export function parseMarketingAgreementData(
  response: string,
  agentName: string
): MarketingAgreementData | null {
  try {
    const cleanResponse = response.replace(/\*\*/g, "");
    logger.debug("[MarketingAgreement] Parsing response...");
    logger.debug("[MarketingAgreement] Clean response preview", { preview: cleanResponse.substring(0, 500) });

    // Extract seller name - multiple patterns for different AI output formats
    const sellerMatch =
      // Pattern 1: After "And" on new line, followed by dots (DOCX format)
      cleanResponse.match(/\bAnd\s*\n+\s*([A-Za-z][A-Za-z\s]+?)(?:……|\.\.\.|\n)/i) ||
      // Pattern 2: "Name:" in signature section followed by seller name
      cleanResponse.match(/\bName:\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i) ||
      // Pattern 3: "Seller's Name:" or "Seller:" prefix
      cleanResponse.match(/Seller(?:'s)?\s*(?:Name)?[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i) ||
      // Pattern 4: "name of the seller" or just "seller:"
      cleanResponse.match(/(?:name of the seller|seller)[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i) ||
      // Pattern 5: "Dear [name]" in email format
      cleanResponse.match(/Dear\s+([A-Za-z][A-Za-z\s]+?)[\n,]/i) ||
      // Pattern 6: "The Seller" section in signature - "The Seller\nName: X"
      cleanResponse.match(/The Seller\s*\n\s*Name:\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i);

    // Extract property registration - capture the full line including location
    // IMPORTANT: Avoid matching company names like "CSC Zyprus Property Group LTD"

    // First, try to find a complete line containing both property keywords AND registration number
    // This handles "Limas Building Flat 105 Registration No. 0/453" format
    const fullLineWithReg = cleanResponse.match(/^.*(?:Building|Complex|Tower|Block|Court|Residence|Residences|Gardens|Heights|Flat|Apartment|Unit).*\d+\/\d+.*$/im);

    // Also look for Building/Court/Complex name separately (might be on different line from reg number)
    const buildingMatch = cleanResponse.match(/([A-Za-z]+\s+(?:Building|Court|Complex|Tower|Residence|Residences|Gardens|Heights|Block))(?:\s+(?:Flat|Apartment|Unit)\s*(?:No\.?)?\s*\d+)?/i);
    const flatMatch = cleanResponse.match(/(?:Flat|Apartment|Unit)\s*(?:No\.?)?\s*(\d+[A-Za-z]?)/i);
    const regNumMatch = cleanResponse.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?)?\s*)?(\d+\/\d+)/i);

    // Combine building + flat + reg if found separately
    let combinedProperty = "";
    if (buildingMatch && regNumMatch) {
      const building = buildingMatch[1];
      const flat = flatMatch ? `Flat No. ${flatMatch[1]}` : "";
      const reg = regNumMatch[1];
      combinedProperty = `${building}${flat ? " " + flat : ""} ${reg}`.trim();
    }

    const regMatch =
      // Pattern 1 (HIGHEST PRIORITY): Full property description after "Property:" or "owner of Property"
      // Captures reg + building + flat + location in one shot. Uses lookahead to stop before legal boilerplate.
      // (?!\s+Group) prevents matching "Property Group LTD"
      cleanResponse.match(/(?:owner of\s+)?Property(?!\s+Group)[:\s]+(?:with\s+)?(?:Registration\s+(?:No\.?\s*)?)?([^\n]*?\d+\/\d+[^\n]*?)(?=\s*\(?hereinafter|\s*which\s+the\s+seller|\s*$)/im) ||
      // Pattern 2: "Property with 0/1234 Location" - captures full text including location
      cleanResponse.match(/Property\s+with\s+(?:Registration\s+(?:No\.?\s*)?)?(\d+\/\d+[^\n]*?)(?=\s*\(?hereinafter|\s*which\s+the\s+seller|\s*$)/im) ||
      // Pattern 3: Full line with property keywords + registration
      (fullLineWithReg && !fullLineWithReg[0].includes("Property Group") ? [fullLineWithReg[0], fullLineWithReg[0].trim()] : null) ||
      // Pattern 4: Combined building + flat + reg from separate matches (fallback - NO location)
      (combinedProperty ? [combinedProperty, combinedProperty] : null) ||
      // Pattern 5: Standard registration number format with Reg prefix: Reg No. 0/1234
      cleanResponse.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?)?)[:\s]*(\d+\/\d+[^\n]*)(?:\n|$)/i) ||
      // Pattern 6: Building with number: "Limas Building 1045" or "Limas Building No. 123"
      cleanResponse.match(/([A-Za-z]+\s+Building\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i) ||
      // Pattern 7: Flat/Apartment format: "Flat No. 103" or "Apartment 5"
      cleanResponse.match(/((?:Flat|Apartment|Unit)\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i) ||
      // Pattern 8: Complex/Tower/Block: "Cynthiana Complex 103"
      cleanResponse.match(/([A-Za-z]+\s+(?:Complex|Tower|Block)\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i) ||
      // Pattern 9: Explicit "Property registration:" or "Property information:" field
      cleanResponse.match(/Property(?:'s)?\s+(?:registration|information)[:\s]+([^\n]+)/i) ||
      // Pattern 10: "Property Details:" field (but NOT "Property Group")
      cleanResponse.match(/Property\s+Details[:\s]+([^\n]+)/i);

    // Extract marketing price - handle "price is €X" and "price: €X" formats
    const priceMatch =
      cleanResponse.match(/(?:marketing\s+)?price\s+is\s+[€$]?\s*([\d,]+)/i) ||
      cleanResponse.match(/(?:Marketing\s+)?Price[:\s]+[€$]?\s*([\d,]+)/i) ||
      cleanResponse.match(/[€$]\s*([\d,]+)/);

    // Extract date if provided
    const dateMatch = cleanResponse.match(
      /(?:Date|Agreement\s+Date)[:\s]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i
    );

    let sellerName = sellerMatch ? sellerMatch[1].trim() : "";
    // Clean up property registration - trim and remove trailing punctuation
    let propertyRegistration = regMatch ? regMatch[1].trim() : "";
    logger.debug("[MarketingAgreement] Property extraction matched:", { rawMatch: propertyRegistration.substring(0, 200) });
    // Remove trailing periods, commas, or parentheses that may have been captured
    propertyRegistration = propertyRegistration.replace(/[.,;:\s]+$/, "").trim();

    // Validate property registration - reject company names and invalid patterns
    const invalidPropertyPatterns = [
      /^Group\s+LTD$/i,
      /^Property\s+Group/i,
      /^CSC\s+Zyprus/i,
      /^Zyprus\s+Property/i,
      /^the\s+property$/i,
      /^\[.*\]$/,  // Bracketed placeholders
      /^XXXXXXXX$/i,
      /^X+$/i,
    ];

    if (propertyRegistration && invalidPropertyPatterns.some(pattern => pattern.test(propertyRegistration))) {
      logger.debug(`[MarketingAgreement] Invalid property info detected: "${propertyRegistration}" - rejecting`, { category: LogCategory.GENERAL });
      propertyRegistration = "";
    }

    const marketingPrice = priceMatch ? priceMatch[1].replace(/,/g, "") : "";
    const agreementDate = dateMatch ? dateMatch[1] : formatOrdinalDate();

    // Validate seller name - reject known invalid patterns
    const invalidSellerPatterns = [
      /^by\s+the\s+agent$/i,
      /^the\s+agent$/i,
      /^agent$/i,
      /^name\s+of\s+(the\s+)?seller$/i,
      /^seller$/i,
      /^the\s+seller$/i,
      /^\[.*\]$/,  // Bracketed placeholders like [SELLER_NAME]
      /^XXXXXXXX$/i,
      /^X+$/i,
    ];

    if (sellerName && invalidSellerPatterns.some(pattern => pattern.test(sellerName))) {
      logger.debug(`[MarketingAgreement] Invalid seller name detected: "${sellerName}" - rejecting`, { category: LogCategory.GENERAL });
      sellerName = "";
    }

    logger.debug("[MarketingAgreement] Extracted:", {
      sellerName,
      propertyRegistration,
      marketingPrice,
      agreementDate,
      agentName,
    });

    // Require at least seller name and property registration
    if (!sellerName || !propertyRegistration) {
      logger.debug("[MarketingAgreement] Missing required fields", { hasSellerName: !!sellerName, hasPropertyReg: !!propertyRegistration });
      return null;
    }

    // Format property info into single line format
    const formattedProperty = formatPropertyInfo(propertyRegistration);

    logger.debug("[MarketingAgreement] Formatted property:", {
      description: formattedProperty.description,
    });

    return {
      agreementDate,
      sellerFullName: sellerName, // Map local variable to interface field
      propertyRegistration,
      marketingPrice,
      agentName,
      propertyInfo: formattedProperty, // Single line property description
    };
  } catch (error) {
    logger.error("[MarketingAgreement] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
