/**
 * Non-Exclusive Marketing Agreement - DOCX Generator
 *
 * Template 15: Generates a non-exclusive marketing agreement
 * matching the official ZPG signature document format.
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
} from "https://esm.sh/docx@8.5.0";

import { FONTS, SPACING, createSignatureLine } from "../styles.ts";

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
 */
export function createMarketingAgreement(
  data: MarketingAgreementData
): Document {
  // Use provided date or default to today
  const agreementDate = data.agreementDate || formatOrdinalDate();

  // Border style for the document frame
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: "000000",
  };

  // Create the content paragraphs
  const contentParagraphs: Paragraph[] = [
    // Title
    new Paragraph({
      children: [
        new TextRun({
          text: "Marketing Agreement",
          bold: true,
          size: 28,
          font: FONTS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),

    // Agreement date line
    new Paragraph({
      children: [
        new TextRun({
          text: "This agreement made on the: ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: agreementDate,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
          color: "FF0000",
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
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the ''Agent'')",
          size: FONTS.SIZES.BODY,
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
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),

    // Seller name with dotted line
    new Paragraph({
      children: [
        new TextRun({
          text: data.sellerName || "(name of the seller)",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
          color: data.sellerName ? "000000" : "FF0000",
        }),
        new TextRun({
          text: "……………………………………………………………………………………………………………………",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    }),

    // Property ownership clause
    new Paragraph({
      children: [
        new TextRun({
          text: "(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `Property with ${data.propertyRegistration || "Reg No. 0/12345 Tala, Paphos"}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
          color: "FF0000",
          underline: {},
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "(hereinafter referred to as 'the Property') which the seller wishes to promote for sale. The Seller gives to the agent the right to market and advertise the sale of the Property based upon the following terms and conditions.",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 300 },
    }),

    // SERVICE section header
    new Paragraph({
      children: [
        new TextRun({
          text: "Service",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 150 },
    }),

    // Clause 1
    createNumberedClause(
      "1.",
      "The Agent may advertise the Property. This is a NON-EXCLUSIVE agreement."
    ),

    // Clause 2
    createNumberedClause(
      "2.",
      "If the Property is sold to a purchaser introduced to the Seller by the Agent, then the Agent will receive the fee as mentioned in clause 4 (four)."
    ),

    // Clause 3
    createNumberedClause(
      "3.",
      "If, at any time following the termination of this agreement, the Property, is sold to any person having been Introduced by the Agent to the Seller prior to the termination of this agreement, then the Agent will receive the fee as mentioned in clause 4 (four)."
    ),

    // Clause 4
    createNumberedClause(
      "4.",
      "The Agent's fee is hereby agreed to be an amount equal to 5.0% plus (Value Added Tax), of the agreed sale value of the Property."
    ),

    // Clause 5 - Marketing Price
    new Paragraph({
      children: [
        new TextRun({
          text: "5.",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: "       The initial agreed marketing price is €",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.marketingPrice || "…………………………",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
          color: data.marketingPrice ? "FF0000" : "000000",
        }),
      ],
      spacing: { after: 100 },
    }),

    // Clause 6
    createNumberedClause(
      "6.",
      "In the unusual case that any registered client of the Agent gets into direct communication with the Seller, then the Seller acknowledges that is legally bound to stop such communication, inform immediately the Agent, and inform the client that any communication must be continued only via the Agent."
    ),

    // GENERAL section header
    new Paragraph({
      children: [
        new TextRun({
          text: "General",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { before: 200, after: 150 },
    }),

    // Agent contact clause (no number - matches official template)
    new Paragraph({
      children: [
        new TextRun({
          text: "It is clearly agreed that the Seller was brought into contact with the CSC Zyprus Property Group LTD",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Represented by ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `[${data.agentName || "Agent Name"}]`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
          color: "FF0000",
        }),
      ],
      spacing: { after: 100 },
    }),

    // Termination clause (no number - matches official template)
    new Paragraph({
      children: [
        new TextRun({
          text: "This agreement shall continue for 30 days after either party receives written notice to terminate from the other.",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 300 },
    }),
  ];

  // Signature table
  const signatureTable = new Table({
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
                    size: FONTS.SIZES.BODY,
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
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            verticalAlign: VerticalAlign.TOP,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Signed:",
                    size: FONTS.SIZES.BODY,
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
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
      // Row 2: Empty space for signatures
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "", size: FONTS.SIZES.BODY })],
                spacing: { after: 400 },
              }),
            ],
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: tableBorder,
              right: tableBorder,
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "", size: FONTS.SIZES.BODY })],
                spacing: { after: 400 },
              }),
            ],
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: tableBorder,
              right: tableBorder,
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
          }),
        ],
      }),
      // Row 3: On behalf / The Seller
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "On behalf of company:",
                    size: FONTS.SIZES.BODY,
                    font: FONTS.PRIMARY,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Charalambos Pitros",
                    size: FONTS.SIZES.BODY,
                    font: FONTS.PRIMARY,
                  }),
                ],
              }),
            ],
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: tableBorder,
              right: tableBorder,
              bottom: tableBorder,
            },
            verticalAlign: VerticalAlign.TOP,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "The Seller",
                    size: FONTS.SIZES.BODY,
                    font: FONTS.PRIMARY,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Name: ",
                    size: FONTS.SIZES.BODY,
                    font: FONTS.PRIMARY,
                  }),
                  new TextRun({
                    text: data.sellerName || "",
                    size: FONTS.SIZES.BODY,
                    font: FONTS.PRIMARY,
                    color: "FF0000",
                  }),
                ],
              }),
            ],
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: tableBorder,
              right: tableBorder,
              bottom: tableBorder,
            },
            verticalAlign: VerticalAlign.TOP,
          }),
        ],
      }),
    ],
    borders: {
      top: tableBorder,
      bottom: tableBorder,
      left: tableBorder,
      right: tableBorder,
    },
  });

  // Main content table with border (the frame around the entire document)
  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [...contentParagraphs, signatureTable],
            borders: {
              top: tableBorder,
              bottom: tableBorder,
              left: tableBorder,
              right: tableBorder,
            },
          }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        children: [mainTable],
      },
    ],
  });
}

/**
 * Helper to create numbered clause paragraphs
 */
function createNumberedClause(number: string, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: number,
        size: FONTS.SIZES.BODY,
        font: FONTS.PRIMARY,
      }),
      new TextRun({
        text: `       ${text}`,
        size: FONTS.SIZES.BODY,
        font: FONTS.PRIMARY,
      }),
    ],
    spacing: { after: 100 },
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
