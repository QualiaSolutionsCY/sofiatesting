/**
 * Property Reservation Agreement - DOCX Generator
 *
 * 4 Template Variants based on LOAN/VAT answers:
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
} from "https://esm.sh/docx@8.5.0";

import { FONTS, SPACING, createSignatureLine } from "../styles.ts";
import { numberToWords } from "../../utils/number-to-words.ts";

/**
 * Buyer information
 */
export interface BuyerInfo {
  fullName: string;
  country: string;
  passportNumber: string;
}

/**
 * Vendor information
 */
export interface VendorInfo {
  name: string;
  registrationNumber?: string;
}

/**
 * Property information
 */
export interface PropertyInfo {
  type: string;
  location: string;
  building: string;
  unitNumber: string;
  registrationNumber: string;
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
  dateReservationFeeReceived: string;
  buyers: BuyerInfo[];
  vendor: VendorInfo;
  property: PropertyInfo;
  financial: FinancialTerms;
  reservationPeriodDays: number;
  contractDeadlineDays: number;
  agreementDate: string;
  hasLoanClause: boolean;
  hasVatClause: boolean;
}

/**
 * Default Zyprus agent and bank details
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
 * Get the refund clause based on LOAN/VAT flags
 * MUST match the original templates EXACTLY
 */
