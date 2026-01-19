/**
 * Shared Tool Definitions
 *
 * OpenRouter/Gemini function calling schemas for SOPHIA.
 * Used by all channels (WhatsApp, Telegram, Web).
 */

import type { ToolResult } from "./adapters/types.ts";
import { calculateVAT, calculateTransferFees, calculateCapitalGains } from "./calculators.ts";

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

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
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
        "Calculate VAT for a property purchase in Cyprus. New properties have 19% VAT (reduced to 5% for primary residence under conditions).",
      parameters: {
        type: "object",
        properties: {
          price: {
            type: "number",
            description: "Property price in EUR",
          },
          isNewProperty: {
            type: "boolean",
            description: "Whether this is a new/first-sale property",
          },
          isPrimaryResidence: {
            type: "boolean",
            description: "Whether buyer will use as primary residence",
          },
          buyerIsEU: {
            type: "boolean",
            description: "Whether buyer is EU citizen/resident",
          },
        },
        required: ["price", "isNewProperty"],
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
];

/**
 * Get tool definitions for OpenRouter
 */
export const getToolDefinitions = (): ToolDefinition[] => TOOLS;

/**
 * Get tool by name
 */
export const getToolByName = (name: string): ToolDefinition | undefined =>
  TOOLS.find((t) => t.function.name === name);

// =============================================================================
// Calculator Tool Handlers (shared implementations)
// =============================================================================

/**
 * Handle VAT calculation tool call
 */
export const handleCalculateVAT = (args: Record<string, unknown>): ToolResult => {
  const result = calculateVAT({
    price: args.price as number,
    isNewProperty: args.isNewProperty as boolean,
    isPrimaryResidence: args.isPrimaryResidence as boolean | undefined,
    buyerIsEU: args.buyerIsEU as boolean | undefined,
  });
  return {
    success: result.success,
    message: result.message,
    data: result.data,
  };
};

/**
 * Handle Transfer Fees calculation tool call
 */
export const handleCalculateTransferFees = (args: Record<string, unknown>): ToolResult => {
  const result = calculateTransferFees({
    price: args.price as number,
    isFirstProperty: args.isFirstProperty as boolean | undefined,
    hasVAT: args.hasVAT as boolean | undefined,
  });
  return {
    success: result.success,
    message: result.message,
    data: result.data,
  };
};

/**
 * Handle Capital Gains calculation tool call
 */
export const handleCalculateCapitalGains = (args: Record<string, unknown>): ToolResult => {
  const result = calculateCapitalGains({
    purchasePrice: args.purchasePrice as number,
    salePrice: args.salePrice as number,
    purchaseYear: args.purchaseYear as number,
    improvements: args.improvements as number | undefined,
    isMainResidence: args.isMainResidence as boolean | undefined,
  });
  return {
    success: result.success,
    message: result.message,
    data: result.data,
  };
};
