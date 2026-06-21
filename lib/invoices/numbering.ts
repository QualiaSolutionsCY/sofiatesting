import type {
  DocumentKind,
  InvoiceDocument,
} from "@/lib/invoices/types/invoice";

export function createDraftNumber(
  kind: DocumentKind,
  sequence: number
): string {
  const prefix =
    kind === "invoice" ? "INV" : kind === "credit-note" ? "CN" : "RCPT";
  // Draft follows the real number sequence, with -DRAFT appended until Marios approves.
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(5, "0")}-DRAFT`;
}

/** Numeric sequence from an official or draft number (ignores year/prefix and the -DRAFT suffix). */
function extractSequence(value: string | undefined | null): number {
  if (!value) return Number.NaN;
  const groups = value.replace(/-draft$/i, "").match(/\d+/g);
  return groups ? Number(groups[groups.length - 1]) : Number.NaN;
}

/** Next sequence for a new draft — advances past every existing official AND draft of this kind. */
export function getNextDraftSequence(
  documents: InvoiceDocument[],
  kind: DocumentKind
): number {
  const fallbackStart =
    kind === "credit-note" ? 10_096 : kind === "receipt" ? 10_386 : 11_424;
  const used = documents
    .filter((document) => document.kind === kind)
    .flatMap((document) => [
      extractSequence(document.officialNumber),
      extractSequence(document.draftNumber),
    ])
    .filter((n) => Number.isFinite(n) && n > 0);
  return (
    (used.length > 0 ? Math.max(fallbackStart, ...used) : fallbackStart) + 1
  );
}

export function officialNumberPlaceholder(kind: DocumentKind): string {
  const label =
    kind === "invoice"
      ? "invoice"
      : kind === "credit-note"
        ? "credit-note"
        : "receipt";
  return `Waiting for client-provided ${label} sequence after Marios approval`;
}

export function getNextOfficialNumber(
  documents: InvoiceDocument[],
  kind: DocumentKind
): string {
  const numbers = documents
    .filter((document) => document.kind === kind)
    .map((document) => document.officialNumber)
    .filter((number): number is string => Boolean(number))
    .map((number) => Number(number.replace(/\D/g, "")))
    .filter((number) => Number.isFinite(number));

  const fallbackStart =
    kind === "credit-note" ? 10_096 : kind === "receipt" ? 10_386 : 11_424;
  const next =
    numbers.length > 0 ? Math.max(...numbers) + 1 : fallbackStart + 1;

  return String(next);
}
