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
            description: "The area/location of the property (e.g., Tala, Potamos Germasogeia)",
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
            description: "Covered veranda area in square meters (optional)",
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
            enum: ["separate", "final_approval", "pending", "unknown"],
            description: "Status of the title deeds",
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
          features: {
            type: "array",
            items: { type: "string" },
            description: "Property features like pool, garden, sea view, air conditioning",
          },
          yearBuilt: {
            type: "integer",
            description: "Year the property was built",
          },
          floor: {
            type: "string",
            description: "Floor level (for apartments): ground, 1st, 2nd, etc.",
          },
          assignTo: {
            type: "string",
            description: "For management only: email of agent to assign as listing owner",
          },
          specialNotes: {
            type: "string",
            description: "Any special notes from the owner or agent",
          },
          areaDescription: {
            type: "string",
            description: "User-provided description of the area/neighborhood (e.g., 'peaceful neighborhood with excellent access to tourist areas, city center, and highway. Near universities and Kings Avenue Mall'). IMPORTANT: Always capture and pass any location/area details the user provides - these are valuable marketing points that should NOT be replaced with generic descriptions.",
          },
          coordinates: {
            type: "object",
            properties: {
              lat: { type: "number", description: "Latitude (e.g., 34.6841 for Limassol)" },
              lon: { type: "number", description: "Longitude (e.g., 33.0413 for Limassol)" },
            },
            description: "GPS coordinates for the property location. Use approximate city coordinates if exact address unknown. Cyprus coordinates: Limassol (34.68, 33.04), Paphos (34.77, 32.42), Nicosia (35.17, 33.36), Larnaca (34.92, 33.63)",
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

  // Send Email Tool
  {
    type: "function",
    function: {
      name: "sendEmail",
      description:
        "Send an email to yourself. The email is automatically sent to your registered Zyprus email address. Use this when you want to send/email a document, template, registration, marketing agreement, or any content to yourself. The email will be sent from sofia@zyprus.com. No need to specify your email address - it's automatically detected.",
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