function getRefundClause(hasLoanClause: boolean, hasVatClause: boolean): string {
  const baseStart = `In the event that the purchase fails to materialize, due to the Vendor's fault, and/or the property does not have clean land registry search (i.e. mortgages etc.) and/or is not free of any encumbrances and/or legal charges whatsoever`;

  // NO LOAN, NO VAT
  if (!hasLoanClause && !hasVatClause) {
    return `${baseStart}, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // YES LOAN, NO VAT
  if (hasLoanClause && !hasVatClause) {
    return `${baseStart}, and/or in the event of refusal or rejection of a mortgage application, subject to the provision of written confirmation by the Bank, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // NO LOAN, YES VAT (note: slightly different wording - "then", "will", "without")
  if (!hasLoanClause && hasVatClause) {
    return `${baseStart}, and/or the prospective sale of the property to the prospective buyer is subject to VAT following a decision of the competent authorities of the Republic of Cyprus and/or the Tax Commissioner, then the Reservation fee will be returned in full to the Prospective buyer without any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
  }

  // YES LOAN, YES VAT (VAT first, then LOAN)
  return `${baseStart}, and/or the prospective sale of the property to the prospective buyer is subject to VAT following a decision of the competent authorities of the Republic of Cyprus and/or the Tax Commissioner, and/or in the event of refusal or rejection of a mortgage application, subject to the provision of written confirmation by the Bank, the Reservation Fee shall be returned in full to the Prospective Buyer, free of any deductions whatsoever within 4 (four) calendar days from the termination of expiry of the reservation period and the Vendor and/or the Estate Agent shall not have any claim whatsoever against the Prospective Buyer in relation to this Agreement.`;
}

/**
 * Creates a Property Reservation Agreement document
 * Matches the 4 template variants in docs/templates/ EXACTLY
 */
export function createReservationAgreement(
  data: ReservationAgreementData,
  _logoData?: Uint8Array // Unused - no logo on reservation agreements
): Document {
  const children: Paragraph[] = [];
  const { agent, bank } = ZYPRUS_DEFAULTS;

  // Title: PROPERTY RESERVATION AGREEMENT (bold, underlined, centered)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PROPERTY RESERVATION AGREEMENT",
          bold: true,
          size: FONTS.SIZES.TITLE,
          font: FONTS.PRIMARY,
          underline: { type: UnderlineType.SINGLE },
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: SPACING.TITLE_AFTER },
    })
  );

  // Date Reservation Fee Received
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Date Reservation Fee Received: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.dateReservationFeeReceived || "……..……………………………………….".substring(0, 40),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );

  // Prospective Buyer(s) - label bold, name not bold, same line
  for (const buyer of data.buyers) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Prospective Buyer: ",
            bold: true,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: buyer.fullName,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // Vendor - label bold, name not bold, same line
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Vendor: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.vendor.name + (data.vendor.registrationNumber ? ` ${data.vendor.registrationNumber}` : ""),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    })
  );

  // Property Details - label bold, details not bold, same line
  const propertyDescription = `${data.property.type} with title deed registration number ${data.property.registrationNumber}, ${data.property.building} Unit No. ${data.property.unitNumber}, situated in ${data.property.location}`;
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Property Details: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: propertyDescription,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    })
  );

  // Financial terms
  const reservationFeeFormatted = `€${data.financial.reservationFee.toLocaleString()}`;
  const purchasePriceFormatted = `€${data.financial.purchasePrice.toLocaleString()}`;

  // Reservation Fee
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Reservation Fee: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `${reservationFeeFormatted} (In words ${data.financial.reservationFeeWords} only)`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    })
  );

  // Purchase Price
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Purchase Price: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `${purchasePriceFormatted} (In words ${data.financial.purchasePriceWords} only)`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );

  // Paragraph 1: Reservation Period clause
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `The prospective buyer agrees that the reservation fee to the amount ${reservationFeeFormatted} will be held by the Estate Agent (as defined herein below into this Property Reservation Agreement) as the escrow agent and which will be held under its custody in order to guarantee that the above property is taken off the market, and be reserved exclusively for the Prospective buyer, for a period of ${data.reservationPeriodDays} days from the date reservation fee received (hereinafter referred to as the "Reservation Period"). The Reservation Fee must be released by the Escrow Agent pursuant to the terms and provisions of this Property Reservation Agreement.`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Paragraph 2: Refund clause (varies by LOAN/VAT)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: getRefundClause(data.hasLoanClause, data.hasVatClause),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Paragraph 3: Contract deadline clause
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `The amount of the reservation fee will be considered as part of the fixed purchase price and a legally binding Contract of Sale must be signed within ${data.contractDeadlineDays} days from the date of the reservation fee received, subject to the provisions hereof.`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Paragraph 4: Forfeiture clause
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `If the purchase fails to materialize due to the Prospective buyer's exclusive fault, then the reservation fee is not refundable and it will be provided 50% to the Vendor and the remaining 50% will be held by the estate agent to cover the administration costs.`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Paragraph 5: Arbiter clause
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `With regard to the subject reservation agreement, the estate agent is the mutually agreed party responsible for determining who is at fault if the transaction does not proceed.`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Details of the Estate Agent
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Details of the Estate Agent:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { before: 200, after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Name: ${agent.name}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `On behalf of ${agent.company}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `CREA Reg. No. ${agent.creaRegNo} & Lic. No. ${agent.licenseNo} (called the "Estate Agent")`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Bank details (includes "as escrow agent")
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Bank details of the Estate Agent, as escrow agent, where the Reservation Fee must be transferred/paid by the Prospective Buyer:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Banking Details",
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Name: ${bank.name}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Account No: ${bank.accountNo}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `IBAN: ${bank.iban}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `BIC: ${bank.bic}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Exclusive negotiation clause
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `For the entire duration of the Reservation Period, the Vendor and the Estate Agent shall not, directly and/or indirectly, advertise, negotiate, solicit and/or accept any offers and/or otherwise from any third party in relation to the Property.`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200, line: SPACING.LINE_HEIGHT },
    })
  );

  // Agreement date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Dated on this ${data.agreementDate}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.SIGNATURE_BEFORE },
    })
  );

  // Signature section: Prospective Buyer(s) with WITNESSES
  for (const buyer of data.buyers) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "The Pospective Buyer:",
            bold: true,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: "                    WITNESSES",
            bold: true,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { before: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: createSignatureLine(25),
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: "                    ",
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: createSignatureLine(25),
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: buyer.fullName,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Name and I.D.:",
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Signature section: Vendor (NO WITNESSES)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "The Vendor:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { before: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: createSignatureLine(25),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: data.vendor.name,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Name and I.D.:",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Signature section: Estate Agent
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "The Estate Agent:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { before: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: createSignatureLine(25),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: agent.name,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `For and on behalf of ${agent.company}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    })
  );

  return new Document({
    sections: [{
      children,
    }],
  });
}

