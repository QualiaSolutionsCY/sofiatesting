/**
 * DOCX Templates Index
 * 
 * Exports all DOCX template creators and parsers.
 */

// Viewing Forms
export {
  createViewingFormSingle,
  parseViewingFormSingleData,
  createBlankViewingFormData,
  type ViewingFormSingleData,
} from "./viewing-form-single.ts";

export {
  createViewingFormMultiple,
  parseViewingFormMultipleData,
  createBlankViewingFormMultipleData,
  type ViewingFormMultipleData,
  type PersonData,
} from "./viewing-form-multiple.ts";

export {
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  createBlankViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./viewing-form-advanced.ts";

// Reservation Agreement
export {
  createReservationAgreement,
  parseReservationAgreementData,
  createBlankReservationAgreementData,
  type ReservationAgreementData,
  type BuyerInfo,
  type VendorInfo,
  type PropertyInfo,
  type FinancialTerms,
  ZYPRUS_DEFAULTS,
} from "./reservation-agreement.ts";

// Marketing Agreement (Non-Exclusive)
export {
  createMarketingAgreement,
  parseMarketingAgreementData,
  createBlankMarketingAgreementData,
  type MarketingAgreementData,
} from "./marketing-agreement.ts";


