/**
 * Property Reservation Agreement - DOCX Generator
 *
 * Template 13: Generates a legally binding reservation agreement
 * with multiple buyer support, legal clauses, and signature sections.
 */

import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  UnderlineType,
} from "https://esm.sh/docx@8.5.0";

import { FONTS, SPACING, createSignatureLine, formatDate } from "../styles.ts";
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
  reservationPeriodWeeks: number;
  contractDeadlineDays: number;
  agreementDate: string;
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
 * Legal clauses for the reservation agreement
 */
const LEGAL_CLAUSES = {
  reservationPeriod: (weeks: number, fee: string) =>
    `The prospective buyer agrees that the reservation fee to the amount ${fee} will be held by the Estate Agent (as defined herein below into this Property Reservation Agreement) under its custody in order to guarantee that the above property is taken off the market, and be reserved exclusively for the Prospective buyer, for a period of ${weeks} weeks from the date reservation fee received (hereinafter referred to as the "Reservation Period"). The Reservation Fee must be released by the Estate Agent pursuant to the terms and provisions of this Property Reservation Agreement.`,

  refundConditions:
    `In the event that the purchase fails to materialize, due to the Vendor's fault, and/or the property does not have clean land registry search (i.e. mortgages etc.) and/or is not free of any encumbrances and/or legal charges whatsoever, then the Reservation fee will be returned in full to the Prospective buyer within 4 (four) calendar days from the termination of the reservation.`,

  forfeitureConditions:
    `If the purchase fails to materialize due to the Prospective buyer's fault, then the reservation fee is not refundable and it will be provided 50% to the Vendor and the remaining 50% will be held by the estate agent to cover the administration costs. Except if the mortgage has been refused and a relevant confirmation is provided from the Bank, then the deposit will be returned in full to the prospective buyer.`,

  contractDeadline: (days: number) =>
    `The amount of the reservation fee will be considered as part of the fixed purchase price and a legally binding Contract of Sale must be signed within ${days} days from the date of the reservation fee received, subject to the provisions hereof.`,

  estateAgentArbiter:
    `With regard to the subject reservation agreement, the estate agent is the mutually agreed party responsible for determining who is at fault if the transaction does not proceed.`,

  exclusiveNegotiation:
    `For the entire duration of the Reservation Period, the Vendors and the Estate Agent shall not, accept any offers and/or otherwise from any third party in relation to the Property.`,
};

/**
 * Format buyers for display (with "and" between multiple)
 */
