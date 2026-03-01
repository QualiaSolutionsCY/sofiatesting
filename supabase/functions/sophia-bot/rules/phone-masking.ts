/**
 * Phone Masking Rules - Single Source of Truth
 *
 * Phone number masking for bank registrations.
 * This consolidates the phone masking rules that were duplicated
 * in 5+ locations across the codebase.
 *
 * ALL phone masking logic should import from here.
 */

/**
 * Mask a Cyprus phone number for bank registrations
 *
 * Format: XX**YYYY
 * - XX = first 2 digits (keep as-is)
 * - ** = TWO ASTERISK CHARACTERS (replacing digits 3-4)
 * - YYYY = last 4 digits (keep as-is)
 *
 * Example: 99123456 → 99**3456
 * Example: 96555444 → 96**5444
 *
 * @param phone - Phone number (with or without country code)
 * @returns Masked phone number
 */
export function maskPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, "");

  // Extract the 8-digit local number
  let localNumber: string;

  if (cleaned.startsWith("+357")) {
    localNumber = cleaned.substring(4);
  } else if (cleaned.startsWith("357")) {
    localNumber = cleaned.substring(3);
  } else if (cleaned.length === 8) {
    localNumber = cleaned;
  } else {
    // Unable to parse, return as-is
    return phone;
  }

  // Ensure we have exactly 8 digits
  if (localNumber.length !== 8) {
    return phone;
  }

  // Apply masking: XX**YYYY
  const firstTwo = localNumber.substring(0, 2);
  const lastFour = localNumber.substring(4, 8);

  return `${firstTwo}**${lastFour}`;
}

/**
 * Mask phone number with country code prefix
 *
 * @param phone - Phone number
 * @returns Masked phone with +357 prefix
 */
export function maskPhoneNumberWithPrefix(phone: string): string {
  const masked = maskPhoneNumber(phone);

  // If masking was applied (contains **), add prefix
  if (masked.includes("**")) {
    return `+357 ${masked}`;
  }

  // Return original if masking failed
  return phone;
}

/**
 * Check if a phone should be masked (client phones in bank registrations)
 * Agent phones should NEVER be masked
 *
 * @param context - 'client' or 'agent'
 * @returns true if phone should be masked
 */
export function shouldMaskPhone(context: "client" | "agent"): boolean {
  return context === "client";
}

/**
 * Phone masking prompt for AI
 * Use this constant in prompts instead of duplicating the rules
 */
export const PHONE_MASKING_PROMPT = `**Phone Masking Rule (CRITICAL):**

MASKED PHONE FORMAT: +357 XX**YYYY

Where:
- XX = first 2 digits (keep as-is)
- ** = TWO ASTERISK CHARACTERS (the * symbol, typed twice)
- YYYY = last 4 digits (keep as-is)

CONSTRUCTION: Take 99123456, split into: 99 | 12 | 3456, output: 99 + * + * + 3456 = 99**3456

EXAMPLES:
- +357 99123456 → +357 99**3456 (nine nine STAR STAR three four five six)
- +357 99111668 → +357 99**1668 (nine nine STAR STAR one six six eight)
- +357 96555444 → +357 96**5444 (nine six STAR STAR five four four four)

COMMON MISTAKE: Writing 99*123456 (9 characters) instead of 99**3456 (8 characters)
The middle two digits DISAPPEAR and are REPLACED by two * symbols.

WHO TO MASK:
- MASK: Client phone number (under "Registration Details:")
- NEVER MASK: Agent phone number (under "My Mobile:")`;

/**
 * Short version of phone masking prompt for condensed contexts
 */
export const PHONE_MASKING_PROMPT_SHORT = `Phone masking: XX**YYYY (two digits, TWO asterisks, four digits)
Example: 99123456 → 99**3456
ONLY mask CLIENT phone, NEVER agent phone.`;

/**
 * Mask an email address for logging purposes (PII protection)
 *
 * Format: first char + *** + @domain
 * Example: john.doe@example.com → j***@example.com
 * Example: a@b.com → a***@b.com
 *
 * @param email - Email address to mask
 * @returns Masked email address
 */
export function maskEmailForLogging(email: string): string {
  if (!email || typeof email !== "string") {
    return "[invalid-email]";
  }

  const atIndex = email.indexOf("@");
  if (atIndex < 1) {
    // No @ or @ is first character - return masked
    return "[invalid-email]";
  }

  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex);

  // Keep first character, mask the rest of local part
  const firstChar = localPart.charAt(0);

  return `${firstChar}***${domainPart}`;
}
