import type { DocumentKind, InvoiceDocument } from "@/lib/invoices/types/invoice";

const companyPrefix = "CSC ZYPRUS PROPERTY GROUP LTD";

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
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
    year: "numeric"
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
    credited: "Credit note"
  };

  return labels[status];
}

export function recurrenceLabel(value: InvoiceDocument["recurrence"]): string {
  const labels: Record<InvoiceDocument["recurrence"], string> = {
    none: "One-off",
    monthly: "Monthly",
    yearly: "Yearly"
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
  // An agent earns commission on both SALES and RENTALS, so "sale of …" and
  // "rent of …" / "letting of …" are commission triggers too — not just the
  // literal word "commission" (Marios's rule).
  return /\bcommission\b|\bproperty sale\b|\bsale of\b|\brent of\b|\bletting of\b/i.test(description);
}

/**
 * The line shown on a credit note: "Credit note for invoice no {X}" followed by
 * the source invoice's original description. Used by BOTH the deterministic PDF
 * (lib/invoices/pdf.ts) and the on-screen preview (TemplatePreview) so they never
 * diverge. Newer credit notes already store the combined string as their
 * description (starts with "Credit note") — returned as-is; older ones store only
 * the original line — the reference is prepended so they read correctly too.
 */
export function creditNoteLineDescription(
  sourceInvoiceNumber: string | undefined,
  description: string | undefined
): string {
  const desc = (description ?? "").trim();
  if (/^credit note/i.test(desc)) return desc;
  const reference = `Credit note for invoice no ${sourceInvoiceNumber || "—"}`;
  return desc ? `${reference}\n${desc}` : reference;
}

export function isValuationDescription(description: string): boolean {
  return /\bvaluation\b/i.test(description);
}

export function normalizeInvoiceDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return "";

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Remove the agent / commission-person name from a description so it never
 * appears on the invoice OR the receipt — regardless of source (Sophia, the
 * admin panel, or legacy data). The agent name is only used as the
 * accounting-group message at approval.
 */
export function stripAgentName(desc?: string): string {
  if (!desc) return "";
  return desc
    .replace(/\s*\(\s*agent\b[\s:]*[^)]*\)/gi, "") // "(Agent: X)" anywhere
    .replace(/\s*[-–—]\s*agent\b[\s:]*[^,;\n]*$/i, "") // "- Agent: X" at the end
    .replace(/\s*\bagent\s*:\s*[^,;\n]*$/i, "") // bare "Agent: X" at the end
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:–—-]+$/, "")
    .trim();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

/**
 * Add one calendar month to a `yyyy-mm-dd` date string, rolling the year at
 * December and clamping the day to the new month's length (e.g. Jan 31 → Feb 28).
 * Used for monthly recurrence: next month's invoice keeps the same day-of-month.
 */
export function addOneMonth(dateStr: string): string {
  if (!dateStr) return dateStr;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/**
 * Add one calendar year to a `yyyy-mm-dd` date string, clamping the day to the
 * new month's length (e.g. Feb 29 in a leap year → Feb 28 the next year).
 * Used for yearly recurrence: next year's invoice keeps the same day-of-month.
 */
export function addOneYear(stamp: string): string {
  if (!stamp) return stamp;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return stamp;
  const day = date.getDate();
  date.setDate(1);
  date.setFullYear(date.getFullYear() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

/**
 * Roll any English month name in a description forward by one month, so a
 * monthly invoice regenerated next month reads "…July 2026" where the previous
 * one said "…June 2026" (Marios writes June, Sophia rolls it to July). A 4-digit
 * year directly after the month is incremented when the month rolls Dec→Jan.
 */
export function rollDescriptionMonth(text: string): string {
  if (!text) return text;
  const monthPattern = new RegExp(`\\b(${MONTH_NAMES.join("|")})\\b(\\s+(\\d{4}))?`, "gi");
  return text.replace(monthPattern, (match, month: string, _withYear: string | undefined, year: string | undefined) => {
    const index = MONTH_NAMES.findIndex((name) => name.toLowerCase() === month.toLowerCase());
    if (index === -1) return match;
    const nextIndex = (index + 1) % 12;
    const nextName = MONTH_NAMES[nextIndex];
    // Preserve the original casing (Title-case vs lower-case) of the matched month.
    const cased = month[0] === month[0].toUpperCase() ? nextName : nextName.toLowerCase();
    if (year) {
      const nextYear = Number(year) + (nextIndex === 0 ? 1 : 0);
      return `${cased} ${nextYear}`;
    }
    return cased;
  });
}

/**
 * Roll any 4-digit year (20xx) in a description forward by one year, so a YEARLY
 * invoice regenerated next year reads "…2027" where the previous one said
 * "…2026". The yearly counterpart of rollDescriptionMonth — keeps the
 * description's year in step with the advanced issue date (addOneYear) so the
 * upcoming instance's PDF never shows the prior year. Months (if any) are left
 * untouched; only the year advances for a yearly cadence.
 */
export function rollDescriptionYear(text: string): string {
  if (!text) return text;
  return text.replace(/\b(20\d{2})\b/g, (_match, year: string) => String(Number(year) + 1));
}
