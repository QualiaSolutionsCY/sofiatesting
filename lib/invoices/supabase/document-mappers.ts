import { getUnifiedFilename } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import { GENERATED_DOCUMENT_PREFIX, SUPABASE_BUCKETS } from "./schema";

export type InvoiceDocumentRowPayload = {
  external_id: string;
  kind: InvoiceDocument["kind"];
  client_name: string;
  client_email?: string;
  bill_to_label: string;
  description: string;
  amount: number;
  vat_mode: InvoiceDocument["vatMode"];
  vat_amount: number;
  total: number;
  currency: "EUR";
  issue_date: string;
  due_date?: string;
  recurrence: InvoiceDocument["recurrence"];
  draft_number: string;
  official_number?: string;
  official_number_pending_reason?: string;
  status: InvoiceDocument["status"];
  payment_status: InvoiceDocument["paymentStatus"];
  paid_at?: string;
  paid_amount?: number;
  receipt_number?: string;
  linked_credit_note_number?: string;
  source_invoice_number?: string;
  correction_reason?: string;
  commission_person_name?: string;
  requires_commission_person: boolean;
  storage_status: InvoiceDocument["storageStatus"];
  storage_path?: string;
  whatsapp_status: InvoiceDocument["whatsappStatus"];
  marios_review_phone: string;
  accounting_group_label: string;
  line_items: Array<{
    description: string;
    amount: number;
    vat_amount: number;
    total: number;
  }>;
  metadata: Record<string, string | number | boolean | null>;
  notes: string[];
};

export type InvoiceDocumentRow = InvoiceDocumentRowPayload & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type RevisionRowPayload = {
  document_external_id: string;
  revision_number: number;
  reason?: string;
  snapshot: InvoiceDocument;
  created_by: string;
};

export type ApprovalRowPayload = {
  document_external_id: string;
  event_label: string;
  event_status: InvoiceDocument["status"];
  official_number?: string;
  event_at: string;
};

export type PaymentRowPayload = {
  invoice_external_id: string;
  receipt_external_id?: string;
  paid_amount: number;
  paid_at: string;
  created_by: string;
};

export type StorageObjectRowPayload = {
  document_external_id: string;
  bucket: string;
  path: string;
  filename: string;
  content_type: "application/pdf";
  public_url?: string;
};

export type MessageEventRowPayload = {
  document_external_id: string;
  target: "marios" | "accounting-group";
  status: InvoiceDocument["whatsappStatus"];
  message_text: string;
  event_at: string;
};

export function toDocumentRow(
  document: InvoiceDocument
): InvoiceDocumentRowPayload {
  return {
    external_id: document.id,
    kind: document.kind,
    client_name: document.clientName,
    client_email: document.clientEmail,
    bill_to_label: document.billToLabel,
    description: document.description,
    amount: document.amount,
    vat_mode: document.vatMode,
    vat_amount: document.vatAmount,
    total: document.total,
    currency: document.currency,
    issue_date: document.issueDate,
    due_date: document.dueDate,
    recurrence: document.recurrence,
    draft_number: document.draftNumber,
    official_number: document.officialNumber,
    official_number_pending_reason: document.officialNumberPendingReason,
    status: document.status,
    payment_status: document.paymentStatus,
    paid_at: document.paidAt,
    paid_amount: document.paidAmount,
    receipt_number: document.receiptNumber,
    linked_credit_note_number: document.linkedCreditNoteNumber,
    source_invoice_number: document.sourceInvoiceNumber,
    correction_reason: document.correctionReason,
    commission_person_name: document.commissionPersonName,
    requires_commission_person: document.requiresCommissionPerson,
    storage_status: document.storageStatus,
    storage_path: document.storagePath,
    whatsapp_status: document.whatsappStatus,
    marios_review_phone: document.mariosReviewPhone,
    accounting_group_label: document.accountingGroupLabel,
    line_items: [
      {
        description: document.description,
        amount: document.amount,
        vat_amount: document.vatAmount,
        total: document.total,
      },
    ],
    metadata: {
      bill_to_label: document.billToLabel,
      display_number: document.officialNumber ?? document.draftNumber,
      source_invoice_number: document.sourceInvoiceNumber ?? null,
      requires_commission_person: document.requiresCommissionPerson,
      recurrence_day: document.recurrenceDay ?? null,
      document_label: document.label ?? null,
    },
    notes: document.notes,
  };
}

