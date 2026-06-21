import type { ManualProviderRequest, ManualProviderResult } from "./types";

export async function deliverWithManualProvider(
  request: ManualProviderRequest
): Promise<ManualProviderResult> {
  const providerMessageId = [
    "manual",
    request.payload.channel,
    request.payload.actionType,
    request.queueItemId,
  ].join(":");

  return {
    provider: "manual",
    providerMessageId,
    queueStatus: "sent",
    deliveryStatus: "manual-copy-ready",
    rawResponse: {
      mode: "manual",
      channel: request.payload.channel,
      target: request.payload.target,
      copied: false,
    },
  };
}
