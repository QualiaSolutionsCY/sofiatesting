/**
 * DOCX Templates Index
 * 
 * Exports all DOCX template creators and parsers.
 */

// Viewing Forms
export {
  createViewingFormSingle,
  parseViewingFormSingleData,
  type ViewingFormSingleData,
} from "./viewing-form-single.ts";

export {
  createViewingFormMultiple,
  parseViewingFormMultipleData,
  type ViewingFormMultipleData,
  type PersonData,
} from "./viewing-form-multiple.ts";

export {
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./viewing-form-advanced.ts";

// Reservation Agreement
export {
  createReservationAgreement,
  parseReservationAgreementData,
  type ReservationAgreementData,
  type BuyerInfo,
  type VendorInfo,
  type PropertyInfo,
  type FinancialTerms,
  ZYPRUS_DEFAULTS,
} from "./reservation-agreement.ts";

