/**
 * SOPHIA Shared Module
 *
 * Barrel export for all shared functionality used across channels.
 * Import from this file: import { ... } from "../_shared/mod.ts"
 */

// Types
export type {
  ChannelType,
  UnifiedMessage,
  UnifiedResponse,
  Agent,
  ToolCall,
  ToolResult,
  ChatMessage,
} from "./adapters/types.ts";

// Database
export {
  getSupabaseAdmin,
  getHistory,
  addMessage,
  claimMessageForProcessing,
  isMessageProcessed,
  markMessageProcessed,
} from "./db.ts";

// Zyprus API
export {
  getZyprusConfig,
  getAccessToken,
  createDraftListing,
  searchProperties,
  loadTaxonomy,
  findLocationUuid,
  findPropertyTypeUuid,
  findListingTypeUuid,
  findPriceModifierUuid,
  findTitleDeedUuid,
  findUserUuid,
  findUserUuids,
  findFeatureUuids,
  findIndoorFeatureUuids,
  findOutdoorFeatureUuids,
  findPropertyViewUuids,
  getLocationsByRegion,
  type ZyprusConfig,
  type TaxonomyItem,
  type TaxonomyCache,
  type ListingData,
  type CreateResult,
  type UserItem,
  type TokenCache,
} from "./zyprus.ts";

// Calculators
export {
  calculateVAT,
  calculateTransferFees,
  calculateCapitalGains,
  type CalculatorResult,
} from "./calculators.ts";

// Tools
export {
  TOOLS,
  getToolDefinitions,
  getToolByName,
  handleCalculateVAT,
  handleCalculateTransferFees,
  handleCalculateCapitalGains,
  type ToolDefinition,
  type ToolCall as ToolCallType,
} from "./tools.ts";

// Services
export {
  // URL Validation
  validateExternalUrl,
  validateImageUrl,
  isUrlSafe,
  type UrlValidationResult,
  // Image Handling
  processImages,
  validateImages,
  generateImageWarnings,
  getOrderedImageUrls,
  getMinimumImageCount,
  hasEnoughImages,
  type ProcessedImage,
  type ImageClassification,
  // Description Generation
  generateDescription,
  generateTitle,
  type PropertyDetails,
} from "./services.ts";

// Prompts
export { SYSTEM_PROMPT, ZYPRUS_LOGO_BASE64 } from "./prompts.ts";
