/**
 * Advanced Viewing Form
 * 
 * Template for viewing form with legal paragraph (exclusive representation clause).
 * Matches the HTML template: zyprus_viewing_form_single_advanced.html
 * 
 * Can be used for single or multiple people - includes the legal liability text.
 */

import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  UnderlineType,
} from "https://esm.sh/docx@8.5.0";

import { FONTS, SPACING, COMPANY, LEGAL_TEXT, createSignatureLine, formatDate, formatPropertyDescription, PLACEHOLDERS } from "../styles.ts";
import { logger } from "../../utils/logger.ts";

/**
 * Person data for viewing form
 */
export interface PersonData {
  fullName: string;
  idNumber: string;
  issuedBy: string;
}

/**
 * Data required for an advanced viewing form
 */
export interface ViewingFormAdvancedData {
  date?: string;
  persons: PersonData[];
  property: {
    registrationNo: string;
    district: string;
    municipality: string;
    locality: string;
    rawDescription?: string;
  };
}

/**
 * Create blank viewing form data with placeholders for advanced form
 */
export function createBlankViewingFormAdvancedData(date?: string): ViewingFormAdvancedData {
  return {
    date: date || formatDate(),
    persons: [
      {
        fullName: PLACEHOLDERS.FULL_NAME,
        idNumber: PLACEHOLDERS.ID_NUMBER,
        issuedBy: PLACEHOLDERS.ISSUED_BY,
      },
    ],
    property: {
      registrationNo: PLACEHOLDERS.REGISTRATION_NO,
      district: PLACEHOLDERS.DISTRICT,
      municipality: PLACEHOLDERS.MUNICIPALITY,
      locality: PLACEHOLDERS.LOCALITY,
      rawDescription: PLACEHOLDERS.PROPERTY,
    },
  };
}

/**
 * Creates an advanced viewing form document with legal paragraph
 */
export function createViewingFormAdvanced(
  data: ViewingFormAdvancedData,
  logoData?: Uint8Array
): Document {
  const dateStr = data.date || formatDate();
  const isSingle = data.persons.length === 1;

  const children: Paragraph[] = [];

  // Logo - preserve aspect ratio (Zyprus logo is 1960x1005, ~2:1 ratio)
  if (logoData && logoData.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: {
              width: 200,
              height: 103,
            },
            type: "png",
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: SPACING.TITLE_AFTER },
      })
    );
  }

  // Title: "Viewing Form" - centered, bold
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Viewing Form",
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

  // Empty line
  children.push(new Paragraph({ text: "" }));

  // Date line - plain text, no bold
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Date: ${dateStr}`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    })
  );

  // Empty line
  children.push(new Paragraph({ text: "" }));

  // Build declaration as single paragraph, no bold (matches reference)
  const personParts = data.persons.map((p, idx) => {
    const prefix = idx === 0 ? "Herein, I " : "I ";
    return `${prefix}${p.fullName} with ID ${p.idNumber}, Issued By: ${p.issuedBy}`;
  });
  const personsText = personParts.join(" and ");
  const verb = isSingle ? "me" : "us";
  const declarationText = `${personsText} confirm that ${COMPANY.FULL_REFERENCE}, has introduced to ${verb} with a viewing and/or digitally the property with the following Registry details:`;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: declarationText,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    })
  );

  // Empty line
  children.push(new Paragraph({ text: "" }));

  // Property line
  const rawProp = data.property.rawDescription || [
    data.property.registrationNo ? `registration no ${data.property.registrationNo}` : '',
    data.property.municipality, data.property.district, data.property.locality,
  ].filter(Boolean).join(" ");
  const propertyDescription = formatPropertyDescription(rawProp);
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Property:",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        ...(propertyDescription
          ? [
              new TextRun({
                text: ` ${propertyDescription}`,
                size: FONTS.SIZES.BODY,
                font: FONTS.PRIMARY,
              }),
            ]
          : []),
      ],
    })
  );

  // Empty line
  children.push(new Paragraph({ text: "" }));

  // Legal paragraph - plain text, no box/border (matches reference)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: LEGAL_TEXT.ADVANCED_VIEWING,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
    })
  );

  // Signatures as simple paragraphs (not table), no bold labels (matches reference)
  for (const _person of data.persons) {
    // Empty line before each signature block
    children.push(new Paragraph({ text: "" }));

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Name: ${createSignatureLine(25)}`,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
      })
    );

    // Empty line between name and signature
    children.push(new Paragraph({ text: "" }));

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Signature: ${createSignatureLine(25)}`,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
      })
    );
  }
  
  return new Document({
    sections: [{
      children,
    }],
  });
}

/**
 * Parse AI response to extract advanced viewing form data
 * Returns blank data with placeholders if parsing fails (for blank documents)
 */
export function parseViewingFormAdvancedData(response: string): ViewingFormAdvancedData | null {
  try {
    // Strip markdown formatting for easier parsing
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*\s+/g, '');

    // Check if this is a BLANK viewing form (has placeholders or ellipses)
    const hasBlankPatterns = /\[\s*\]/g.test(response) ||
                            /[\.…]{8,}/g.test(response) ||
                            /_{15,}/g.test(response) ||
                            /\.{15,}/g.test(response);

    const isViewingForm = cleanResponse.toLowerCase().includes('viewing form') &&
                          cleanResponse.toLowerCase().includes('herein, i');

    // If it's a blank viewing form, return placeholder data
    if (isViewingForm && hasBlankPatterns) {
      logger.debug("[ViewingFormAdvanced] Detected blank viewing form - using placeholders");
      const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      return createBlankViewingFormAdvancedData(dateMatch ? dateMatch[1] : undefined);
    }

    // Extract all person matches
    // IMPORTANT: issuedBy captures only the country name (single word) to avoid duplicate company text
    const persons: PersonData[] = [];
    const simpleMatches = cleanResponse.matchAll(/(?:Herein,?\s*)?I\s+([^,]+?)\s+with\s+ID\s+([^\s,]+),?\s+Issued\s+By:?\s*([A-Za-z]+)(?:\s+confirm)?/gi);
    for (const m of simpleMatches) {
      persons.push({
        fullName: m[1].trim(),
        idNumber: m[2].trim(),
        issuedBy: m[3].trim(),
      });
    }

    // Capture full "Property:" line for smart formatting
    // IMPORTANT: Must anchor to line start and require colon to avoid matching "Property" in company name
    const propertyLineMatch = cleanResponse.match(/^Property:\s*(.+)/im);

    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*([^\n,*]+)/i);

    const dateMatch = cleanResponse.match(/Date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (persons.length === 0 || (!regNoMatch && !propertyLineMatch)) {
      logger.debug("[ViewingFormAdvanced] Could not parse required fields from response");
      return null;
    }

    return {
      date: dateMatch ? dateMatch[1] : undefined,
      persons,
      property: {
        registrationNo: regNoMatch ? regNoMatch[1].trim() : "",
        district: districtMatch ? districtMatch[1].trim() : "",
        municipality: municipalityMatch ? municipalityMatch[1].trim() : "",
        locality: localityMatch ? localityMatch[1].trim() : "",
        rawDescription: propertyLineMatch ? propertyLineMatch[1].trim() : undefined,
      },
    };
  } catch (error) {
    logger.error("[ViewingFormAdvanced] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

