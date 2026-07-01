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

// One A4 page fits ~34 statement rows beneath the letterhead + title block +
// table header, leaving room for the summary footer (count + Subtotal / VAT /
// Total). Beyond that we cap and render a distinct "+N more" hint as the last
// line rather than silently dropping invoices.
const MAX_ROWS = 34;

// Human-readable status labels for the ledger's Status column. Mirrors the XLS
// generator (lib/invoices/statement-xls.ts) so the two exports read identically.
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  "sent-to-marios": "With Marios",
  "correction-needed": "Correction needed",
  "corrected-resend": "Corrected · resend",
  approved: "Approved",
  numbered: "Numbered",
  "sent-to-accounting": "Paid",
  credited: "Credited",
  cancelled: "Cancelled"
};

// Split a Doc's absolute total into subtotal + VAT using the same VAT treatment
// the invoice was issued under. Mirrors splitVat in lib/invoices/statement-xls.ts
// (and the totals block in lib/invoices/pdf.ts) so the PDF summary reconciles with
// the XLS export and each invoice's own PDF (subtotal + VAT = total, every mode).
function splitVat(doc: Doc): { subtotal: number; vat: number; total: number } {
  const total = Math.abs(Number(doc.total) || 0);
  const rate = doc.vatMode === "no-vat" ? 0 : Number(doc.vatRate) || 0;
  if (rate === 0) return { subtotal: total, vat: 0, total };
  const subtotal = total / (1 + rate / 100);
  return { subtotal, vat: total - subtotal, total };
}

