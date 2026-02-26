/**
 * Standard Viewing Form - Multiple People
 * 
 * Template for multiple people viewing form (2+ persons).
 * Matches the HTML template: zyprus_viewing_form (10).html
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

import { FONTS, SPACING, COMPANY, createSignatureLine, formatDate, formatPropertyDescription, PLACEHOLDERS, isPlaceholder } from "../styles.ts";
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
 * Data required for a multiple people viewing form
 */
export interface ViewingFormMultipleData {
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
 * Create blank viewing form data with placeholders for multiple persons
 */
export function createBlankViewingFormMultipleData(date?: string): ViewingFormMultipleData {
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
 * Creates a multiple people viewing form document
 */
export function createViewingFormMultiple(
  data: ViewingFormMultipleData,
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

  // Build declaration with bold placeholder fields
  const verb = data.persons.length === 1 ? "me" : "us";
  const declarationRuns: TextRun[] = [];
  data.persons.forEach((p, idx) => {
    const prefix = idx === 0 ? "Herein, I " : " and I ";
    declarationRuns.push(new TextRun({ text: prefix, size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
    declarationRuns.push(new TextRun({ text: p.fullName, bold: isPlaceholder(p.fullName), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
    declarationRuns.push(new TextRun({ text: " with ID ", size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
    declarationRuns.push(new TextRun({ text: p.idNumber, bold: isPlaceholder(p.idNumber), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
    declarationRuns.push(new TextRun({ text: " Issued By: ", size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
    declarationRuns.push(new TextRun({ text: p.issuedBy, bold: isPlaceholder(p.issuedBy), size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));
  });
  declarationRuns.push(new TextRun({ text: ` confirm that ${COMPANY.FULL_REFERENCE}, has introduced to ${verb} with a viewing the property with the following Registry details:`, size: FONTS.SIZES.BODY, font: FONTS.PRIMARY }));

  children.push(
    new Paragraph({
      children: declarationRuns,
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

  // Signature sections - 2 per row in a borderless table
  const noBorders = {
    top: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NIL, size: 0, color: "FFFFFF" },
  };

  const signatureRows: TableRow[] = [];

  // Process persons in pairs (2 per row)
  for (let i = 0; i < data.persons.length; i += 2) {
    const rightPerson = data.persons[i + 1]; // may be undefined for odd count

    // Name row
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
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
                spacing: { before: 600, after: 300 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: rightPerson
                  ? [
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
                    ]
                  : [],
                spacing: { before: 600, after: 300 },
              }),
            ],
          }),
        ],
      })
    );

    // Signature row
    signatureRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
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
                spacing: { after: 500 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: rightPerson
                  ? [
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
                    ]
                  : [],
                spacing: { after: 500 },
              }),
            ],
          }),
        ],
      })
    );
  }

  const signatureTable = new Table({
    rows: signatureRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  children.push(signatureTable as unknown as Paragraph);
  
  return new Document({
    sections: [{
      children,
    }],
  });
}

/**
 * Parse AI response to extract viewing form data for multiple people
 * Returns blank data with placeholders if parsing fails (for blank documents)
 */
export function parseViewingFormMultipleData(response: string): ViewingFormMultipleData | null {
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
      logger.debug("[ViewingFormMultiple] Detected blank/partial viewing form - extracting available data");
      const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const blankData = createBlankViewingFormMultipleData(dateMatch ? dateMatch[1] : undefined);

      // Extract ALL persons using matchAll (supports multiple people)
      const personMatches = cleanResponse.matchAll(/(?:Herein,?\s*)?I\s+([^,]+?)\s+with\s+ID\s+(\[[^\]]*\]|[^\s,]+),?\s+Issued\s+By:?\s*([A-Za-z]+|\[[\s\w]*\])(?:\s+(?:and|confirm))?/gi);
      const extractedPersons: PersonData[] = [];
      for (const m of personMatches) {
        const name = m[1].trim();
        if (name && !/^[\[\]\.…_\s]+$/.test(name) && name.length > 1) {
          const rawId = m[2].trim();
          extractedPersons.push({
            fullName: name,
            idNumber: /^\[/.test(rawId) ? PLACEHOLDERS.ID_NUMBER : rawId,
            issuedBy: /^\[/.test(m[3].trim()) ? PLACEHOLDERS.ISSUED_BY : m[3].trim(),
          });
        }
      }

      if (extractedPersons.length > 0) {
        blankData.persons = extractedPersons;
        logger.debug(`[ViewingFormMultiple] Extracted ${extractedPersons.length} person(s) from partial data`);
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

    // Extract all person matches
    // IMPORTANT: issuedBy must stop at "confirm" or "and" to avoid capturing duplicate company text
    const personRegex = /(?:I\s+)([^,]+?)(?:\s+with\s+ID\s+)(\[[^\]]*\]|[^\s,]+)(?:,?\s+Issued\s+By:?\s*)([A-Za-z]+|\[[\s\w]*\])(?=\s+(?:and\s+I|confirm))/gi;
    const persons: PersonData[] = [];

    let match;
    while ((match = personRegex.exec(cleanResponse)) !== null) {
      const rawId = match[2].trim();
      persons.push({
        fullName: match[1].trim(),
        idNumber: /^\[/.test(rawId) ? PLACEHOLDERS.ID_NUMBER : rawId,
        issuedBy: /^\[/.test(match[3].trim()) ? PLACEHOLDERS.ISSUED_BY : match[3].trim(),
      });
    }

    // If no matches from complex regex, try simpler approach
    // IMPORTANT: issuedBy captures only the country name (single word) to avoid duplicate company text
    if (persons.length === 0) {
      const simpleMatches = cleanResponse.matchAll(/(?:Herein,?\s*)?I\s+([^,]+?)\s+with\s+ID\s+(\[[^\]]*\]|[^\s,]+),?\s+Issued\s+By:?\s*([A-Za-z]+|\[[\s\w]*\])(?:\s+confirm)?/gi);
      for (const m of simpleMatches) {
        const rawId = m[2].trim();
        persons.push({
          fullName: m[1].trim(),
          idNumber: /^\[/.test(rawId) ? PLACEHOLDERS.ID_NUMBER : rawId,
          issuedBy: /^\[/.test(m[3].trim()) ? PLACEHOLDERS.ISSUED_BY : m[3].trim(),
        });
      }
    }

    // Capture full "Property:" line for smart formatting
    // IMPORTANT: Must anchor to line start and require colon to avoid matching "Property" in company name
    const propertyLineMatch = cleanResponse.match(/^Property:\s*(.+)/im);

    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*\*?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*\*?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*\*?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*\*?\s*([^\n,*]+)/i);

    const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (persons.length === 0 || (!regNoMatch && !propertyLineMatch)) {
      logger.debug("[ViewingFormMultiple] Could not parse required fields from response");
      logger.debug("[ViewingFormMultiple] Parse results", { personsFound: persons.length, regNo: regNoMatch ? regNoMatch[1] : null });
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
    logger.error("[ViewingFormMultiple] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

