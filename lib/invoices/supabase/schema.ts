import type {
  ApprovalStatus,
  DocumentKind,
  PaymentStatus,
  Recurrence,
  StorageStatus,
  VatMode,
  WhatsappStatus
} from "@/lib/invoices/types/invoice";

export const SUPABASE_TABLES = {
  accessUsers: "invoice_access_users",
  documents: "invoice_documents",
  revisions: "invoice_document_revisions",
  approvals: "invoice_approvals",
  payments: "invoice_payments",
  storageObjects: "invoice_storage_objects",
  messageEvents: "invoice_message_events",
  actionQueue: "invoice_action_queue",
  deliveryEvents: "invoice_delivery_events",
  webhookEvents: "invoice_webhook_events",
  providerAccounts: "integration_provider_accounts"
} as const;

export const SUPABASE_BUCKETS = {
  invoices: process.env.SUPABASE_INVOICE_BUCKET ?? "invoices"
} as const;

export const GENERATED_DOCUMENT_PREFIX = "generated";

export const DOCUMENT_KIND_VALUES = ["invoice", "credit-note", "receipt"] as const satisfies readonly DocumentKind[];
export const APPROVAL_STATUS_VALUES = [
  "draft",
  "sent-to-marios",
  "approved",
  "numbered",
  "sent-to-accounting",
  "correction-needed",
  "corrected-resend",
  "cancelled",
  "credited"
] as const satisfies readonly ApprovalStatus[];
export const PAYMENT_STATUS_VALUES = ["not-required", "unpaid", "paid"] as const satisfies readonly PaymentStatus[];
export const RECURRENCE_VALUES = ["none", "monthly", "yearly"] as const satisfies readonly Recurrence[];
export const VAT_MODE_VALUES = ["plus-vat", "included-vat", "no-vat"] as const satisfies readonly VatMode[];
export const STORAGE_STATUS_VALUES = [
  "not-generated",
  "stored",
  "needs-regeneration"
] as const satisfies readonly StorageStatus[];
export const WHATSAPP_STATUS_VALUES = ["planned", "queued", "sent", "blocked"] as const satisfies readonly WhatsappStatus[];

export const ACCESS_ROLE_VALUES = ["owner", "finance", "operations"] as const;
export const MESSAGE_TARGET_VALUES = ["marios", "accounting-group"] as const;
export const MESSAGE_STATUS_VALUES = ["planned", "queued", "sent", "blocked"] as const;

export const INVOICE_ACTION_TYPE_VALUES = [
  "send-draft-to-marios",
  "send-final-to-client",
  "send-accounting-copy",
  "send-corrected-resend",
  "send-credit-note",
  "send-receipt",
  "send-review-reminder"
] as const;
export const DELIVERY_CHANNEL_VALUES = ["whatsapp", "email", "manual"] as const;
export const DELIVERY_TARGET_VALUES = ["marios", "client", "accounting-group", "internal-ops"] as const;
export const INTEGRATION_PROVIDER_VALUES = ["manual", "whatsapp", "email"] as const;
export const ACTION_QUEUE_STATUS_VALUES = [
  "queued",
  "processing",
  "sent",
  "failed",
  "cancelled"
] as const;
export const DELIVERY_EVENT_STATUS_VALUES = [
  "pending",
  "manual-copy-ready",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled"
] as const;
export const WEBHOOK_SIGNATURE_STATUS_VALUES = ["not-required", "unverified", "verified", "failed"] as const;
export const WEBHOOK_PROCESSING_STATUS_VALUES = ["received", "processed", "ignored", "failed"] as const;
export const WEBHOOK_EVENT_TYPE_VALUES = [
  "delivery-status",
  "inbound-message",
  "approval-reply",
  "unknown"
] as const;