export function fromDocumentRow(row: InvoiceDocumentRow): InvoiceDocument {
  return {
    id: row.external_id,
    kind: row.kind,
    clientName: row.client_name,
    clientEmail: row.client_email,
    billToLabel: row.bill_to_label,
    description: row.description,
    amount: Number(row.amount),
    vatMode: row.vat_mode,
    vatAmount: Number(row.vat_amount),
    total: Number(row.total),
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    recurrence: row.recurrence,
    recurrenceDay:
      typeof row.metadata?.recurrence_day === "number"
        ? row.metadata.recurrence_day
        : undefined,
    label:
      row.metadata?.document_label === "valuation" ? "valuation" : undefined,
    draftNumber: row.draft_number,
    officialNumber: row.official_number,
    officialNumberPendingReason: row.official_number_pending_reason,
    status: row.status,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    paidAmount:
      row.paid_amount === undefined ? undefined : Number(row.paid_amount),
    receiptNumber: row.receipt_number,
    linkedCreditNoteNumber: row.linked_credit_note_number,
    sourceInvoiceNumber: row.source_invoice_number,
    correctionReason: row.correction_reason,
    commissionPersonName: row.commission_person_name,
    requiresCommissionPerson: row.requires_commission_person,
    storageStatus: row.storage_status,
    storagePath: row.storage_path,
    whatsappStatus: row.whatsapp_status,
    mariosReviewPhone: row.marios_review_phone,
    accountingGroupLabel: row.accounting_group_label,
    approvalTimeline: [
      {
        label: "Loaded from Supabase document row",
        at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
        by: "Sophia",
      },
    ],
    notes: row.notes ?? [],
  };
}

export function toRevisionRow(
  document: InvoiceDocument,
  revisionNumber: number,
  reason = document.correctionReason
): RevisionRowPayload {
  return {
    document_external_id: document.id,
    revision_number: revisionNumber,
    reason,
    snapshot: document,
    created_by: latestActor(document),
  };
}

export function toApprovalRows(
  document: InvoiceDocument
): ApprovalRowPayload[] {
  return document.approvalTimeline.map((event) => ({
    document_external_id: document.id,
    event_label: event.label,
    event_status: document.status,
    official_number: document.officialNumber,
    event_at: event.at,
  }));
}

export function toPaymentRow(
  invoice: InvoiceDocument,
  receipt?: InvoiceDocument
): PaymentRowPayload | null {
  if (
    invoice.paymentStatus !== "paid" ||
    !invoice.paidAt ||
    !invoice.paidAmount
  )
    return null;

  return {
    invoice_external_id: invoice.id,
    receipt_external_id: receipt?.id,
    paid_amount: invoice.paidAmount,
    paid_at: invoice.paidAt,
    created_by: latestActor(invoice),
  };
}

export function toStorageObjectRow(
  document: InvoiceDocument
): StorageObjectRowPayload {
  const filename = getUnifiedFilename(document);
  return {
    document_external_id: document.id,
    bucket: SUPABASE_BUCKETS.invoices,
    path: document.storagePath ?? `${GENERATED_DOCUMENT_PREFIX}/${filename}`,
    filename,
    content_type: "application/pdf",
  };
}

export function toMessageEventRows(
  document: InvoiceDocument
): MessageEventRowPayload[] {
  const eventAt = document.approvalTimeline.at(-1)?.at ?? document.issueDate;
  return [
    {
      document_external_id: document.id,
      target: "marios",
      status: document.whatsappStatus,
      message_text: `Review ${getUnifiedFilename(document)}`,
      event_at: eventAt,
    },
    {
      document_external_id: document.id,
      target: "accounting-group",
      status: document.whatsappStatus,
      message_text: `File ${getUnifiedFilename(document)} for accounting.`,
      event_at: eventAt,
    },
  ];
}

function latestActor(document: InvoiceDocument) {
  return document.approvalTimeline.at(-1)?.by ?? "Sophia";
}
