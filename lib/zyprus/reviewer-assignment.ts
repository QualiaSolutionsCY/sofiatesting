import {
  REGIONAL_ACCOUNTS,
  REVIEWER_RULES,
} from "../telegram/routing-constants";

/**
 * Get reviewers for a property listing based on type and region
 */
export function getReviewers({
  listingType, // 'sale' | 'rent'
  region,
  submittedByEmail,
  isMichelleRental = false,
}: {
  listingType: "sale" | "rent";
  region: string;
  submittedByEmail?: string;
  isMichelleRental?: boolean;
}) {
  // Special case: Michelle sending rental property
  if (
    listingType === "rent" &&
    isMichelleRental &&
    submittedByEmail?.toLowerCase().includes("michelle")
  ) {
    return {
      reviewer1: "demetra@zyprus.com", // Demetra Papademetriou
      reviewer2: REGIONAL_ACCOUNTS[region] || REGIONAL_ACCOUNTS.Limassol,
    };
  }

  // For rent properties: reviewer is the person who sent it
  if (listingType === "rent") {
    return {
      reviewer1: submittedByEmail,
      reviewer2: null,
    };
  }

  // For sale properties
  if (listingType === "sale") {
    // Famagusta: Only regional manager
    if (region.toLowerCase() === "famagusta") {
      return {
        reviewer1: REGIONAL_ACCOUNTS.Famagusta,
        reviewer2: null,
      };
    }

    // Other regions: Lauren + regional manager
    return {
      reviewer1: REVIEWER_RULES.SALE_PRIMARY_REVIEWER, // listings@zyprus.com (Lauren)
      reviewer2: REGIONAL_ACCOUNTS[region as keyof typeof REGIONAL_ACCOUNTS],
    };
  }

  return {
    reviewer1: null,
    reviewer2: null,
  };
}

/**
 * Validate if user can create listing in specific region
 */
export function validateRegionPermission({
  userEmail,
  userRegion,
  targetRegion,
  isAdmin = false,
}: {
  userEmail: string;
  userRegion?: string;
  targetRegion: string;
  isAdmin?: boolean;
}) {
  // Admins (Lauren/Charalambos) can create listings anywhere
  if (
    isAdmin &&
    (userEmail.toLowerCase().includes("lauren") ||
      userEmail.toLowerCase().includes("charalambos"))
  ) {
    return { allowed: true };
  }

  // Agents can only create listings in their own region
  if (userRegion && userRegion !== targetRegion) {
    return {
      allowed: false,
      message:
        "Unfortunately, you are not allowed to market a property outside your region on zyprus.com. Please contact the relevant regional manager for assistance.",
    };
  }

  return { allowed: true };
}
