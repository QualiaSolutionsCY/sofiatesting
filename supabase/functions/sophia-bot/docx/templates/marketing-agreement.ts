/**
 * Non-Exclusive Marketing Agreement - DOCX Generator
 *
 * Template 15: Generates a non-exclusive marketing agreement
 * matching the official ZPG document format.
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
  VerticalAlign,
  PageOrientation,
} from "https://esm.sh/docx@8.5.0";

import { FONTS } from "../styles.ts";

/**
 * Marketing Agreement Data
 */
export interface MarketingAgreementData {
  agreementDate: string; // e.g., "1st March 2026"
  sellerName: string;
  propertyRegistration: string; // e.g., "Reg No. 0/12345 Tala, Paphos"
  marketingPrice: string; // e.g., "350,000"
  agentName: string; // Auto-filled from agent record
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
 * Creates a Non-Exclusive Marketing Agreement document
 * Clean format: no outer border, no red text, fits on one page
 */
export function createMarketingAgreement(
  data: MarketingAgreementData
): Document {
  // Use provided date or default to today
  const agreementDate = data.agreementDate || formatOrdinalDate();

  // Format placeholders - use brackets for empty/missing values
  const sellerDisplay = data.sellerName || "[sellers name]";
  const propertyDisplay = data.propertyRegistration || "[PRoperty information]";
  const priceDisplay = data.marketingPrice ? `${data.marketingPrice}` : "[PRICE]";
  const agentDisplay = data.agentName || "[AGENTS NAME]";
  const dateDisplay = agreementDate || "[date]";

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

  // Font size for body text (smaller to fit on one page)
  const bodySize = 22; // 11pt

  return new Document({
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
                size: 28, // 14pt
                font: FONTS.PRIMARY,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          // Agreement date line
          new Paragraph({
            children: [
              new TextRun({
                text: `This agreement made on the: ${dateDisplay}`,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),

          // BETWEEN clause
          new Paragraph({
            children: [
              new TextRun({
                text: "BETWEEN: CSC Zyprus Property Group LTD",
                bold: true,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the \"Agent\")",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),

          // And
          new Paragraph({
            children: [
              new TextRun({
                text: "And",
                bold: true,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),

          // Seller name and property clause (combined paragraph)
          new Paragraph({
            children: [
              new TextRun({
                text: `${sellerDisplay} `,
                bold: true,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
              new TextRun({
                text: `(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property with the ${propertyDisplay}`,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "(hereinafter referred to as 'the Property') which the seller wishes to promote for sale. The Seller gives to the agent the right to market and advertise the sale of the Property based upon the following terms and conditions.",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),

          // SERVICE section header
          new Paragraph({
            children: [
              new TextRun({
                text: "Service",
                bold: true,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 100 },
          }),

          // Clause 1
          new Paragraph({
            children: [
              new TextRun({
                text: "1. The Agent may advertise the Property. This is a NON-EXCLUSIVE agreement.",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 60 },
          }),

          // Clause 2
          new Paragraph({
            children: [
              new TextRun({
                text: "2. If the Property is sold to a purchaser introduced to the Seller by the Agent, then the Agent will receive the fee as mentioned in clause 4 (four).",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 60 },
          }),

          // Clause 3
          new Paragraph({
            children: [
              new TextRun({
                text: "3. If, at any time following the termination of this agreement, the Property, is sold to any person having been Introduced by the Agent to the Seller prior to the termination of this agreement, then the Agent will receive the fee as mentioned in clause 4 (four).",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 60 },
          }),

          // Clause 4
          new Paragraph({
            children: [
              new TextRun({
                text: "4. The Agent's fee is hereby agreed to be an amount equal to 5.0% plus (Value Added Tax), of the agreed sale value of the Property.",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 60 },
          }),

          // Clause 5 - Marketing Price
          new Paragraph({
            children: [
              new TextRun({
                text: `5. The initial agreed marketing price is ${priceDisplay}`,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 60 },
          }),

          // Clause 6
          new Paragraph({
            children: [
              new TextRun({
                text: "6. In the unusual case that any registered client of the Agent gets into direct communication with the Seller, then the Seller acknowledges that is legally bound to stop such communication, inform immediately the Agent, and inform the client that any communication must be continued only via the Agent.",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),

          // GENERAL section header
          new Paragraph({
            children: [
              new TextRun({
                text: "General",
                bold: true,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 100 },
          }),

          // Agent contact clause
          new Paragraph({
            children: [
              new TextRun({
                text: "It is clearly agreed that the Seller was brought into contact with the CSC Zyprus Property Group LTD",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Represented by ${agentDisplay}`,
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 100 },
          }),

          // Termination clause
          new Paragraph({
            children: [
              new TextRun({
                text: "This agreement shall continue for 30 days after either party receives written notice to terminate from the other.",
                size: bodySize,
                font: FONTS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),

          // Signature table (only this has border)
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
                            font: FONTS.PRIMARY,
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
                            font: FONTS.PRIMARY,
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
              // Row 2: Empty space for signatures
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: "", size: bodySize })],
                        spacing: { after: 400 },
                      }),
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
                      new Paragraph({
                        children: [new TextRun({ text: "", size: bodySize })],
                        spacing: { after: 400 },
                      }),
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
              // Row 3: On behalf of company / The Seller
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "On behalf of company:",
                            size: bodySize,
                            font: FONTS.PRIMARY,
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "Charalambos Pitros",
                            size: bodySize,
                            font: FONTS.PRIMARY,
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
                            text: "The Seller",
                            size: bodySize,
                            font: FONTS.PRIMARY,
                          }),
                        ],
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Name: ${sellerDisplay}`,
                            size: bodySize,
                            font: FONTS.PRIMARY,
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
    console.log("[MarketingAgreement] Parsing response...");
    console.log("[MarketingAgreement] Clean response preview:", cleanResponse.substring(0, 500));

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

    // Extract property registration
    const regMatch =
      cleanResponse.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?)?|Property\s+with\s+Reg\s+No\.?)[:\s]*(\d+\/\d+[^,\n]*)/i) ||
      cleanResponse.match(/Property[:\s]+([^\n]+?Reg[^\n]+)/i);

    // Extract marketing price
    const priceMatch =
      cleanResponse.match(/(?:Marketing\s+)?Price[:\s]+[€$]?\s*([\d,]+)/i) ||
      cleanResponse.match(/[€$]\s*([\d,]+)/);

    // Extract date if provided
    const dateMatch = cleanResponse.match(
      /(?:Date|Agreement\s+Date)[:\s]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i
    );

    let sellerName = sellerMatch ? sellerMatch[1].trim() : "";
    const propertyRegistration = regMatch ? regMatch[1].trim() : "";
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
      console.log(`[MarketingAgreement] Invalid seller name detected: "${sellerName}" - rejecting`);
      sellerName = "";
    }

    console.log("[MarketingAgreement] Extracted:", {
      sellerName,
      propertyRegistration,
      marketingPrice,
      agreementDate,
      agentName,
    });

    // Require at least seller name and property registration
    if (!sellerName || !propertyRegistration) {
      console.log("[MarketingAgreement] Missing required fields - sellerName:", !!sellerName, "propertyReg:", !!propertyRegistration);
      return null;
    }

    return {
      agreementDate,
      sellerName,
      propertyRegistration,
      marketingPrice,
      agentName,
    };
  } catch (error) {
    console.error("[MarketingAgreement] Error parsing response:", error);
    return null;
  }
}
