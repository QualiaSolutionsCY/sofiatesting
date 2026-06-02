import type {
  ACTION_QUEUE_STATUS_VALUES,
  DELIVERY_CHANNEL_VALUES,
  DELIVERY_EVENT_STATUS_VALUES,
  DELIVERY_TARGET_VALUES,
  INTEGRATION_PROVIDER_VALUES,
  INVOICE_ACTION_TYPE_VALUES,
  WEBHOOK_EVENT_TYPE_VALUES,
  WEBHOOK_PROCESSING_STATUS_VALUES,
  WEBHOOK_SIGNATURE_STATUS_VALUES
} from "@/lib/invoices/supabase/schema";

type TupleValue<T extends readonly string[]> = T[number];

export type InvoiceActionType = TupleValue<typeof INVOICE_ACTION_TYPE_VALUES>;
export type DeliveryChannel = TupleValue<typeof DELIVERY_CHANNEL_VALUES>;
export type DeliveryTarget = TupleValue<typeof DELIVERY_TARGET_VALUES>;
export type IntegrationProvider = TupleValue<typeof INTEGRATION_PROVIDER_VALUES>;
export type DeliveryQueueStatus = TupleValue<typeof ACTION_QUEUE_STATUS_VALUES>;
export type DeliveryEventStatus = TupleValue<typeof DELIVERY_EVENT_STATUS_VALUES>;
export type WebhookSignatureStatus = TupleValue<typeof WEBHOOK_SIGNATURE_STATUS_VALUES>;
export type WebhookProcessingStatus = TupleValue<typeof WEBHOOK_PROCESSING_STATUS_VALUES>;
export type WebhookEventType = TupleValue<typeof WEBHOOK_EVENT_TYPE_VALUES>;
