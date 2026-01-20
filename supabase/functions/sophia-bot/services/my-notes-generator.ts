/**
 * My Notes Generator
 * Creates back-office notes for property listings
 *
 * My Notes are internal notes visible only to Zyprus staff,
 * containing owner contact details and agent information.
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
}

/**
 * Format phone number for display
 */
function formatPhone(phone: string): string {
  // Already formatted
  if (phone.includes(" ") || phone.startsWith("+357")) {
    return phone;
  }

  // Add Cyprus country code if missing
  let formatted = phone.replace(/\D/g, "");

  if (formatted.startsWith("357")) {
    formatted = "+" + formatted;
  } else if (formatted.startsWith("9") || formatted.startsWith("7")) {
    formatted = "+357" + formatted;
  } else if (!formatted.startsWith("+")) {
    formatted = "+357" + formatted;
  }

  // Format: +357 99 123456
  if (formatted.length >= 12) {
    return (
      formatted.slice(0, 4) +
      " " +
      formatted.slice(4, 6) +
      " " +
      formatted.slice(6)
    );
  }

  return formatted;
}

/**
 * Generate My Notes content for a property listing
 *
 * Format:
 * Owner: [Name]
 * Tel: [Phone]
 * Agent: [Agent Name]
 * [Optional: Registration Number]
 * [Optional: Notes]
 */
export function generateMyNotes(
  owner: OwnerInfo,
  agent: Agent,
  context?: ListingContext
): string {
  const lines: string[] = [];

  // Owner information
  lines.push(`Owner: ${owner.name}`);
  lines.push(`Tel: ${formatPhone(owner.phone)}`);

  if (owner.email) {
    lines.push(`Email: ${owner.email}`);
  }

  // Agent information
  lines.push(`Agent: ${agent.fullName}`);

  // Registration number if provided
  if (context?.registrationNumber) {
    lines.push(`Reg: ${context.registrationNumber}`);
  }

  // Source if provided
  if (context?.source) {
    lines.push(`Source: ${context.source}`);
  }

  // Duplicate warning (important for reviewers)
  if (context?.duplicateWarning) {
    lines.push("");
    lines.push("⚠️ POTENTIAL DUPLICATE:");
    lines.push(context.duplicateWarning);
  }

  // Special notes from owner
  if (owner.specialNotes) {
    lines.push("");
    lines.push("Owner Notes:");
    lines.push(owner.specialNotes);
  }

  // Urgent notes
  if (context?.urgentNotes) {
    lines.push("");
    lines.push("⚡ URGENT:");
    lines.push(context.urgentNotes);
  }

  // Add timestamp
  lines.push("");
  lines.push(`Created via SOPHIA AI: ${new Date().toISOString().split("T")[0]}`);

  return lines.join("\n");
}

/**
 * Generate AI Assistant Notes for the listing
 * This is a separate field that captures the AI's understanding of the request
 */
export function generateAIAssistantNotes(
  requestSummary: string,
  propertyType: string,
  keyFeatures: string[],
  specialInstructions?: string
): string {
  const lines: string[] = [];

  lines.push("=== AI UPLOAD SUMMARY ===");
  lines.push("");
  lines.push(`Request: ${requestSummary}`);
  lines.push(`Property Type: ${propertyType}`);

  if (keyFeatures.length > 0) {
    lines.push(`Key Features: ${keyFeatures.join(", ")}`);
  }

  if (specialInstructions) {
    lines.push("");
    lines.push("Special Instructions:");
    lines.push(specialInstructions);
  }

  lines.push("");
  lines.push("---");
  lines.push("This listing was created by SOPHIA AI assistant.");
  lines.push("All details were extracted from WhatsApp conversation.");

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

