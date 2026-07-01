import { clientById } from "@/lib/invoices/redesign/data";
import { formatDate } from "@/lib/invoices/format";
import {
  asArrayBuffer,
  ENTITY,
  escapePdfText,
  eur,
  latin1Bytes,
  textWidth,
  winAnsi,
  wrapText
} from "@/lib/invoices/pdf";
import type { Doc } from "@/lib/invoices/redesign/types";

export interface StatementMeta {
  from: string;
  to: string;
  clientName?: string;
}

// One A4 page fits ~40 statement rows beneath the letterhead + title + table
// header, leaving room for the bold Total row. Beyond that we cap and render a
// "+N more" hint as the last line rather than silently dropping invoices.
const MAX_ROWS = 40;

/**
 * Build a one-page A4 portrait "Statement of Account": the CSC letterhead, a
 * title, the date range (+ optional client), a five-column ledger table
 * [Date · № · Client · Description · Total], one row per invoice sorted by
 * issue date, and a bold Total row summing the totals.
 *
 * Reuses the single-invoice PDF's low-level scaffolding via additive exports
 * from lib/invoices/pdf.ts (ENTITY, eur, textWidth, wrapText, winAnsi,
 * escapePdfText, latin1Bytes, asArrayBuffer) so the letterhead, money format and
 * byte-accurate content-stream encoding match the invoice PDF exactly. The
 * page/table geometry is statement-specific, so it is assembled here rather than
 * bent out of buildDocumentPdfBytes (which lays out a single invoice).
 */
export function buildStatementPdfBlob(docs: Doc[], meta: StatementMeta): Blob {
  return new Blob([asArrayBuffer(buildStatementPdfBytes(docs, meta))], { type: "application/pdf" });
}

function buildStatementPdfBytes(docs: Doc[], meta: StatementMeta): Uint8Array {
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

  // ---- Header: title (right) + letterhead (left) ----
  textRight(MR, 792, "Statement of Account", 20, true, 0.1);

  let headerY = 748;
  text(ML, headerY, ENTITY.name, 13, true, 0.1);
  headerY -= 17;
  const headerLines = [
    ENTITY.regNo,
    ENTITY.address,
    ENTITY.contactLine,
    `V.A.T Reg. No. : ${ENTITY.vatNo}`
  ];
  for (const ln of headerLines) {
    text(ML, headerY, ln, 9, false, 0.32);
    headerY -= 12.5;
  }

  // ---- Statement meta (right): date range + optional client ----
  const rangeLabel = `Period: ${formatDate(meta.from)} — ${formatDate(meta.to)}`;
  textRight(MR, 760, rangeLabel, 9.5, false, 0.2);
  if (meta.clientName) {
    textRight(MR, 745, `Client: ${meta.clientName}`, 9.5, false, 0.2);
  } else {
    textRight(MR, 745, "Client: All clients", 9.5, false, 0.2);
  }

  // ---- Rows, sorted by issue date (oldest first) ----
  const sorted = [...docs].sort((a, b) => (a.issued || "").localeCompare(b.issued || ""));
  const total = sorted.reduce((sum, d) => sum + Math.abs(Number(d.total) || 0), 0);
  const overflow = Math.max(0, sorted.length - MAX_ROWS);
  const rows = sorted.slice(0, MAX_ROWS);
  if (overflow > 0) {
    console.warn(
      `[statement-pdf] ${sorted.length} invoices matched but only ${MAX_ROWS} fit on one page; ${overflow} not rendered — narrow the date range.`
    );
  }

  // ---- Ledger table: Date | № | Client | Description | Total ----
  const xNo = 120; // Date | №
  const xClient = 176; // № | Client
  const xDesc = 320; // Client | Description
  const xTotalDiv = 468; // Description | Total
  const totalR = MR - 6;

  let y = headerY - 22;
  const tableTop = y;

  // Header row (bold labels).
  const hb = tableTop - 15;
  text(ML + 8, hb, "Date", 9, true, 0.1);
  text(xNo + 8, hb, "№", 9, true, 0.1);
  text(xClient + 8, hb, "Client", 9, true, 0.1);
  text(xDesc + 8, hb, "Description", 9, true, 0.1);
  textRight(totalR, hb, "Total", 9, true, 0.1);

  const bodyTop = tableTop - 22;
  const lineH = 12;
  let cursor = bodyTop - 15;

  for (const doc of rows) {
    const client = clientById(doc.client);
    const number = doc.officialNo ? doc.officialNo : doc.draftNo || "—";
    const descSource = (doc.description || (doc.lines || []).map((l) => l.desc).filter(Boolean).join("; ") || "—")
      .replace(/\s*\n+\s*/g, " · ");
    const clientLines = wrapText(client.name, xDesc - xClient - 14, 9, false);
    const descLines = wrapText(descSource, xTotalDiv - xDesc - 14, 9, false);
    const rowLineCount = Math.max(1, clientLines.length, descLines.length);
    const h = 6 + rowLineCount * lineH;

    text(ML + 8, cursor, formatDate(doc.issued), 9, false, 0.18);
    text(xNo + 8, cursor, number, 9, false, 0.18);
    clientLines.forEach((ln, i) => text(xClient + 8, cursor - i * lineH, ln, 9, false, 0.18));
    descLines.forEach((ln, i) => text(xDesc + 8, cursor - i * lineH, ln, 9, false, 0.18));
    textRight(totalR, cursor, eur(Math.abs(Number(doc.total) || 0)), 9, false, 0.18);

    cursor -= h;
  }

  // Bold Total row beneath the last data row.
  const totalRowY = cursor - 4;
  const totalRowBottom = totalRowY - 16;
  text(xDesc + 8, totalRowY, "Total", 10, true, 0.1);
  textRight(totalR, totalRowY, eur(total), 10, true, 0.1);

  // Overflow hint (if capped) beneath the total row.
  let bottom = totalRowBottom;
  if (overflow > 0) {
    const hintY = totalRowBottom - 14;
    text(ML + 8, hintY, `+${overflow} more — narrow the date range to see every invoice.`, 8.5, false, 0.4);
    bottom = hintY - 8;
  }

  // ---- Table rules: outer box, header separator, total separator, column dividers ----
  line(ML, tableTop, MR, tableTop, 0.7, 0.5);
  line(ML, bodyTop, MR, bodyTop, 0.7, 0.5);
  line(ML, totalRowY + 12, MR, totalRowY + 12, 0.6, 0.6);
  line(ML, bottom, MR, bottom, 0.7, 0.5);
  line(ML, tableTop, ML, bottom, 0.7, 0.5);
  line(MR, tableTop, MR, bottom, 0.7, 0.5);
  for (const vx of [xNo, xClient, xDesc, xTotalDiv]) line(vx, tableTop, vx, bottom, 0.6, 0.65);

  // Empty-state note when no invoices match.
  if (rows.length === 0) {
    text(ML + 8, bodyTop - 20, "No invoices in this period.", 9.5, false, 0.4);
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
