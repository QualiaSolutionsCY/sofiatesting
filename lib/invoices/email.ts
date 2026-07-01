import { documentKindLabel, formatDate, getDisplayNumber, getUnifiedFilename } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export type ClientEmailMessage = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachmentFilename: string;
};

export function buildClientEmailMessage(
  document: InvoiceDocument,
  sharedCcEmail: string
): ClientEmailMessage {
  const number = getDisplayNumber(document);
  const issueMonth = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric"
  }).format(new Date(document.issueDate));
  const documentName = document.kind === "credit-note" ? "Credit note" : document.kind === "receipt" ? "Receipt" : "Invoice";

  return {
    to: document.clientEmail ?? "",
    cc: sharedCcEmail.trim(),
    subject: `${documentName} ${number} for ${issueMonth}`,
    attachmentFilename: getUnifiedFilename(document),
    // Single source of truth: the client-delivery compose shows the exact same
    // default letterhead the panel/Sophia/auto-send emails use.
    body: buildInvoiceEmailBody(document)
  };
}

// Currency exactly as the PDF renders it (lib/invoices/pdf.ts eur()): "€" prefix,
// de-DE grouping (dot thousands, comma decimal), always two decimals — so the
// email's "Bill due" matches the attached invoice to the cent.
function eur(value: number): string {
  const num = Number(value) || 0;
  return `€${num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The default client-facing email body — CSC Zyprus's letterhead exactly as
 * Marios specified (30-06 meeting): greeting, the "on behalf of…" line with the
 * document number + month, the amount + due date, Marios as the correspondence
 * contact, a do-not-reply notice, then the full company signature. Dynamic fields
 * come from the document; the rest is fixed brand text.
 *
 * This is the ONE source of the default invoice email across every path — the
 * admin "client delivery" compose (buildClientEmailMessage above), the panel /
 * Sophia-over-WhatsApp send (sendInvoiceEmailAction's fallback), and the
 * auto-send on approval. File-based on purpose — never a DB row, since
 * autoresearch rewrites DB prompt rows (see memory invoicing-prompt-db-backed).
 */
export function buildInvoiceEmailBody(document: InvoiceDocument): string {
  const label = documentKindLabel(document.kind).toLowerCase();
  const number = getDisplayNumber(document);
  const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(document.issueDate)
  );
  const dueDate = document.dueDate ? formatDate(document.dueDate) : "on receipt";

  return [
    `Hello ${document.clientName},`,
    "",
    `On behalf of CSC Zyprus Property Group, attached please find your ${label} No. ${number} for ${monthYear}.`,
    "",
    `Bill due ${eur(document.total)}. Date Due ${dueDate}`,
    "",
    "For any correspondence, you can contact Marios Polyviou at marios@zyprus.com",
    "",
    "Please don't reply to this email.",
    "",
    "Kind regards,",
    "Sophia",
    "",
    "Zyprus Property Group",
    "Tombs of the Kings Avenue 96, Office 21, 8046 Paphos, Cyprus",
    "T: +357 77 77 64 77 (Call Center)",
    "M: +357 99 92 15 60 (WhatsApp and Viber)",
    "W: www.zyprus.com",
    "E: info@zyprus.com",
    "E: marios@zyprus.com",
    "Licensed and Registered Real Estate Agency Firm",
    "CSC Zyprus Property Group LTD",
    "CREA Reg. No. 742 and CREA Lic. No. 378/E"
  ].join("\n");
}
