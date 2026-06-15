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
 *   - Reviewer 1: zyprus@zyprus.com (Lauren's main account)
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
  assignTo?: string,
  isBankListing?: boolean
): ReviewerAssignment {
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

  // FOR RENT: Agent reviews their own listings.
  // Management agents have listingOwnerEmail = "ASK" — for them, the assigned
  // agent (assignTo) becomes the listing owner / reviewer / instructor.
  if (propertyType === "rent") {
    const listingOwner =
      assignTo ||
      (agent.listingOwnerEmail === "ASK"
        ? agent.communicationEmail
        : agent.listingOwnerEmail);
    return {
      reviewer1: listingOwner,
      reviewer2: null,
      listingOwner,
      listingInstructor: listingOwner, // CRITICAL: Must be same as listingOwner
    };
  }

  // BANK SALE: bank-owned property scraped from a bank portal. The regional
  // office owns/instructs the listing (NOT the requesting agent), while Lauren
  // + the regional office review it. Only applies to sale; rent / Michelle
  // branches above are untouched. Falls back to standard logic if the region
  // has no regional office email (keeps existing behavior).
  if (isBankListing && REGIONAL_EMAILS[propertyRegion]) {
    const regionalOffice = REGIONAL_EMAILS[propertyRegion];
    return {
      reviewer1: "zyprus@zyprus.com",
      reviewer2: regionalOffice,
      listingOwner: regionalOffice,
      listingInstructor: regionalOffice, // Always same as listingOwner
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
    reviewer1: "zyprus@zyprus.com",
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
  _propertyType: "sale" | "rent",
  isBankListing?: boolean
): boolean {
  // Bank-owned listings are auto-assigned to the regional office for the
  // property's region (see assignReviewers) — the listing owner is NEVER the
  // requesting agent and NEVER something to ask about, even for management.
  if (isBankListing) return false;
  // Management needs to specify who to assign to — applies to both sale and
  // rent because the listing owner can't be the management user themselves.
  return agent.role === "management" && agent.listingOwnerEmail === "ASK";
}

/**
 * Get the appropriate listing owner email for an agent
 * For management, this returns "ASK" indicating they need to specify
 */
export function getListingOwnerEmail(agent: Agent): string {
  return agent.listingOwnerEmail;
}
