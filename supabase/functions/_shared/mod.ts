/**
 * SOPHIA Shared Module
 *
 * Barrel export for all shared functionality used across channels.
 * Import from this file: import { ... } from "../_shared/mod.ts"
 */

// Types
export type {
  Agent,
  ChannelType,
  ChatMessage,
  ToolCall,
  ToolResult,
  UnifiedMessage,
  UnifiedResponse,
} from "./adapters/types.ts";
// Calculators
export {
  type CalculatorResult,
  calculateCapitalGains,
  calculateTransferFees,
  calculateVAT,
} from "./calculators.ts";
// Database
export {
  addMessage,
  claimMessageForProcessing,
  getHistory,
  getSupabaseAdmin,
  isMessageProcessed,
  markMessageProcessed,
} from "./db.ts";
// Prompts
export { SYSTEM_PROMPT, ZYPRUS_LOGO_BASE64 } from "./prompts.ts";
// Services
export {
  // Description Generation
  generateDescription,
  generateImageWarnings,
  generateTitle,
  getMinimumImageCount,
  getOrderedImageUrls,
  hasEnoughImages,
  type ImageClassification,
  isUrlSafe,
  type ProcessedImage,
  type PropertyDetails,
  // Image Handling
  processImages,
  type UrlValidationResult,
  // URL Validation
  validateExternalUrl,
  validateImages,
  validateImageUrl,
} from "./services.ts";
// Tools
export {
  getToolByName,
  getToolDefinitions,
  handleCalculateCapitalGains,
  handleCalculateTransferFees,
  handleCalculateVAT,
  TOOLS,
  type ToolCall as ToolCallType,
  type ToolDefinition,
} from "./tools.ts";
// Zyprus API
export {
  type CreateResult,
  createDraftListing,
  findFeatureUuids,
  findIndoorFeatureUuids,
  findListingTypeUuid,
  findLocationUuid,
  findOutdoorFeatureUuids,
  findPriceModifierUuid,
  findPropertyTypeUuid,
  findPropertyViewUuids,
  findTitleDeedUuid,
  findUserUuid,
  findUserUuids,
  getAccessToken,
  getLocationsByRegion,
  getZyprusConfig,
  type ListingData,
  loadTaxonomy,
  searchProperties,
  type TaxonomyCache,
  type TaxonomyItem,
  type TokenCache,
  type UserItem,
  type ZyprusConfig,
} from "./zyprus.ts";
