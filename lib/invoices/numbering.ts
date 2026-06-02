import type { DocumentKind } from "@/lib/invoices/types/invoice";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function createDraftNumber(kind: DocumentKind, index: number): string {
  const prefix = kind === "invoice" ? "D-INV" : kind === "credit-note" ? "D-CN" : "D-RCPT";
  return `${prefix}-${new Date().getFullYear()}-${String(index).padStart(4, "0")}`;
}

export function officialNumberPlaceholder(kind: DocumentKind): string {
  const label = kind === "invoice" ? "invoice" : kind === "credit-note" ? "credit-note" : "receipt";
  return `Waiting for client-provided ${label} sequence after Marios approval`;
}

export function getNextOfficialNumber(documents: InvoiceDocument[], kind: DocumentKind): string {
  const numbers = documents
    .filter((document) => document.kind === kind)
    .map((document) => document.officialNumber)
    .filter((number): number is string => Boolean(number))
    .map((number) => Number(number.replace(/\D/g, "")))
    .filter((number) => Number.isFinite(number));

  const fallbackStart = kind === "credit-note" ? 10096 : kind === "receipt" ? 10386 : 11424;
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : fallbackStart + 1;

  return String(next);
}
