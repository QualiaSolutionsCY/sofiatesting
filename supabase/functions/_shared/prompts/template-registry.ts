/**
 * SOPHIA Template Registry
 *
 * Maps template categories to their IDs and provides lazy loading.
 * Templates are only loaded when detected by intent.
 */

export type TemplateCategory =
  | "registrations"
  | "viewing_forms"
  | "reservations"
  | "marketing"
  | "client_comms"
  | "property_upload"
  | "calculators"
  | "knowledge";

export interface TemplateInfo {
  id: string;
  name: string;
  category: TemplateCategory;
  keywords: string[];
  isDocx: boolean;
}

/**
 * Template metadata for intent detection
 */
export const TEMPLATE_CATALOG: TemplateInfo[] = [
  // Registrations (01-08)
  {
    id: "01",
    name: "Standard Seller Registration",
    category: "registrations",
    keywords: [
      "standard seller",
      "seller registration",
      "standard registration",
    ],
    isDocx: false,
  },
  {
    id: "02",
    name: "Seller with Marketing",
    category: "registrations",
    keywords: ["seller with marketing", "marketing registration"],
    isDocx: false,
  },
  {
    id: "03",
    name: "Rental Registration",
    category: "registrations",
    keywords: ["rental registration", "tenancy registration", "rental"],
    isDocx: false,
  },
  {
    id: "04",
    name: "Advanced Seller Registration",
    category: "registrations",
    keywords: ["advanced seller", "advanced registration"],
    isDocx: false,
  },
  {
    id: "05",
    name: "Bank Property Registration",
    category: "registrations",
    keywords: ["bank property", "bank registration", "bank apartment"],
    isDocx: false,
  },
  {
    id: "06",
    name: "Bank Land Registration",
    category: "registrations",
    keywords: ["bank land", "land registration"],
    isDocx: false,
  },
  {
    id: "07",
    name: "Developer Registration (Viewing)",
    category: "registrations",
    keywords: [
      "developer",
      "developer registration",
      "dev reg",
      "registration developer",
    ],
    isDocx: false,
  },
  {
    id: "08",
    name: "Developer Registration (No Viewing)",
    category: "registrations",
    keywords: ["developer no viewing"],
    isDocx: false,
  },

  // Viewing Forms (09-10)
  {
    id: "09",
    name: "Standard Viewing Form",
    category: "viewing_forms",
    keywords: ["viewing form", "standard viewing"],
    isDocx: true,
  },
  {
    id: "10",
    name: "Advanced Viewing Form",
    category: "viewing_forms",
    keywords: ["advanced viewing"],
    isDocx: true,
  },

  // Reservations (11-12)
  {
    id: "11",
    name: "Property Reservation",
    category: "reservations",
    keywords: ["reservation", "property reservation"],
    isDocx: true,
  },
  {
    id: "12",
    name: "Reservation Agreement",
    category: "reservations",
    keywords: ["reservation agreement"],
    isDocx: true,
  },

  // Marketing Agreements (14)
  {
    id: "14",
    name: "Email Marketing Agreement",
    category: "marketing",
    keywords: [
      "email marketing",
      "marketing agreement",
      "signature document",
      "signature form",
    ],
    isDocx: false,
  },

  // Client Communications (17-43)
  {
    id: "17",
    name: "Good Client Email",
    category: "client_comms",
    keywords: ["good client", "client email"],
    isDocx: false,
  },
  {
    id: "18",
    name: "Good Client WhatsApp",
    category: "client_comms",
    keywords: ["good client whatsapp"],
    isDocx: false,
  },
  {
    id: "19",
    name: "Valuation Quote",
    category: "client_comms",
    keywords: ["valuation quote", "valuation"],
    isDocx: false,
  },
  {
    id: "20",
    name: "Valuation Request",
    category: "client_comms",
    keywords: ["valuation request"],
    isDocx: false,
  },
  {
    id: "21",
    name: "Follow-up Multiple",
    category: "client_comms",
    keywords: ["follow up", "follow-up", "multiple properties"],
    isDocx: false,
  },
  {
    id: "22",
    name: "Follow-up Single",
    category: "client_comms",
    keywords: ["follow up single", "single property"],
    isDocx: false,
  },
  {
    id: "23",
    name: "Buyer Viewing Confirmation",
    category: "client_comms",
    keywords: ["buyer confirmation", "viewing confirmation"],
    isDocx: false,
  },
  {
    id: "24",
    name: "Low Budget",
    category: "client_comms",
    keywords: ["low budget", "budget issue"],
    isDocx: false,
  },
  {
    id: "25",
    name: "Multiple Areas Issue",
    category: "client_comms",
    keywords: ["multiple areas", "areas issue"],
    isDocx: false,
  },
  {
    id: "26",
    name: "Time Wasters",
    category: "client_comms",
    keywords: ["time waster", "decline"],
    isDocx: false,
  },
  {
    id: "27",
    name: "Still Looking",
    category: "client_comms",
    keywords: ["still looking", "follow up"],
    isDocx: false,
  },
  {
    id: "28",
    name: "No Agent Cooperation",
    category: "client_comms",
    keywords: ["no cooperation", "agent cooperation"],
    isDocx: false,
  },
  {
    id: "31",
    name: "AML/KYC Lawyer",
    category: "client_comms",
    keywords: ["aml", "kyc", "lawyer", "compliance"],
    isDocx: false,
  },
  {
    id: "32",
    name: "AML/KYC Internal",
    category: "client_comms",
    keywords: ["aml internal", "compliance internal"],
    isDocx: false,
  },
  {
    id: "33",
    name: "Selling Request",
    category: "client_comms",
    keywords: ["selling request"],
    isDocx: false,
  },
  {
    id: "34",
    name: "Pricing Advice",
    category: "client_comms",
    keywords: ["pricing advice", "recommended price"],
    isDocx: false,
  },
  {
    id: "35",
    name: "Overpriced Decline",
    category: "client_comms",
    keywords: ["overpriced", "price too high"],
    isDocx: false,
  },
  {
    id: "36",
    name: "Location Info Request",
    category: "client_comms",
    keywords: ["location info", "property location"],
    isDocx: false,
  },
  {
    id: "37",
    name: "Different Regions",
    category: "client_comms",
    keywords: ["different region", "other region"],
    isDocx: false,
  },
  {
    id: "38",
    name: "No Reply Follow-up",
    category: "client_comms",
    keywords: ["no reply", "not responding"],
    isDocx: false,
  },
  {
    id: "39",
    name: "Missing Phone",
    category: "client_comms",
    keywords: ["missing phone", "no phone"],
    isDocx: false,
  },
  {
    id: "40",
    name: "Plain Request",
    category: "client_comms",
    keywords: ["plain request", "info request"],
    isDocx: false,
  },
  {
    id: "41",
    name: "Apology Delay",
    category: "client_comms",
    keywords: ["apology", "delay", "sorry"],
    isDocx: false,
  },
  {
    id: "42",
    name: "Patience Request",
    category: "client_comms",
    keywords: ["patience", "rushing", "insisting"],
    isDocx: false,
  },
];

