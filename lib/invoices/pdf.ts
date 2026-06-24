import { creditNoteLineDescription, documentKindLabel, formatDate, getDisplayNumber } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

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

// Times-Roman / Times-Bold advance widths (1000 units/em) for WinAnsi 0x20–0x7E.
// Used for right-alignment and word-wrap so the layout matches Marios's template
// (Invoice 11491), which is set in Times.
const TIMES = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541];
const TIMESB = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520];

function charWidth(code: number, bold: boolean): number {
  if (code === 0x20ac) return 500; // €
  if (code === 0xb7) return 250; // · (middle dot)
  if (code >= 32 && code <= 126) return (bold ? TIMESB : TIMES)[code - 32];
  return 500;
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

// Match Marios's template exactly: "€" prefix, de-DE grouping (dot thousands,
// COMMA decimal) and ALWAYS two decimals — e.g. €600,00 · €1.234,50. The € glyph is
// mapped to WinAnsi 0x80 in winAnsi() and the fonts declare WinAnsiEncoding, so it
// renders as € in spec-compliant viewers.
function eur(value: number): string {
  const num = Number(value) || 0;
  return `€${num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.6, gray = 0.78) =>
    ops.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);

  // ---- Header: title (centred, top) + letterhead (left) + meta (right) ----
  // Mirrors Marios's template (Invoice 11491): no status stamp; the document title
  // sits near the top, the company letterhead on the left, the Date / No. / Due
  // meta on the right (label + value, both left-aligned).
  const titleCenterX = 360;
  text(titleCenterX - textWidth(title, 22, true) / 2, 768, title, 22, true, 0.1);

  // Company letterhead (left).
  let headerY = 708;
  text(ML, headerY, ENTITY.name, 13, true, 0.1);
  headerY -= 17;
  const headerLines = [
    ENTITY.regNo,
    ENTITY.address,
    ENTITY.contactLine,
    `V.A.T Reg. No. : ${ENTITY.vatNo}`,
    `CREA License No. ${ENTITY.creaLicense}`,
    `CREA Reg No. ${ENTITY.creaReg}`
  ];
  for (const ln of headerLines) {
    text(ML, headerY, ln, 9, false, 0.32);
    headerY -= 12.5;
  }

  // Meta block (right): "Date:" / "Invoice No.:" / "Due Date:" — label + value,
  // both left-aligned, aligned with the top of the company name.
  const numberLabel = isReceipt ? "Receipt No.:" : isCredit ? "Credit Note No.:" : "Invoice No.:";
  const meta: Array<[string, string]> = [
    ["Date:", formatDate(document.issueDate)],
    [numberLabel, getDisplayNumber(document)]
  ];
  if (!isCredit && !isReceipt && document.dueDate) meta.push(["Due Date:", formatDate(document.dueDate)]);
  if (isCredit && document.sourceInvoiceNumber) meta.push(["Applies to:", `Invoice ${document.sourceInvoiceNumber}`]);
  const metaLabelX = 356;
  const metaValueX = 452;
  let metaY = 742;
  for (const [label, value] of meta) {
    text(metaLabelX, metaY, label, 9.5, false, 0.2);
    text(metaValueX, metaY, value, 9.5, false, 0.2);
    metaY -= 15;
  }

  // ---- Bill To ----
  let y = Math.min(headerY, metaY) - 18;
  text(ML, y, isReceipt ? "Received From:" : "Bill To:", 10, true, 0.1);
  y -= 15;
  text(ML, y, document.clientName, 10, false, 0.15);
  y -= 13;
  if (document.clientEmail) {
    text(ML, y, document.clientEmail, 9, false, 0.35);
    y -= 12;
  }
  y -= 18;

  // ---- Line-item table: Qty | Item | Description | Unit Price | Total ----
  const xItem = 92;      // Qty | Item divider
  const xDescDiv = 128;  // Item | Description divider
  const xUnitDiv = 432;  // Description | Unit Price divider (wider Description, like 11491)
  const xTotalDiv = 490; // Unit Price | Total divider
  const unitR = 486;
  const totalR = MR - 8;
  const headerH = 22;
  const tableTop = y;

  // Header row: bold labels, no fill (matches the reference's white header row).
  const hb = tableTop - 15;
  text(ML + 8, hb, "Qty", 9, true, 0.1);
  text(xItem + 8, hb, "Item", 9, true, 0.1);
  text(xDescDiv + 8, hb, "Description", 9, true, 0.1);
  textRight(unitR, hb, "Unit Price", 9, true, 0.1);
  textRight(totalR, hb, "Total", 9, true, 0.1);

  const bodyTop = tableTop - headerH;
  // Credit notes show a fixed reference line; everything else lists its line items.
  const items = isCredit
    ? [{ desc: creditNoteLineDescription(document.sourceInvoiceNumber, document.description), unit: document.amount, total: document.amount, qty: 1 }]
    : document.lineItems && document.lineItems.length
      ? document.lineItems.map((li) => ({ desc: li.description || "—", unit: li.unitPrice, total: li.quantity * li.unitPrice, qty: li.quantity }))
      : [{ desc: document.description || "—", unit: document.amount, total: document.amount, qty: 1 }];
  const lineH = 13;
  let cursor = bodyTop - 16;
  let rowH = 0;
  items.forEach((it) => {
    const dLines = wrapText(it.desc, xUnitDiv - xDescDiv - 14, 9.5, false);
    text(ML + 14, cursor, String(it.qty), 9.5, false, 0.15);
    dLines.forEach((ln, i) => text(xDescDiv + 8, cursor - i * lineH, ln, 9.5, false, 0.15));
    textRight(unitR, cursor, eur(it.unit), 9.5, false, 0.15);
    textRight(totalR, cursor, eur(it.total), 9.5, false, 0.15);
    const h = Math.max(20, 8 + dLines.length * lineH);
    rowH += h;
    cursor -= h;
  });

  // Stretch the ruled table down to fill the page, reserving room for the totals +
  // banking block beneath it.
  const PAGE_BOTTOM_MARGIN = 56;
  let belowTableHeight: number;
  if (isCredit) {
    belowTableHeight = 96;
  } else {
    const bankLineCount = isReceipt ? 1 : 6; // invoice: "Banking Details" + 5 lines
    belowTableHeight = 104 + bankLineCount * 16;
  }
  const fillBottom = PAGE_BOTTOM_MARGIN + belowTableHeight;
  const bottom = Math.min(bodyTop - rowH, fillBottom);
  // Outer box + header separator + all four internal column dividers.
  line(ML, tableTop, MR, tableTop, 0.7, 0.5);
  line(ML, bodyTop, MR, bodyTop, 0.7, 0.5);
  line(ML, bottom, MR, bottom, 0.7, 0.5);
  line(ML, tableTop, ML, bottom, 0.7, 0.5);
  line(MR, tableTop, MR, bottom, 0.7, 0.5);
  for (const vx of [xItem, xDescDiv, xUnitDiv, xTotalDiv]) line(vx, tableTop, vx, bottom, 0.6, 0.65);

  // ---- Totals (right-aligned, no box) ----
  // Cyprus VAT is a fixed 19% but the label shows only "V.A.T" to match the
  // template. Derive the net Subtotal from total − VAT so Subtotal + VAT = Total
  // for every vatMode (plus-vat: net; included-vat: gross − VAT; no-vat: total).
  const subtotal = Math.abs(document.total) - Math.abs(document.vatAmount);
  // Credit notes store a negative total; show the magnitude (the "Balance credited"
  // label carries the sign).
  const totalDisplay = eur(Math.abs(document.total));
  const valR = MR - 4;        // values right-aligned here
  const labelR = valR - 86;   // labels right-aligned just left of the value column
  let ty = bottom - 22;
  const totalsRow = (label: string, value: string, bold: boolean) => {
    text(labelR - textWidth(label, 9.5, bold), ty, label, 9.5, bold, bold ? 0.1 : 0.25);
    textRight(valR, ty, value, 9.5, bold, bold ? 0.1 : 0.15);
  };
  totalsRow("Subtotal", eur(subtotal), false);
  ty -= 16;
  totalsRow("V.A.T", eur(document.vatAmount), false);
  ty -= 16;
  totalsRow("Total", totalDisplay, true);
  ty -= 16;
  totalsRow(isCredit ? "Balance credited" : "Balance Due", totalDisplay, true);
  ty -= 34;

  // ---- Banking Details (bold block) — matches the template; no settlement note ----
  if (!isCredit && !isReceipt) {
    const bankLines = [
      "Banking Details",
      ENTITY.bankName,
      `Account Name: ${ENTITY.accountName}`,
      `Account Number: ${ENTITY.accountNumber}`,
      `IBAN: ${ENTITY.iban}`,
      `BIC: ${ENTITY.bic}`
    ];
    for (const ln of bankLines) {
      text(ML, ty, ln, 9, true, 0.1);
      ty -= 16;
    }
  } else if (isReceipt) {
    text(ML, ty, ENTITY.receiptNote, 9, false, 0.32);
    ty -= 12;
  }

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>",
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
