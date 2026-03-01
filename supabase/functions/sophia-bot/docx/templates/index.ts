/**
 * DOCX Templates Index
 *
 * Exports all DOCX template creators and parsers.
 */

// Marketing Agreement (Non-Exclusive)
export {
  createBlankMarketingAgreementData,
  createMarketingAgreement,
  type MarketingAgreementData,
  parseMarketingAgreementData,
} from "./marketing-agreement.ts";
// Reservation Agreement
export {
  type BuyerInfo,
  createBlankReservationAgreementData,
  createReservationAgreement,
  type FinancialTerms,
  type PropertyInfo,
  parseReservationAgreementData,
  type ReservationAgreementData,
  type VendorInfo,
  ZYPRUS_DEFAULTS,
} from "./reservation-agreement.ts";

export {
  createBlankViewingFormAdvancedData,
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./viewing-form-advanced.ts";
export {
  createBlankViewingFormMultipleData,
  createViewingFormMultiple,
  type PersonData,
  parseViewingFormMultipleData,
  type ViewingFormMultipleData,
} from "./viewing-form-multiple.ts";
// Viewing Forms
export {
  createBlankViewingFormData,
  createViewingFormSingle,
  parseViewingFormSingleData,
  type ViewingFormSingleData,
} from "./viewing-form-single.ts";
