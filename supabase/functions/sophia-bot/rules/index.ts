/**
 * Rules Module - Barrel Export
 *
 * This is the main entry point for all business rules.
 * Import from here instead of individual files.
 */

// Bank detection exports
export {
  BANK_DETECTION_PROMPT,
  BANK_URL_PATTERNS,
  type BankName,
  detectBankFromUrl,
  getSupportedBanks,
  isBankPropertyUrl,
  isValidBankName,
  VALID_BANK_NAMES,
} from "./bank-detection.ts";
// Email format exports
export {
  EMAIL_FORMAT_PROMPT,
  EMAIL_FORMAT_PROMPT_SHORT,
  type EmailParts,
  isEmailTemplate,
  parseEmailParts,
  splitEmailIntoMessages,
} from "./email-format.ts";
// Phone masking exports
export {
  maskEmailForLogging,
  maskPhoneNumber,
  maskPhoneNumberWithPrefix,
  PHONE_MASKING_PROMPT,
  PHONE_MASKING_PROMPT_SHORT,
  shouldMaskPhone,
} from "./phone-masking.ts";
