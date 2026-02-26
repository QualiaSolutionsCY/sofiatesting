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

import { FONTS, SPACING, COMPANY, createSignatureLine, formatDate, formatPropertyDescription, PLACEHOLDERS, isPlaceholder } from "../styles.ts";
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
 * Create blank viewing form data with placeholders
 */
export function createBlankViewingFormData(date?: string): ViewingFormSingleData {
  return {
    date: date || formatDate(),
    person: {
      fullName: PLACEHOLDERS.FULL_NAME,
      idNumber: PLACEHOLDERS.ID_NUMBER,
      issuedBy: PLACEHOLDERS.ISSUED_BY,
    },
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
 * Creates a single person viewing form document
 */
export function createViewingFormSingle(
  data: ViewingFormSingleData,
  logoData?: Uint8Array,
  logoType: "jpg" | "png" = "png"
): Document {
  const dateStr = data.date || formatDate();

  const children: Paragraph[] = [];

  // Logo - Zyprus viewing form logo
  if (logoData && logoData.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoData,
            transformation: {
              width: 120,
              height: 62,
            },
            type: logoType,
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

  // Declaration paragraph - bold placeholder fields so they stand out
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Herein, I ", size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: data.person.fullName, bold: isPlaceholder(data.person.fullName), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: " with ID ", size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: data.person.idNumber, bold: isPlaceholder(data.person.idNumber), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: " Issued By: ", size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: data.person.issuedBy, bold: isPlaceholder(data.person.issuedBy), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
        new TextRun({ text: ` confirm that ${COMPANY.FULL_REFERENCE}, has introduced to me with a viewing the property with the following Registry details:`, size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }),
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
          bold: isPlaceholder(propertyDescription),
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
 * Returns blank data with placeholders if parsing fails (for blank documents)
 */
export function parseViewingFormSingleData(response: string): ViewingFormSingleData | null {
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

    // If it's a blank/partial viewing form, extract whatever data IS available
    if (isViewingForm && hasBlankPatterns) {
      logger.debug("[ViewingFormSingle] Detected blank/partial viewing form - extracting available data", { category: LogCategory.GENERAL });
      const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const blankData = createBlankViewingFormData(dateMatch ? dateMatch[1] : undefined);

      // Extract name from "Herein, I [NAME] with ID" pattern
      const partialNameMatch = cleanResponse.match(/(?:Herein,?\s*I\s+)(.+?)\s+with\s+ID/i);
      if (partialNameMatch) {
        const name = partialNameMatch[1].trim();
        if (name && !/^[\[\]\.…_\s]+$/.test(name) && name.length > 1) {
          blankData.person.fullName = name;
        }
      }

      // Extract ID if it's a real value (not placeholder)
      const partialIdMatch = cleanResponse.match(/with\s+ID\s+([A-Z0-9]+)/i);
      if (partialIdMatch) {
        blankData.person.idNumber = partialIdMatch[1].trim();
      }

      // Extract IssuedBy if it's a real value
      const partialIssuedMatch = cleanResponse.match(/Issued\s+By:?\s*([A-Za-z]{2,})/i);
      if (partialIssuedMatch && partialIssuedMatch[1].trim().toLowerCase() !== "confirm") {
        blankData.person.issuedBy = partialIssuedMatch[1].trim();
      }

      // Extract property if available
      const partialPropertyMatch = cleanResponse.match(/^Property:\s*(.+)/im);
      if (partialPropertyMatch) {
        const prop = partialPropertyMatch[1].trim();
        if (prop && !/^[\[\]\.…_\s]+$/.test(prop) && prop.length > 3) {
          blankData.property.rawDescription = prop;
        }
      }

      return blankData;
    }

    // Extract person details using regex
    // IMPORTANT: issuedBy must stop at "confirm" to avoid capturing duplicate company text
    const personMatch = cleanResponse.match(/(?:Herein,?\s*I\s+)([^,]+?)(?:\s+with\s+ID\s+)(\[[^\]]*\]|[^\s,]+)(?:,?\s+Issued\s+By:?\s*)([A-Za-z]+|\[[\s\w]*\])(?:\s+confirm)?/i);

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

    const rawId = personMatch[2].trim();
    return {
      date: dateMatch ? dateMatch[1] : undefined,
      person: {
        fullName: personMatch[1].trim(),
        idNumber: /^\[/.test(rawId) ? PLACEHOLDERS.ID_NUMBER : rawId,
        issuedBy: /^\[/.test(personMatch[3].trim()) ? PLACEHOLDERS.ISSUED_BY : personMatch[3].trim(),
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

