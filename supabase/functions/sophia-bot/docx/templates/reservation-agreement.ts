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
 * Property information - single description string
 */
export interface PropertyInfo {
  description: string;
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
function getRefundClause(hasLoan: boolean, hasVat: boolean, reservationFee: string): string {
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

  // Build buyer string: "Name Cyprus ID: 123456"
  const buyerStr = data.buyers
    .map((b) => `${b.fullName} ${b.idType}: ${b.idNumber}`)
    .join(" and ");

  // Build vendor string: "Name Cyprus ID: 123456"
  const vendorStr = `${data.vendor.name} ${data.vendor.idType}: ${data.vendor.idNumber}`;

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
        new TextRun({ text: data.dateReceived || "……..……………………………………….".substring(0, 40), size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Prospective Buyer
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Prospective Buyer: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: buyerStr, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Vendor
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Vendor: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: vendorStr, size: 22, font: "Times New Roman" }),
      ],
      spacing: { after: 200 },
    })
  );

  // Property Details
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Property Details: ", bold: true, size: 22, font: "Times New Roman" }),
        new TextRun({ text: data.property.description, size: 22, font: "Times New Roman" }),
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

  // ===== THE PROSPECTIVE BUYER SECTION =====
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        // Row 1: "The Prospective Buyer:" | "WITNESSES"
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "The Prospective Buyer:", size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "WITNESSES", size: 22, font: "Times New Roman" })],
              })],
            }),
          ],
        }),
        // Row 2: Empty row for signature space
        new TableRow({
          children: [
            new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
            new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
          ],
        }),
        // Row 3: Signature lines
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "_________________________", size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "_________________________", size: 22, font: "Times New Roman" })],
              })],
            }),
          ],
        }),
        // Row 4: Buyer name | Name and I.D.:
        ...data.buyers.map(buyer => new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: `${buyer.fullName} ${buyer.idType}`, size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "Name and I.D.:", size: 22, font: "Times New Roman" })],
              })],
            }),
          ],
        })),
      ],
    })
  );

  // Spacing after buyer section
  children.push(new Paragraph({ text: "", spacing: { after: 300 } }));

  // ===== THE VENDOR SECTION =====
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        // Row 1: "The Vendor:" | empty (no WITNESSES header repeated)
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "The Vendor:", size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({ text: "" })],
            }),
          ],
        }),
        // Row 2: Empty row for signature space
        new TableRow({
          children: [
            new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
            new TableCell({ borders: noBorders, children: [new Paragraph({ text: "" })] }),
          ],
        }),
        // Row 3: Signature lines
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "_________________________", size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "_________________________", size: 22, font: "Times New Roman" })],
              })],
            }),
          ],
        }),
        // Row 4: Vendor name | Name and I.D.:
        new TableRow({
          children: [
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: data.vendor.name, size: 22, font: "Times New Roman" })],
              })],
            }),
            new TableCell({
              borders: noBorders,
              children: [new Paragraph({
                children: [new TextRun({ text: "Name and I.D.:", size: 22, font: "Times New Roman" })],
              })],
            }),
          ],
        }),
      ],
    })
  );

  // Spacing after vendor section
  children.push(new Paragraph({ text: "", spacing: { after: 300 } }));

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

/**
 * Parse AI response to extract reservation agreement data
 * VERY forgiving parser - handles any format the AI might output
 */
