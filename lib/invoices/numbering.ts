import type { DocumentKind } from "@/lib/invoices/types/invoice";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function createDraftNumber(kind: DocumentKind, sequence: number): string {
  const prefix = kind === "invoice" ? "INV" : kind === "credit-note" ? "CN" : "RCPT";
  // Draft follows the real number sequence, with -DRAFT appended until Marios approves.
  // Year is the current year: this function has no issueDate in its signature and every
  // consumer of a draft number reads only the trailing digits (see extractSequence, which
  // strips year/prefix/-DRAFT), so the embedded year is cosmetic and never gates sequencing.
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(5, "0")}-DRAFT`;
}

/** Numeric sequence from an official or draft number (ignores year/prefix and the -DRAFT suffix). */
function extractSequence(value: string | undefined | null): number {
  if (!value) return NaN;
  const groups = value.replace(/-draft$/i, "").match(/\d+/g);
  return groups ? Number(groups[groups.length - 1]) : NaN;
}

/** Next sequence for a new draft — advances past every existing official AND draft of this kind. */
export function getNextDraftSequence(documents: InvoiceDocument[], kind: DocumentKind): number {
  const fallbackStart = kind === "credit-note" ? 10096 : kind === "receipt" ? 10386 : 11424;
  const used = documents
    .filter((document) => document.kind === kind)
    .flatMap((document) => [extractSequence(document.officialNumber), extractSequence(document.draftNumber)])
    .filter((n) => Number.isFinite(n) && n > 0);
  return (used.length > 0 ? Math.max(fallbackStart, ...used) : fallbackStart) + 1;
}

export function officialNumberPlaceholder(kind: DocumentKind): string {
  const label = kind === "invoice" ? "invoice" : kind === "credit-note" ? "credit-note" : "receipt";
  return `Waiting for client-provided ${label} sequence after Marios approval`;
}

/**
 * Official number to assign when a draft is approved. The number the agent already
 * saw on the draft (e.g. 11437) must carry through to the official invoice — it must
 * NOT jump to a lower next-official value (11435) just because earlier drafts were
 * never approved. So we reuse the draft's own sequence, unless that exact number is
 * already taken by another official (then fall back to the next official in sequence).
 */
export function officialNumberOnApproval(documents: InvoiceDocument[], document: InvoiceDocument): string {
  const seq = extractSequence(document.draftNumber);
  if (Number.isFinite(seq) && seq > 0) {
    const taken = documents.some(
      (other) =>
        other.id !== document.id &&
        other.kind === document.kind &&
        extractSequence(other.officialNumber) === seq
    );
    if (!taken) return String(seq);
  }
  return getNextOfficialNumber(documents, document.kind);
}

/**
 * Next official number for a kind. Draft-aware: it advances past every existing
 * official AND draft sequence of this kind, so receipts/credit-notes (which call
 * this directly, unlike invoices that go through officialNumberOnApproval) never
 * regress below a draft sequence the agent already saw — mirroring getNextDraftSequence.
 */
export function getNextOfficialNumber(documents: InvoiceDocument[], kind: DocumentKind): string {
  const sequences = documents
    .filter((document) => document.kind === kind)
    .flatMap((document) => [extractSequence(document.officialNumber), extractSequence(document.draftNumber)])
    .filter((n) => Number.isFinite(n) && n > 0);

  const fallbackStart = kind === "credit-note" ? 10096 : kind === "receipt" ? 10386 : 11424;
  const next = sequences.length > 0 ? Math.max(fallbackStart, ...sequences) + 1 : fallbackStart + 1;

  return String(next);
}
