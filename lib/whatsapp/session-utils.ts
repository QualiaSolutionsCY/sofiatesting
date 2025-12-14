/**
 * WhatsApp Session Utilities
 * Pure functions for session management that can be tested independently
 */

export type SessionState = {
  currentMenu?:
    | "main"
    | "templates"
    | "calculator"
    | "listing"
    | "listing_type";
  lastMenuSent?: string;
  listingData?: Partial<{
    type: string;
    location: string;
    price: string;
    bedrooms: number;
    bathrooms: number;
    size: string;
  }>;
  pendingAction?: {
    type: string;
    data?: Record<string, unknown>;
  };
  lastActivity: number;
};

/**
 * Create a default session state
 */
export const createDefaultSession = (): SessionState => ({
  lastActivity: Date.now(),
});

/**
 * Merge session updates into existing session
 */
export const mergeSessionUpdates = (
  current: SessionState,
  updates: Partial<SessionState>
): SessionState => ({
  ...current,
  ...updates,
  lastActivity: Date.now(),
});

/**
 * Check if a session has expired based on TTL
 * @param session - The session to check
 * @param ttlMs - TTL in milliseconds (default 30 minutes)
 */
export const isSessionExpired = (
  session: SessionState,
  ttlMs = 1_800_000
): boolean => {
  return Date.now() - session.lastActivity > ttlMs;
};

/**
 * Template selection mapping (menu selection -> template ID)
 */
export const TEMPLATE_SELECTIONS: Record<number, string> = {
  1: "seller_registration",
  2: "bank_registration_property",
  3: "viewing_form",
  4: "marketing_agreement_exclusive",
  5: "followup_viewed",
  6: "valuation_report",
  7: "offer_submission",
  8: "other",
};

/**
 * Calculator selection mapping (menu selection -> calculator type)
 */
export const CALCULATOR_SELECTIONS: Record<number, string> = {
  1: "vat",
  2: "transfer_fees",
  3: "capital_gains",
};

/**
 * Listing type selection mapping (menu selection -> property type)
 */
export const LISTING_TYPE_SELECTIONS: Record<number, string> = {
  1: "apartment",
  2: "house",
  3: "land",
  4: "commercial",
};

/**
 * Email templates that should be sent as text (not DOCX)
 */
export const EMAIL_TEMPLATES = [
  "followup_viewed",
  "valuation_report",
  "introduction_email",
  "welcome_email",
  "property_match",
  "price_reduction",
] as const;

/**
 * Check if a template should be sent as email (text) or document (DOCX)
 */
export const isEmailTemplate = (templateId: string): boolean => {
  return EMAIL_TEMPLATES.includes(
    templateId as (typeof EMAIL_TEMPLATES)[number]
  );
};

/**
 * Get template ID from selection number
 */
export const getTemplateFromSelection = (selection: number): string | null => {
  return TEMPLATE_SELECTIONS[selection] || null;
};

/**
 * Get calculator type from selection number
 */
export const getCalculatorFromSelection = (
  selection: number
): string | null => {
  return CALCULATOR_SELECTIONS[selection] || null;
};

/**
 * Get property type from selection number
 */
export const getListingTypeFromSelection = (
  selection: number
): string | null => {
  return LISTING_TYPE_SELECTIONS[selection] || null;
};

/**
 * Build listing progress message based on collected data
 */
export const buildListingProgress = (
  listingData: SessionState["listingData"]
): {
  message: string;
  nextNeeded: string | null;
  isComplete: boolean;
} => {
  const data = listingData || {};
  const required = [
    { field: "type", label: "Property Type", value: data.type },
    { field: "location", label: "Location", value: data.location },
    { field: "price", label: "Price", value: data.price },
    { field: "size", label: "Size (sqm)", value: data.size },
    { field: "bedrooms", label: "Bedrooms", value: data.bedrooms },
    { field: "bathrooms", label: "Bathrooms", value: data.bathrooms },
  ];

  let message = "📋 *Property Listing Progress*\n\n";
  let nextNeeded: string | null = null;

  for (const field of required) {
    if (field.value) {
      message += `✅ ${field.label}: ${field.value}\n`;
    } else {
      message += `⏳ ${field.label}: _needed_\n`;
      if (!nextNeeded) {
        nextNeeded = field.label;
      }
    }
  }

  const isComplete = nextNeeded === null;

  if (nextNeeded) {
    message += `\n*Please provide the ${nextNeeded}:*`;
  } else {
    message += "\n✨ *All basic info collected!*\nNow I need:\n";
    message += "- Swimming pool (yes/no/communal)\n";
    message += "- Parking (yes/no)\n";
    message += "- Air conditioning (yes/no)\n";
    message += "- Owner name & phone\n";
  }

  return { message, nextNeeded, isComplete };
};
