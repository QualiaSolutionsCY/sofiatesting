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
 * Marios specified: greeting, the "on behalf of…" line with the document number
 * + month, the amount + due date, the Sophia AI-disclosure + do-not-reply notice,
 * then Marios Polyviou's full signature (matching his real email letterhead,
 * structure + spacing). Dynamic fields come from the document; the rest is fixed
 * brand text. The HTML twin (invoiceEmailBodyToHtml) renders the same content with
 * bold brand lines, clickable web/email links, and the Zyprus logo.
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
    // AI disclosure kept (Marios's transparency ask) directly above his signature.
    "Sent by Sophia, CSC Zyprus's AI assistant.",
    "Please don't reply to this email.",
    "",
    // Marios Polyviou's signature — matches his real email letterhead exactly
    // (structure + spacing). A blank line separates each line so the plain-text
    // fallback mirrors the HTML twin's airy layout.
    "Kind Regards,",
    "",
    "Marios Polyviou",
    "",
    "Real Estate Consultant",
    "",
    "Zyprus Property Group",
    "",
    "Tombs of the Kings Avenue 96, Office 21, 8046 Paphos, Cyprus",
    "",
    "T: +357 77 77 64 77 (Call Center)",
    "",
    "M: +357 99 92 15 60 (WhatsApp and Viber)",
    "",
    "W: www.zyprus.com",
    "",
    "E: info@zyprus.com",
    "",
    "E: marios@zyprus.com",
    "",
    "Licensed and Registered Real Estate Agency Firm",
    "",
    "CSC Zyprus Property Group LTD",
    "",
    "CREA Reg. No. 742 and CREA Lic. No. 378/E"
  ].join("\n");
}

// Hosted from public/assets so email clients can fetch it (recipients aren't on the
// dev network that SNI-blocks *.vercel.app — see memory vercel-app-sni-blocked).
const ZYPRUS_LOGO_URL = "https://sofiatesting.vercel.app/assets/zyprus-logo.png";
// The signature lines rendered bold, matching Marios's real email letterhead.
const HTML_BOLD_LINES = new Set([
  "Real Estate Consultant",
  "Zyprus Property Group",
  "Licensed and Registered Real Estate Agency Firm",
  "CSC Zyprus Property Group LTD"
]);

/**
 * HTML rendering of an invoice email body — same content as the plain text (the
 * letterhead default OR an operator's custom message), rendered line-by-line so the
 * structure matches Marios's signature: brand lines bold, the "please don't reply"
 * notice bold, the T:/M:/W:/E: labels bold, web/email addresses clickable, blank
 * lines kept as spacers, and the Zyprus logo appended as a footer. Derived from the
 * same text so the two never diverge; Resend sends both text + html. Custom operator
 * messages render as plain lines (bolding only fires on the exact fixed brand strings).
 */
export function invoiceEmailBodyToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Linkify the brand web address + any @zyprus.com address. Runs on already-escaped
  // text (URLs/emails carry no & < > so escaping leaves them intact).
  const linkify = (s: string) =>
    s
      .replace(
        /www\.zyprus\.com/g,
        '<a href="https://www.zyprus.com" style="color:#6b21a8;text-decoration:none;">www.zyprus.com</a>'
      )
      .replace(
        /([A-Za-z0-9._%+-]+@zyprus\.com)/g,
        '<a href="mailto:$1" style="color:#6b21a8;text-decoration:none;">$1</a>'
      );
  const renderLine = (raw: string): string => {
    const line = raw.replace(/\s+$/, "");
    if (line === "") return '<div style="font-size:8px;line-height:8px;">&nbsp;</div>';
    if (line === "Please don't reply to this email.") return `<div><strong>${esc(line)}</strong></div>`;
    if (HTML_BOLD_LINES.has(line)) return `<div><strong>${esc(line)}</strong></div>`;
    // Contact rows: bold the single-letter label, linkify the value (W: / E:).
    const contact = line.match(/^([TMWE]):\s*(.*)$/);
    if (contact) return `<div><strong>${contact[1]}:</strong> ${linkify(esc(contact[2]))}</div>`;
    return `<div>${linkify(esc(line))}</div>`;
  };
  const body = text.split("\n").map(renderLine).join("");
  const logo =
    `<div style="margin-top:16px;">` +
    `<img src="${ZYPRUS_LOGO_URL}" alt="Zyprus Property Group" height="34" style="display:block;border:0;outline:none;text-decoration:none;" />` +
    `</div>`;
  return (
    `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #111;">` +
    body +
    logo +
    `</div>`
  );
}
