import { documentKindLabel, formatDate, getDisplayNumber } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

/**
 * Letterhead for the issuing entity. Mirrors the ENTITY constant the admin-panel
 * template (components/invoices/redesign/ledger/TemplatePreview.tsx) renders, so the
 * generated PDF matches the on-screen "Print / save as PDF" template. Kept inline here
 * to keep the PDF generator self-contained (it runs in both client and server paths).
 */
const ENTITY = {
  name: "CSC ZYPRUS PROPERTY GROUP LTD",
  regNo: "HE 412 339",
  vatNo: "CY 10412339B",
  address: "29 Christaki Kranou, Office 12, 4042 Limassol, Cyprus",
  iban: "CY17 0020 0144 0000 0000 1247 8312",
  bank: "Bank of Cyprus · SWIFT BCYPCY2N"
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
  const words = (value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["—"];
  const lines: string[] = [];
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
  return lines;
}

function money(value: number): string {
  return (Number(value) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  text(ML, 800, ENTITY.name, 12, true, 0.1);
  textRight(MR, 794, title, 22, true, 0.1);
  text(ML, 783, ENTITY.address, 9, false, 0.42);
  text(ML, 770, `Reg. No. ${ENTITY.regNo}`, 9, false, 0.42);
  text(ML, 757, `VAT No. ${ENTITY.vatNo}`, 9, false, 0.42);

  const meta: Array<[string, string]> = [
    ["Number", getDisplayNumber(document)],
    ["Date", formatDate(document.issueDate)]
  ];
  if (!isCredit && !isReceipt && document.dueDate) {
    meta.push(["Due Date", formatDate(document.dueDate)]);
  }
  if (isCredit && document.sourceInvoiceNumber) meta.push(["Applies to", document.sourceInvoiceNumber]);

  let metaY = 772;
  for (const [label, value] of meta) {
    text(MR - 175, metaY, label, 8, false, 0.45);
    textRight(MR, metaY, value, 9.5, false, 0.12);
    metaY -= 15;
  }

  // Divider sits below BOTH the left letterhead and the (variable-height) meta block
  // so it never strikes through a meta row when there are 3–4 rows.
  const dividerY = Math.min(752, metaY + 7) - 8;
  line(ML, dividerY, MR, dividerY, 0.6, 0.8);

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
  text(colNum, hb, "#", 8.5, true, 0.25);
  text(colDesc, hb, "Description", 8.5, true, 0.25);
  textRight(unitR, hb, "Unit · €", 8.5, true, 0.25);
  textRight(totalR, hb, "Total · €", 8.5, true, 0.25);

  const bodyTop = tableTop - headerH;
  const descLines = wrapText(document.description || "—", xDescEnd - colDesc, 9.5, false);
  const lineH = 13;
  const rowH = Math.max(28, 16 + descLines.length * lineH);
  const rb = bodyTop - 18;
  text(colNum, rb, "1", 9.5, false, 0.2);
  descLines.forEach((ln, i) => text(colDesc, rb - i * lineH, ln, 9.5, false, 0.15));
  textRight(unitR, rb, money(document.amount), 9.5, false, 0.15);
  textRight(totalR, rb, money(document.amount), 9.5, false, 0.15);

  const bottom = bodyTop - rowH;
  // outer box + header separator + column rules
  line(ML, tableTop, MR, tableTop, 0.6, 0.78);
  line(ML, bodyTop, MR, bodyTop, 0.6, 0.78);
  line(ML, bottom, MR, bottom, 0.6, 0.78);
  line(ML, tableTop, ML, bottom, 0.6, 0.78);
  line(MR, tableTop, MR, bottom, 0.6, 0.78);
  for (const vx of [ML + 32, 410, 474]) line(vx, tableTop, vx, bottom, 0.5, 0.86);

  // ---- Totals ----
  const rate = document.amount > 0 ? Math.round((document.vatAmount / document.amount) * 100) : document.vatMode === "no-vat" ? 0 : 19;
  const labelX = MR - 200;
  let ty = bottom - 26;
  text(labelX, ty, "Subtotal", 9.5, false, 0.42);
  textRight(MR, ty, money(document.amount), 9.5, false, 0.12);
  ty -= 16;
  text(labelX, ty, `VAT ${rate}%`, 9.5, false, 0.42);
  textRight(MR, ty, money(document.vatAmount), 9.5, false, 0.12);
  ty -= 8;
  line(labelX, ty, MR, ty, 0.7, 0.6);
  ty -= 17;
  text(labelX, ty, isCredit ? "Total credited" : isReceipt ? "Total paid" : "Total due", 11.5, true, 0.1);
  textRight(MR, ty, money(document.total), 11.5, true, 0.1);
  ty -= 34;

  // ---- Settlement / acknowledgement ----
  text(ML, ty, isReceipt ? "ACKNOWLEDGEMENT" : isCredit ? "CREDIT" : "SETTLEMENT", 7.5, true, 0.5);
  ty -= 14;
  const settleLines = isReceipt
    ? wrapText(
        `This receipt confirms payment of ${document.sourceInvoiceNumber || getDisplayNumber(document)} in full. Issued by ${ENTITY.name}.`,
        MR - ML,
        9,
        false
      )
    : isCredit
      ? wrapText(
          `Credit balance applied against client account. No payment required.${document.sourceInvoiceNumber ? ` Reference: original invoice ${document.sourceInvoiceNumber}.` : ""}`,
          MR - ML,
          9,
          false
        )
      : [`Beneficiary: ${ENTITY.name}`, `IBAN: ${ENTITY.iban}`, `Bank: ${ENTITY.bank}`];
  for (const ln of settleLines) {
    text(ML, ty, ln, 9, false, 0.42);
    ty -= 12;
  }
  ty -= 14;

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
