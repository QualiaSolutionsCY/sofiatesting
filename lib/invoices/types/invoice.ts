export type DocumentKind = "invoice" | "credit-note" | "receipt";

export type Recurrence = "none" | "monthly" | "yearly";

export type InvoicePeriod = Extract<Recurrence, "monthly" | "yearly">;

export type ApprovalStatus =
  | "draft"
  | "sent-to-marios"
  | "approved"
  | "numbered"
  | "sent-to-accounting"
  | "correction-needed"
  | "corrected-resend"
  | "cancelled"
  | "credited";

export type VatMode = "plus-vat" | "included-vat" | "no-vat";

export type StorageStatus = "not-generated" | "stored" | "needs-regeneration";

export type WhatsappStatus = "planned" | "queued" | "sent" | "blocked";

export type PaymentStatus = "not-required" | "unpaid" | "paid";

export type DocumentLabel = "valuation";

export type ApprovalEvent = {
  label: string;
  at: string;
  by: string;
};

export type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceDocument = {
  id: string;
  kind: DocumentKind;
  clientName: string;
  clientEmail?: string;
  billToLabel: string;
  description: string;
  amount: number;
  /** Per-line items. When present, the source of truth for the rows; `description`
   * + `amount` stay populated (joined / summed) for backward-compatible consumers. */
  lineItems?: LineItem[];
  vatMode: VatMode;
  vatAmount: number;
  total: number;
  currency: "EUR";
  issueDate: string;
  dueDate?: string;
  recurrence: Recurrence;
  recurrenceDay?: number;
  label?: DocumentLabel;
  draftNumber: string;
  officialNumber?: string;
  officialNumberPendingReason?: string;
  status: ApprovalStatus;
  paymentStatus: PaymentStatus;
  paidAt?: string;
  paidAmount?: number;
  receiptNumber?: string;
  linkedCreditNoteNumber?: string;
  sourceInvoiceNumber?: string;
  correctionReason?: string;
  commissionPersonName?: string;
  requiresCommissionPerson: boolean;
  storageStatus: StorageStatus;
  storagePath?: string;
  whatsappStatus: WhatsappStatus;
  mariosReviewPhone: string;
  accountingGroupLabel: string;
  approvalTimeline: ApprovalEvent[];
  notes: string[];
};

export type DocumentFilters = {
  kind: "all" | DocumentKind;
  status: "all" | ApprovalStatus;
  recurrence: "all" | Recurrence;
  paymentStatus: "all" | PaymentStatus;
  search: string;
  clientSearch: string;
  dateFrom: string;
  dateTo: string;
};

export type SummaryMetric = {
  label: string;
  value: string;
  tone: "neutral" | "attention" | "success" | "warning";
};