/**
 * Keywords that indicate property upload intent
 */
export const UPLOAD_KEYWORDS = [
  "upload",
  "create listing",
  "add property",
  "list property",
  "new listing",
  "upload property",
  "add listing",
];

/**
 * Keywords that indicate calculator intent
 */
export const CALCULATOR_KEYWORDS = [
  "vat",
  "transfer fee",
  "capital gain",
  "calculate",
  "tax",
  "how much",
  "fees",
];

/**
 * Keywords that indicate knowledge/Q&A intent
 */
export const KNOWLEDGE_KEYWORDS = [
  "what is",
  "how do",
  "explain",
  "tell me about",
  "pr program",
  "permanent residence",
  "tax residency",
  "planning zone",
  "minimum sqm",
  "60-day rule",
  "title deed",
  "crea",
];

/**
 * Detect which template categories are needed based on user message
 */
export const detectIntent = (message: string): TemplateCategory[] => {
  const lower = message.toLowerCase();
  const categories: Set<TemplateCategory> = new Set();

  // Check for property upload
  if (UPLOAD_KEYWORDS.some((kw) => lower.includes(kw))) {
    categories.add("property_upload");
  }

  // Check for calculators
  if (CALCULATOR_KEYWORDS.some((kw) => lower.includes(kw))) {
    categories.add("calculators");
  }

  // Check for knowledge questions
  if (KNOWLEDGE_KEYWORDS.some((kw) => lower.includes(kw))) {
    categories.add("knowledge");
  }

  // Check for specific templates
  for (const template of TEMPLATE_CATALOG) {
    if (template.keywords.some((kw) => lower.includes(kw))) {
      categories.add(template.category);
    }
  }

  // If no specific intent detected, include registrations and client_comms as defaults
  // since they're the most common
  if (categories.size === 0) {
    categories.add("registrations");
    categories.add("client_comms");
  }

  return Array.from(categories);
};

/**
 * Get templates for detected categories
 */
export const getTemplatesForCategories = (
  categories: TemplateCategory[]
): TemplateInfo[] => {
  return TEMPLATE_CATALOG.filter((t) => categories.includes(t.category));
};
