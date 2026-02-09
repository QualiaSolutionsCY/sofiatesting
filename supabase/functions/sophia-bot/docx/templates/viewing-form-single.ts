/**
 * Standard Viewing Form - Single Person
 * 
 * Template for a single person viewing form.
 * Matches the HTML template: zyprus_viewing_form_single.html
 */

import {
  Document,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  UnderlineType,
} from "https://esm.sh/docx@8.5.0";

import { FONTS, SPACING, COMPANY, createSignatureLine, formatDate, formatPropertyDescription } from "../styles.ts";
import { logger, LogCategory } from "../../utils/logger.ts";

/**
 * Data required for a single person viewing form
 */
export interface ViewingFormSingleData {
  date?: string;
  person: {
    fullName: string;
    idNumber: string;
    issuedBy: string;
  };
  property: {
    registrationNo: string;
    district: string;
    municipality: string;
    locality: string;
    rawDescription?: string;
  };
}

/**
 * Creates a single person viewing form document
 */
export function createViewingFormSingle(
  data: ViewingFormSingleData,
  logoData?: Uint8Array
): Document {
  const dateStr = data.date || formatDate();
  
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
  
  // Title: "Viewing Form" - centered, bold, underlined
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

  // Date line
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Date: ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: dateStr,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.TITLE_AFTER },
    })
  );

  // Declaration paragraph - no bold on names/IDs/company (matches reference doc)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Herein, I ${data.person.fullName} with ID ${data.person.idNumber} Issued By: ${data.person.issuedBy} confirm that ${COMPANY.FULL_REFERENCE}, has introduced to me with a viewing the property with the following Registry details:`,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: 366 },
    })
  );

  // Property line - uses smart parser (handles building names, flat numbers)
  const rawProp = data.property.rawDescription || [
    data.property.registrationNo ? `registration no ${data.property.registrationNo}` : '',
    data.property.municipality, data.property.district, data.property.locality,
  ].filter(Boolean).join(" ");
  const propertyDescription = formatPropertyDescription(rawProp);
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Property: ",
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
      spacing: { after: SPACING.SIGNATURE_BEFORE },
    })
  );

  // Empty line before signatures
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  // Signature - Name
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Name: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: createSignatureLine(20),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Signature - Signature
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Signature: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: createSignatureLine(18),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 400 },
    })
  );
  
  return new Document({
    sections: [{
      children,
    }],
  });
}

/**
 * Parse AI response to extract viewing form data for single person
 */
export function parseViewingFormSingleData(response: string): ViewingFormSingleData | null {
  try {
    // Strip markdown formatting for easier parsing
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*\s+/g, '');

    // Extract person details using regex
    // IMPORTANT: issuedBy must stop at "confirm" to avoid capturing duplicate company text
    const personMatch = cleanResponse.match(/(?:Herein,?\s*I\s+)([^,]+?)(?:\s+with\s+ID\s+)([^\s,]+)(?:,?\s+Issued\s+By:?\s*)([A-Za-z]+)(?:\s+confirm)?/i);

    // Capture full "Property:" line for smart formatting (includes building name, flat no)
    // IMPORTANT: Must anchor to line start and require colon to avoid matching "Property" in company name
    const propertyLineMatch = cleanResponse.match(/^Property:\s*(.+)/im);

    // Also extract structured fields as fallback
    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*\*?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*\*?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*\*?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*\*?\s*([^\n,*]+)/i);

    const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (!personMatch || (!regNoMatch && !propertyLineMatch)) {
      logger.debug("[ViewingFormSingle] Could not parse required fields from response", { category: LogCategory.GENERAL });
      return null;
    }

    return {
      date: dateMatch ? dateMatch[1] : undefined,
      person: {
        fullName: personMatch[1].trim(),
        idNumber: personMatch[2].trim(),
        issuedBy: personMatch[3].trim(),
      },
      property: {
        registrationNo: regNoMatch ? regNoMatch[1].trim() : "",
        district: districtMatch ? districtMatch[1].trim() : "",
        municipality: municipalityMatch ? municipalityMatch[1].trim() : "",
        locality: localityMatch ? localityMatch[1].trim() : "",
        rawDescription: propertyLineMatch ? propertyLineMatch[1].trim() : undefined,
      },
    };
  } catch (error) {
    logger.error("[ViewingFormSingle] Error parsing response", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.GENERAL });
    return null;
  }
}

