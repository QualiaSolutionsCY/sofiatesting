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
  issued: string;
  due?: string;
  paidOn?: string;
  period: string;
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
  stage: "all" | Stage;
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
  lines: Line[];
  description: string;
  recurrence: "none" | "monthly" | "yearly";
  commission: Commission | null;
  newClient: Client | null;
  editingId?: string;
  draftNo?: string | null;
  officialNo?: string | null;
  stage?: Stage;
  timeline?: TimelineEvent[];
  amount?: number;
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
  onConfirm?: () => void;
}
