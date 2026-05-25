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
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "https://esm.sh/docx@8.5.0";
import { LogCategory, logger } from "../../utils/logger.ts";
import { formatPropertyDescription } from "../../utils/property-formatter.ts";
import { FONTS } from "../styles.ts";

/**
 * Structured property info for single line display
 * Format: "Cynthiana Complex Flat No. 105, Agios Theodoros, Paphos (Registration No 0/1547)"
 */
export interface PropertyInfo {
  description: string; // Full single line with address, flat no, and registration
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
  const numericPrice = Number.parseInt(cleanPrice, 10);

  if (isNaN(numericPrice)) {
    return price; // Return original if can't parse
  }

  // Format with euro symbol and thousand separators
  return `€${numericPrice.toLocaleString("en-IE")}`;
}

/**
 * Format raw property input into a PropertyInfo object.
 * Delegates to the shared formatPropertyDescription() from property-formatter.ts.
 */
export function formatPropertyInfo(rawInput: string): PropertyInfo {
  if (!rawInput || rawInput.length < 3) {
    return { description: "[Property Information]" };
  }
  return { description: formatPropertyDescription(rawInput) };
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
  const sellerDisplay = data.sellerFullName || "[SELLER NAME]";
  const rawPropertyInfo = data.propertyRegistration || "[Property Information]";

  // Get property info (single line format)
  // Use provided propertyInfo if available, otherwise parse from raw input
  const structuredProperty =
    data.propertyInfo || formatPropertyInfo(rawPropertyInfo);
  const propertyDisplay = structuredProperty.description || rawPropertyInfo;

  const priceDisplay = formatPrice(data.marketingPrice);
  const agentDisplay = data.agentName || "[Agent's Name]";
  const dateDisplay = agreementDate || "[Date]";

  // Check if value contains placeholder brackets [FIELD] or [ ]
  const checkPlaceholder = (val: string) => (val ? /\[.*?\]/.test(val) : false);

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
              top: 720, // 0.5 inch
              bottom: 720, // 0.5 inch
              left: 1080, // 0.75 inch
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
                text: 'CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the "Agent")',
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
                bold: checkPlaceholder(propertyDisplay),
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
                text: "5. The initial agreed marketing price is ",
                size: bodySize,
                font: fontFamily,
              }),
              new TextRun({
                text: priceDisplay,
                bold: checkPlaceholder(priceDisplay),
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
 * Create blank marketing agreement data with placeholders
 */
export function createBlankMarketingAgreementData(
  agentName = "[Agent's Name]"
): MarketingAgreementData {
  return {
    agreementDate: formatOrdinalDate(),
    sellerFullName: "[SELLER NAME]",
    propertyRegistration: "[PROPERTY REGISTRATION]",
    marketingPrice: "[PRICE]",
    agentName,
    propertyInfo: {
      description: "[PROPERTY DETAILS]",
    },
  };
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

    // Check if this is a BLANK marketing agreement (has placeholders or ellipses)
    const hasBlankPatterns =
      /\[\s*\]/g.test(response) ||
      /[.…]{8,}/g.test(response) ||
      /_{15,}/g.test(response) ||
      /\.{15,}/g.test(response);

    const isMarketingAgreement = cleanResponse
      .toLowerCase()
      .includes("marketing agreement");

    // If it's a blank/partial marketing agreement, extract whatever data IS available
    if (isMarketingAgreement && hasBlankPatterns) {
      logger.debug(
        "[MarketingAgreement] Detected blank/partial marketing agreement - extracting available data",
        { category: LogCategory.GENERAL }
      );
      const blankData = createBlankMarketingAgreementData(agentName);

      // Extract seller name if available
      const partialSellerMatch =
        cleanResponse.match(
          /\bAnd\s*\n+\s*([A-Za-z][A-Za-z\s]+?)(?:……|\.\.\.|\n)/i
        ) ||
        cleanResponse.match(
          /Seller(?:'s)?\s*(?:Name)?[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i
        ) ||
        cleanResponse.match(
          /The Seller\s*\n\s*Name:\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i
        );

      if (partialSellerMatch) {
        const name = partialSellerMatch[1].trim();
        // Reject known invalid seller names (e.g., "by the Agent")
        const invalidNames = [
          /^(?:sign(?:ed)?\s+)?by\s+the\s+agent$/i,
          /^the\s+agent$/i,
          /^agent$/i,
          /^name\s+of\s+(the\s+)?seller$/i,
          /^seller$/i,
          /^the\s+seller$/i,
        ];
        if (
          name &&
          !/^[[\].…_\s]+$/.test(name) &&
          name.length > 1 &&
          !invalidNames.some((p) => p.test(name))
        ) {
          blankData.sellerFullName = name;
        }
      }

      // Extract property registration if available
      const partialRegMatch =
        cleanResponse.match(
          /Property(?!\s+Group)[:\s]+(?:with\s+)?(?:Registration\s+(?:No\.?\s*)?)?([^\n]*?\d+\/\d+[^\n]*?)(?=\s*\(?hereinafter|\s*which\s+the\s+seller|\s*$)/im
        ) ||
        cleanResponse.match(
          /(?:Reg(?:istration)?\.?\s*(?:No\.?)?)[:\s]*(\d+\/\d+[^\n]*)(?:\n|$)/i
        );

      if (partialRegMatch) {
        const prop = partialRegMatch[1].trim();
        if (prop && !/^[[\].…_\s]+$/.test(prop) && prop.length > 3) {
          blankData.propertyRegistration = prop;
          blankData.propertyInfo = formatPropertyInfo(prop);
        }
      }

      // Extract price if available
      const partialPriceMatch =
        cleanResponse.match(
          /(?:marketing\s+)?price\s+is\s+[€$]?\s*([\d,]+)/i
        ) ||
        cleanResponse.match(/(?:Marketing\s+)?Price[:\s]+[€$]?\s*([\d,]+)/i);

      if (partialPriceMatch) {
        blankData.marketingPrice = partialPriceMatch[1].replace(/,/g, "");
      }

      return blankData;
    }

    logger.debug("[MarketingAgreement] Parsing response...");
    logger.debug("[MarketingAgreement] Clean response preview", {
      preview: cleanResponse.substring(0, 500),
    });

    // Extract seller name - multiple patterns for different AI output formats
    const sellerMatch =
      // Pattern 1: After "And" on new line, followed by dots (DOCX format)
      cleanResponse.match(
        /\bAnd\s*\n+\s*([A-Za-z][A-Za-z\s]+?)(?:……|\.\.\.|\n)/i
      ) ||
      // Pattern 2: "Name:" in signature section followed by seller name
      cleanResponse.match(/\bName:\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i) ||
      // Pattern 3: "Seller's Name:" or "Seller:" prefix
      cleanResponse.match(
        /Seller(?:'s)?\s*(?:Name)?[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i
      ) ||
      // Pattern 4: "name of the seller" or just "seller:"
      cleanResponse.match(
        /(?:name of the seller|seller)[:\s]+([A-Za-z][A-Za-z\s]+?)(?:\n|,|$)/i
      ) ||
      // Pattern 5: "Dear [name]" in email format
      cleanResponse.match(/Dear\s+([A-Za-z][A-Za-z\s]+?)[\n,]/i) ||
      // Pattern 6: "The Seller" section in signature - "The Seller\nName: X"
      cleanResponse.match(
        /The Seller\s*\n\s*Name:\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i
      );

    // Extract property registration - capture the full line including location
    // IMPORTANT: Avoid matching company names like "CSC Zyprus Property Group LTD"

    // First, try to find a complete line containing both property keywords AND registration number
    // This handles "Limas Building Flat 105 Registration No. 0/453" format
    const fullLineWithReg = cleanResponse.match(
      /^.*(?:Building|Complex|Tower|Block|Court|Residence|Residences|Gardens|Heights|Flat|Apartment|Unit).*\d+\/\d+.*$/im
    );

    // Also look for Building/Court/Complex name separately (might be on different line from reg number)
    const buildingMatch = cleanResponse.match(
      /([A-Za-z]+\s+(?:Building|Court|Complex|Tower|Residence|Residences|Gardens|Heights|Block))(?:\s+(?:Flat|Apartment|Unit)\s*(?:No\.?)?\s*\d+)?/i
    );
    const flatMatch = cleanResponse.match(
      /(?:Flat|Apartment|Unit)\s*(?:No\.?)?\s*(\d+[A-Za-z]?)/i
    );
    const regNumMatch = cleanResponse.match(
      /(?:Reg(?:istration)?\.?\s*(?:No\.?)?\s*)?(\d+\/\d+)/i
    );

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
      cleanResponse.match(
        /(?:owner of\s+)?Property(?!\s+Group)[:\s]+(?:with\s+)?(?:Registration\s+(?:No\.?\s*)?)?([^\n]*?\d+\/\d+[^\n]*?)(?=\s*\(?hereinafter|\s*which\s+the\s+seller|\s*$)/im
      ) ||
      // Pattern 2: "Property with 0/1234 Location" - captures full text including location
      cleanResponse.match(
        /Property\s+with\s+(?:Registration\s+(?:No\.?\s*)?)?(\d+\/\d+[^\n]*?)(?=\s*\(?hereinafter|\s*which\s+the\s+seller|\s*$)/im
      ) ||
      // Pattern 3: Full line with property keywords + registration
      (fullLineWithReg && !fullLineWithReg[0].includes("Property Group")
        ? [fullLineWithReg[0], fullLineWithReg[0].trim()]
        : null) ||
      // Pattern 4: Combined building + flat + reg from separate matches (fallback - NO location)
      (combinedProperty ? [combinedProperty, combinedProperty] : null) ||
      // Pattern 5: Standard registration number format with Reg prefix: Reg No. 0/1234
      cleanResponse.match(
        /(?:Reg(?:istration)?\.?\s*(?:No\.?)?)[:\s]*(\d+\/\d+[^\n]*)(?:\n|$)/i
      ) ||
      // Pattern 6: Building with number: "Limas Building 1045" or "Limas Building No. 123"
      cleanResponse.match(
        /([A-Za-z]+\s+Building\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i
      ) ||
      // Pattern 7: Flat/Apartment format: "Flat No. 103" or "Apartment 5"
      cleanResponse.match(
        /((?:Flat|Apartment|Unit)\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i
      ) ||
      // Pattern 8: Complex/Tower/Block: "Cynthiana Complex 103"
      cleanResponse.match(
        /([A-Za-z]+\s+(?:Complex|Tower|Block)\s+(?:No\.?\s*)?\d+[^\n]*)(?:\n|$)/i
      ) ||
      // Pattern 9: Explicit "Property registration:" or "Property information:" field
      cleanResponse.match(
        /Property(?:'s)?\s+(?:registration|information)[:\s]+([^\n]+)/i
      ) ||
      // Pattern 10: "Property Details:" field (but NOT "Property Group")
      cleanResponse.match(/Property\s+Details[:\s]+([^\n]+)/i) ||
      // Pattern 11: Fallback generic "Property:" match (catches descriptions without numbers)
      cleanResponse.match(
        /(?:owner of\s+)?Property(?!\s+Group)[:\s]+([^\n]+)/i
      );

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
    logger.debug("[MarketingAgreement] Property extraction matched:", {
      rawMatch: propertyRegistration.substring(0, 200),
    });
    // Remove trailing periods, commas, or parentheses that may have been captured
    propertyRegistration = propertyRegistration
      .replace(/[.,;:\s]+$/, "")
      .trim();

    // Validate property registration - reject company names and invalid patterns
    const invalidPropertyPatterns = [
      /^Group\s+LTD$/i,
      /^Property\s+Group/i,
      /^CSC\s+Zyprus/i,
      /^Zyprus\s+Property/i,
      /^the\s+property$/i,
      /^\[.*\]$/, // Bracketed placeholders
      /^XXXXXXXX$/i,
      /^X+$/i,
    ];

    if (
      propertyRegistration &&
      invalidPropertyPatterns.some((pattern) =>
        pattern.test(propertyRegistration)
      )
    ) {
      logger.debug(
        `[MarketingAgreement] Invalid property info detected: "${propertyRegistration}" - rejecting`,
        { category: LogCategory.GENERAL }
      );
      propertyRegistration = "";
    }

    const marketingPrice = priceMatch ? priceMatch[1].replace(/,/g, "") : "";
    const agreementDate = dateMatch ? dateMatch[1] : formatOrdinalDate();

    // Validate seller name - reject known invalid patterns
    const invalidSellerPatterns = [
      /^(?:sign(?:ed)?\s+)?by\s+the\s+agent$/i,
      /^the\s+agent$/i,
      /^agent$/i,
      /^name\s+of\s+(the\s+)?seller$/i,
      /^seller$/i,
      /^the\s+seller$/i,
      /^\[.*\]$/, // Bracketed placeholders like [SELLER_NAME]
      /^XXXXXXXX$/i,
      /^X+$/i,
    ];

    if (
      sellerName &&
      invalidSellerPatterns.some((pattern) => pattern.test(sellerName))
    ) {
      logger.debug(
        `[MarketingAgreement] Invalid seller name detected: "${sellerName}" - using placeholder`,
        { category: LogCategory.GENERAL }
      );
      sellerName = "[SELLER NAME]";
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
      logger.debug("[MarketingAgreement] Missing required fields", {
        hasSellerName: !!sellerName,
        hasPropertyReg: !!propertyRegistration,
      });
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
    logger.error(
      "[MarketingAgreement] Parse error",
      error instanceof Error ? error : new Error(String(error))
    );
    return null;
  }
}