/**
 * Build a one-page A4 portrait "Statement of Account": a strong header block (CSC
 * letterhead on the left, a "STATEMENT OF ACCOUNT" title with the period + client
 * + generation date in a boxed meta panel on the right), a ruled ledger table with
 * a shaded header row [Date · № · Client · Description · Status · Total], one
 * zebra-striped row per invoice sorted by issue date, and a visually separated
 * summary footer showing the invoice count and bold Subtotal / VAT / Total sums.
 *
 * Reuses the single-invoice PDF's low-level scaffolding via additive exports from
 * lib/invoices/pdf.ts (ENTITY, eur, textWidth, wrapText, winAnsi, escapePdfText,
 * latin1Bytes, asArrayBuffer) so the letterhead, money format and byte-accurate
 * content-stream encoding match the invoice PDF exactly. The page/table geometry is
 * statement-specific, so it is assembled here rather than bent out of
 * buildDocumentPdfBytes (which lays out a single invoice).
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
  // Filled rectangle (used for the shaded header row and zebra stripes). Drawn
  // BEFORE the text over it so the glyphs stay on top.
  const fillRect = (x: number, y: number, w: number, h: number, gray: number) =>
    ops.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);

  // Truncate a single-line cell value to fit a column width, appending an ellipsis
  // so the ledger stays one line per field (Client / Description) and columns never
  // collide. wrapText is width-aware; we take its first line then trim to fit.
  const fit = (value: string, maxWidth: number, size: number): string => {
    if (textWidth(value, size, false) <= maxWidth) return value;
    let out = value;
    while (out.length > 1 && textWidth(`${out}…`, size, false) > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out.trimEnd()}…`;
  };

  // ============================ HEADER BLOCK ============================
  // Company letterhead (left) — bold name + reg/address/contact/VAT lines.
  let headerY = 792;
  text(ML, headerY, ENTITY.name, 13, true, 0.1);
  headerY -= 16;
  const headerLines = [
    `Reg. No. ${ENTITY.regNo}`,
    ENTITY.address,
    ENTITY.contactLine,
    `V.A.T Reg. No. : ${ENTITY.vatNo}`
  ];
  for (const ln of headerLines) {
    text(ML, headerY, ln, 8.5, false, 0.34);
    headerY -= 12;
  }

  // Title + meta panel (right). The big title sits at the top-right; a light,
  // boxed panel beneath it carries the period, client and generation date so the
  // statement's scope reads at a glance.
  textRight(MR, 792, "STATEMENT OF ACCOUNT", 17, true, 0.08);

  const panelTop = 776;
  const panelBottom = 700;
  const panelLeft = 330;
  fillRect(panelLeft, panelBottom, MR - panelLeft, panelTop - panelBottom, 0.965);
  line(panelLeft, panelTop, MR, panelTop, 0.6, 0.72);
  line(panelLeft, panelBottom, MR, panelBottom, 0.6, 0.72);
  line(panelLeft, panelBottom, panelLeft, panelTop, 0.6, 0.72);
  line(MR, panelBottom, MR, panelTop, 0.6, 0.72);

  const metaRows: Array<[string, string]> = [
    ["Period", `${formatDate(meta.from)} — ${formatDate(meta.to)}`],
    ["Account", meta.clientName ? meta.clientName : "All clients"],
    ["Generated", formatDate(new Date().toISOString().slice(0, 10))]
  ];
  const metaLabelX = panelLeft + 12;
  const metaValueR = MR - 12;
  let metaY = panelTop - 18;
  for (const [label, value] of metaRows) {
    text(metaLabelX, metaY, label.toUpperCase(), 7.5, true, 0.42);
    textRight(metaValueR, metaY, fit(value, metaValueR - metaLabelX - 66, 9.5), 9.5, false, 0.14);
    metaY -= 23;
  }

  // Full-width rule separating the header block from the ledger.
  const dividerY = 688;
  line(ML, dividerY, MR, dividerY, 1.1, 0.35);

  // ============================ LEDGER TABLE ============================
  // Sort oldest → newest and pre-compute the reconciled Subtotal / VAT / Total.
  const sorted = [...docs].sort((a, b) => (a.issued || "").localeCompare(b.issued || ""));
  let sumSub = 0;
  let sumVat = 0;
  let sumTotal = 0;
  for (const d of sorted) {
    const { subtotal, vat, total } = splitVat(d);
    sumSub += subtotal;
    sumVat += vat;
    sumTotal += total;
  }
  const overflow = Math.max(0, sorted.length - MAX_ROWS);
  const rows = sorted.slice(0, MAX_ROWS);
  if (overflow > 0) {
    console.warn(
      `[statement-pdf] ${sorted.length} invoices matched but only ${MAX_ROWS} fit on one page; ${overflow} not rendered — narrow the date range.`
    );
  }

  // Column geometry: Date | № | Client | Description | Status | Total.
  const xNo = 120;
  const xClient = 172;
  const xDesc = 280;
  const xStatus = 424;
  const xTotalDiv = 486;
  const totalR = MR - 6;

  const tableTop = dividerY - 16;
  const headerRowH = 18;
  const rowH = 16;

  // Shaded, ruled header row.
  fillRect(ML, tableTop - headerRowH, MR - ML, headerRowH, 0.16);
  const hy = tableTop - 13;
  text(ML + 8, hy, "Date", 8.5, true, 0.98);
  text(xNo + 8, hy, "№", 8.5, true, 0.98);
  text(xClient + 8, hy, "Client", 8.5, true, 0.98);
  text(xDesc + 8, hy, "Description", 8.5, true, 0.98);
  text(xStatus + 8, hy, "Status", 8.5, true, 0.98);
  textRight(totalR, hy, "Total", 8.5, true, 0.98);

  // Body rows with zebra shading (every other row lightly filled).
  const bodyTop = tableTop - headerRowH;
  let cursor = bodyTop;
  rows.forEach((doc, idx) => {
    const rowTop = cursor;
    const rowBottom = rowTop - rowH;
    if (idx % 2 === 1) fillRect(ML, rowBottom, MR - ML, rowH, 0.972);

    const client = clientById(doc.client);
    const number = doc.officialNo ? doc.officialNo : doc.draftNo || "—";
    const descSource = (doc.description || (doc.lines || []).map((l) => l.desc).filter(Boolean).join("; ") || "—")
      .replace(/\s*\n+\s*/g, " · ");
    const status = STATUS_LABEL[doc.stage] ?? doc.stage;
    const baseline = rowBottom + 5;

    text(ML + 8, baseline, formatDate(doc.issued), 8.5, false, 0.18);
    text(xNo + 8, baseline, fit(number, xClient - xNo - 12, 8.5), 8.5, false, 0.18);
    text(xClient + 8, baseline, fit(client.name, xDesc - xClient - 12, 8.5), 8.5, false, 0.18);
    text(xDesc + 8, baseline, fit(descSource, xStatus - xDesc - 12, 8.5), 8.5, false, 0.18);
    text(xStatus + 8, baseline, fit(status, xTotalDiv - xStatus - 12, 8.5), 8.5, false, 0.3);
    textRight(totalR, baseline, eur(splitVat(doc).total), 8.5, false, 0.14);

    cursor = rowBottom;
  });

  const bodyBottom = rows.length === 0 ? bodyTop - rowH : cursor;

  // Empty-state note when no invoices match.
  if (rows.length === 0) {
    text(ML + 8, bodyTop - 11, "No invoices in this period.", 9, false, 0.4);
  }

  // ---- Table rules: outer box, header separator, per-row rules, column dividers ----
  line(ML, tableTop, MR, tableTop, 0.8, 0.35);
  line(ML, bodyTop, MR, bodyTop, 0.8, 0.35);
  for (let i = 1; i < rows.length; i++) line(ML, bodyTop - i * rowH, MR, bodyTop - i * rowH, 0.4, 0.85);
  line(ML, bodyBottom, MR, bodyBottom, 0.8, 0.35);
  line(ML, tableTop, ML, bodyBottom, 0.8, 0.35);
  line(MR, tableTop, MR, bodyBottom, 0.8, 0.35);
  for (const vx of [xNo, xClient, xDesc, xStatus, xTotalDiv]) line(vx, tableTop, vx, bodyBottom, 0.5, 0.62);

  // ============================ SUMMARY FOOTER ============================
  // A visually separate boxed panel on the right: invoice count on the left, then
  // Subtotal / VAT / bold Total stacked with right-aligned money.
  const gap = 16;
  const footTop = bodyBottom - gap;
  const footRowH = 16;
  const footBottom = footTop - footRowH * 3 - 8;
  const footLeft = 300;

  fillRect(footLeft, footBottom, MR - footLeft, footTop - footBottom, 0.965);
  line(footLeft, footTop, MR, footTop, 0.7, 0.4);
  line(footLeft, footBottom, MR, footBottom, 0.7, 0.4);
  line(footLeft, footBottom, footLeft, footTop, 0.7, 0.4);
  line(MR, footBottom, MR, footTop, 0.7, 0.4);

  const footLabelR = MR - 96;
  const footValueR = MR - 10;
  let fy = footTop - 15;
  const footRow = (label: string, value: string, bold: boolean) => {
    textRight(footLabelR, fy, label, 9.5, bold, bold ? 0.1 : 0.32);
    textRight(footValueR, fy, value, 9.5, bold, bold ? 0.1 : 0.16);
    fy -= footRowH;
  };
  footRow("Subtotal", eur(sumSub), false);
  footRow("V.A.T", eur(sumVat), false);
  // Bold rule above the Total line, then the bold Total.
  line(footLabelR - 60, fy + footRowH - 3, footValueR, fy + footRowH - 3, 0.5, 0.55);
  footRow("Total", eur(sumTotal), true);

  // Invoice count (left of the totals panel), plus the distinct overflow hint.
  const countLabel = `${sorted.length} invoice${sorted.length === 1 ? "" : "s"}${
    meta.clientName ? "" : " · all clients"
  } in this period`;
  text(ML, footTop - 15, countLabel, 9, true, 0.2);
  if (overflow > 0) {
    // Distinct overflow line: a small filled tag + accent-grey caption beneath the count.
    const hintY = footTop - 33;
    fillRect(ML, hintY - 3, 3, 11, 0.45);
    text(ML + 9, hintY, `+${overflow} more not shown — narrow the date range to see every invoice.`, 8.5, true, 0.42);
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
