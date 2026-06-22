import type { InvoiceDocument, InvoicePeriod, VatMode } from "@/lib/invoices/types/invoice";
import { createDraftNumber, officialNumberPlaceholder } from "@/lib/invoices/numbering";
import {
  isCommissionDescription,
  isValuationDescription,
  normalizeInvoiceDescription
} from "@/lib/invoices/format";
import { accountingGroup, mariosPhone } from "@/lib/invoices/data/sample-records";

export type DocumentInput = {
  kind: InvoiceDocument["kind"];
  clientName: string;
  clientEmail?: string;
  description: string;
  amount: number;
  vatMode: VatMode;
  issueDate: string;
  dueDate?: string;
  recurrence: InvoiceDocument["recurrence"];
  recurrenceDay?: number;
  sourceInvoiceNumber?: string;
  commissionPersonName?: string;
};

export type DashboardDocumentControls = {
  vatMode?: VatMode;
  period?: InvoicePeriod;
};

export function calculateVat(amount: number, vatMode: VatMode) {
  if (vatMode === "no-vat") {
    return { vatAmount: 0, total: amount };
  }

  if (vatMode === "included-vat") {
    const net = amount / 1.19;
    return { vatAmount: roundMoney(amount - net), total: amount };
  }

  const vatAmount = roundMoney(amount * 0.19);
  return { vatAmount, total: roundMoney(amount + vatAmount) };
}

export function createDocument(input: DocumentInput, index: number): InvoiceDocument {
  const description = normalizeInvoiceDescription(input.description);
  const { vatAmount, total } = calculateVat(input.amount, input.vatMode);
  const requiresCommissionPerson = isCommissionDescription(description);
  const label = isValuationDescription(description) ? "valuation" : undefined;

  return {
    id: `${input.kind}-${crypto.randomUUID()}`,
    kind: input.kind,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    billToLabel: input.kind === "credit-note" ? "Bill to" : "Bill To",
    description,
    amount: input.amount,
    vatMode: input.vatMode,
    vatAmount,
    total,
    currency: "EUR",
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    recurrence: input.recurrence,
    recurrenceDay: input.recurrence === "none" ? undefined : input.recurrenceDay,
    label,
    draftNumber: createDraftNumber(input.kind, index),
    officialNumberPendingReason: officialNumberPlaceholder(input.kind),
    status: "draft",
    paymentStatus: input.kind === "invoice" ? "unpaid" : input.kind === "receipt" ? "paid" : "not-required",
    sourceInvoiceNumber: input.sourceInvoiceNumber,
    commissionPersonName: input.commissionPersonName,
    requiresCommissionPerson,
    storageStatus: "not-generated",
    whatsappStatus: "planned",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [{ label: "Draft created", at: new Date().toISOString(), by: "Sophia" }],
    notes: [
      requiresCommissionPerson
        ? "Commission trigger detected. Sophia must include the relevant person in the group message."
        : "Draft can be sent to Marios for approval."
    ]
  };
}

export function createReceiptFromInvoice(invoice: InvoiceDocument, index: number): InvoiceDocument {
  const now = new Date().toISOString();

  return {
    ...invoice,
    id: `receipt-${crypto.randomUUID()}`,
    kind: "receipt",
    // The receipt's own line describes WHAT it is — a receipt for the source
    // invoice — not the original invoice's billing description.
    description: `Receipt for invoice no ${invoice.officialNumber ?? invoice.draftNumber}`,
    billToLabel: "Bill To",
    recurrence: "none",
    draftNumber: createDraftNumber("receipt", index),
    officialNumber: undefined,
    officialNumberPendingReason: officialNumberPlaceholder("receipt"),
    status: "draft",
    paymentStatus: "paid",
    paidAt: now,
    paidAmount: invoice.total,
    sourceInvoiceNumber: invoice.officialNumber ?? invoice.draftNumber,
    receiptNumber: undefined,
    storageStatus: "not-generated",
    storagePath: undefined,
    whatsappStatus: "planned",
    approvalTimeline: [
      { label: "Source invoice marked paid", at: now, by: "Sophia" },
      { label: "Receipt draft created", at: now, by: "Sophia" }
    ],
    notes: [
      `Receipt created from ${invoice.officialNumber ?? invoice.draftNumber}.`,
      "Receipt template intentionally excludes the removed payment-method line."
    ]
  };
}