function formatBuyers(buyers: BuyerInfo[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  buyers.forEach((buyer, index) => {
    if (index > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "and",
              size: FONTS.SIZES.BODY,
              font: FONTS.PRIMARY,
            }),
          ],
          spacing: { before: 100, after: 100 },
        })
      );
    }

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: buyer.fullName,
            bold: true,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${buyer.country} PASSPORT: ${buyer.passportNumber}`,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { after: 100 },
      })
    );
  });

  return paragraphs;
}

/**
 * Creates a Property Reservation Agreement document
 */
export function createReservationAgreement(
  data: ReservationAgreementData,
  logoData?: Uint8Array
): Document {
  const children: Paragraph[] = [];
  const { agent, bank } = ZYPRUS_DEFAULTS;

  // Logo
  if (logoData && logoData.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: {
              width: 180,
              height: 92,
            },
            type: "png",
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: SPACING.TITLE_AFTER },
      })
    );
  }

  // Title: PROPERTY RESERVATION
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PROPERTY RESERVATION",
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
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.dateReservationFeeReceived || createSignatureLine(30),
          bold: !!data.dateReservationFeeReceived,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );

  // Prospective Buyer label
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Prospective Buyer:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    })
  );

  // Buyer(s) details
  children.push(...formatBuyers(data.buyers));

  // Vendor label and details
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Vendor:",
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
          text: data.vendor.name,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        ...(data.vendor.registrationNumber ? [
          new TextRun({
            text: ` ${data.vendor.registrationNumber}`,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ] : []),
      ],
      spacing: { after: 200 },
    })
  );

  // Property Details label
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Property Details:",
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
          text: `${data.property.type} in ${data.property.location}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${data.property.building} Unit No. ${data.property.unitNumber} with Reg Number ${data.property.registrationNumber}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Financial terms
  const reservationFeeFormatted = `€${data.financial.reservationFee.toLocaleString()}`;
  const purchasePriceFormatted = `€${data.financial.purchasePrice.toLocaleString()}`;

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
          text: `${reservationFeeFormatted} `,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `(In words ${data.financial.reservationFeeWords} only)`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Purchase Price: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `${purchasePriceFormatted} `,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: `(In words ${data.financial.purchasePriceWords} only)`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );

  // Legal clauses
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_CLAUSES.reservationPeriod(data.reservationPeriodWeeks, reservationFeeFormatted),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_CLAUSES.refundConditions,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_CLAUSES.forfeitureConditions,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_CLAUSES.contractDeadline(data.contractDeadlineDays),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_CLAUSES.estateAgentArbiter,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // Estate Agent Details
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

  // Banking Details
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Bank details of the Estate Agent, where the Reservation Fee must be transferred/paid by the Prospective Buyer:",
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
          text: LEGAL_CLAUSES.exclusiveNegotiation,
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
          text: `Dated on this ${data.agreementDate}.`,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.SIGNATURE_BEFORE },
    })
  );

  // Signature sections - Prospective Buyer(s)
  for (const buyer of data.buyers) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "The Prospective Buyer:",
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
          new TextRun({
            text: "                              Name and I.D.:",
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Vendor signature
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "The Vendor:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: "                         WITNESSES",
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
          text: data.vendor.name,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: "                              Name and I.D.:",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Estate Agent signature
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
    const dateReservationFeeReceived = dateMatch ? dateMatch[1].trim() : formatDate();

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
    const propertyTypeMatch = cleanResponse.match(/(Apartment|Villa|House|Land|Office|Shop|Warehouse|Building)\s+(?:in|at)\s+/i);
    const locationMatch = cleanResponse.match(/(?:in|at)\s+([A-Za-z\s,]+)(?:\n|$)/i);
    const buildingMatch = cleanResponse.match(/([A-Za-z\s]+(?:Bl\.|Block|Building)[^\n]*Unit)/i) ||
                          cleanResponse.match(/([A-Za-z0-9\s\-\.]+)\s+Unit\s+No/i);
    const unitMatch = cleanResponse.match(/Unit\s+(?:No\.?|Number)[:\s]+(\S+)/i);
    const regMatch = cleanResponse.match(/(?:Reg(?:istration)?\.?\s*(?:No\.?|Number)?)[:\s]+(\d+\/\d+)/i) ||
                     cleanResponse.match(/with\s+Reg\s+Number\s+(\d+\/\d+)/i);

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

    // Extract timeline (with defaults)
    const periodMatch = cleanResponse.match(/(\d+)\s*weeks?\s+(?:reservation|period)/i);
    const deadlineMatch = cleanResponse.match(/(\d+)\s*days?\s+(?:to\s+sign|deadline|contract)/i);

    const reservationPeriodWeeks = periodMatch ? parseInt(periodMatch[1], 10) : 8;
    const contractDeadlineDays = deadlineMatch ? parseInt(deadlineMatch[1], 10) : 40;

    // Extract agreement date or use today
    const agreementDateMatch = cleanResponse.match(/Dated\s+(?:on\s+)?(?:this\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?[A-Za-z]+\s+\d{4})/i);
    const agreementDate = agreementDateMatch ? agreementDateMatch[1] : formatOrdinalDate(new Date());

    console.log("[ReservationAgreement] Successfully parsed data:", {
      buyers: buyers.length,
      vendor: vendor.name,
      property: property.registrationNumber,
      reservationFee,
      purchasePrice,
    });

    return {
      dateReservationFeeReceived,
      buyers,
      vendor,
      property,
      financial,
      reservationPeriodWeeks,
      contractDeadlineDays,
      agreementDate,
    };
  } catch (error) {
    console.error("[ReservationAgreement] Error parsing response:", error);
    return null;
  }
}

/**
 * Format date as ordinal (e.g., "21st day of October 2022")
 */
function formatOrdinalDate(date: Date): string {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  const suffix = getOrdinalSuffix(day);
  return `${day}${suffix} day of ${month} ${year}`;
}

/**
 * Get ordinal suffix for a number
 */
function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

