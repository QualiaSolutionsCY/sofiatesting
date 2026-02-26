/**
 * Property Reservation Agreement - DOCX Generator
 * EXACT REPLICA of the 4 reference templates in docs/templates/
 *
 * 4 Variants based on LOAN/VAT:
 * - NO LOAN, NO VAT
 * - YES LOAN, NO VAT
 * - NO LOAN, YES VAT
 * - YES LOAN, YES VAT
 */

import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "https://esm.sh/docx@8.5.0";

import { numberToWords } from "../../utils/number-to-words.ts";
import { logger } from "../../utils/logger.ts";
import { formatPropertyDescription } from "../../utils/property-formatter.ts";
import { isPlaceholder } from "../styles.ts";

// NO LOGO on reservation agreements - matches reference templates

/**
 * Buyer information - format: "Name Cyprus ID: 123456"
 */
export interface BuyerInfo {
  fullName: string;
  idType: string; // "Cyprus ID" or "UK Passport" etc.
  idNumber: string;
}

/**
 * Vendor information - format: "Name Cyprus ID: 123456"
 */
export interface VendorInfo {
  name: string;
  idType: string;
  idNumber: string;
}

/**
 * Property information - single line format
 * Example: "Cynthiana Complex Flat No. 105, Agios Theodoros, Paphos (Registration No 0/1547)"
 */
export interface PropertyInfo {
  description: string;        // Full formatted description including flat no and registration
}

/**
 * Financial terms
 */
export interface FinancialTerms {
  reservationFee: number;
  reservationFeeWords: string;
  purchasePrice: number;
  purchasePriceWords: string;
}

/**
 * Complete reservation agreement data
 */
export interface ReservationAgreementData {
  dateReceived?: string;
  buyers: BuyerInfo[];
  vendor: VendorInfo;
  vendors?: VendorInfo[];
  property: PropertyInfo;
  financial: FinancialTerms;
  reservationPeriodDays?: number;
  contractDeadlineDays?: number;
  agreementDate?: string;
  hasLoanClause: boolean;
  hasVatClause: boolean;
}

/**
 * Fixed agent/bank details
 */
export const ZYPRUS_DEFAULTS = {
  agent: {
    name: "Charalambos Pitros",
    company: "CSC ZYPRUS PROPERTY GROUP LTD",
    creaRegNo: "742",
    licenseNo: "378/E",
  },
  bank: {
    name: "CSC ZYPRUS PROPERTY GROUP LTD",
    accountNo: "502-10-734364-01",
    iban: "CY08 0050 0502 0005 0210 7343 6401",
    bic: "HEBACY2N",
  },
} as const;

/**
 * Get the EXACT refund clause from reference templates
 */
