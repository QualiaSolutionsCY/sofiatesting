/**
 * Template Registry - Single Source of Truth for All SOPHIA Templates
 *
 * This is THE ONLY place template definitions should exist.
 * All other files should import from here.
 *
 * DOCX Templates (4 total):
 * - Standard Viewing Form
 * - Advanced Viewing Form
 * - Property Reservation Agreement
 * - Non-Exclusive Marketing Agreement
 *
 * TEXT Templates: All others (sent as WhatsApp messages)
 */

import { logger, LogCategory } from "../utils/logger.ts";

/**
 * Template output types
 */
export type TemplateOutputType = "TEXT" | "DOCX";

/**
 * Template category definitions
 */
export type TemplateCategory =
  | "REGISTRATIONS"
  | "VIEWING_FORMS"
  | "RESERVATIONS"
  | "MARKETING"
  | "CLIENT_COMMS";

/**
 * Template metadata
 */
export interface TemplateDefinition {
  id: string;
  name: string;
  outputType: TemplateOutputType;
  category: TemplateCategory;
  requiredFields: string[];
  optionalFields?: string[];
  aliases: string[]; // Alternative names/triggers
}

/**
 * DOCX Template Titles - Exact matches for detection
 * These are the ONLY templates that generate DOCX files
 */
export const DOCX_TEMPLATE_TITLES = [
  // Viewing Forms (Templates 09-10)
  "Viewing Form",
  "Standard Viewing Form",
  "Advanced Viewing Form",
  "Advanced Viewing/Introduction Form",

  // Reservation Agreement (Template 11)
  "Property Reservation Agreement",
  "Property Reservation",
  "Reservation Agreement",

  // Marketing Agreement (Template 15)
  "Marketing Agreement",
  "Non-Exclusive Marketing Agreement",
] as const;

/**
 * DOCX template IDs for quick lookup
 */
export const DOCX_TEMPLATE_IDS = ["09", "10", "11", "15"] as const;

/**
 * Master Template Registry
 * Single source of truth for all 43+ templates
 */
