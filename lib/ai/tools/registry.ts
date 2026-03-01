import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import type { ChatMessage } from "@/lib/types";

import { calculateCapitalGainsTool } from "./calculate-capital-gains";
import { calculateTransferFeesTool } from "./calculate-transfer-fees";
import { calculateVATTool } from "./calculate-vat";
import { createLandListingTool } from "./create-land-listing";
import { createListingTool } from "./create-listing";
import { getZyprusDataTool } from "./get-zyprus-data";
import { listListingsTool } from "./list-listings";
import { requestSuggestions } from "./request-suggestions";
import { sendDocument } from "./send-document";
import { uploadLandListingTool } from "./upload-land-listing";
import { uploadListingTool } from "./upload-listing";

export function getToolConfig({
  session,
  dataStream,
}: {
  session?: Session | null;
  dataStream?: UIMessageStreamWriter<ChatMessage>;
} = {}) {
  const tools: Record<string, any> = {
    calculateCapitalGains: calculateCapitalGainsTool,
    calculateTransferFees: calculateTransferFeesTool,
    calculateVAT: calculateVATTool,
    createLandListing: createLandListingTool,
    createListing: createListingTool,
    getZyprusData: getZyprusDataTool,
    listListings: listListingsTool,
    uploadLandListing: uploadLandListingTool,
    uploadListing: uploadListingTool,
  };

  // Initialize dynamic tools if session/stream provided
  if (session && dataStream) {
    tools.requestSuggestions = requestSuggestions({ session, dataStream });
    tools.sendDocument = sendDocument({ session, dataStream });
  }

  return {
    tools,
    activeTools: Object.keys(tools),
  };
}

export function getTelegramToolConfig() {
  // Telegram has a limited set of tools (no UI streaming, no file generation forms)
  const tools = {
    calculateCapitalGains: calculateCapitalGainsTool,
    calculateTransferFees: calculateTransferFeesTool,
    calculateVAT: calculateVATTool,
    createLandListing: createLandListingTool,
    createListing: createListingTool,
    getZyprusData: getZyprusDataTool,
    listListings: listListingsTool,
    // Note: uploadListing deliberately NOT added - listings require reviewer approval
  };

  return {
    tools,
    activeTools: Object.keys(tools) as (keyof typeof tools)[],
  };
}
