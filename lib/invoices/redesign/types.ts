export type Stage =
  | "draft"
  | "sent-to-marios"
  | "correction-needed"
  | "corrected-resend"
  | "approved"
  | "numbered"
  | "sent-to-accounting"
  | "credited"
  | "cancelled";

export type DocKind = "invoice" | "credit" | "receipt";

export type VatMode = "plus-vat" | "included-vat" | "no-vat";

export interface Line {
  desc: string;
  qty: number;
  unitPrice: number;
}

export interface TimelineEvent {
  at: string;
  who: string;
  what: string;
  body: string;
}

export interface Commission {
  agent: string;
  rate: string;
  amount: number;
}

export interface Correction {
  reason: string;
  at: string;
  from: string;
}

export interface Doc {
  id: string;
  kind: DocKind;
  stage: Stage;
  draftNo: string | null;
  officialNo: string | null;
  pdf?: string;
  client: string;
  // Recipient email the invoice is sent to (DocumentInput.clientEmail ->
  // InvoiceDocument.clientEmail). Set for any invoice now, not just recurring.
  clientEmail?: string;
  issued: string;
  due?: string;
  paidOn?: string;
  period: string;
  recurrence?: "none" | "monthly" | "yearly";
  vatRate: number;
  vatMode: VatMode;
  lines: Line[];
  total: number;
  description: string;
  commission?: Commission | null;
  correction?: Correction;
  receiptNo?: string;
  receiptPdf?: string;
  creditedBy?: string;
  appliesTo?: string;
  appliesToId?: string;
  timeline: TimelineEvent[];
  // Set when the document is soft-deleted (shown in the "Deleted" view, M4).
  deletedAt?: string;
}

export interface Client {
  id: string;
  name: string;
  property: string;
  address: string;
  vat: string;
}

export interface Filters {
  kind: "all" | DocKind;
  // "approved-numbered" is a merged filter that matches both Approved and Numbered docs.
  // "recurrence-monthly" / "recurrence-yearly" filter by the invoice's recurrence schedule.
  // "kind-receipt" filters to receipts only.
  stage: "all" | Stage | "approved-numbered" | "recurrence-monthly" | "recurrence-yearly" | "kind-receipt" | "deleted";
  q: string;
  from: string;
  to: string;
}

export interface RecurringRun {
  id: string;
  cadence: "Monthly" | "Yearly";
  nextRun: string;
  count: number;
  owners: string[];
  paused: boolean;
  lastRun: string;
  lastRunCount: number;
  lastRunIssued: number;
}

export interface StageDescriptor {
  id: Stage;
  label: string;
  chip: string;
}

export interface ComposerLine {
  key: number | string;
  desc: string;
  qty: number | string;
  unitPrice: number | string;
}

export interface ComposerForm {
  kind: DocKind;
  client: string;
  period: string;
  issued: string;
  due: string;
  vatRate: number;
  vatMode?: VatMode;
  lines: Line[];
  description: string;
  recurrence: "none" | "monthly" | "yearly";
  recurrenceEmail?: string;
  commission: Commission | null;
  newClient: Client | null;
  editingId?: string;
  draftNo?: string | null;
  officialNo?: string | null;
  stage?: Stage;
  timeline?: TimelineEvent[];
  amount?: number;
  // When kind === "receipt" or "credit", the existing invoice (Doc id) this
  // document is derived from. Receipts and credit notes are always issued
  // against a real invoice, never standalone.
  sourceInvoiceId?: string;
  // Reason for a credit note (sent to the accounting group with the credit note).
  creditReason?: string;
}

export interface PaletteItem {
  id: string;
  type: "doc" | "action";
  target?: string;
  action?: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

export interface ConfirmState {
  title: string;
  body: string;
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (reason?: string) => void;
  prompt?: { label: string; placeholder?: string; required?: boolean };
}
