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
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
} from "https://esm.sh/docx@8.5.0";

import { COLORS, FONTS, SPACING, COMPANY, LOGO, createSignatureLine, formatDate } from "../styles.ts";
import { logger, LogCategory } from "../../utils/logger.ts";

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
  };
}

/**
 * Creates a multiple people viewing form document
 */
export function createViewingFormMultiple(
  data: ViewingFormMultipleData,
  logoData?: Uint8Array
): Document {
  const dateStr = data.date || formatDate();
  
  const children: Paragraph[] = [];
  
  // Logo - preserve aspect ratio (Zyprus logo is approximately 3:1 ratio)
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
  
  // First person paragraph
  const firstPerson = data.persons[0];
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Herein, I ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: firstPerson.fullName,
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: " with ID ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: firstPerson.idNumber,
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
          text: firstPerson.issuedBy,
          bold: true,
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );

  // "and" on its own line
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "and",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );

  // Add remaining persons (each on their own paragraph)
  for (let i = 1; i < data.persons.length; i++) {
    const person = data.persons[i];
    const isLast = i === data.persons.length - 1;

    // Person info paragraph
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "I ",
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: person.fullName,
            bold: true,
            underline: { type: UnderlineType.SINGLE },
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: " with ID ",
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
          new TextRun({
            text: person.idNumber,
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
            text: person.issuedBy,
            bold: true,
            size: FONTS.SIZES.BODY,
            font: FONTS.PRIMARY,
          }),
        ],
        spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
      })
    );

    // Add "and" between additional persons (for 3+ people)
    if (!isLast) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "and",
              size: FONTS.SIZES.BODY,
              font: FONTS.PRIMARY,
            }),
          ],
          spacing: { after: SPACING.PARAGRAPH_AFTER },
        })
      );
    }
  }

  // Confirmation paragraph (after all persons)
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "confirm that ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: COMPANY.FULL_REFERENCE,
          bold: true,
          underline: { type: UnderlineType.SINGLE },
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
        new TextRun({
          text: ", has introduced to us with a viewing the property with the following",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: 0, line: SPACING.LINE_HEIGHT },
    })
  );

  // "Registry details" on its own line
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Registry details",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        }),
      ],
      spacing: { after: SPACING.PARAGRAPH_AFTER },
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
  
  // Signature sections for each person (side by side if 2 people)
  if (data.persons.length === 2) {
    // Create a table for side-by-side signatures with proper padding
    const signatureTable = new Table({
      rows: [
        // Name row
        new TableRow({
          height: { value: 600, rule: "atLeast" as const },
          children: [
            new TableCell({
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
                  spacing: { before: 200, after: 200 },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
            new TableCell({
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
                  spacing: { before: 200, after: 200 },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
          ],
        }),
        // Signature row
        new TableRow({
          height: { value: 600, rule: "atLeast" as const },
          children: [
            new TableCell({
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
                  spacing: { before: 200, after: 200 },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
            new TableCell({
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
                  spacing: { before: 200, after: 200 },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    children.push(signatureTable as unknown as Paragraph);
  } else {
    // Stacked signatures for 3+ people
    data.persons.forEach((person, index) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Person ${index + 1}`,
              bold: true,
              size: FONTS.SIZES.BODY,
              font: FONTS.PRIMARY,
            }),
          ],
          spacing: { before: index > 0 ? SPACING.PARAGRAPH_AFTER : 0 },
        }),
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
          spacing: { after: 120 },
        }),
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
    });
  }
  
  return new Document({
    sections: [{
      children,
    }],
  });
}

/**
 * Parse AI response to extract viewing form data for multiple people
 */
export function parseViewingFormMultipleData(response: string): ViewingFormMultipleData | null {
  try {
    // Strip markdown formatting for easier parsing
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*\s+/g, '');

    // Extract all person matches
    // IMPORTANT: issuedBy must stop at "confirm" or "and" to avoid capturing duplicate company text
    const personRegex = /(?:I\s+)([^,]+?)(?:\s+with\s+ID\s+)([^\s,]+)(?:\s+Issued\s+By:?\s*)([A-Za-z]+)(?=\s+(?:and\s+I|confirm))/gi;
    const persons: PersonData[] = [];

    let match;
    while ((match = personRegex.exec(cleanResponse)) !== null) {
      persons.push({
        fullName: match[1].trim(),
        idNumber: match[2].trim(),
        issuedBy: match[3].trim(),
      });
    }

    // If no matches from complex regex, try simpler approach
    // IMPORTANT: issuedBy captures only the country name (single word) to avoid duplicate company text
    if (persons.length === 0) {
      const simpleMatches = cleanResponse.matchAll(/(?:Herein,?\s*)?I\s+([^,]+?)\s+with\s+ID\s+([^\s,]+)\s+Issued\s+By:?\s*([A-Za-z]+)(?:\s+confirm)?/gi);
      for (const m of simpleMatches) {
        persons.push({
          fullName: m[1].trim(),
          idNumber: m[2].trim(),
          issuedBy: m[3].trim(),
        });
      }
    }

    // Extract property details (handle markdown ** formatting)
    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*\*?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*\*?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*\*?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*\*?\s*([^\n,*]+)/i);

    // Extract date (handle markdown ** formatting)
    const dateMatch = cleanResponse.match(/Date:?\s*\*?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

    if (persons.length === 0 || !regNoMatch) {
      logger.debug("[ViewingFormMultiple] Could not parse required fields from response");
      logger.debug("[ViewingFormMultiple] Parse results", { personsFound: persons.length, regNo: regNoMatch ? regNoMatch[1] : null });
      return null;
    }
    
    return {
      date: dateMatch ? dateMatch[1] : undefined,
      persons,
      property: {
        registrationNo: regNoMatch[1].trim(),
        district: districtMatch ? districtMatch[1].trim() : "",
        municipality: municipalityMatch ? municipalityMatch[1].trim() : "",
        locality: localityMatch ? localityMatch[1].trim() : "",
      },
    };
  } catch (error) {
    logger.error("[ViewingFormMultiple] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

