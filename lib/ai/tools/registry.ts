/**
 * Tool Registry - Single source of truth for all AI tools
 *
 * This eliminates the dual-registration requirement where tools needed to be
 * registered in both `experimental_activeTools` and `tools` objects.
 *
 * Usage:
 * ```typescript
 * import { getToolConfig, STATIC_TOOLS, ACTIVE_TOOL_NAMES } from "./registry";
 *
 * // In streamText:
 * const { tools, activeTools } = getToolConfig({ session, dataStream });
 * streamText({
 *   experimental_activeTools: activeTools,
 *   tools,
 *   // ...
 * })
 * ```
 */

import type { Session } from "next-auth";
import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "@/lib/types";

// Static tools (no runtime dependencies)
import { calculateCapitalGainsTool } from "./calculate-capital-gains";
import { calculateTransferFeesTool } from "./calculate-transfer-fees";
import { calculateVATTool } from "./calculate-vat";
import { createLandListingTool } from "./create-land-listing";
import { createListingTool } from "./create-listing";
import { getZyprusDataTool } from "./get-zyprus-data";
import { listListingsTool } from "./list-listings";
import { uploadLandListingTool } from "./upload-land-listing";
import { uploadListingTool } from "./upload-listing";
import { sendEmailTool } from "./send-email";

// Factory tools (require session/dataStream at runtime)
import { requestSuggestions } from "./request-suggestions";
import { sendDocument } from "./send-document";

/**
 * Static tools that don't require runtime dependencies
 * These can be imported and used directly
 */
export const STATIC_TOOLS = {
  calculateTransferFees: calculateTransferFeesTool,
  calculateCapitalGains: calculateCapitalGainsTool,
  calculateVAT: calculateVATTool,
  createListing: createListingTool,
  listListings: listListingsTool,
  uploadListing: uploadListingTool,
  createLandListing: createLandListingTool,
  uploadLandListing: uploadLandListingTool,
  getZyprusData: getZyprusDataTool,
  sendEmail: sendEmailTool,
} as const;

/**
 * Names of factory tools that need session/dataStream
 */
export const FACTORY_TOOL_NAMES = [
  "requestSuggestions",
  "sendDocument",
] as const;

/**
 * All active tool names for experimental_activeTools
 * This is the single source of truth - no more manual sync required
 */
export const ACTIVE_TOOL_NAMES = [
  ...Object.keys(STATIC_TOOLS),
  ...FACTORY_TOOL_NAMES,
] as const;

export type StaticToolName = keyof typeof STATIC_TOOLS;
export type FactoryToolName = (typeof FACTORY_TOOL_NAMES)[number];
export type ToolName = StaticToolName | FactoryToolName;

/**
 * Context required for factory tools
 */
type ToolContext = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * Get the complete tool configuration for streamText
 *
 * @param context - Session and dataStream for factory tools
 * @returns Object with tools and activeTools ready for streamText
 */
export const getToolConfig = (context: ToolContext) => {
  const tools = {
    ...STATIC_TOOLS,
    requestSuggestions: requestSuggestions(context),
    sendDocument: sendDocument(context),
  };

  // Return as tuple to preserve literal types
  return {
    tools,
    activeTools: ACTIVE_TOOL_NAMES as unknown as ToolName[],
  };
};

/**
 * Get tools for channels that don't support factory tools (WhatsApp/Telegram)
 * These channels use sendEmail instead of sendDocument
 */
export const getStaticToolsOnly = () => ({
  tools: STATIC_TOOLS,
  activeTools: Object.keys(STATIC_TOOLS) as StaticToolName[],
});

/**
 * Get tools for Telegram (subset - no upload tools as they require reviewer approval)
 */
export const getTelegramToolConfig = () => {
  const telegramTools = {
    calculateTransferFees: STATIC_TOOLS.calculateTransferFees,
    calculateCapitalGains: STATIC_TOOLS.calculateCapitalGains,
    calculateVAT: STATIC_TOOLS.calculateVAT,
    createListing: STATIC_TOOLS.createListing,
    getZyprusData: STATIC_TOOLS.getZyprusData,
  } as const;

  return {
    tools: telegramTools,
    activeTools: Object.keys(telegramTools) as (keyof typeof telegramTools)[],
  };
};

/**
 * Validate that all tool names in activeTools have corresponding implementations
 * Use this in tests to catch registration mismatches
 */
export const validateToolRegistry = (): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  const allToolNames = new Set([
    ...Object.keys(STATIC_TOOLS),
    ...FACTORY_TOOL_NAMES,
  ]);

  for (const name of ACTIVE_TOOL_NAMES) {
    if (!allToolNames.has(name)) {
      errors.push(`Tool "${name}" in ACTIVE_TOOL_NAMES has no implementation`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
