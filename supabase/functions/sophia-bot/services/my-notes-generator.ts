/**
 * My Notes Generator
 * Creates back-office notes for property listings
 *
 * My Notes contains only essential info for reviewers:
 * 1. Google Maps link (priority)
 * 2. Agent notes / special instructions
 */

import { Agent } from "../agents/identifier.ts";

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
 * 1. Google Maps link (priority — first line)
 * 2. Agent notes / special instructions (if any)
 * 3. Duplicate warning (if flagged)
 *
 * Keep it minimal — other details go in separate Zyprus fields.
 */
export function generateMyNotes(
  owner: OwnerInfo,
  _agent: Agent,
  context?: ListingContext
): string {
  const lines: string[] = [];

  // Google Maps link — always first (highest priority for reviewers)
  // Prefer the exact URL the agent provided; fall back to coordinates-based link
  if (context?.locationUrl) {
    lines.push(context.locationUrl);
  } else if (context?.coordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${context.coordinates.lat},${context.coordinates.lon}`;
    lines.push(mapsUrl);
  }

  // Agent notes / special instructions from the conversation
  if (owner.specialNotes) {
    lines.push(owner.specialNotes);
  }

  // Duplicate warning (important for reviewers)
  if (context?.duplicateWarning) {
    lines.push("");
    lines.push(`⚠️ POTENTIAL DUPLICATE: ${context.duplicateWarning}`);
  }

  return lines.join("\n");
}

/**
 * Generate AI Assistant Notes for the listing
 * This is a separate field (field_ai_message) that captures special instructions
 */
export function generateAIAssistantNotes(
  _requestSummary: string,
  _propertyType: string,
  _keyFeatures: string[],
  specialInstructions?: string
): string {
  // Only include special instructions / agent notes — nothing else
  return specialInstructions || "";
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
    /owner(?:'s)?(?:\s+name)?(?:\s*[:\-])?\s*([A-Za-z]+(?:\s+[A-Za-z]+)+)/i,
    /name(?:\s*[:\-])?\s*([A-Za-z]+(?:\s+[A-Za-z]+)+)/i,
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
