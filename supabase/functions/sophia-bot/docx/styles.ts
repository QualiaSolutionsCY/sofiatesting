/**
 * Zyprus DOCX Styles
 *
 * Branding constants and styling for generated DOCX documents.
 * Matches the HTML viewing forms exactly.
 */

// Re-export property formatter from shared utility (single source of truth)
export {
  COMPLEX_INDICATORS,
  CYPRUS_AREAS,
  CYPRUS_DISTRICTS,
  formatPropertyDescription,
  PROPERTY_TYPES,
  titleCase,
} from "../utils/property-formatter.ts";

/**
 * Zyprus brand colors
 */
export const COLORS = {
  /** Primary green - used for accents, borders, highlights */
  PRIMARY_GREEN: "00A651",
  /** Dark green hover state */
  PRIMARY_GREEN_DARK: "008C44",
  /** Main text color */
  TEXT_PRIMARY: "333333",
  /** Secondary text color */
  TEXT_SECONDARY: "444444",
  /** Light gray background for legal sections */
  BACKGROUND_LIGHT: "F9F9F9",
  /** Border gray */
  BORDER_GRAY: "CCCCCC",
  /** White */
  WHITE: "FFFFFF",
} as const;

/**
 * Font settings matching HTML forms
 */
export const FONTS = {
  /** Primary font family */
  PRIMARY: "Calibri",
  /** Fallback fonts */
  FALLBACK: ["Segoe UI", "Arial", "sans-serif"],

  /** Font sizes in half-points (Word uses half-points) */
  SIZES: {
    /** Body text: 12pt = 24 half-points */
    BODY: 24,
    /** Title: 14pt = 28 half-points */
    TITLE: 28,
    /** Small text: 10pt = 20 half-points */
    SMALL: 20,
    /** Field labels: 12pt = 24 half-points */
    LABEL: 24,
  },
} as const;

/**
 * Spacing in twentieths of a point (twips)
 * 1 inch = 1440 twips, 1 point = 20 twips
 */
export const SPACING = {
  /** Line spacing for body text (2.2 line height) */
  LINE_HEIGHT: 440, // Roughly 2.2 * 200
  /** Space after paragraphs */
  PARAGRAPH_AFTER: 200,
  /** Space after title */
  TITLE_AFTER: 400,
  /** Space after date line */
  DATE_AFTER: 400,
  /** Space before signature section */
  SIGNATURE_BEFORE: 600,
  /** Legal paragraph padding */
  LEGAL_PADDING: 300,
} as const;

/**
 * Document dimensions in twips
 */
export const PAGE = {
  /** A4 width */
  WIDTH: 11_906,
  /** A4 height */
  HEIGHT: 16_838,
  /** Margins */
  MARGIN: {
    TOP: 1440,
    BOTTOM: 1440,
    LEFT: 1800,
    RIGHT: 1800,
  },
} as const;

/**
 * Logo dimensions in EMUs (English Metric Units)
 * 1 inch = 914400 EMUs
 */
export const LOGO = {
  /** Logo width: 200px ≈ 2.08 inches */
  WIDTH: 1_905_000,
  /** Logo height: 60px ≈ 0.625 inches */
  HEIGHT: 571_500,
} as const;

/**
 * Company information for documents
 */
export const COMPANY = {
  NAME: "CSC Zyprus Property Group LTD",
  REG_NUMBER: "742",
  LICENSE_NUMBER: "378/E",
  FULL_REFERENCE:
    "CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E)",
} as const;

/**
 * Legal text for Advanced Viewing Form
 */
export const LEGAL_TEXT = {
  ADVANCED_VIEWING: `By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.`,
} as const;

/**
 * Signature line styling
 */
export const SIGNATURE = {
  /** Width of signature line in characters */
  LINE_WIDTH: 40,
  /** Character used for signature line */
  LINE_CHAR: "_",
} as const;

/**
 * Placeholder text for blank documents
 */
export const PLACEHOLDERS = {
  FULL_NAME: "[FULL NAME]",
  ID_NUMBER: "[ID NUMBER]",
  ISSUED_BY: "[ISSUED BY]",
  REGISTRATION_NO: "[REGISTRATION NO]",
  DISTRICT: "[DISTRICT]",
  MUNICIPALITY: "[MUNICIPALITY]",
  LOCALITY: "[LOCALITY]",
  PROPERTY: "[PROPERTY DETAILS]",
} as const;

/**
 * Check if a value contains placeholder brackets like [FIELD] or [ ]
 * Used to bold placeholder fields so they stand out as "fill this in"
 */
export function isPlaceholder(value: string): boolean {
  if (!value) return false;
  return /\[.*?\]/.test(value);
}

/**
 * Generate a signature line string
 */
export function createSignatureLine(
  width: number = SIGNATURE.LINE_WIDTH
): string {
  return SIGNATURE.LINE_CHAR.repeat(width);
}

/**
 * Format a date for documents (DD/MM/YYYY)
 */
export function formatDate(date: Date = new Date()): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Note: formatPropertyDescription and related constants are now imported from ../utils/property-formatter.ts
// This keeps styles.ts focused on styling while the property formatter logic lives in one place.
