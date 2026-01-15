/**
 * Reviewer Assignment Engine
 * Determines who reviews and owns listings based on business rules
 */

import { Agent } from "../agents/identifier.ts";

export interface ReviewerAssignment {
  reviewer1: string;
  reviewer2: string | null;
  listingOwner: string;
  listingInstructor: string;
}

export class RejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RejectionError";
  }
}

// Regional office emails
const REGIONAL_EMAILS: Record<string, string> = {
  paphos: "requestpaphos@zyprus.com",
  limassol: "requestlimassol@zyprus.com",
  larnaca: "requestlarnaca@zyprus.com",
  nicosia: "requestnicosia@zyprus.com",
  famagusta: "requestfamagusta@zyprus.com",
};

/**
 * Assign reviewers based on property type, region, and agent
 *
 * Rules from documentation:
 * - FOR SALE (Paphos/Limassol/Larnaca/Nicosia):
 *   - Reviewer 1: listings@zyprus.com (Lauren)
 *   - Reviewer 2: request{region}@zyprus.com
 *
 * - FOR SALE (Famagusta only):
 *   - Reviewer 1: requestfamagusta@zyprus.com
 *   - Reviewer 2: NONE
 *
 * - FOR RENT (all regions):
 *   - Reviewer 1: Same as agent who sent it
 *   - Reviewer 2: NONE
 */
export function assignReviewers(
  agent: Agent,
  propertyType: "sale" | "rent",
  propertyRegion: string,
  assignTo?: string
): ReviewerAssignment {
  // SPECIAL CASE: Charalambos/Lauren (management) cannot do rentals via AI
  if (agent.role === "management" && propertyType === "rent") {
    throw new RejectionError(
      "Unfortunately you cannot use my services for adding rental properties. " +
        "Please send it to a normal regional agent."
    );
  }

  // SPECIAL CASE: Michelle rentals → Demetra
  // Michelle's communication email is limassol@zyprus.com
  if (
    agent.communicationEmail === "limassol@zyprus.com" &&
    propertyType === "rent"
  ) {
    return {
      reviewer1: "demetra@zyprus.com",
      reviewer2: null,
      listingOwner: "demetra@zyprus.com",
      listingInstructor: "michelle@zyprus.com",
    };
  }

  // FOR RENT: Agent reviews their own listings
  if (propertyType === "rent") {
    return {
      reviewer1: agent.listingOwnerEmail,
      reviewer2: null,
      listingOwner: agent.listingOwnerEmail,
      listingInstructor: agent.communicationEmail,
    };
  }

  // FOR SALE: Famagusta has special rules (only one reviewer)
  if (propertyRegion === "famagusta") {
    const listingOwner =
      agent.listingOwnerEmail === "ASK" ? assignTo || agent.communicationEmail : agent.listingOwnerEmail;

    return {
      reviewer1: "requestfamagusta@zyprus.com",
      reviewer2: null,
      listingOwner,
      listingInstructor: agent.communicationEmail,
    };
  }

  // FOR SALE: Standard regions (Paphos, Limassol, Larnaca, Nicosia)
  // Management (Charalambos/Lauren) need to specify who to assign to
  const listingOwner =
    agent.listingOwnerEmail === "ASK" ? assignTo || agent.communicationEmail : agent.listingOwnerEmail;

  return {
    reviewer1: "listings@zyprus.com",
    reviewer2: REGIONAL_EMAILS[propertyRegion] || null,
    listingOwner,
    listingInstructor: agent.communicationEmail,
  };
}

/**
 * Check if management needs to specify assignment
 */
export function needsAssignmentInput(
  agent: Agent,
  propertyType: "sale" | "rent"
): boolean {
  // Management selling properties need to specify who to assign to
  return (
    agent.role === "management" &&
    agent.listingOwnerEmail === "ASK" &&
    propertyType === "sale"
  );
}

/**
 * Get the appropriate listing owner email for an agent
 * For management, this returns "ASK" indicating they need to specify
 */
export function getListingOwnerEmail(agent: Agent): string {
  return agent.listingOwnerEmail;
}