function getRefundClause(hasLoan: boolean, hasVat: boolean, _reservationFee: string): string {
  const base = `In the event that the purchase fails to materialize, due to the Vendor's fault, and/or the property does not have clean land registry search (i.e. mortgages etc.) and/or is not free of any encumbrances and/or legal charges whatsoever`;

  // NO LOAN, NO VAT
  if (!hasLoan && !hasVat) {
    return `${base}, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // YES LOAN, NO VAT
  if (hasLoan && !hasVat) {
    return `${base}, and/or in the event of refusal or rejection of a mortgage application, subject to the provision of written confirmation by the Bank, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // NO LOAN, YES VAT
  if (!hasLoan && hasVat) {
    return `${base}, and/or the prospective sale of the property to the prospective buyer is subject to VAT following a decision of the competent authorities of the Republic of Cyprus and/or the Tax Commissioner, then the Reservation fee will be returned in full to the Prospective buyer without any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // YES LOAN, YES VAT
  return `${base}, and/or the prospective sale of the property to the prospective buyer is subject to VAT following a decision of the competent authorities of the Republic of Cyprus and/or the Tax Commissioner, and/or in the event of refusal or rejection of a mortgage application, subject to the provision of written confirmation by the Bank, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
}

/**
 * Create EXACT replica of reference reservation agreement templates
 * NO LOGO - matches the reference documents exactly
 */
export function createReservationAgreement(data: ReservationAgreementData): Document {
  const { agent, bank } = ZYPRUS_DEFAULTS;
  const periodDays = data.reservationPeriodDays || 40;
  const contractDays = data.contractDeadlineDays || 40;
  const reservationFeeFormatted = `€${data.financial.reservationFee.toLocaleString()}`;

  // Resolve vendors array (use vendors[] if available, fall back to single vendor)
  const allVendors = data.vendors && data.vendors.length > 0
    ? data.vendors
    : [data.vendor];

  // Build buyer string: "Name Cyprus ID: 123456 and Name2 Cyprus ID: 789012"
  const buyerStr = data.buyers
    .map((b) => `${b.fullName} ${b.idType}: ${b.idNumber}`)
    .join(" and ");

  // Build vendor string: "Name Cyprus ID: 123456 and Name2 Cyprus ID: 789012"
  const vendorStr = allVendors
    .map((v) => `${v.name} ${v.idType}: ${v.idNumber}`)
    .join(" and ");

  // Agreement date
  const dateStr = data.agreementDate || formatDate(new Date());

  const children: Paragraph[] = [];

  // TITLE: PROPERTY RESERVATION AGREEMENT (bold, underlined, centered)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PROPERTY RESERVATION AGREEMENT",
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: 24,
          font: "Times New Roman",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Date Reservation Fee Received
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Date Reservation Fee Received: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: data.dateReceived || "[Date Reservation Fee Received]", bold: isPlaceholder(data.dateReceived || "[Date Reservation Fee Received]"), size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Prospective Buyer
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Prospective Buyer: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: buyerStr, bold: isPlaceholder(buyerStr), size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Vendor
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Vendor: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: vendorStr, bold: isPlaceholder(vendorStr), size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Property Details - single line with flat no and registration
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Property: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: data.property.description, bold: isPlaceholder(data.property.description), size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Reservation Fee
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Reservation Fee: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: `${reservationFeeFormatted} (In words ${data.financial.reservationFeeWords} only)`, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Purchase Price
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Purchase Price: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: `€${data.financial.purchasePrice.toLocaleString()} (In words ${data.financial.purchasePriceWords} only)`, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 300 },
    })
  );

  // PARAGRAPH 1: Reservation Period clause (EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `The prospective buyer agrees that the reservation fee to the amount ${reservationFeeFormatted} will be held by the Estate Agent (as defined herein below into this Property Reservation Agreement) as the escrow agent and which will be held under its custody in order to guarantee that the above property is taken off the market, and be reserved exclusively for the Prospective buyer, for a period of ${periodDays} days from the date reservation fee received (hereinafter referred to as the "Reservation Period"). The Reservation Fee must be released by the Escrow Agent pursuant to the terms and provisions of this Property Reservation Agreement.`,
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // PARAGRAPH 2: Refund clause (varies by LOAN/VAT - EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: getRefundClause(data.hasLoanClause, data.hasVatClause, reservationFeeFormatted),
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // PARAGRAPH 3: Contract deadline (EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `The amount of the reservation fee will be considered as part of the fixed purchase price and a legally binding Contract of Sale must be signed within ${contractDays} days from the date of the reservation fee received, subject to the provisions hereof.`,
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // PARAGRAPH 4: Forfeiture clause (EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `If the purchase fails to materialize due to the Prospective buyer's exclusive fault, then the reservation fee is not refundable and it will be provided 50% to the Vendor and the remaining 50% will be held by the estate agent to cover the administration costs.`,
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // PARAGRAPH 5: Arbiter clause (EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `With regard to the subject reservation agreement, the estate agent is the mutually agreed party responsible for determining who is at fault if the transaction does not proceed.`,
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Details of the Estate Agent
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Details of the Estate Agent:", bold: true, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 100 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Name: ${agent.name}`, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `On behalf of ${agent.company}`, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `CREA Reg. No. ${agent.creaRegNo} & Lic. No. ${agent.licenseNo} (called the "Estate Agent")`, size: 22, font: "Times New Roman" })],
      spacing: { after: 300 },
    })
  );

  // Bank details
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Bank details of the Estate Agent, as escrow agent, where the Reservation Fee must be transferred/paid by the Prospective Buyer:", bold: true, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 100 },
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Banking Details", bold: true, underline: { type: UnderlineType.SINGLE }, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Name: ${bank.name}`, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Account No: ${bank.accountNo}`, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `IBAN: ${bank.iban}`, size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `BIC: ${bank.bic}`, size: 22, font: "Times New Roman" })],
      spacing: { after: 300 },
    })
  );

  // Exclusive negotiation clause (EXACT text from reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `For the entire duration of the Reservation Period, the Vendor and the Estate Agent shall not, directly and/or indirectly, advertise, negotiate, solicit and/or accept any offers and/or otherwise from any third party in relation to the Property.`,
          size: 22,
          font: "Times New Roman",
        }),
      ],
      spacing: { after: 300 },
    })
  );

  // Dated
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Dated on this ${dateStr}`, size: 22, font: "Times New Roman" })],
      spacing: { after: 400 },
    })
  );

  // SIGNATURE SECTION - Using table for proper two-column layout
  // Use NIL style with size 0 and white color to completely hide borders
  const noBorders = {
    top: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
  };

  // ===== BUYER AND VENDOR SIGNATURES SIDE BY SIDE =====
  // Determine how many signature rows needed (max of buyers, vendors)
  const maxParties = Math.max(data.buyers.length, allVendors.length);

  const signatureRows: TableRow[] = [];

  // Row 1: Headers
  signatureRows.push(
    new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders,
          children: [new Paragraph({
            children: [new TextRun({ text: `The Prospective Buyer${data.buyers.length > 1 ? "s" : ""}:`, size: 22, font: "Times New Roman" })],
          })],
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noBorders,
          children: [new Paragraph({
            children: [new TextRun({ text: `The Vendor${allVendors.length > 1 ? "s" : ""}:`, size: 22, font: "Times New Roman" })],
          })],
        }),
      ],
    })
  );

  // One signature block per party (matched left/right)
  for (let i = 0; i < maxParties; i++) {
    const buyer = data.buyers[i];
    const vendor = allVendors[i];

    // Empty row for signature space
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
          new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
        ],
      })
    );
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
          new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
        ],
      })
    );

    // Signature lines
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [new Paragraph({
              children: [new TextRun({ text: buyer ? "_________________________" : "", size: 22, font: "Times New Roman" })],
            })],
          }),
          new TableCell({
            borders: noBorders,
            children: [new Paragraph({
              children: [new TextRun({ text: vendor ? "_________________________" : "", size: 22, font: "Times New Roman" })],
            })],
          }),
        ],
      })
    );

    // Names under signature lines
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [new Paragraph({
              children: [new TextRun({ text: buyer ? buyer.fullName : "", size: 22, font: "Times New Roman" })],
            })],
          }),
          new TableCell({
            borders: noBorders,
            children: [new Paragraph({
              children: [new TextRun({ text: vendor ? vendor.name : "", size: 22, font: "Times New Roman" })],
            })],
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: signatureRows,
    })
  );

  // Spacing after parties section
  children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
  children.push(new Paragraph({ text: "" }));

  // ===== THE ESTATE AGENT SECTION =====
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "The Estate Agent:", size: 22, font: "Times New Roman" })],
    })
  );

  // Extra space for signature
  children.push(new Paragraph({ text: "" }));
  children.push(new Paragraph({ text: "" }));

  children.push(
    new Paragraph({
      children: [new TextRun({ text: "_________________________", size: 22, font: "Times New Roman" })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: agent.name, size: 22, font: "Times New Roman" })],
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: `For and on behalf of ${agent.company}`, size: 22, font: "Times New Roman" })],
      spacing: { after: 400 },
    })
  );

  children.push(new Paragraph({ text: "" }));

  // ===== WITNESSES SECTION - Always exactly 2 =====
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "WITNESSES", bold: true, underline: { type: UnderlineType.SINGLE }, size: 22, font: "Times New Roman" })],
      spacing: { after: 200 },
    })
  );

  // Witness 1
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "1. _________________________", size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "   Name and I.D.:", size: 22, font: "Times New Roman" })],
      spacing: { after: 300 },
    })
  );

  // Witness 2
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "2. _________________________", size: 22, font: "Times New Roman" })],
    })
  );
  children.push(
    new Paragraph({
      children: [new TextRun({ text: "   Name and I.D.:", size: 22, font: "Times New Roman" })],
    })
  );

  return new Document({
    sections: [{ children }],
  });
}

/**
 * Format date as "28th day of July, 2025"
 */
function formatDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  return `${day}${suffix} day of ${month}, ${year}`;
}

// Note: formatPropertyDescription, CYPRUS_DISTRICTS, CYPRUS_AREAS, COMPLEX_INDICATORS, PROPERTY_TYPES, titleCase
// are now imported from ../../utils/property-formatter.ts (single source of truth)

/**
 * Create blank reservation agreement data with placeholders
 */
export function createBlankReservationAgreementData(): ReservationAgreementData {
  return {
    buyers: [{
      fullName: "[PROSPECTIVE BUYER]",
      idType: "Cyprus ID",
      idNumber: "[ID NUMBER]",
    }],
    vendor: {
      name: "[VENDOR NAME]",
      idType: "Cyprus ID",
      idNumber: "[ID NUMBER]",
    },
    vendors: [{
      name: "[VENDOR NAME]",
      idType: "Cyprus ID",
      idNumber: "[ID NUMBER]",
    }],
    property: {
      description: "[PROPERTY DETAILS]",
    },
    financial: {
      reservationFee: 0,
      reservationFeeWords: "[AMOUNT] euro",
      purchasePrice: 0,
      purchasePriceWords: "[AMOUNT] euro",
    },
    hasLoanClause: false,
    hasVatClause: false,
  };
}

/**
 * Parse AI response to extract reservation agreement data
 *
 * Expected input format from SOPHIA (based on field collection):
 * 1. Prospective buyer's full name, ID type, and ID number (e.g., Giorgos Ioannou Cyprus ID: 945119)
 * 2. Vendor's full name, ID type, and ID number (e.g., Maria Panagiotou Cyprus ID: 989050)
 * 3. Full property description (e.g., A plot with registration number 0/9029, situated in Mouttayiaka, Limassol)
 * 4. Reservation fee amount (e.g., €10,000)
 * 5. Purchase price (e.g., €435,000)
 * 6. LOAN yes/no
 * 7. VAT yes/no
 */
export function parseReservationAgreementData(response: string): ReservationAgreementData | null {
  try {
    logger.debug("[ReservationAgreement] Parsing response", { length: response.length });

    // Clean response - remove markdown bold markers (MUST be before blank pattern check)
    const cleanResponse = response.replace(/\*\*/g, '');

    // Check if this is a BLANK reservation agreement (has placeholders or ellipses)
    const hasBlankPatterns = /\[\s*\]/g.test(response) ||
      /[\.…]{8,}/g.test(response) ||
      /_{15,}/g.test(response) ||
      /\.{15,}/g.test(response);

    const isReservationAgreement = response.toLowerCase().includes('reservation agreement');

    // If it's a blank/partial reservation agreement, extract whatever data IS available
    if (isReservationAgreement && hasBlankPatterns) {
      logger.debug("[ReservationAgreement] Detected blank/partial reservation agreement - extracting available data");
      const blankData = createBlankReservationAgreementData();

      // Extract Loan/VAT flags from comment
      const loanVatComment = cleanResponse.match(/<!--[^>]*?loan[:\s]*(yes|no)[^>]*?vat[:\s]*(yes|no)[^>]*?-->/i);
      if (loanVatComment) {
        blankData.hasLoanClause = /yes/i.test(loanVatComment[1]);
        blankData.hasVatClause = /yes/i.test(loanVatComment[2]);
      }

      // Extract buyer info if available
      const buyerLineMatch = cleanResponse.match(/Prospective\s+Buyer[:\s]*([^\n]+)/i);
      if (buyerLineMatch) {
        const buyerText = buyerLineMatch[1].trim();

        // Parse "Name1 Country1 Passport: ID1 and Name2 Country2 Passport: ID2"
        const buyerSegments = buyerText.split(/\s+and\s+/i);

        for (let i = 0; i < buyerSegments.length; i++) {
          const segment = buyerSegments[i].trim();
          if (!segment || /^[\[\]\.…_\s]+$/.test(segment)) continue;

          // Try to match: "Name Country Passport: ID" or "Name Cyprus ID: ID"
          const idTypeMatch = segment.match(/^(.+?)\s+((?:\w+\s+)?(?:Passport|Cyprus\s+ID|ID))[:\s]+([A-Z0-9]+)/i);
          if (idTypeMatch) {
            const buyer = {
              fullName: idTypeMatch[1].trim(),
              idType: idTypeMatch[2].trim(),
              idNumber: idTypeMatch[3].trim(),
            };
            if (i === 0) {
              blankData.buyers[0] = buyer;
            } else {
              blankData.buyers.push(buyer);
            }
          } else {
            // Just a name without ID
            const nameOnly = segment.split(/\s+(?:Cyprus\s+ID|Passport|ID|UK|\[)/i)[0].trim();
            // Skip bracket-only placeholders like "[ ]", "[]", etc. — keep the default "[PROSPECTIVE BUYER]"
            const isBracketPlaceholder = /^\[[\s]*\]$/.test(nameOnly);
            if (nameOnly && nameOnly.length > 1 && !isBracketPlaceholder) {
              if (i === 0) {
                blankData.buyers[0].fullName = nameOnly;
              } else {
                blankData.buyers.push({ fullName: nameOnly, idType: "Cyprus ID", idNumber: "[ID NUMBER]" });
              }
            }
          }
        }
      }

      // Extract vendor info if available
      const vendorLineMatch = cleanResponse.match(/(?:^|\n)Vendor[:\s]*([^\n]+)/im);
      if (vendorLineMatch) {
        const vendorText = vendorLineMatch[1].trim();
        if (vendorText && !/^[\[\]\.…_\s:]+$/.test(vendorText)) {
          const vendorIdMatch = vendorText.match(/^(.+?)\s+((?:\w+\s+)?(?:Passport|Cyprus\s+ID|ID))[:\s]+([A-Z0-9]+)/i);
          if (vendorIdMatch) {
            blankData.vendor.name = vendorIdMatch[1].trim();
            blankData.vendor.idType = vendorIdMatch[2].trim();
            blankData.vendor.idNumber = vendorIdMatch[3].trim();
            if (blankData.vendors && blankData.vendors.length > 0) {
              blankData.vendors[0].name = vendorIdMatch[1].trim();
              blankData.vendors[0].idType = vendorIdMatch[2].trim();
              blankData.vendors[0].idNumber = vendorIdMatch[3].trim();
            }
          } else {
            const nameOnly = vendorText.split(/\s+(?:Cyprus\s+ID|Passport|ID|UK|\[)/i)[0].trim();
            const isBracketPlaceholder = /^\[[\s]*\]$/.test(nameOnly);
            if (nameOnly && nameOnly.length > 1 && !isBracketPlaceholder) {
              blankData.vendor.name = nameOnly;
              if (blankData.vendors && blankData.vendors.length > 0) {
                blankData.vendors[0].name = nameOnly;
              }
            }
          }
        }
      }

      // Extract date if available
      const dateMatch = cleanResponse.match(/Date\s+Reservation\s+Fee\s+Received[:\s]*([^\n]+)/i);
      if (dateMatch) {
        const dateText = dateMatch[1].trim();
        if (dateText && !/^[\[\]\.…_\s]+$/.test(dateText) && dateText.length > 3) {
          blankData.date = dateText;
        }
      }

      // Extract property if available (require colon to avoid matching "PROPERTY RESERVATION AGREEMENT" title)
      const propertyMatch = cleanResponse.match(/^Property\s*:\s*(.+)/im);
      if (propertyMatch) {
        const prop = propertyMatch[1].trim();
        if (prop && !/^[\[\]\.…_\s]+$/.test(prop) && prop.length > 3) {
          blankData.property.description = formatPropertyDescription(prop);
        }
      }

      // Extract amounts if available
      const reservationFeeMatch = cleanResponse.match(/Reservation\s+Fee[:\s]*[€$]?\s*([\d,]+)/i);
      if (reservationFeeMatch) {
        const fee = parseInt(reservationFeeMatch[1].replace(/,/g, ""), 10);
        if (fee > 0) {
          blankData.financial.reservationFee = fee;
          blankData.financial.reservationFeeWords = numberToWords(fee) + " euro";
        }
      }

      const purchasePriceMatch = cleanResponse.match(/Purchase\s+Price[:\s]*[€$]?\s*([\d,]+)/i);
      if (purchasePriceMatch) {
        const price = parseInt(purchasePriceMatch[1].replace(/,/g, ""), 10);
        if (price > 0) {
          blankData.financial.purchasePrice = price;
          blankData.financial.purchasePriceWords = numberToWords(price) + " euro";
        }
      }

      logger.debug("[ReservationAgreement] Partial data extracted", {
        buyerName: blankData.buyers[0]?.fullName,
        buyerId: blankData.buyers[0]?.idNumber,
        hasLoan: blankData.hasLoanClause,
        hasVat: blankData.hasVatClause,
      });

      return blankData;
    }

    // Extract LOAN/VAT flags
    // Priority 1: Structured HTML comment format <!-- Loan: Yes, VAT: No -->
    // Priority 2: Individual field detection (simplified, no cross-field matching)
    let hasLoanClause = false;
    let hasVatClause = false;

    const commentMatch = cleanResponse.match(/<!--[^>]*?loan[:\s]*(yes|no)[^>]*?vat[:\s]*(yes|no)[^>]*?-->/i);
    if (commentMatch) {
      hasLoanClause = /yes/i.test(commentMatch[1]);
      hasVatClause = /yes/i.test(commentMatch[2]);
      logger.debug("[ReservationAgreement] Flags from comment", { hasLoan: hasLoanClause, hasVat: hasVatClause });
    } else {
      // Fallback: match "loan: yes/no" and "vat: yes/no" individually
      // Use capture group [1] to avoid false positives from surrounding text
      const loanMatch = cleanResponse.match(/\bloan[:\s]*(yes|no)/i);
      hasLoanClause = loanMatch ? /yes/i.test(loanMatch[1]) : false;

      const vatMatch = cleanResponse.match(/\bvat[:\s]*(yes|no)/i);
      hasVatClause = vatMatch ? /yes/i.test(vatMatch[1]) : false;
      logger.debug("[ReservationAgreement] Flags from regex fallback", { hasLoan: hasLoanClause, hasVat: hasVatClause });
    }

    // BUYERS: Parse multiple buyers separated by "and"
    // Format: "Name1 Cyprus ID: 123456 and Name2 Cyprus ID: 789012"
    const buyers: BuyerInfo[] = [];

    // First, find the buyer section
    const buyerLineMatch = cleanResponse.match(/Prospective\s+Buyer[:\s]*([^\n]+)/i);
    if (buyerLineMatch) {
      const buyerLine = buyerLineMatch[1].trim();
      logger.debug("[ReservationAgreement] Buyer line:", { buyerLine });

      // Split by " and " to get individual buyers
      const buyerSegments = buyerLine.split(/\s+and\s+/i);

      for (const segment of buyerSegments) {
        const trimmedSegment = segment.trim();
        if (!trimmedSegment) continue;

        // Try to parse "Name IDType: IDNumber" format
        // Captures country/nationality before Passport/ID (e.g., "Jordan Passport", "American Passport", "British ID")
        const parsed = trimmedSegment.match(/^([A-Za-z][A-Za-z\s]+?)\s+((?:[A-Za-z]+\s+)?(?:Passport|ID)|Cyprus\s+ID|UK\s+Passport)[:\s]*([A-Z0-9]+)/i);

        if (parsed) {
          buyers.push({
            fullName: parsed[1].trim(),
            idType: parsed[2].trim(),
            idNumber: parsed[3].trim(),
          });
        } else {
          // Try simpler format: "Name IDNumber" (assuming Cyprus ID)
          const simpleParsed = trimmedSegment.match(/^([A-Za-z][A-Za-z\s]+?)\s+(\d{5,})/);
          if (simpleParsed) {
            buyers.push({
              fullName: simpleParsed[1].trim(),
              idType: "Cyprus ID",
              idNumber: simpleParsed[2].trim(),
            });
          } else {
            // Just take the name
            const nameOnly = trimmedSegment.split(/\s+\d/)[0].trim();
            if (nameOnly && nameOnly.length > 2) {
              buyers.push({
                fullName: nameOnly,
                idType: "Cyprus ID",
                idNumber: "000000",
              });
            }
          }
        }
      }
    }

    logger.debug("[ReservationAgreement] Buyers parsed:", { count: buyers.length, buyers });

    if (buyers.length === 0) {
      logger.debug("[ReservationAgreement] No buyers found");
      return null;
    }

    // VENDORS: Parse multiple vendors separated by "and" (same logic as buyers)
    const vendors: VendorInfo[] = [];

    const vendorLineMatch = cleanResponse.match(/Vendor[:\s]*([^\n]+)/i);
    if (vendorLineMatch) {
      const vendorLine = vendorLineMatch[1].trim();
      logger.debug("[ReservationAgreement] Vendor line:", { vendorLine });

      // Split by " and " to get individual vendors
      const vendorSegments = vendorLine.split(/\s+and\s+/i);

      for (const segment of vendorSegments) {
        const trimmedSegment = segment.trim();
        if (!trimmedSegment) continue;

        // Try to parse "Name IDType: IDNumber" format
        // Captures country/nationality before Passport/ID (e.g., "Jordan Passport", "American Passport")
        const parsed = trimmedSegment.match(/^([A-Za-z][A-Za-z\s]+?)\s+((?:[A-Za-z]+\s+)?(?:Passport|ID)|Cyprus\s+ID|UK\s+Passport)[:\s]*([A-Z0-9]+)/i);

        if (parsed) {
          vendors.push({
            name: parsed[1].trim(),
            idType: parsed[2].trim(),
            idNumber: parsed[3].trim(),
          });
        } else {
          // Try simpler format: "Name IDNumber"
          const simpleParsed = trimmedSegment.match(/^([A-Za-z][A-Za-z\s]+?)\s+(\d{5,})/);
          if (simpleParsed) {
            vendors.push({
              name: simpleParsed[1].trim(),
              idType: "Cyprus ID",
              idNumber: simpleParsed[2].trim(),
            });
          } else {
            // Just take the name
            const nameOnly = trimmedSegment.split(/\s+(Cyprus|Passport|ID|\d)/i)[0].trim();
            if (nameOnly && nameOnly.length > 2) {
              const idMatch = trimmedSegment.match(/(?:Cyprus\s+ID|Passport|ID)[:\s]*([A-Z0-9]+)/i);
              vendors.push({
                name: nameOnly,
                idType: "Cyprus ID",
                idNumber: idMatch ? idMatch[1] : "000000",
              });
            }
          }
        }
      }
    }

    logger.debug("[ReservationAgreement] Vendors parsed:", { count: vendors.length, vendors });

    if (vendors.length === 0) {
      logger.debug("[ReservationAgreement] No vendors found");
      return null;
    }

    // Primary vendor for backward compat
    const vendor: VendorInfo = vendors[0];

    // PROPERTY: Extract and FORMAT property description
    let rawPropertyDesc = "";

    // Try multiple patterns to extract property description
    const propertyPatterns = [
      // Pattern 1: "Property Details: ..." until "Reservation Fee" or numbered item
      /Property\s+(?:Details|Description)[:\s]*([^]*?)(?=\n\s*(?:\d+\.|Reservation\s+Fee|Purchase\s+Price|Loan|VAT))/i,
      // Pattern 2: "Property Details: ..." until end of line or next section
      /Property\s+(?:Details|Description)[:\s]*(.+?)(?=\n\n|\nReservation|\nPurchase|$)/is,
      // Pattern 3: Just get whatever follows "Property Details:"
      /Property\s+(?:Details|Description)[:\s]*(.+)/i,
      // Pattern 4: "Property:" with required colon (avoids matching "PROPERTY RESERVATION AGREEMENT" title)
      /^Property\s*:\s*(.+)/im,
    ];

    for (const pattern of propertyPatterns) {
      const match = cleanResponse.match(pattern);
      if (match && match[1]) {
        rawPropertyDesc = match[1].trim()
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (rawPropertyDesc && rawPropertyDesc.length > 5) {
          break;
        }
      }
    }

    // Clean up property description - remove any trailing field markers
    rawPropertyDesc = rawPropertyDesc
      .replace(/\s*Reservation\s+Fee.*$/i, '')
      .replace(/\s*Purchase\s+Price.*$/i, '')
      .replace(/\s*\d+\.\s*.*$/i, '')
      .trim();

    // FORMAT the property description as single line with location outside parentheses
    const formattedDescription = formatPropertyDescription(rawPropertyDesc);

    logger.debug("[ReservationAgreement] Property", {
      raw: rawPropertyDesc,
      formatted: formattedDescription,
    });

    const property: PropertyInfo = {
      description: formattedDescription,
    };

    // FINANCIAL: Extract amounts
    let reservationFee = 5000; // default
    let purchasePrice = 300000; // default

    // Reservation fee patterns
    const reservationPatterns = [
      /Reservation\s+Fee[:\s]*[€$]?\s*([\d,]+)/i,
      /Reservation[:\s]*[€$]\s*([\d,]+)/i,
      /Fee[:\s]*[€$]\s*([\d,]+)/i,
    ];

    for (const pattern of reservationPatterns) {
      const match = cleanResponse.match(pattern);
      if (match) {
        const parsed = parseInt(match[1].replace(/,/g, ""), 10);
        if (parsed > 0) {
          reservationFee = parsed;
          break;
        }
      }
    }

    // Purchase price patterns
    const purchasePatterns = [
      /Purchase\s+Price[:\s]*[€$]?\s*([\d,]+)/i,
      /Price[:\s]*[€$]\s*([\d,]+)/i,
      /Total[:\s]*[€$]\s*([\d,]+)/i,
    ];

    for (const pattern of purchasePatterns) {
      const match = cleanResponse.match(pattern);
      if (match) {
        const parsed = parseInt(match[1].replace(/,/g, ""), 10);
        if (parsed > 0) {
          purchasePrice = parsed;
          break;
        }
      }
    }

    logger.debug("[ReservationAgreement] Financial", { reservationFee, purchasePrice });

    const financial: FinancialTerms = {
      reservationFee,
      reservationFeeWords: numberToWords(reservationFee) + " euro",
      purchasePrice,
      purchasePriceWords: numberToWords(purchasePrice) + " euro",
    };

    logger.debug("[ReservationAgreement] PARSE SUCCESS:", {
      buyers: buyers.map(b => `${b.fullName} ${b.idType}: ${b.idNumber}`),
      vendors: vendors.map(v => `${v.name} ${v.idType}: ${v.idNumber}`),
      property: formattedDescription.substring(0, 80),
      loan: hasLoanClause,
      vat: hasVatClause,
    });

    return {
      buyers,
      vendor,
      vendors,
      property,
      financial,
      hasLoanClause,
      hasVatClause,
    };
  } catch (error) {
    logger.error("[ReservationAgreement] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
