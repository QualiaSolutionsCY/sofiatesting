/**
 * Reviewer Assignment Engine
 * Determines who reviews and owns listings based on business rules
 */

import type { Agent } from "../agents/identifier.ts";
import { REGIONAL_EMAILS } from "../config/business-rules.ts";

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

  // SPECIAL CASE: Michelle rentals → Demetra as owner, Michelle as instructor
  // Michelle's communication email is limassol@zyprus.com
  // Owner = Demetra, Reviewers = Demetra + requestlimassol, Instructor = Michelle
  if (
    agent.communicationEmail === "limassol@zyprus.com" &&
    propertyType === "rent"
  ) {
    return {
      reviewer1: "demetra@zyprus.com",
      reviewer2: "requestlimassol@zyprus.com",
      listingOwner: "demetra@zyprus.com",
      listingInstructor: agent.communicationEmail, // Michelle is the instructor (person who sent it)
    };
  }

  // FOR RENT: Agent reviews their own listings
  if (propertyType === "rent") {
    return {
      reviewer1: agent.listingOwnerEmail,
      reviewer2: null,
      listingOwner: agent.listingOwnerEmail,
      listingInstructor: agent.listingOwnerEmail, // CRITICAL: Must be same as listingOwner
    };
  }

  // FOR SALE: Famagusta has special rules (only one reviewer)
  if (propertyRegion === "famagusta") {
    const listingOwner =
      assignTo ||
      (agent.listingOwnerEmail === "ASK"
        ? agent.communicationEmail
        : agent.listingOwnerEmail);

    return {
      reviewer1: "requestfamagusta@zyprus.com",
      reviewer2: null,
      listingOwner,
      listingInstructor: listingOwner, // Always same as listingOwner
    };
  }

  // FOR SALE: Standard regions (Paphos, Limassol, Larnaca, Nicosia)
  // When assignTo is provided, it always takes precedence (management assigns to specific agent)
  const listingOwner =
    assignTo ||
    (agent.listingOwnerEmail === "ASK"
      ? agent.communicationEmail
      : agent.listingOwnerEmail);

  return {
    reviewer1: "listings@zyprus.com",
    reviewer2: REGIONAL_EMAILS[propertyRegion] || null,
    listingOwner,
    listingInstructor: listingOwner, // Always same as listingOwner
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
