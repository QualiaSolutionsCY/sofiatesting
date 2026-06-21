import type {
  DeliveryChannel,
  DeliveryEventStatus,
  DeliveryQueueStatus,
  DeliveryTarget,
  IntegrationProvider,
  InvoiceActionType,
} from "@/lib/invoices/types/integrations";

export type IntegrationDeliveryPayload = {
  documentId: string;
  documentKind: "invoice" | "credit-note" | "receipt";
  actionType: InvoiceActionType;
  target: DeliveryTarget;
  channel: DeliveryChannel;
  provider: IntegrationProvider;
  subject?: string;
  messageText: string;
  attachmentFilename: string;
  to?: string;
  cc?: string;
  context: Record<string, string | number | boolean | null | undefined>;
};

export type ManualProviderRequest = {
  queueItemId: string;
  payload: IntegrationDeliveryPayload;
};

export type ManualProviderResult = {
  provider: IntegrationProvider;
  providerMessageId: string;
  queueStatus: DeliveryQueueStatus;
  deliveryStatus: DeliveryEventStatus;
  rawResponse: Record<string, string | number | boolean>;
};