export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  // === REGISTRATION TEMPLATES (TEXT) ===
  "01": {
    id: "01",
    name: "Standard Seller Registration",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["buyerNames", "propertyInfo", "viewingDateTime"],
    optionalFields: ["propertyLink"],
    aliases: ["seller registration", "standard seller", "registration for seller"],
  },
  "02": {
    id: "02",
    name: "Seller with Marketing Agreement",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["buyerNames", "propertyInfo", "viewingDateTime"],
    optionalFields: ["propertyLink"],
    aliases: ["seller with marketing", "seller marketing agreement"],
  },
  "03": {
    id: "03",
    name: "Rental Property Registration",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["tenantNames", "propertyInfo", "viewingDateTime"],
    optionalFields: ["propertyLink"],
    aliases: ["rental registration", "rental property"],
  },
  "04": {
    id: "04",
    name: "Advanced Seller Registration",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["buyerNames", "propertyInfo"],
    optionalFields: ["agencyFee", "paymentPercentage"],
    aliases: ["advanced seller", "advanced registration"],
  },
  "05": {
    id: "05",
    name: "Bank Property Registration",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["clientName", "clientPhone", "propertyLink"],
    optionalFields: [],
    aliases: ["bank property", "bank registration property"],
  },
  "06": {
    id: "06",
    name: "Bank Land Registration",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["clientName", "clientPhone", "propertyLink"],
    optionalFields: [],
    aliases: ["bank land", "bank registration land"],
  },
  "07": {
    id: "07",
    name: "Developer Registration (with Viewing)",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["clientNames", "viewingDateTime"],
    optionalFields: ["projectName", "location"],
    aliases: ["developer registration viewing", "developer with viewing"],
  },
  "08": {
    id: "08",
    name: "Developer Registration (no Viewing)",
    outputType: "TEXT",
    category: "REGISTRATIONS",
    requiredFields: ["clientNames"],
    optionalFields: ["projectName", "location"],
    aliases: ["developer registration", "developer no viewing"],
  },

  // === VIEWING FORMS (DOCX) ===
  "09": {
    id: "09",
    name: "Standard Viewing Form",
    outputType: "DOCX",
    category: "VIEWING_FORMS",
    requiredFields: ["date", "fullName", "idNumber", "issuedBy", "propertyReg", "district"],
    optionalFields: ["municipality", "locality"],
    aliases: ["viewing form", "standard viewing", "viewing form standard"],
  },
  "10": {
    id: "10",
    name: "Advanced Viewing Form",
    outputType: "DOCX",
    category: "VIEWING_FORMS",
    requiredFields: ["date", "fullName", "idNumber", "issuedBy", "propertyReg", "district"],
    optionalFields: ["municipality", "locality"],
    aliases: ["advanced viewing", "advanced viewing form", "introduction form"],
  },

  // === RESERVATION AGREEMENT (DOCX) ===
  "11": {
    id: "11",
    name: "Property Reservation Agreement",
    outputType: "DOCX",
    category: "RESERVATIONS",
    requiredFields: [
      "buyerName", "buyerIdType", "buyerIdNumber",
      "vendorName", "vendorIdType", "vendorIdNumber",
      "propertyDescription", "reservationFee", "purchasePrice",
      "hasLoan", "hasVat"
    ],
    optionalFields: [],
    aliases: ["reservation agreement", "property reservation", "reservation"],
  },

  // === MARKETING AGREEMENTS ===
  "14": {
    id: "14",
    name: "Email Marketing Agreement",
    outputType: "TEXT",
    category: "MARKETING",
    requiredFields: ["propertyInfo", "marketingPrice"],
    optionalFields: [],
    aliases: ["email marketing", "marketing email", "email marketing agreement"],
  },
  "15": {
    id: "15",
    name: "Non-Exclusive Marketing Agreement",
    outputType: "DOCX",
    category: "MARKETING",
    requiredFields: ["sellerFullName", "propertyRegistration", "marketingPrice"],
    optionalFields: [],
    aliases: ["non-exclusive", "non exclusive", "marketing agreement", "signature document"],
  },

  // === CLIENT COMMUNICATION TEMPLATES (TEXT) ===
  "17": {
    id: "17",
    name: "Request Callback - Email - Buyer",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName"],
    optionalFields: ["propertyLink"],
    aliases: ["request callback", "callback email", "arrange a call"],
  },
  "18": {
    id: "18",
    name: "Request Callback - WhatsApp - Buyer",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName"],
    optionalFields: ["propertyLink"],
    aliases: ["callback whatsapp", "whatsapp callback"],
  },
  "19": {
    id: "19",
    name: "Valuation Quote",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName", "valuationFee"],
    optionalFields: [],
    aliases: ["valuation quote", "quote for valuation"],
  },
  "20": {
    id: "20",
    name: "Valuation Request",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName"],
    optionalFields: [],
    aliases: ["valuation request"],
  },
  "21": {
    id: "21",
    name: "Client Not Providing Phone",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: [],
    aliases: ["not providing phone", "won't give phone", "refused phone"],
  },
  "22": {
    id: "22",
    name: "Good Client (Missing Phone)",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName", "region"],
    optionalFields: [],
    aliases: ["good client", "missing phone template"],
  },
  "23": {
    id: "23",
    name: "Follow-up with Multiple Properties",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName", "location", "links"],
    optionalFields: [],
    aliases: ["follow up multiple", "follow-up multiple properties"],
  },
  "24": {
    id: "24",
    name: "No Options - Low Budget",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["no options", "low budget"],
  },
  "25": {
    id: "25",
    name: "Multiple Areas Issue",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["cityRegion"],
    optionalFields: ["clientName"],
    aliases: ["multiple areas", "too many areas"],
  },
  "26": {
    id: "26",
    name: "Time Wasters - Polite Decline",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["time waster", "polite decline"],
  },
  "27": {
    id: "27",
    name: "Still Looking Follow-up",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName"],
    optionalFields: [],
    aliases: ["still looking", "still looking follow up"],
  },
  "28": {
    id: "28",
    name: "No Agent Cooperation",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["estateAgentName"],
    optionalFields: [],
    aliases: ["no cooperation", "agent cooperation decline"],
  },
  "31": {
    id: "31",
    name: "Follow-up with Single Property",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["clientName", "propertyType", "location", "link"],
    optionalFields: [],
    aliases: ["follow up single", "follow-up one property"],
  },
  "32": {
    id: "32",
    name: "Buyer Viewing Confirmation",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["link"],
    optionalFields: [],
    aliases: ["viewing confirmation", "buyer viewing confirmation"],
  },
  "33": {
    id: "33",
    name: "AML/KYC Request to Lawyer",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: [],
    aliases: ["AML for lawyer", "AML request lawyer", "KYC request lawyer"],
  },
  "34": {
    id: "34",
    name: "AML/KYC Internal Compliance",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["invoiceNumber"],
    optionalFields: [],
    aliases: ["AML compliance", "KYC compliance email"],
  },
  "35": {
    id: "35",
    name: "Selling Request Received",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["potentialSellerName"],
    optionalFields: [],
    aliases: ["selling request", "seller request received"],
  },
  "36": {
    id: "36",
    name: "Recommended Pricing Advice",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["sellerName", "recommendedPrice", "sellingPriceRange"],
    optionalFields: [],
    aliases: ["pricing advice", "recommended pricing"],
  },
  "37": {
    id: "37",
    name: "Overpriced Property Decline",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: ["sellerName", "transactionType"],
    optionalFields: [],
    aliases: ["overpriced", "overpriced property", "price too high"],
  },
  "38": {
    id: "38",
    name: "Property Location Information Request",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["location request", "property location info"],
  },
  "39": {
    id: "39",
    name: "Different Regions Request",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["different regions", "multiple regions"],
  },
  "40": {
    id: "40",
    name: "Client Follow Up - No Reply Yet",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["no reply follow up", "client not replying"],
  },
  "41": {
    id: "41",
    name: "Plain Request to info@zyprus.com",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: [],
    aliases: ["plain request", "info request template"],
  },
  "42": {
    id: "42",
    name: "Apology for Extended Delay",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["apology delay", "delayed response apology"],
  },
  "43": {
    id: "43",
    name: "Client Rushing/Insisting",
    outputType: "TEXT",
    category: "CLIENT_COMMS",
    requiredFields: [],
    optionalFields: ["clientName"],
    aliases: ["patience request", "client rushing", "client insisting"],
  },
};

