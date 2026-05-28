/**
 * My Notes Generator
 * Creates back-office notes for property listings
 *
 * My Notes contains only essential info for reviewers:
 * 1. Google Maps link (priority)
 * 2. Agent notes / special instructions
 */

import type { Agent } from "../agents/identifier.ts";

export interface OwnerInfo {
  name: string;
  phone: string;
  email?: string;
  specialNotes?: string;
}

export interface ListingContext {
  registrationNumber?: string;
  source?: string;
  duplicateWarning?: string;
  urgentNotes?: string;
  locationUrl?: string;
  coordinates?: { lat: number; lon: number };
  listingOwner?: string;
  listingOwnerName?: string;
  reviewer1?: string;
  reviewer2?: string;
  aiMessage?: string;
  listingType?: "sale" | "rent";
  propertyType?: string;
  keyFeatures?: string[];
}

/**
 * Generate My Notes content for a property listing
 *
 * Format (updated Feb 2026):
 * 1. Listing Owner (matches Listing Instructor in AI Notes)
 * 2. Google Maps link
 * 3. Duplicate warning (if flagged)
 */
export function generateMyNotes(
  _owner: OwnerInfo,
  _agent: Agent,
  context?: ListingContext
): string {
  const lines: string[] = [];

  // Listing Owner — MUST match the Listing Instructor in AI Notes
  if (context?.listingOwner) {
    const ownerDisplay = context.listingOwnerName
      ? `${context.listingOwnerName} (${context.listingOwner})`
      : context.listingOwner;
    lines.push(`Listing Owner: ${ownerDisplay}`);
  }

  // Google Maps link — ONLY if locationUrl is actually a Google Maps link.
  // Bank-portal URLs (altamira/altia/remu/gogordian) belong in Own Reference ID,
  // not My notes. Bazaraki URLs likewise stay out of notes.
  const looksLikeMapsUrl =
    !!context?.locationUrl &&
    /google\.(?:com|gr|com\.cy)\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(
      context.locationUrl
    );
  if (looksLikeMapsUrl) {
    lines.push(context!.locationUrl as string);
  } else if (context?.coordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${context.coordinates.lat},${context.coordinates.lon}`;
    lines.push(mapsUrl);
  }

  // Special instructions / agent notes (important for reviewers to see in back office)
  if (_owner.specialNotes) {
    lines.push("");
    lines.push(`Agent Notes: ${_owner.specialNotes}`);
  }

  // Duplicate warning (important for reviewers)
  if (context?.duplicateWarning) {
    lines.push("");
    lines.push(`POTENTIAL DUPLICATE: ${context.duplicateWarning}`);
  }

  return lines.join("\n");
}

/**
 * Generate AI Assistant Notes for the listing
 * This is a separate field (field_ai_message) that captures special instructions
 * Format: Listing Instructor, Google Maps link, then special instructions
 */
export function generateAIAssistantNotes(
  _requestSummary: string,
  _propertyType: string,
  _keyFeatures: string[],
  specialInstructions?: string,
  locationUrl?: string,
  coordinates?: { lat: number; lon: number },
  listingInstructor?: { name: string; email: string }
): string {
  const lines: string[] = [];

  // Listing Instructor — matches Listing Owner in My Notes
  if (listingInstructor) {
    lines.push(
      `Listing Instructor: ${listingInstructor.name} (${listingInstructor.email})`
    );
  }

  // Google Maps link — same filter as generateMyNotes. Bank-portal URLs do
  // not belong in AI Notes; they go to Own Reference ID.
  const looksLikeMapsUrl =
    !!locationUrl &&
    /google\.(?:com|gr|com\.cy)\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(
      locationUrl
    );
  if (looksLikeMapsUrl) {
    lines.push(locationUrl as string);
  } else if (coordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${coordinates.lat},${coordinates.lon}`;
    lines.push(mapsUrl);
  }

  // Special instructions / agent notes
  if (specialInstructions) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(specialInstructions);
  }

  return lines.join("\n");
}

/**
 * Parse owner details from a text message
 * Attempts to extract name, phone, and email from free-form text
 */
export function parseOwnerDetails(text: string): Partial<OwnerInfo> {
  const result: Partial<OwnerInfo> = {};

  // Try to find phone number
  const phoneMatch = text.match(
    /(?:\+357|00357|357)?[\s.-]?(?:9[0-9]|7[0-9])[\s.-]?\d{3}[\s.-]?\d{3}/
  );
  if (phoneMatch) {
    result.phone = phoneMatch[0].replace(/[\s.-]/g, "");
  }

  // Try to find email
  const emailMatch = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  if (emailMatch) {
    result.email = emailMatch[0].toLowerCase();
  }

  // Name is harder - look for common patterns
  const namePatterns = [
    /owner(?:'s)?(?:\s+name)?(?:\s*[:-])?\s*([A-Za-z]+(?:\s+[A-Za-z]+)+)/i,
    /name(?:\s*[:-])?\s*([A-Za-z]+(?:\s+[A-Za-z]+)+)/i,
    /(?:mr|mrs|ms|miss)\.?\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.name = match[1].trim();
      break;
    }
  }

  return result;
}