export function createCreditNoteFromInvoice(invoice: InvoiceDocument, index: number): InvoiceDocument {
  const now = new Date().toISOString();

  return {
    ...invoice,
    id: `credit-note-${crypto.randomUUID()}`,
    kind: "credit-note",
    billToLabel: "Bill to",
    recurrence: "none",
    draftNumber: createDraftNumber("credit-note", index),
    officialNumber: undefined,
    officialNumberPendingReason: officialNumberPlaceholder("credit-note"),
    status: "draft",
    paymentStatus: "not-required",
    paidAt: undefined,
    paidAmount: undefined,
    receiptNumber: undefined,
    linkedCreditNoteNumber: undefined,
    sourceInvoiceNumber: invoice.officialNumber ?? invoice.draftNumber,
    storageStatus: "not-generated",
    storagePath: undefined,
    whatsappStatus: "planned",
    approvalTimeline: [
      { label: "Source invoice cancellation requested", at: now, by: "Sophia" },
      { label: "Credit note draft created", at: now, by: "Sophia" }
    ],
    notes: [
      `Credit note created from ${invoice.officialNumber ?? invoice.draftNumber}.`,
      "Credit-note number remains pending until Marios approves and the client sequence is applied."
    ]
  };
}

export function updateDocumentFromInput(
  document: InvoiceDocument,
  input: DocumentInput
): InvoiceDocument {
  const description = normalizeInvoiceDescription(input.description);
  const { vatAmount, total } = calculateVat(input.amount, input.vatMode);
  const requiresCommissionPerson = isCommissionDescription(description);
  const label = isValuationDescription(description) ? "valuation" : undefined;

  return {
    ...document,
    kind: input.kind,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    billToLabel: input.kind === "credit-note" ? "Bill to" : "Bill To",
    description,
    amount: input.amount,
    vatMode: input.vatMode,
    vatAmount,
    total,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    recurrence: input.recurrence,
    recurrenceDay: input.recurrence === "none" ? undefined : input.recurrenceDay,
    label,
    sourceInvoiceNumber: input.sourceInvoiceNumber,
    commissionPersonName: input.commissionPersonName,
    requiresCommissionPerson,
    storageStatus: document.status === "sent-to-accounting" ? "needs-regeneration" : document.storageStatus,
    notes: [
      ...document.notes,
      document.status === "sent-to-accounting"
        ? "Edited after sending. Regenerate and resend with ignore-previous-version caption."
        : "Draft details updated."
    ]
  };
}

export function updateDocumentDashboardControls(
  document: InvoiceDocument,
  input: DashboardDocumentControls
): InvoiceDocument {
  const vatMode = input.vatMode ?? document.vatMode;
  const { vatAmount, total } = calculateVat(document.amount, vatMode);

  return {
    ...document,
    vatMode,
    vatAmount,
    total,
    recurrence: input.period ?? document.recurrence,
    storageStatus: document.status === "sent-to-accounting" ? "needs-regeneration" : document.storageStatus
  };
}

export function ensureInvoiceDashboardPeriod(document: InvoiceDocument): InvoiceDocument {
  if (document.kind !== "invoice" || document.recurrence !== "none") {
    return document;
  }

  return { ...document, recurrence: "monthly" };
}

export function documentMatchesInvoiceNumberSearch(
  document: InvoiceDocument,
  search: string
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [document.draftNumber, document.officialNumber, document.sourceInvoiceNumber]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
