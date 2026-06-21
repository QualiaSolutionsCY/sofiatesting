import type {
  DeliveryChannel,
  DeliveryEventStatus,
  DeliveryQueueStatus,
  DeliveryTarget,
  IntegrationProvider,
  InvoiceActionType,
} from "./integrations";

export type DeliveryRecord = {
  queueItemId: string;
  documentId: string;
  actionType: InvoiceActionType;
  target: DeliveryTarget;
  channel: DeliveryChannel;
  provider: IntegrationProvider;
  queueStatus: DeliveryQueueStatus;
  deliveryStatus: DeliveryEventStatus;
  providerMessageId?: string;
  attempts: number;
  errorMessage?: string;
  messageText: string;
  subject?: string;
  attachmentFilename: string;
  createdAt: string;
  updatedAt?: string;
};
