/**
 * Templates Module - Barrel Export
 *
 * This is the main entry point for all template-related functionality.
 * Import from here instead of individual files.
 */

// Registry exports
export {
  TEMPLATE_REGISTRY,
  TEMPLATE_CATEGORIES,
  DOCX_TEMPLATE_TITLES,
  DOCX_TEMPLATE_IDS,
  getTemplateOutputType,
  isDocxTemplateId,
  isDocxTemplateTitle,
  extractTemplateTitle,
  findTemplateByAlias,
  getTemplateById,
  getTemplatesByOutputType,
  getDocxTemplates,
  getTextTemplates,
  type TemplateOutputType,
  type TemplateCategory,
  type TemplateDefinition,
} from "./registry.ts";

// Field exports
export {
  FIELD_DEFINITIONS,
  getFieldDefinition,
  validateField,
  generateFieldPrompt,
  getRequiredFields,
  getOptionalFields,
  hasAllRequiredFields,
  getMissingFields,
  type FieldType,
  type FieldDefinition,
} from "./fields.ts";

// Detection exports
export {
  isCompletedReservationAgreement,
  isCompletedViewingForm,
  isCompletedMarketingAgreement,
  isClarificationQuestion,
  isConfirmationMessage,
  containsPlaceholders,
  shouldSendAsDocx,
  detectDocxTemplateType,
  detectTemplateTypeFromMessage,
  wasDocxTemplateRequested,
  type DocxTemplateType,
} from "./detection.ts";
