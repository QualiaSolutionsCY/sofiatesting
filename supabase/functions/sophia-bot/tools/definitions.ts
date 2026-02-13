/**
 * OpenRouter Tool Definitions
 * Function calling schema for SOPHIA's listing upload capabilities
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * All available tools for SOPHIA
 */
export const TOOLS: ToolDefinition[] = [
  // Property Listing Creation
  {
    type: "function",
    function: {
      name: "createPropertyListing",
      description:
        "Create a property listing draft on zyprus.com. Use this when an agent wants to upload a new property for sale or rent. Collects all required information and creates an unpublished draft.",
      parameters: {
        type: "object",
        properties: {
          listingType: {
            type: "string",
            enum: ["sale", "rent"],
            description: "Whether the property is for sale or rent",
          },
          propertyType: {
            type: "string",
            enum: ["apartment", "house", "detached house", "villa", "maisonette", "bungalow", "penthouse", "townhouse", "studio", "semi-detached"],
            description: "The type of property (use 'detached house' for standalone houses, 'semi-detached' for joined houses)",
          },
          price: {
            type: "number",
            description: "The price in EUR",
          },
          location: {
            type: "string",
            description: "The specific area/location of the property. MUST include district (Paphos, Limassol, Larnaca, Nicosia, Famagusta). If user omits district, ASK which district. Example formats: 'Neapoli, Nicosia', 'Germasogeia, Limassol', 'Tala, Paphos'. NEVER assume district - always clarify if missing.",
          },
          bedrooms: {
            type: "integer",
            description: "Number of bedrooms (0 for studio)",
          },
          bathrooms: {
            type: "integer",
            description: "Number of bathrooms",
          },
          coveredArea: {
            type: "number",
            description: "Covered internal area in square meters",
          },
          plotSize: {
            type: "number",
            description: "Plot/land size in square meters (for houses/villas)",
          },
          coveredVeranda: {
            type: "number",
            description: "Covered veranda area in square meters. ALWAYS include when user mentions veranda/balcony size - this is used in the listing title.",
          },
          uncoveredVeranda: {
            type: "number",
            description: "Uncovered veranda area in square meters (optional)",
          },
          ownerName: {
            type: "string",
            description: "Name of the property owner",
          },
          ownerPhone: {
            type: "string",
            description: "Phone number of the property owner",
          },
          ownerEmail: {
            type: "string",
            description: "Email of the property owner (optional)",
          },
          titleDeedStatus: {
            type: "string",
            enum: ["separate", "final_approval", "pending", "share_of_land", "unknown", "do_not_display"],
            description: "Status of the title deeds: separate (full title deeds), final_approval, pending, share_of_land (shared ownership of land), unknown, do_not_display (agent explicitly asked to NOT show deed status in the description — still capture the actual status in specialNotes for reviewers)",
          },
          priceNegotiable: {
            type: "boolean",
            description: "Whether the price is negotiable. Default is TRUE (negotiable) unless agent explicitly says 'non-negotiable' or 'fixed price'",
          },
          isNewBuild: {
            type: "boolean",
            description: "Whether this is a new build property. Set to true if agent mentions 'new build', 'brand new', 'newly built', or year built is recent (within last 2-3 years)",
          },
          parkingType: {
            type: "string",
            enum: ["covered", "open", "garage", "carport", "none"],
            description: "Type of parking available. Ask agent to specify: covered parking, open parking, garage, carport, or none",
          },
          condition: {
            type: "string",
            enum: ["new", "excellent", "good", "fair", "needs_renovation"],
            description: "Property condition. Set based on agent description: 'brand new'→new, 'perfect/excellent condition'→excellent, 'good condition'→good, 'needs work/renovation'→needs_renovation",
          },
          orientation: {
            type: "string",
            enum: ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"],
            description: "Compass orientation of the property (which direction it faces)",
          },
          priceModifier: {
            type: "string",
            enum: ["no_vat", "plus_vat", "vat_included"],
            description: "VAT status of the price. Default 'no_vat' for resale properties. Use 'plus_vat' if price is before VAT, 'vat_included' if VAT is already in the price. Only relevant for new builds.",
          },
          registrationNumber: {
            type: "string",
            description: "Property registration number from title deed (e.g., 0/1234)",
          },
          imageUrls: {
            type: "array",
            items: { type: "string" },
            description: "Array of image URLs for the property",
          },
          floorPlanUrls: {
            type: "array",
            items: { type: "string" },
            description: "Array of floor plan image URLs (separate from property photos). These are uploaded to a dedicated floor plan field on the listing.",
          },
          titleDeedFileUrls: {
            type: "array",
            items: { type: "string" },
            description: "Array of title deed document URLs (PDF or scanned image of title deeds). When agent sends a document attachment during property upload, pass the URL here. These are uploaded to the title deed documents field on the listing.",
          },
          features: {
            type: "array",
            items: { type: "string" },
            description: "Property features. Include: INDOOR (fitted kitchen, air conditioning, central heating, underfloor heating, fireplace, storage room, elevator), OUTDOOR (private pool, communal pool, garden, BBQ area, covered parking, open parking, garage), VIEWS (sea view, mountain view, city view). Infer features from images when possible.",
          },
          yearBuilt: {
            type: "integer",
            description: "Year the property was built",
          },
          floor: {
            type: "string",
            description: "Floor level (for apartments): ground, 1st, 2nd, etc.",
          },
          basementRooms: {
            type: "integer",
            description: "Number of bedrooms/rooms in the basement (e.g., if agent says '5 bedrooms plus 1 in the basement', pass bedrooms=5 and basementRooms=1). These will be shown as '5 Bedrooms + 1 Basement Bedroom' in the description.",
          },
          assignTo: {
            type: "string",
            description: "For management only: email of agent to assign as listing owner. CRITICAL: If the user says 'assign to [name]' or 'assign to [email]', extract the email and pass it here. Check the agent name-to-email mapping in your instructions. If user provides the email directly (e.g., 'danae@zyprus.com'), use it as-is.",
          },
          specialNotes: {
            type: "string",
            description: "Any special notes from the owner or agent",
          },
          areaDescription: {
            type: "string",
            description: "Description of the area/neighborhood for the listing. IMPORTANT: When user provides a Google Maps link, analyze the location and describe what is specifically nearby (e.g., supermarkets, schools, parks, beach proximity, restaurants, highway access). Also capture any area details the user provides verbatim - these are valuable marketing points that should NOT be replaced with generic descriptions.",
          },
          locationUrl: {
            type: "string",
            description: "Google Maps URL or pin link provided by the agent for the property location. Pass the EXACT URL as-is — do NOT modify it. This goes directly into the listing notes for reviewers.",
          },
          coordinates: {
            type: "object",
            properties: {
              lat: { type: "number", description: "Latitude (e.g., 35.17 for Nicosia, 34.68 for Limassol)" },
              lon: { type: "number", description: "Longitude (e.g., 33.36 for Nicosia, 33.04 for Limassol)" },
            },
            description: "GPS coordinates for the property location. Extract from Google Maps URL if provided (the @lat,lon part). Otherwise use approximate city coordinates. Cyprus coordinates: Nicosia (35.17, 33.36), Limassol (34.68, 33.04), Paphos (34.77, 32.42), Larnaca (34.92, 33.63), Famagusta (35.12, 33.95)",
          },
        },
        required: [
          "listingType",
          "propertyType",
          "price",
          "location",
          "bedrooms",
          "bathrooms",
          "coveredArea",
          "ownerName",
          "ownerPhone",
          "titleDeedStatus",
          "imageUrls",
        ],
      },
    },
  },

  // Get Zyprus Taxonomy Data
  {
    type: "function",
    function: {
      name: "getZyprusData",
      description:
        "Retrieve reference data from Zyprus (locations, property types, features). Use this to get valid options for property listings.",
      parameters: {
        type: "object",
        properties: {
          dataType: {
            type: "string",
            enum: ["locations", "property_types", "features", "listing_types"],
            description: "Type of reference data to retrieve",
          },
          region: {
            type: "string",
            enum: ["paphos", "limassol", "larnaca", "nicosia", "famagusta"],
            description: "Filter locations by region (optional)",
          },
        },
        required: ["dataType"],
      },
    },
  },

  // VAT Calculator
  {
    type: "function",
    function: {
      name: "calculateVAT",
      description:
        "Calculate VAT for a NEW property purchase in Cyprus. ALWAYS requires price AND area (sqm). Defaults to primary residence (5% reduced rate). Standard 19% applies if area >190sqm or price >€475,000.",
      parameters: {
        type: "object",
        properties: {
          price: {
            type: "number",
            description: "Property price in EUR (required)",
          },
          area: {
            type: "number",
            description: "Property area in square meters (required for accurate calculation)",
          },
          isPrimaryResidence: {
            type: "boolean",
            description: "Whether buyer will use as primary residence (defaults to true)",
          },
        },
        required: ["price", "area"],
      },
    },
  },

  // Transfer Fees Calculator
  {
    type: "function",
    function: {
      name: "calculateTransferFees",
      description:
        "Calculate property transfer fees for a Cyprus property purchase.",
      parameters: {
        type: "object",
        properties: {
          price: {
            type: "number",
            description: "Property price in EUR",
          },
          isFirstProperty: {
            type: "boolean",
            description: "Whether this is buyer's first property in Cyprus",
          },
          hasVAT: {
            type: "boolean",
            description: "Whether VAT applies (new property)",
          },
        },
        required: ["price"],
      },
    },
  },

  // Capital Gains Calculator
  {
    type: "function",
    function: {
      name: "calculateCapitalGains",
      description:
        "Calculate capital gains tax for selling a property in Cyprus.",
      parameters: {
        type: "object",
        properties: {
          purchasePrice: {
            type: "number",
            description: "Original purchase price in EUR",
          },
          salePrice: {
            type: "number",
            description: "Sale price in EUR",
          },
          purchaseYear: {
            type: "integer",
            description: "Year property was purchased",
          },
          improvements: {
            type: "number",
            description: "Cost of improvements/renovations",
          },
          isMainResidence: {
            type: "boolean",
            description: "Whether this was seller's main residence",
          },
        },
        required: ["purchasePrice", "salePrice", "purchaseYear"],
      },
    },
  },

  // Get Regional Agents (for management assignment)
  {
    type: "function",
    function: {
      name: "getRegionalAgents",
      description:
        "List available agents in a specific region. Use this when management (Charalambos, Lauren) asks who they can assign a listing to, or wants to see agents in a region.",
      parameters: {
        type: "object",
        properties: {
          region: {
            type: "string",
            enum: ["paphos", "limassol", "larnaca", "nicosia", "famagusta"],
            description: "The region to list agents for",
          },
        },
        required: ["region"],
      },
    },
  },

  // Extract Property from Bazaraki
  {
    type: "function",
    function: {
      name: "extractFromBazaraki",
      description:
        "Extract property details from a Bazaraki listing URL. Use this when an agent sends a Bazaraki link (bazaraki.com or bazaraki.cy). Extracts photos, price, location, property type, bedrooms, bathrooms, and area. The agent must still provide owner details and title deed status. Always confirm extracted data with the agent before uploading.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full Bazaraki listing URL (e.g., https://www.bazaraki.com/adv/12345678_...)",
          },
        },
        required: ["url"],
      },
    },
  },

  // Send Email Tool
  {
    type: "function",
    function: {
      name: "sendEmail",
      description:
        "Send an email to yourself. The email is automatically sent to your registered Zyprus email address. ONLY use this when the user EXPLICITLY asks to email something (e.g., 'send to my email', 'email it to me'). DO NOT automatically email DOCX documents (viewing forms, reservation agreements, marketing agreements) - these are sent as WhatsApp file attachments unless user requests email. The email will be sent from sofia@zyprus.com. No need to specify your email address - it's automatically detected.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text or HTML)",
          },
          attachmentUrl: {
            type: "string",
            description: "URL of a document to attach (optional, e.g., DOCX file URL)",
          },
          attachmentName: {
            type: "string",
            description: "Filename for the attachment (optional, e.g., 'Marketing_Agreement.docx')",
          },
        },
        required: ["subject", "body"],
      },
    },
  },
];

/**
 * Get tool definitions for OpenRouter
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOLS;
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.function.name === name);
}

