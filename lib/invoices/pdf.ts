import { documentKindLabel, formatDate, getDisplayNumber, recurrenceLabel } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

// Month-year label for the billing period — mirrors the redesign adapter's
// private periodFromIssue (lib/invoices/redesign/adapter.ts:23-28) without
// importing it, so the PDF's "Recurring · Monthly · May 2026" row matches the
// on-screen TemplatePreview row.
function periodLabelFromIssue(issueDate: string): string {
  const [y, m] = (issueDate || "").split("-");
  if (!y || !m) return "";
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-GB", { month: "long" });
  return `${month} ${y}`;
}

/**
 * Letterhead for the issuing entity. Mirrors the ENTITY constant the admin-panel
 * template (components/invoices/redesign/ledger/TemplatePreview.tsx) renders, so the
 * generated PDF matches the on-screen "Print / save as PDF" template. Kept inline here
 * to keep the PDF generator self-contained (it runs in both client and server paths).
 */
// Kept in sync with TEMPLATE_DEFAULTS (lib/invoices/redesign/template-context.tsx)
// so the downloaded/WhatsApp PDF matches the on-screen A4 preview exactly.
const ENTITY = {
  name: "CSC ZYPRUS PROPERTY GROUP LTD",
  regNo: "HE344546",
  vatNo: "10344546O",
  address: "Tombs of the Kings Avenue 96, 8046 Paphos, Cyprus",
  contactLine: "T: 77776477 E: info@zyprus.com",
  creaLicense: "378/E",
  creaReg: "742",
  bankName: "Hellenic Bank",
  accountName: "CSC ZYPRUS PROPERTY GROUP LTD",
  accountNumber: "502-01-734364-01",
  iban: "CY97 0050 0502 0005 0201 7343 6401",
  bic: "HEBACY2N",
  settlementNote: "Payment due within the stated terms. Please use the invoice number as the payment reference.",
  receiptNote: "This receipt confirms payment in full. Thank you."
};

// Helvetica / Helvetica-Bold advance widths (1000 units/em) for WinAnsi 0x20–0x7E.
// Used for right-alignment and word-wrap so the layout matches the HTML template.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function charWidth(code: number, bold: boolean): number {
  if (code === 0x20ac) return 556; // €
  if (code === 0xb7) return 278; // · (middle dot)
  if (code >= 32 && code <= 126) return (bold ? HELVB : HELV)[code - 32];
  return bold ? 556 : 556;
}

function textWidth(value: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of value) units += charWidth(ch.codePointAt(0) ?? 32, bold);
  return (units / 1000) * size;
}

