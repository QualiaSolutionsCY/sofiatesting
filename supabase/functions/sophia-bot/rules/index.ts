/**
 * Rules Module - Barrel Export
 *
 * This is the main entry point for all business rules.
 * Import from here instead of individual files.
 */

// Bank detection exports
export {
  BANK_URL_PATTERNS,
  VALID_BANK_NAMES,
  BANK_DETECTION_PROMPT,
  detectBankFromUrl,
  isBankPropertyUrl,
  isValidBankName,
  getSupportedBanks,
  type BankName,
} from "./bank-detection.ts";

// Phone masking exports
export {
  PHONE_MASKING_PROMPT,
  PHONE_MASKING_PROMPT_SHORT,
  maskPhoneNumber,
  maskPhoneNumberWithPrefix,
  shouldMaskPhone,
  maskEmailForLogging,
} from "./phone-masking.ts";

// Email format exports
export {
  EMAIL_FORMAT_PROMPT,
  EMAIL_FORMAT_PROMPT_SHORT,
  parseEmailParts,
  splitEmailIntoMessages,
  isEmailTemplate,
  type EmailParts,
} from "./email-format.ts";
