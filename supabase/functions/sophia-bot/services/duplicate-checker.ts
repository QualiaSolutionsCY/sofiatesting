/**
 * Duplicate Detection Service
 * Checks if a property might already exist in the system
 */

import { normalizePhone } from "../agents/identifier.ts";

export interface DuplicateMatch {
  id: string;
  url: string;
  matchReason: "phone" | "name" | "address" | "combined";
  confidence: "high" | "medium" | "low";
  propertyType?: string;
  location?: string;
}

export interface DuplicateResult {
  isDuplicate: boolean;
  potentialMatches: DuplicateMatch[];
}

/**
 * Normalize a name for comparison
 * Removes titles, extra spaces, converts to lowercase
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|dr|prof)\.?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check for potential duplicates using Zyprus API search
 *
 * Search strategy:
 * 1. Phone number match (highest confidence)
 * 2. Owner name match in same location (medium confidence)
 * 3. Exact address match (high confidence)
 */
export async function checkForDuplicates(
  ownerPhone: string,
  ownerName: string,
  location: string,
  zyprusApiUrl: string,
  accessToken: string
): Promise<DuplicateResult> {
  const matches: DuplicateMatch[] = [];
  const normalizedPhone = normalizePhone(ownerPhone);
  const normalizedName = normalizeName(ownerName);

  try {
    // Search by phone number (most reliable)
    const phoneMatches = await searchByPhone(
      normalizedPhone,
      zyprusApiUrl,
      accessToken
    );
    for (const match of phoneMatches) {
      matches.push({
        ...match,
        matchReason: "phone",
        confidence: "high",
      });
    }

    // Search by owner name + location
    const nameMatches = await searchByNameAndLocation(
      normalizedName,
      location,
      zyprusApiUrl,
      accessToken
    );
    for (const match of nameMatches) {
      // Skip if already found by phone
      if (matches.some((m) => m.id === match.id)) {
        continue;
      }
      matches.push({
        ...match,
        matchReason: "name",
        confidence: "medium",
      });
    }
  } catch (error) {
    console.error("[DuplicateChecker] Search error:", error);
    // Don't fail the upload if duplicate check fails
    // Just log and continue
  }

  return {
    isDuplicate: matches.length > 0,
    potentialMatches: matches,
  };
}

/**
 * Search Zyprus for properties with matching owner phone
 */
async function searchByPhone(
  phone: string,
  zyprusApiUrl: string,
  accessToken: string
): Promise<Omit<DuplicateMatch, "matchReason" | "confidence">[]> {
  // The last 8 digits are the most reliable for matching Cyprus numbers
  const searchPhone = phone.slice(-8);

  try {
    const response = await fetch(
      `${zyprusApiUrl}/jsonapi/node/property?filter[field_my_notes][operator]=CONTAINS&filter[field_my_notes][value]=${searchPhone}&page[limit]=5`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.api+json",
          "User-Agent": "SophiaAI",
        },
      }
    );

    if (!response.ok) {
      console.log("[DuplicateChecker] Phone search failed:", response.status);
      return [];
    }

    const data = await response.json();
    return (data.data || []).map((item: Record<string, unknown>) => ({
      id: item.id as string,
      url: `https://zyprus.com/property/${item.id}`,
      propertyType: ((item.attributes as Record<string, unknown>)?.field_property_type as string) || undefined,
      location: ((item.attributes as Record<string, unknown>)?.field_location as string) || undefined,
    }));
  } catch (error) {
    console.error("[DuplicateChecker] Phone search error:", error);
    return [];
  }
}

/**
 * Search Zyprus for properties with matching owner name and location
 */
async function searchByNameAndLocation(
  name: string,
  location: string,
  zyprusApiUrl: string,
  accessToken: string
): Promise<Omit<DuplicateMatch, "matchReason" | "confidence">[]> {
  // Normalize location for search
  const normalizedLocation = location.toLowerCase().trim();

  try {
    // Search in My Notes field for owner name
    const response = await fetch(
      `${zyprusApiUrl}/jsonapi/node/property?filter[name][operator]=CONTAINS&filter[name][value]=${encodeURIComponent(name)}&page[limit]=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.api+json",
          "User-Agent": "SophiaAI",
        },
      }
    );

    if (!response.ok) {
      console.log("[DuplicateChecker] Name search failed:", response.status);
      return [];
    }

    const data = await response.json();

    // Filter by location match
    return (data.data || [])
      .filter((item: Record<string, unknown>) => {
        const attrs = item.attributes as Record<string, unknown>;
        const itemLocation = ((attrs?.field_location as string) || "").toLowerCase();
        return itemLocation.includes(normalizedLocation) || normalizedLocation.includes(itemLocation);
      })
      .map((item: Record<string, unknown>) => ({
        id: item.id as string,
        url: `https://zyprus.com/property/${item.id}`,
        propertyType: ((item.attributes as Record<string, unknown>)?.field_property_type as string) || undefined,
        location: ((item.attributes as Record<string, unknown>)?.field_location as string) || undefined,
      }));
  } catch (error) {
    console.error("[DuplicateChecker] Name search error:", error);
    return [];
  }
}

/**
 * Generate a warning message for potential duplicates
 */
export function generateDuplicateWarning(
  matches: DuplicateMatch[]
): string {
  if (matches.length === 0) {
    return "";
  }

  const highConfidence = matches.filter((m) => m.confidence === "high");
  const otherMatches = matches.filter((m) => m.confidence !== "high");

  let message = "⚠️ **Potential Duplicate Warning**\n\n";

  if (highConfidence.length > 0) {
    message += "I found existing properties that may be duplicates:\n\n";
    for (const match of highConfidence) {
      message += `• **${match.matchReason === "phone" ? "Same owner phone" : "Matching address"}**\n`;
      message += `  ID: ${match.id}\n`;
      if (match.location) {
        message += `  Location: ${match.location}\n`;
      }
      message += `  ${match.url}\n\n`;
    }
  }

  if (otherMatches.length > 0) {
    message += "Other possible matches:\n\n";
    for (const match of otherMatches) {
      message += `• Similar owner name in ${match.location || "same area"}\n`;
      message += `  ${match.url}\n\n`;
    }
  }

  message +=
    "Please verify these are not duplicates before publishing. " +
    "The reviewer will also check this.";

  return message;
}

/**
 * Create AI notes about potential duplicates for the listing
 */
export function createDuplicateNote(matches: DuplicateMatch[]): string {
  if (matches.length === 0) {
    return "";
  }

  const ids = matches.map((m) => m.id).join(", ");
  return `POTENTIAL DUPLICATE: Check against property IDs: ${ids}`;
}

