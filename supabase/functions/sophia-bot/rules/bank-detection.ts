/**
 * Bank Detection Rules - Single Source of Truth
 *
 * Detects bank names from property URLs.
 * This resolves the conflict between content.ts and document-routing.ts
 * which had different domain lists.
 *
 * ALL bank detection should import from here.
 */

/**
 * Bank URL pattern definition
 */
interface BankUrlPattern {
  pattern: RegExp;
  bank: string;
}

/**
 * Comprehensive list of bank property website patterns
 * INCLUDES ALL DOMAINS from both content.ts and document-routing.ts
 */
export const BANK_URL_PATTERNS: BankUrlPattern[] = [
  // REMU - both domains are valid
  { pattern: /remuproperties\.com/i, bank: "REMU" },
  { pattern: /remu\.com\.cy/i, bank: "REMU" },

  // Altamira - both domains are valid
  { pattern: /altamira-amc\.com/i, bank: "Altamira" },
  { pattern: /altamira-npl\.com/i, bank: "Altamira" },

  // Gordian - both domains are valid
  { pattern: /gogordian\.com/i, bank: "Gordian" },
  { pattern: /gordian\.com\.cy/i, bank: "Gordian" },

  // Bank of Cyprus
  { pattern: /bankofcyprus\.com/i, bank: "Bank of Cyprus" },
  { pattern: /boc\.com\.cy/i, bank: "Bank of Cyprus" },

  // Hellenic Bank
  { pattern: /hellenic-bank\.com/i, bank: "Hellenic Bank" },
  { pattern: /hellenicbank\.com/i, bank: "Hellenic Bank" },
];

/**
 * Bank names for validation
 */
export const VALID_BANK_NAMES = [
  "REMU",
  "Altamira",
  "Gordian",
  "Bank of Cyprus",
  "Hellenic Bank",
] as const;

export type BankName = (typeof VALID_BANK_NAMES)[number];

/**
 * Detect bank from a property URL
 *
 * @param url - The property URL to check
 * @returns The bank name if detected, null otherwise
 */
export function detectBankFromUrl(url: string): BankName | null {
  if (!url) return null;

  for (const { pattern, bank } of BANK_URL_PATTERNS) {
    if (pattern.test(url)) {
      return bank as BankName;
    }
  }

  return null;
}

/**
 * Check if a URL is from a known bank property website
 */
export function isBankPropertyUrl(url: string): boolean {
  return detectBankFromUrl(url) !== null;
}

/**
 * Validate if a string is a valid bank name
 */
export function isValidBankName(name: string): name is BankName {
  return VALID_BANK_NAMES.includes(name as BankName);
}

/**
 * Get all supported bank names
 */
export function getSupportedBanks(): readonly BankName[] {
  return VALID_BANK_NAMES;
}

/**
 * Bank detection prompt for AI
 * Use this in prompts instead of duplicating the patterns
 */
export const BANK_DETECTION_PROMPT = `Bank Detection from Link:
- remuproperties.com OR remu.com.cy → REMU
- altamira-amc.com OR altamira-npl.com → Altamira
- gogordian.com OR gordian.com.cy → Gordian
- bankofcyprus.com OR boc.com.cy → Bank of Cyprus
- hellenic-bank.com OR hellenicbank.com → Hellenic Bank
- If no link match, ask: "Which bank is this property with?"`;
