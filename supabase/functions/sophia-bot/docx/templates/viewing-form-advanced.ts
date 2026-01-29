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
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  ShadingType,
} from "https://esm.sh/docx@8.5.0";

import { COLORS, FONTS, SPACING, COMPANY, LOGO, LEGAL_TEXT, createSignatureLine, formatDate } from "../styles.ts";
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
  
  // Build declaration text runs for all persons
  const declarationRuns: TextRun[] = [
    new TextRun({
      text: "Herein, I ",
      size: FONTS.SIZES.BODY,
      font: FONTS.PRIMARY,
    }),
  ];
  
  // Add each person to the declaration
  data.persons.forEach((person, index) => {
    declarationRuns.push(
      new TextRun({
        text: person.fullName,
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
      })
    );
    
    if (index < data.persons.length - 1) {
      declarationRuns.push(
        new TextRun({
          text: " and I ",
          size: FONTS.SIZES.BODY,
          font: FONTS.PRIMARY,
        })
      );
    }
  });
  
  // Complete the declaration
  declarationRuns.push(
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
      text: isSingle 
        ? ", has introduced to me with a viewing the property with the following Registry details"
        : ", has introduced to us with a viewing the property with the following Registry details",
      size: FONTS.SIZES.BODY,
      font: FONTS.PRIMARY,
    })
  );
  
  // Declaration paragraph
  children.push(
    new Paragraph({
      children: declarationRuns,
      spacing: { after: SPACING.PARAGRAPH_AFTER, line: SPACING.LINE_HEIGHT },
    })
  );
  
  // Property details
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
      spacing: { after: SPACING.PARAGRAPH_AFTER },
    })
  );
  
  // Legal paragraph with green left border and gray background
  // Using a table to simulate the bordered box
  const legalTable = new Table({
    rows: [
      new TableRow({
        children: [
          // Green border cell (narrow)
          new TableCell({
            children: [new Paragraph({ text: "" })],
            width: { size: 50, type: WidthType.DXA },
            shading: {
              type: ShadingType.SOLID,
              color: COLORS.PRIMARY_GREEN,
              fill: COLORS.PRIMARY_GREEN,
            },
          }),
          // Content cell with gray background
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: LEGAL_TEXT.ADVANCED_VIEWING,
                    size: FONTS.SIZES.SMALL,
                    font: FONTS.PRIMARY,
                    color: COLORS.TEXT_SECONDARY,
                  }),
                ],
                spacing: { line: 280 }, // 1.7 line height
              }),
            ],
            shading: {
              type: ShadingType.SOLID,
              color: COLORS.BACKGROUND_LIGHT,
              fill: COLORS.BACKGROUND_LIGHT,
            },
            margins: {
              top: SPACING.LEGAL_PADDING,
              bottom: SPACING.LEGAL_PADDING,
              left: SPACING.LEGAL_PADDING,
              right: SPACING.LEGAL_PADDING,
            },
          }),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
  
  children.push(legalTable as unknown as Paragraph);
  
  // Add spacing after legal section
  children.push(
    new Paragraph({
      text: "",
      spacing: { after: SPACING.SIGNATURE_BEFORE },
    })
  );
  
  // Signature sections
  if (data.persons.length === 1) {
    // Single person signature
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
      })
    );
  } else if (data.persons.length === 2) {
    // Two-person side-by-side signatures
    const signatureTable = new Table({
      rows: [
        new TableRow({
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
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
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
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
        new TableRow({
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
                  spacing: { before: SPACING.PARAGRAPH_AFTER },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
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
                  spacing: { before: SPACING.PARAGRAPH_AFTER },
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
    
    children.push(signatureTable as unknown as Paragraph);
  } else {
    // Multiple people - stacked
    data.persons.forEach((_, index) => {
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
 * Parse AI response to extract advanced viewing form data
 */
export function parseViewingFormAdvancedData(response: string): ViewingFormAdvancedData | null {
  try {
    // Strip markdown formatting for easier parsing
    const cleanResponse = response.replace(/\*\*/g, '').replace(/\*\s+/g, '');

    // Extract all person matches
    // IMPORTANT: issuedBy captures only the country name (single word) to avoid duplicate company text
    const persons: PersonData[] = [];
    const simpleMatches = cleanResponse.matchAll(/(?:Herein,?\s*)?I\s+([^,]+?)\s+with\s+ID\s+([^\s,]+)\s+Issued\s+By:?\s*([A-Za-z]+)(?:\s+confirm)?/gi);
    for (const m of simpleMatches) {
      persons.push({
        fullName: m[1].trim(),
        idNumber: m[2].trim(),
        issuedBy: m[3].trim(),
      });
    }
    
    // Extract property details (use cleanResponse to handle markdown)
    const regNoMatch = cleanResponse.match(/Registration\s*No\.?:?\s*([^\n,*]+)/i);
    const districtMatch = cleanResponse.match(/District:?\s*([^\n,*]+)/i);
    const municipalityMatch = cleanResponse.match(/Municipality:?\s*([^\n,*]+)/i);
    const localityMatch = cleanResponse.match(/Locality:?\s*([^\n,*]+)/i);

    // Extract date
    const dateMatch = cleanResponse.match(/Date:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    
    if (persons.length === 0 || !regNoMatch) {
      logger.debug("[ViewingFormAdvanced] Could not parse required fields from response");
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
    logger.error("[ViewingFormAdvanced] Parse error", error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