/**
 * Parse AI response to extract reservation agreement data
 */
export function parseReservationAgreementData(response: string): ReservationAgreementData | null {
  try {
    const cleanResponse = response.replace(/\*\*/g, '');
    console.log("[ReservationAgreement] Parsing response...");

    // Extract date reservation fee received
    const dateMatch = cleanResponse.match(/Date\s+Reservation\s+Fee\s+Received[:\s]+([^\n]+)/i) ||
                      cleanResponse.match(/Date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    const dateReservationFeeReceived = dateMatch ? dateMatch[1].trim() : "";

    // Extract buyers (can be multiple)
    const buyers: BuyerInfo[] = [];

    // Pattern 1: "Name COUNTRY PASSPORT: number"
    const buyerPattern1 = /([A-Za-z]+\s+[A-Za-z]+)\s*\n?\s*([A-Z]+)\s+PASSPORT[:\s]+(\d+)/gi;
    let buyerMatch;
    while ((buyerMatch = buyerPattern1.exec(cleanResponse)) !== null) {
      buyers.push({
        fullName: buyerMatch[1].trim(),
        country: buyerMatch[2].trim(),
        passportNumber: buyerMatch[3].trim(),
      });
    }

    // Pattern 2: "Buyer: Name, Country, Passport: number"
    if (buyers.length === 0) {
      const buyerPattern2 = /(?:Buyer|Prospective\s+Buyer)[:\s]+([A-Za-z\s]+),\s*([A-Za-z]+),\s*(?:Passport|ID)[:\s]+([A-Z0-9]+)/gi;
      while ((buyerMatch = buyerPattern2.exec(cleanResponse)) !== null) {
        buyers.push({
          fullName: buyerMatch[1].trim(),
          country: buyerMatch[2].trim(),
          passportNumber: buyerMatch[3].trim(),
        });
      }
    }

    // Pattern 3: Simple "Name from Country, passport number"
    if (buyers.length === 0) {
      const buyerPattern3 = /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:from\s+)?([A-Za-z]+)[\s,]+(?:passport|id)[:\s]+([A-Z0-9]+)/gi;
      while ((buyerMatch = buyerPattern3.exec(cleanResponse)) !== null) {
        buyers.push({
          fullName: buyerMatch[1].trim(),
          country: buyerMatch[2].trim(),
          passportNumber: buyerMatch[3].trim(),
        });
      }
    }

    if (buyers.length === 0) {
      console.log("[ReservationAgreement] Could not extract buyer information");
      return null;
    }

    // Extract vendor
    const vendorMatch = cleanResponse.match(/Vendor[:\s]+([^\n]+?)(?:\s+HE\s+\d+|\s*\n)/i) ||
                        cleanResponse.match(/Seller[:\s]+([^\n]+?)(?:\s+HE\s+\d+|\s*\n)/i);
    const vendorRegMatch = cleanResponse.match(/(HE\s*\d+)/i);

    if (!vendorMatch) {
      console.log("[ReservationAgreement] Could not extract vendor information");
      return null;
    }

    const vendor: VendorInfo = {
      name: vendorMatch[1].trim(),
      registrationNumber: vendorRegMatch ? vendorRegMatch[1] : undefined,
    };

    // Extract property details
    const propertyTypeMatch = cleanResponse.match(/(Apartment|Villa|House|Land|Office|Shop|Warehouse|Building|Plot)\s+(?:in|at|with)\s+/i);
    const locationMatch = cleanResponse.match(/(?:situated\s+in|in|at)\s+([A-Za-z\s,]+?)(?:\s*\n|$)/i);
    const buildingMatch = cleanResponse.match(/([A-Za-z\s]+(?:Bl\.|Block|Building)[^\n]*)/i) ||
                          cleanResponse.match(/([A-Za-z0-9\s\-\.]+)\s+Unit\s+No/i);
    const unitMatch = cleanResponse.match(/Unit\s+(?:No\.?|Number)[:\s]+(\S+)/i);
    const regMatch = cleanResponse.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?|Number)?)[:\s]+(\d+\/\d+)/i) ||
                     cleanResponse.match(/registration\s+number\s+(\d+\/\d+)/i);

    if (!regMatch) {
      console.log("[ReservationAgreement] Could not extract property registration number");
      return null;
    }

    const property: PropertyInfo = {
      type: propertyTypeMatch ? propertyTypeMatch[1] : "Property",
      location: locationMatch ? locationMatch[1].trim() : "",
      building: buildingMatch ? buildingMatch[1].trim() : "",
      unitNumber: unitMatch ? unitMatch[1] : "",
      registrationNumber: regMatch[1],
    };

    // Extract financial terms
    const reservationFeeMatch = cleanResponse.match(/Reservation\s+Fee[:\s]+[€$]?\s*([\d,]+)/i);
    const purchasePriceMatch = cleanResponse.match(/Purchase\s+Price[:\s]+[€$]?\s*([\d,]+)/i);

    if (!reservationFeeMatch || !purchasePriceMatch) {
      console.log("[ReservationAgreement] Could not extract financial terms");
      return null;
    }

    const reservationFee = parseInt(reservationFeeMatch[1].replace(/,/g, ''), 10);
    const purchasePrice = parseInt(purchasePriceMatch[1].replace(/,/g, ''), 10);

    const financial: FinancialTerms = {
      reservationFee,
      reservationFeeWords: numberToWords(reservationFee) + " euro",
      purchasePrice,
      purchasePriceWords: numberToWords(purchasePrice) + " euro",
    };

    // Extract timeline (defaults: 40 days)
    const periodMatch = cleanResponse.match(/(\d+)\s*days?\s+(?:reservation|period)/i);
    const deadlineMatch = cleanResponse.match(/(\d+)\s*days?\s+(?:to\s+sign|deadline|contract)/i);

    const reservationPeriodDays = periodMatch ? parseInt(periodMatch[1], 10) : 40;
    const contractDeadlineDays = deadlineMatch ? parseInt(deadlineMatch[1], 10) : 40;

    // Extract Loan/VAT clause flags
    const lowerResponse = cleanResponse.toLowerCase();
    const hasLoanClause =
      lowerResponse.includes("with loan") ||
      lowerResponse.includes("yes loan") ||
      lowerResponse.includes("loan clause") ||
      lowerResponse.includes("mortgage clause") ||
      lowerResponse.includes("bank loan") ||
      lowerResponse.includes("needs mortgage") ||
      lowerResponse.includes("getting a loan") ||
      lowerResponse.includes("applying for loan") ||
      lowerResponse.includes("loan: yes") ||
      /loan[:\s]+yes/i.test(cleanResponse);

    const hasVatClause =
      lowerResponse.includes("with vat") ||
      lowerResponse.includes("yes vat") ||
      lowerResponse.includes("vat clause") ||
      lowerResponse.includes("vat applies") ||
      lowerResponse.includes("subject to vat") ||
      lowerResponse.includes("vat: yes") ||
      /vat[:\s]+yes/i.test(cleanResponse);

    // Extract agreement date or use today
    const agreementDateMatch = cleanResponse.match(/Dated\s+(?:on\s+)?(?:this\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?[A-Za-z]+,?\s+\d{4})/i);
    const agreementDate = agreementDateMatch ? agreementDateMatch[1] : formatOrdinalDate(new Date());

    console.log("[ReservationAgreement] Successfully parsed data:", {
      buyers: buyers.length,
      vendor: vendor.name,
      property: property.registrationNumber,
      reservationFee,
      purchasePrice,
      hasLoanClause,
      hasVatClause,
    });

    return {
      dateReservationFeeReceived,
      buyers,
      vendor,
      property,
      financial,
      reservationPeriodDays,
      contractDeadlineDays,
      agreementDate,
      hasLoanClause,
      hasVatClause,
    };
  } catch (error) {
    console.error("[ReservationAgreement] Error parsing response:", error);
    return null;
  }
}

/**
 * Format date as ordinal (e.g., "28th day of July, 2025")
 */
function formatOrdinalDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const suffix = getOrdinalSuffix(day);
  return `${day}${suffix} day of ${month}, ${year}`;
}

/**
 * Get ordinal suffix for a number
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
