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
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "https://esm.sh/docx@8.5.0";

import { COLORS, FONTS, SPACING, COMPANY, LOGO, createSignatureLine, formatDate } from "../styles.ts";
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
  
  // Logo - preserve aspect ratio (Zyprus logo is approximately 4:1 ratio)
  if (logoData && logoData.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: {
              width: 200,
              height: 50,
            },
            type: "png",
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: SPACING.TITLE_AFTER },
      })
    );
  }
  
  // Title: "Viewing Form" - centered, underlined
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
      spacing: { after: SPACING.DATE_AFTER },
    })
  );
  
  // Declaration paragraph
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Herein, I ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.person.fullName,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: " with ID ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.person.idNumber,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: " Issued By: ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.person.issuedBy,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: ` confirm that `,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: COMPANY.FULL_REFERENCE,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: ", has introduced to me with a viewing the property with the following Registry details",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );
  
  // Property details - Registration No
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Registration No.: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.property.registrationNo,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 120 },
    })
  );
  
  // Property details - District
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "District: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.property.district,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 120 },
    })
  );
  
  // Property details - Municipality
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Municipality: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.property.municipality,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 120 },
    })
  );
  
  // Property details - Locality
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Locality: ",
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: data.property.locality,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.SIGNATURE_BEFORE },
    })
  );
  
  // Signature section - Name
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
          text: createSignatureLine(30),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );
  
  // Signature section - Signature
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
          text: createSignatureLine(28),
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
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
    const personMatch = cleanResponse.match(/(?:Herein,?\s*I\s+)([^,]+?)(?:\s+with\s+ID\s+)([^\s,]+)(?:\s+Issued\s+By:?\s*)([A-Za-z]+)(?:\s+confirm)?/i);

    // Extract property details (handle any remaining markdown)
    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*\*?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*\*?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*\*?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*\*?\s*([^\n,*]+)/i);

    // Extract date (handle any remaining markdown)
    const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (!personMatch || !regNoMatch) {
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
        registrationNo: regNoMatch[1].trim(),
        district: districtMatch ? districtMatch[1].trim() : "",
        municipality: municipalityMatch ? municipalityMatch[1].trim() : "",
        locality: localityMatch ? localityMatch[1].trim() : "",
      },
    };
  } catch (error) {
    logger.error("[ViewingFormSingle] Error parsing response", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.GENERAL });
    return null;
  }
}