export function parseReservationAgreementData(response: string): ReservationAgreementData | null {
  try {
    console.log("[ReservationAgreement] Parsing response, length:", response.length);

    // Extract LOAN/VAT flags
    const hasLoanClause = /loan/i.test(response) && /yes/i.test(response);
    const hasVatClause = /vat/i.test(response) && /yes/i.test(response);
    console.log("[ReservationAgreement] Loan:", hasLoanClause, "VAT:", hasVatClause);

    // BUYER: Extract any name after "Prospective Buyer"
    let buyerName = "";
    let buyerIdType = "Cyprus ID";
    let buyerIdNumber = "";

    // Try to get buyer name - very forgiving
    const buyerMatch = response.match(/Prospective\s+Buyer[:\s]*([A-Za-z][A-Za-z\s]*)/i);
    if (buyerMatch) {
      buyerName = buyerMatch[1].trim().split('\n')[0].trim(); // Take first line only
    }

    // Try to get first ID number after buyer section
    const firstIdMatch = response.match(/(?:Cyprus\s+)?(?:ID|PASSPORT)[:\s]*(\d+)/i);
    if (firstIdMatch) {
      buyerIdNumber = firstIdMatch[1];
      if (/passport/i.test(response.substring(0, response.indexOf(firstIdMatch[0]) + 50))) {
        buyerIdType = "Cyprus Passport";
      }
    }

    console.log("[ReservationAgreement] Buyer:", buyerName, buyerIdType, buyerIdNumber);

    if (!buyerName || !buyerIdNumber) {
      // Last resort - just grab any name-like text
      const anyNameMatch = response.match(/Buyer[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/);
      if (anyNameMatch) buyerName = anyNameMatch[1];
      const anyIdMatch = response.match(/(\d{5,})/);
      if (anyIdMatch) buyerIdNumber = anyIdMatch[1];
    }

    if (!buyerName) {
      console.log("[ReservationAgreement] No buyer name found");
      return null;
    }

    const buyers: BuyerInfo[] = [{
      fullName: buyerName,
      idType: buyerIdType,
      idNumber: buyerIdNumber || "000000",
    }];

    // VENDOR: Extract name after "Vendor"
    let vendorName = "";
    let vendorIdType = "Cyprus ID";
    let vendorIdNumber = "";

    const vendorMatch = response.match(/Vendor[:\s]*([A-Za-z][A-Za-z\s]*?)(?=\n|Cyprus|ID|PASSPORT|Property)/i);
    if (vendorMatch) {
      vendorName = vendorMatch[1].trim();
    }

    // Get vendor ID - look for ID after vendor section
    const vendorSection = response.match(/Vendor[:\s]*([^]*?)(?=Property\s+Details)/i);
    if (vendorSection) {
      const vendorIdMatch = vendorSection[1].match(/(?:Cyprus\s+)?(?:ID|PASSPORT)[:\s]*(\d+)/i);
      if (vendorIdMatch) {
        vendorIdNumber = vendorIdMatch[1];
        if (/passport/i.test(vendorSection[1])) {
          vendorIdType = "Cyprus Passport";
        }
      }
    }

    console.log("[ReservationAgreement] Vendor:", vendorName, vendorIdType, vendorIdNumber);

    if (!vendorName) {
      // Fallback
      const anyVendorMatch = response.match(/Vendor[:\s]*([A-Z][a-z]+)/);
      if (anyVendorMatch) vendorName = anyVendorMatch[1];
    }

    if (!vendorName) {
      console.log("[ReservationAgreement] No vendor name found");
      return null;
    }

    const vendor: VendorInfo = {
      name: vendorName,
      idType: vendorIdType,
      idNumber: vendorIdNumber || "000000",
    };

    // PROPERTY: Extract description - take everything after "Property Details:" until next field
    let propertyDesc = "Property as described";
    const propertyMatch = response.match(/Property\s+Details[:\s]*([^]*?)(?=Reservation\s+Fee|Purchase\s+Price|$)/i);
    if (propertyMatch) {
      propertyDesc = propertyMatch[1].trim().split('\n')[0].trim() || propertyDesc;
    }
    console.log("[ReservationAgreement] Property:", propertyDesc.substring(0, 50));

    const property: PropertyInfo = { description: propertyDesc };

    // FINANCIAL: Extract amounts - be very forgiving
    let reservationFee = 5000; // default
    let purchasePrice = 300000; // default

    const reservationMatch = response.match(/Reservation\s+Fee[:\s]*[€$]?\s*([\d,]+)/i);
    if (reservationMatch) {
      reservationFee = parseInt(reservationMatch[1].replace(/,/g, ""), 10) || 5000;
    }

    const purchaseMatch = response.match(/Purchase\s+Price[:\s]*[€$]?\s*([\d,]+)/i);
    if (purchaseMatch) {
      purchasePrice = parseInt(purchaseMatch[1].replace(/,/g, ""), 10) || 300000;
    }

    console.log("[ReservationAgreement] Financial:", reservationFee, purchasePrice);

    const financial: FinancialTerms = {
      reservationFee,
      reservationFeeWords: numberToWords(reservationFee) + " euro",
      purchasePrice,
      purchasePriceWords: numberToWords(purchasePrice) + " euro",
    };

    console.log("[ReservationAgreement] PARSE SUCCESS:", {
      buyer: buyers[0].fullName,
      vendor: vendor.name,
      property: propertyDesc.substring(0, 30),
      loan: hasLoanClause,
      vat: hasVatClause,
    });

    return {
      buyers,
      vendor,
      property,
      financial,
      hasLoanClause,
      hasVatClause,
    };
  } catch (error) {
    console.error("[ReservationAgreement] PARSE ERROR:", error);
    return null;
  }
}
