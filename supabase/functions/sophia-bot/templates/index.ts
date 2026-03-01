/**
 * Templates Module - Barrel Export
 *
 * This is the main entry point for all template-related functionality.
 * Import from here instead of individual files.
 */

// Detection exports
export {
  containsPlaceholders,
  type DocxTemplateType,
  detectDocxTemplateType,
  detectTemplateTypeFromMessage,
  isClarificationQuestion,
  isCompletedMarketingAgreement,
  isCompletedReservationAgreement,
  isCompletedViewingForm,
  isConfirmationMessage,
  shouldSendAsDocx,
  wasDocxTemplateRequested,
} from "./detection.ts";

// Field exports
export {
  FIELD_DEFINITIONS,
  type FieldDefinition,
  type FieldType,
  generateFieldPrompt,
  getFieldDefinition,
  getMissingFields,
  getOptionalFields,
  getRequiredFields,
  hasAllRequiredFields,
  validateField,
} from "./fields.ts";
// Registry exports
export {
  DOCX_TEMPLATE_IDS,
  DOCX_TEMPLATE_TITLES,
  extractTemplateTitle,
  findTemplateByAlias,
  getDocxTemplates,
  getTemplateById,
  getTemplateOutputType,
  getTemplatesByOutputType,
  getTextTemplates,
  isDocxTemplateId,
  isDocxTemplateTitle,
  TEMPLATE_CATEGORIES,
  TEMPLATE_REGISTRY,
  type TemplateCategory,
  type TemplateDefinition,
  type TemplateOutputType,
} from "./registry.ts";
