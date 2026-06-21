import type {
  DocumentKind,
  InvoiceDocument,
} from "@/lib/invoices/types/invoice";

const companyPrefix = "CSC ZYPRUS PROPERTY GROUP LTD";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // Day · full month name · year — e.g. "17 June 2026".
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function documentKindLabel(kind: DocumentKind): string {
  if (kind === "invoice") return "Invoice";
  if (kind === "credit-note") return "Credit Note";
  return "Receipt";
}

export function statusLabel(status: InvoiceDocument["status"]): string {
  const labels: Record<InvoiceDocument["status"], string> = {
    draft: "Draft",
    "sent-to-marios": "With Marios",
    approved: "Approved",
    numbered: "Numbered",
    "sent-to-accounting": "Sent to accounting",
    "correction-needed": "Correction needed",
    "corrected-resend": "Corrected resend",
    cancelled: "Cancelled",
    credited: "Credited",
  };

  return labels[status];
}

export function recurrenceLabel(value: InvoiceDocument["recurrence"]): string {
  const labels: Record<InvoiceDocument["recurrence"], string> = {
    none: "One-off",
    monthly: "Monthly",
    yearly: "Yearly",
  };

  return labels[value];
}

export function getDisplayNumber(document: InvoiceDocument): string {
  return document.officialNumber ?? document.draftNumber;
}

export function getUnifiedFilename(document: InvoiceDocument): string {
  const label = documentKindLabel(document.kind);
  return `${companyPrefix} ${label} ${getDisplayNumber(document)}.pdf`;
}

export function isCommissionDescription(description: string): boolean {
  return /\bcommission\b|\bproperty sale\b|\bsale of (the )?property\b/i.test(
    description
  );
}

export function isValuationDescription(description: string): boolean {
  return /\bvaluation\b/i.test(description);
}

export function normalizeInvoiceDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
