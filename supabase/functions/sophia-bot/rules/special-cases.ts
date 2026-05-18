/**
 * Special Cases Handler
 * Handles edge cases and exceptions in the business rules
 */

import { type Agent, getAgentByEmail } from "../agents/identifier.ts";
import { REGIONAL_EMAILS } from "../config/business-rules.ts";

export interface UploadRequest {
  listingType: "sale" | "rent";
  location: string;
  assignTo?: string;
}

export interface SpecialCaseResult {
  proceed?: boolean;
  rejected?: boolean;
  needsInput?: boolean;
  question?: string;
  message?: string;
  modifiedRequest?: Partial<UploadRequest>;
}

/**
 * Get the region for an agent by their email (from database)
 */
export async function getAgentRegion(
  email: string
): Promise<string | null> {
  const agent = await getAgentByEmail(email);
  return agent?.region || null;
}

/**
 * Handle special cases before processing an upload request
 */
export async function handleSpecialCases(
  agent: Agent,
  request: UploadRequest,
  propertyRegion: string
): Promise<SpecialCaseResult> {
  // 1. Check if agent can upload (canUpload flag from database)
  if (!agent.canUpload) {
    return {
      rejected: true,
      message:
        "I'm not able to upload properties for you as you're not configured as a listing agent. " +
        "However, I can help you generate documents such as viewing forms or marketing agreements.",
    };
  }

  // 2. Management trying to do rentals
  if (agent.role === "management" && request.listingType === "rent") {
    return {
      rejected: true,
      message:
        "Unfortunately you cannot use my services for adding rental properties. " +
        "Please send it to a normal regional agent.",
    };
  }

  // 3. Management must specify assignment for sales
  if (
    agent.role === "management" &&
    agent.listingOwnerEmail === "ASK" &&
    request.listingType === "sale" &&
    !request.assignTo
  ) {
    return {
      needsInput: true,
      question:
        "To whom would you like me to assign this property as the listing owner? " +
        "Please provide the agent's name or email.",
    };
  }

  // 4. Management trying to assign to wrong region
  if (agent.role === "management" && request.assignTo) {
    const assignToLower = request.assignTo.toLowerCase().trim();

    // Check if this is a regional office email (requestpaphos@zyprus.com, etc.)
    const regionalOfficeRegion = Object.entries(REGIONAL_EMAILS).find(
      ([_, email]) => email === assignToLower
    )?.[0];

    if (regionalOfficeRegion) {
      // Regional office email — validate region matches property
      if (regionalOfficeRegion !== propertyRegion) {
        return {
          rejected: true,
          message:
            `I'm not able to assign this ${propertyRegion} property to the ${regionalOfficeRegion} office. ` +
            `Would you like me to assign it to the ${propertyRegion} office (${REGIONAL_EMAILS[propertyRegion]}) instead?`,
        };
      }
    } else {
      // Regular agent — validate from database
      const assigneeRegion = await getAgentRegion(
        request.assignTo
      );

      if (
        assigneeRegion &&
        assigneeRegion !== "all" &&
        assigneeRegion !== propertyRegion
      ) {
        return {
          rejected: true,
          message:
            `I'm not able to assign this ${propertyRegion} property to ${request.assignTo} ` +
            `as they are based in ${assigneeRegion}. ` +
            `Would you like me to assign it to a ${propertyRegion}-based agent instead?`,
        };
      }
    }
  }

  // 5. Michelle rentals special case - auto-reassign to Demetra
  if (
    agent.communicationEmail.toLowerCase() === "limassol@zyprus.com" &&
    request.listingType === "rent"
  ) {
    return {
      proceed: true,
      modifiedRequest: {
        assignTo: "demetra@zyprus.com",
      },
      message: "I'll assign this rental to Demetra as per company policy.",
    };
  }

  // No special case applies - proceed normally
  return { proceed: true };
}

/**
 * Check if an unknown sender needs identification
 */
export function handleUnknownSender(): SpecialCaseResult {
  return {
    needsInput: true,
    question:
      "I don't recognize your phone number in our system. " +
      "Could you please confirm who you are and your Zyprus email address?",
  };
}

/**
 * Validate that required fields are present
 */
export function validateRequiredFields(data: Record<string, unknown>): {
  valid: boolean;
  missing: string[];
} {
  const required = [
    "listingType",
    "price",
    "propertyType",
    "location",
    "bedrooms",
    "coveredArea",
    "ownerName",
    "ownerPhone",
  ];

  // Title deed status is required for SALE only.
  // For RENT, the handler auto-sets titleDeedStatus = "do_not_display"
  // (rentals don't show deed status on the listing).
  const listingType = ((data.listingType as string) || "").toLowerCase();
  if (listingType !== "rent") {
    required.push("titleDeedStatus");
  }

  // Bathrooms are required for residential types only
  // Commercial types (office, shop, warehouse, hotel) and buildings are exempt
  const propertyType = ((data.propertyType as string) || "").toLowerCase();
  const commercialTypes = ["building", "office", "shop", "warehouse", "hotel"];
  const isCommercial = commercialTypes.some((t) => propertyType.includes(t));
  if (!isCommercial) {
    required.push("bathrooms");
  }

  const missing = required.filter(
    (field) =>
      data[field] === undefined || data[field] === null || data[field] === ""
  );

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get a friendly message for missing fields
 */
export function getMissingFieldsMessage(missing: string[]): string {
  const fieldNames: Record<string, string> = {
    listingType: "whether this is for sale or rent",
    price: "the price",
    propertyType: "the property type (apartment, house, villa, etc.)",
    location: "the location/area",
    bedrooms: "the number of bedrooms",
    bathrooms: "the number of bathrooms",
    coveredArea: "the covered area in square meters",
    ownerName: "the owner's name",
    ownerPhone: "the owner's phone number",
    titleDeedStatus: "the title deed status",
  };

  const friendlyNames = missing.map((f) => fieldNames[f] || f);

  if (friendlyNames.length === 1) {
    return `I still need ${friendlyNames[0]} to create the listing.`;
  }

  const last = friendlyNames.pop();
  return `I still need ${friendlyNames.join(", ")} and ${last} to create the listing.`;
}