function wrapText(value: string, maxWidth: number, size: number, bold: boolean): string[] {
  const lines: string[] = [];
  // Honour explicit line breaks (e.g. receipt: invoice-no line + description),
  // width-wrapping each paragraph independently.
  for (const paragraph of (value || "").split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || textWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : ["—"];
}

// Mirror the on-screen template's `amount` helper (lib/invoices/redesign/data.ts):
// "€" prefix, comma thousands, and decimals ONLY when the value has cents — so the
// downloaded PDF reads identically to the A4 preview (€1,000 · €1,234.50). The €
// glyph is mapped to WinAnsi 0x80 in winAnsi() and the fonts declare WinAnsiEncoding,
// so it renders as € (not the Saudi Riyal fallback) in spec-compliant viewers.
function eur(value: number): string {
  const num = Number(value) || 0;
  const hasCents = Math.round(Math.abs(num) * 100) % 100 !== 0;
  return `€${num.toLocaleString("en-GB", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function buildDocumentPdfBlob(document: InvoiceDocument): Blob {
  return new Blob([asArrayBuffer(buildDocumentPdfBytes(document))], { type: "application/pdf" });
}

export function buildDocumentPdfBytes(document: InvoiceDocument): Uint8Array {
  const isCredit = document.kind === "credit-note";
  const isReceipt = document.kind === "receipt";
  const title = documentKindLabel(document.kind);

  const ML = 56;
  const MR = 539;
  const ops: string[] = [];

  const setFill = (gray: number) => ops.push(`${gray} g`);
  const text = (x: number, y: number, value: string, size: number, bold = false, gray = 0.12) => {
    setFill(gray);
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(winAnsi(value))}) Tj ET`);
  };
  const textRight = (xRight: number, y: number, value: string, size: number, bold = false, gray = 0.12) =>
    text(xRight - textWidth(value, size, bold), y, value, size, bold, gray);
  const rectFill = (x: number, y: number, w: number, h: number, gray: number) =>
    ops.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.6, gray = 0.78) =>
    ops.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);

  // ---- Header: entity letterhead (left) + document title & meta (right) ----
  // Letterhead lines mirror the on-screen template preview exactly.
  text(ML, 800, ENTITY.name, 12, true, 0.1);
  textRight(MR, 794, title, 22, true, 0.1);
  // Mirror the on-screen TemplatePreview letterhead line-for-line.
  const headerLines = [
    ENTITY.regNo,
    ENTITY.address,
    ENTITY.contactLine,
    `CREA License No. ${ENTITY.creaLicense}`,
    `CREA Reg No. ${ENTITY.creaReg}`
  ];
  let headerY = 786;
  for (const ln of headerLines) {
    text(ML, headerY, ln, 8.5, false, 0.42);
    headerY -= 12;
  }

  const meta: Array<[string, string]> = [
    ["No.", getDisplayNumber(document)],
    ["Date", formatDate(document.issueDate)]
  ];
  if (!isCredit && !isReceipt && document.dueDate) {
    meta.push(["Due Date", formatDate(document.dueDate)]);
  }
  if (!isCredit && !isReceipt && document.recurrence !== "none") {
    meta.push(["Recurring", `${recurrenceLabel(document.recurrence)} · ${periodLabelFromIssue(document.issueDate)}`]);
  }
  if (isCredit && document.sourceInvoiceNumber) meta.push(["Applies to", `Invoice ${document.sourceInvoiceNumber}`]);

  // Start the right-hand meta below the 22pt document title so the number never
  // collides with the "Invoice" / "Credit Note" heading.
  let metaY = 772;
  for (const [label, value] of meta) {
    text(MR - 175, metaY, label, 8, false, 0.45);
    textRight(MR, metaY, value, 9.5, false, 0.12);
    metaY -= 15;
  }

  // Baseline for the "Bill to" block: below BOTH the left letterhead and the
  // (variable-height) meta block. No visible rule — the header flows straight into
  // "Bill To", matching the on-screen template (which has no divider either).
  const dividerY = Math.min(headerY, metaY) - 4;

  // ---- Bill to ----
  let y = dividerY - 15;
  text(ML, y, isReceipt ? "RECEIVED FROM" : "BILL TO", 7.5, true, 0.5);
  y -= 15;
  text(ML, y, document.clientName, 12, true, 0.12);
  y -= 14;
  if (document.clientEmail) {
    text(ML, y, document.clientEmail, 9, false, 0.42);
    y -= 12;
  }
  y -= 16;

  // ---- Line-item table ----
  const colNum = ML + 10;
  const colDesc = ML + 44;
  const xDescEnd = 404; // description wraps before the Unit column
  const unitR = 468;
  const totalR = MR - 8;
  const headerH = 22;
  const tableTop = y;

  rectFill(ML, tableTop - headerH, MR - ML, headerH, 0.93);
  const hb = tableTop - 15;
  text(colNum, hb, "Item", 8.5, true, 0.25);
  text(colDesc, hb, "Description", 8.5, true, 0.25);
  textRight(unitR, hb, "Unit Price", 8.5, true, 0.25);
  textRight(totalR, hb, "Total", 8.5, true, 0.25);

  const bodyTop = tableTop - headerH;
  // Credit notes show a fixed reference line; everything else lists its line
  // items (falling back to the single description when none are stored).
  const items = isCredit
    ? [{ desc: document.description || `Credit note for invoice no ${document.sourceInvoiceNumber || "—"}`, unit: document.amount, total: document.amount }]
    : document.lineItems && document.lineItems.length
      ? document.lineItems.map((li) => ({ desc: li.description || "—", unit: li.unitPrice, total: li.quantity * li.unitPrice }))
      : [{ desc: document.description || "—", unit: document.amount, total: document.amount }];
  const lineH = 13;
  let cursor = bodyTop - 18;
  let rowH = 0;
  items.forEach((it, idx) => {
    const dLines = wrapText(it.desc, xDescEnd - colDesc, 9.5, false);
    text(colNum, cursor, String(idx + 1), 9.5, false, 0.2);
    dLines.forEach((ln, i) => text(colDesc, cursor - i * lineH, ln, 9.5, false, 0.15));
    textRight(unitR, cursor, eur(it.unit), 9.5, false, 0.15);
    textRight(totalR, cursor, eur(it.total), 9.5, false, 0.15);
    const h = Math.max(28, 16 + dLines.length * lineH);
    rowH += h;
    cursor -= h;
  });

  // Stretch the ruled table down to fill the page — mirroring the on-screen
  // TemplatePreview's filler row — while reserving exact room for the totals +
  // settlement that sit beneath it. `belowTableHeight` is the distance from the
  // table's bottom edge down to the lowest text baseline of those blocks, derived
  // from the same ty-decrements used when they're drawn below. Falls back to the
  // natural compact height when a long description already pushes the row past it.
  const PAGE_BOTTOM_MARGIN = 56;
  let belowTableHeight: number;
  if (isCredit) {
    belowTableHeight = 84; // totals end at "Balance credited"; no settlement block
  } else {
    const noteLines = isReceipt
      ? wrapText(ENTITY.receiptNote, MR - ML, 9, false)
      : wrapText(ENTITY.settlementNote, MR - ML, 9, false);
    // receipt: just the note lines; invoice: wrapped note + 1 blank gap + 5 bank lines.
    const settleLineCount = isReceipt ? noteLines.length : noteLines.length + 1 + 5;
    belowTableHeight = 132 + Math.max(0, settleLineCount - 1) * 12;
  }
  const fillBottom = PAGE_BOTTOM_MARGIN + belowTableHeight;
  const bottom = Math.min(bodyTop - rowH, fillBottom);
  // outer box + header separator + column rules
  line(ML, tableTop, MR, tableTop, 0.6, 0.78);
  line(ML, bodyTop, MR, bodyTop, 0.6, 0.78);
  line(ML, bottom, MR, bottom, 0.6, 0.78);
  line(ML, tableTop, ML, bottom, 0.6, 0.78);
  line(MR, tableTop, MR, bottom, 0.6, 0.78);
  for (const vx of [ML + 32, 410, 474]) line(vx, tableTop, vx, bottom, 0.5, 0.86);

  // ---- Totals ----
  // Cyprus VAT is a fixed 19% — show it literally, never back-compute the rate
  // from amounts (that broke on "included-VAT" invoices, where document.amount
  // holds the GROSS, yielding a wrong 16% and a gross Subtotal line). Derive the
  // net Subtotal from the total minus VAT so Subtotal + VAT = Total for every
  // vatMode (plus-vat: net; included-vat: gross − VAT; no-vat: total).
  const rate = document.vatMode === "no-vat" ? 0 : 19;
  const subtotal = Math.abs(document.total) - Math.abs(document.vatAmount);
  const labelX = MR - 200;
  let ty = bottom - 26;
  text(labelX, ty, "Subtotal", 9.5, false, 0.42);
  textRight(MR, ty, eur(subtotal), 9.5, false, 0.12);
  ty -= 16;
  text(labelX, ty, `V.A.T ${rate}%`, 9.5, false, 0.42);
  textRight(MR, ty, eur(document.vatAmount), 9.5, false, 0.12);
  ty -= 8;
  line(labelX, ty, MR, ty, 0.7, 0.6);
  ty -= 16;
  // Credit notes store a negative total; show the magnitude (the "Balance credited"
  // label carries the sign) so the PDF reads €7,140 like the on-screen template.
  const totalDisplay = eur(Math.abs(document.total));
  text(labelX, ty, "Total", 10.5, true, 0.1);
  textRight(MR, ty, totalDisplay, 10.5, true, 0.1);
  ty -= 18;
  text(labelX, ty, isCredit ? "Balance credited" : "Balance Due", 11.5, true, 0.1);
  textRight(MR, ty, totalDisplay, 11.5, true, 0.1);
  ty -= 34;

  // ---- Settlement / acknowledgement ----
  // Mirrors TemplatePreview: credit notes show no settlement block; receipts show
  // the acknowledgement note; invoices show the full bank block + settlement note.
  if (!isCredit) {
    text(ML, ty, isReceipt ? "ACKNOWLEDGEMENT" : "SETTLEMENT", 7.5, true, 0.5);
    ty -= 14;
    const settleLines = isReceipt
      ? wrapText(ENTITY.receiptNote, MR - ML, 9, false)
      : [
          // Settlement note sits ABOVE the bank block, separated by a blank line.
          ...wrapText(ENTITY.settlementNote, MR - ML, 9, false),
          "",
          ENTITY.bankName,
          `Account Name: ${ENTITY.accountName}`,
          `Account Number: ${ENTITY.accountNumber}`,
          `IBAN: ${ENTITY.iban}`,
          `BIC: ${ENTITY.bic}`
        ];
    for (const ln of settleLines) {
      text(ML, ty, ln, 9, false, 0.42);
      ty -= 12;
    }
    ty -= 14;
  }

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(parts.join("").length);
    parts.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }

  const xref = parts.join("").length;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) {
    parts.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  return latin1Bytes(parts.join(""));
}

export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Map a string to WinAnsi-safe single-byte characters so the content stream stays
 * 1 char = 1 byte (keeps xref offsets and /Length byte-accurate). € → 0x80; smart
 * quotes/dashes are folded to ASCII; anything above 0xFF becomes "?".
 */
function winAnsi(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 0x20ac) out += String.fromCharCode(0x80); // €
    else if (code === 0x2013 || code === 0x2014) out += "-";
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

function latin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