/**
 * Category summary for documentation
 */
export const TEMPLATE_CATEGORIES = {
  REGISTRATIONS: {
    name: "Registration Templates",
    templates: ["01", "02", "03", "04", "05", "06", "07", "08"],
    outputType: "TEXT" as const,
    description: "Seller, Bank, Developer registrations - sent as WhatsApp messages",
  },
  VIEWING_FORMS: {
    name: "Viewing Forms",
    templates: ["09", "10"],
    outputType: "DOCX" as const,
    description: "Standard and Advanced viewing forms - sent as DOCX files",
  },
  RESERVATIONS: {
    name: "Reservation Agreement",
    templates: ["11"],
    outputType: "DOCX" as const,
    description: "Property Reservation Agreement - sent as DOCX file",
  },
  MARKETING: {
    name: "Marketing Agreements",
    templates: ["14", "15"],
    outputType: "MIXED" as const,
    description: "Email (TEXT) and Non-Exclusive (DOCX) marketing agreements",
  },
  CLIENT_COMMS: {
    name: "Client Communications",
    templates: ["17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28",
                "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43"],
    outputType: "TEXT" as const,
    description: "Client communication templates - sent as WhatsApp messages",
  },
} as const;

/**
 * Check if a template ID is a DOCX template
 */
export function isDocxTemplateId(templateId: string): boolean {
  const normalized = templateId.padStart(2, "0");
  return DOCX_TEMPLATE_IDS.includes(normalized as typeof DOCX_TEMPLATE_IDS[number]);
}

/**
 * Get template output type by ID
 */
export function getTemplateOutputType(templateId: string): TemplateOutputType {
  const normalized = templateId.padStart(2, "0");
  const template = TEMPLATE_REGISTRY[normalized];
  return template?.outputType ?? "TEXT";
}

/**
 * Check if a response title/header indicates a DOCX template
 */
export function isDocxTemplateTitle(title: string): boolean {
  const normalizedTitle = title.toLowerCase().trim();

  return DOCX_TEMPLATE_TITLES.some(docxTitle =>
    normalizedTitle.includes(docxTitle.toLowerCase())
  );
}

/**
 * Extract the template title from an AI response
 * Looks for bold headers like **Viewing Form** or titles at the start
 */
export function extractTemplateTitle(response: string): string | null {
  const lines = response.trim().split('\n');

  // Check first few lines for a title
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Check for bold header: **Title**
    const boldMatch = line.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return boldMatch[1].trim();
    }

    // Check for underlined title (common in DOCX forms)
    if (line.match(/^[A-Z][a-zA-Z\s\/\-]+$/) && line.length < 50) {
      return line;
    }

    // If first non-empty line doesn't look like a title, stop looking
    if (i === 0 && !line.startsWith('**') && !line.match(/^[A-Z]/)) {
      break;
    }
  }

  return null;
}

/**
 * Find template by alias (trigger phrase)
 */
export function findTemplateByAlias(searchTerm: string): TemplateDefinition | null {
  const normalized = searchTerm.toLowerCase().trim();

  for (const template of Object.values(TEMPLATE_REGISTRY)) {
    if (template.aliases.some(alias => normalized.includes(alias.toLowerCase()))) {
      return template;
    }
  }

  return null;
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): TemplateDefinition | null {
  const normalized = id.padStart(2, "0");
  return TEMPLATE_REGISTRY[normalized] ?? null;
}

/**
 * Get all templates by output type
 */
export function getTemplatesByOutputType(type: TemplateOutputType): TemplateDefinition[] {
  return Object.values(TEMPLATE_REGISTRY).filter(t => t.outputType === type);
}

/**
 * Get all DOCX templates
 */
export function getDocxTemplates(): TemplateDefinition[] {
  return getTemplatesByOutputType("DOCX");
}

/**
 * Get all TEXT templates
 */
export function getTextTemplates(): TemplateDefinition[] {
  return getTemplatesByOutputType("TEXT");
}

// Log initialization
logger.debug(`[Template Registry] Initialized with ${Object.keys(TEMPLATE_REGISTRY).length} templates`, {
  category: LogCategory.GENERAL,
});
