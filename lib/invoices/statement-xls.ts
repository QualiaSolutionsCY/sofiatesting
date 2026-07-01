import { utils as xlsxUtils, write as xlsxWrite } from "xlsx-js-style";
import { clientById } from "@/lib/invoices/redesign/data";
import { formatDate } from "@/lib/invoices/format";
import type { Doc, Stage } from "@/lib/invoices/redesign/types";

export interface StatementMeta {
  from: string;
  to: string;
  clientName?: string;
}

const STATUS_LABEL: Record<Stage, string> = {
  draft: "Draft",
  "sent-to-marios": "With Marios",
  "correction-needed": "Correction needed",
  "corrected-resend": "Corrected · resend",
  approved: "Approved",
  numbered: "Numbered",
  "sent-to-accounting": "Paid · receipt issued",
  credited: "Credited",
  cancelled: "Cancelled"
};

// Split a Doc's absolute total into subtotal + VAT using the same VAT treatment the
// invoice was issued under. Mirrors the derivation in lib/invoices/pdf.ts's totals
// block (subtotal + VAT = total for every vatMode) so the statement's figures agree
// with each invoice's own PDF.
function splitVat(doc: Doc): { subtotal: number; vat: number; total: number } {
  const total = Math.abs(Number(doc.total) || 0);
  const rate = doc.vatMode === "no-vat" ? 0 : Number(doc.vatRate) || 0;
  if (rate === 0) return { subtotal: total, vat: 0, total };
  if (doc.vatMode === "included-vat") {
    const subtotal = total / (1 + rate / 100);
    return { subtotal, vat: total - subtotal, total };
  }
  // plus-vat: stored total is gross; back out the net subtotal.
  const subtotal = total / (1 + rate / 100);
  return { subtotal, vat: total - subtotal, total };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const MONEY_FMT = "#,##0.00";

// Colours (ARGB hex, no leading #). Kept muted/professional to match the PDF.
const INK = "1F2937"; // header fill
const RULE = "D1D5DB"; // thin cell borders
const ZEBRA = "F6F7F9"; // alternate-row fill
const TITLE_INK = "111827";
const META_INK = "6B7280";

const thin = { style: "thin" as const, color: { rgb: RULE } };
const CELL_BORDER = { top: thin, bottom: thin, left: thin, right: thin };

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: INK } },
  alignment: { vertical: "center" as const },
  border: CELL_BORDER
};
const MONEY_HEADER_STYLE = {
  ...HEADER_STYLE,
  alignment: { vertical: "center" as const, horizontal: "right" as const }
};
const TITLE_STYLE = { font: { bold: true, sz: 16, color: { rgb: TITLE_INK } } };
const SUBTITLE_STYLE = { font: { bold: true, sz: 10, color: { rgb: TITLE_INK } } };
const META_STYLE = { font: { sz: 10, color: { rgb: META_INK } } };

const textCell = (zebra: boolean) => ({
  alignment: { horizontal: "left" as const, vertical: "center" as const },
  border: CELL_BORDER,
  ...(zebra ? { fill: { fgColor: { rgb: ZEBRA } } } : {})
});
const moneyCell = (zebra: boolean) => ({
  alignment: { horizontal: "right" as const, vertical: "center" as const },
  border: CELL_BORDER,
  ...(zebra ? { fill: { fgColor: { rgb: ZEBRA } } } : {})
});

const TOTAL_TEXT_STYLE = {
  font: { bold: true },
  alignment: { horizontal: "right" as const },
  border: { ...CELL_BORDER, top: { style: "medium" as const, color: { rgb: INK } } }
};
const TOTAL_MONEY_STYLE = {
  font: { bold: true },
  alignment: { horizontal: "right" as const },
  border: { ...CELL_BORDER, top: { style: "medium" as const, color: { rgb: INK } } }
};
const TOTAL_BLANK_STYLE = {
  border: { ...CELL_BORDER, top: { style: "medium" as const, color: { rgb: INK } } }
};

/**
 * Build an Excel (.xlsx) statement of account. A merged title / meta block sits
 * above an eight-column ledger:
 * Date · Invoice № · Client · Description · Subtotal · VAT · Total · Status.
 *
 * Structure:
 * - Rows 1–4: "STATEMENT OF ACCOUNT" title, company name, period, and account —
 *   each a merged banner spanning all columns.
 * - Header row: bold, dark-filled, frozen (freeze panes) so it stays visible when
 *   scrolling; money headers right-aligned.
 * - Data rows: zebra-striped, thin cell borders, money right-aligned and numeric
 *   with a #,##0.00 format so Excel sorts/sums them as numbers (not text). Status
 *   is a human-readable label (Paid / Unpaid / Cancelled / …).
 * - Totals row: bold, medium top border, with live =SUM() formulas over the money
 *   columns so the figures recalculate if a user edits a cell.
 */
export function buildStatementXlsBlob(docs: Doc[], meta: StatementMeta): Blob {
  const sorted = [...docs].sort((a, b) => (a.issued || "").localeCompare(b.issued || ""));

  const header = ["Date", "Invoice №", "Client", "Description", "Subtotal", "VAT", "Total", "Status"];
  const colCount = header.length; // 8
  const moneyCols = [4, 5, 6]; // Subtotal, VAT, Total (0-based)

  // ---- Title / meta banner (rows 0–3), each merged across all columns ----
  const accountLine = meta.clientName ? meta.clientName : "All clients";
  const periodLine = `Period: ${formatDate(meta.from)} — ${formatDate(meta.to)}`;
  const bannerRows = [
    ["STATEMENT OF ACCOUNT"],
    ["CSC ZYPRUS PROPERTY GROUP LTD"],
    [periodLine],
    [`Account: ${accountLine}`]
  ];
  const BANNER_H = bannerRows.length; // 4
  const HEADER_R = BANNER_H + 1; // one blank spacer row between banner and header

  // ---- Build the sheet from an array-of-arrays so cell types are inferred ----
  const aoa: (string | number)[][] = [];
  for (const b of bannerRows) aoa.push([b[0]]);
  aoa.push([]); // spacer row
  aoa.push(header);

  let sumSub = 0;
  let sumVat = 0;
  let sumTotal = 0;
  for (const doc of sorted) {
    const { subtotal, vat, total } = splitVat(doc);
    sumSub += subtotal;
    sumVat += vat;
    sumTotal += total;
    const number = doc.officialNo ? doc.officialNo : doc.draftNo || "—";
    const description = (doc.description || (doc.lines || []).map((l) => l.desc).filter(Boolean).join("; ") || "—")
      .replace(/\s*\n+\s*/g, " · ");
    aoa.push([
      formatDate(doc.issued),
      number,
      clientById(doc.client).name,
      description,
      round2(subtotal),
      round2(vat),
      round2(total),
      STATUS_LABEL[doc.stage] ?? doc.stage
    ]);
  }

  const firstDataR = HEADER_R + 1; // 0-based row index of the first data row
  const lastDataR = firstDataR + sorted.length - 1; // -1 when empty (no data rows)
  const totalsR = firstDataR + sorted.length; // row index of the Totals row

  // Totals row: Excel =SUM() over the data range (numeric, live-recalculating).
  const sumFormula = (c: number) =>
    sorted.length > 0
      ? { f: `SUM(${xlsxUtils.encode_cell({ r: firstDataR, c })}:${xlsxUtils.encode_cell({ r: lastDataR, c })})` }
      : 0;
  const totalsRow: (string | number)[] = ["", "", "", "TOTAL", 0, 0, 0, `${sorted.length} invoice${sorted.length === 1 ? "" : "s"}`];
  aoa.push(totalsRow);

  const sheet = xlsxUtils.aoa_to_sheet(aoa);

  // Overwrite the totals money cells with live SUM formulas.
  if (sorted.length > 0) {
    for (const c of moneyCols) {
      const addr = xlsxUtils.encode_cell({ r: totalsR, c });
      sheet[addr] = { t: "n", ...(sumFormula(c) as { f: string }) } as typeof sheet[typeof addr];
    }
  }

  // ---- Merges: each banner line spans all 8 columns ----
  sheet["!merges"] = bannerRows.map((_row, r) => ({
    s: { r, c: 0 },
    e: { r, c: colCount - 1 }
  }));

  // ---- Style the banner ----
  const styleAt = (r: number, c: number, style: Record<string, unknown>) => {
    const addr = xlsxUtils.encode_cell({ r, c });
    const cell = sheet[addr];
    if (cell) cell.s = style;
  };
  styleAt(0, 0, TITLE_STYLE);
  styleAt(1, 0, SUBTITLE_STYLE);
  styleAt(2, 0, META_STYLE);
  styleAt(3, 0, META_STYLE);

  // ---- Header row: filled/bold, money headers right-aligned ----
  for (let c = 0; c < colCount; c++) {
    styleAt(HEADER_R, c, moneyCols.includes(c) ? MONEY_HEADER_STYLE : HEADER_STYLE);
  }

  // ---- Data rows: zebra + borders + alignment; money numeric with #,##0.00 ----
  for (let r = firstDataR; r <= lastDataR; r++) {
    const zebra = (r - firstDataR) % 2 === 1;
    for (let c = 0; c < colCount; c++) {
      const addr = xlsxUtils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) continue;
      if (moneyCols.includes(c)) {
        cell.s = moneyCell(zebra);
        if (cell.t === "n") cell.z = MONEY_FMT;
      } else {
        cell.s = textCell(zebra);
      }
    }
  }

  // ---- Totals row: bold, medium top border, money right-aligned + formatted ----
  for (let c = 0; c < colCount; c++) {
    const addr = xlsxUtils.encode_cell({ r: totalsR, c });
    const cell = sheet[addr];
    if (!cell) continue;
    if (moneyCols.includes(c)) {
      cell.s = TOTAL_MONEY_STYLE;
      cell.z = MONEY_FMT;
    } else if (c === 3) {
      cell.s = { ...TOTAL_TEXT_STYLE, alignment: { horizontal: "right" as const } };
    } else if (c === colCount - 1) {
      cell.s = { ...TOTAL_TEXT_STYLE, font: { bold: true }, alignment: { horizontal: "left" as const } };
    } else {
      cell.s = TOTAL_BLANK_STYLE;
    }
  }

  // ---- Column widths ----
  sheet["!cols"] = [
    { wch: 18 }, // Date
    { wch: 13 }, // Invoice №
    { wch: 26 }, // Client
    { wch: 42 }, // Description
    { wch: 13 }, // Subtotal
    { wch: 12 }, // VAT
    { wch: 14 }, // Total
    { wch: 22 } // Status
  ];

  // ---- Row heights: taller title + header ----
  sheet["!rows"] = [];
  sheet["!rows"][0] = { hpt: 22 }; // title
  sheet["!rows"][HEADER_R] = { hpt: 20 }; // header

  // ---- Freeze the banner + header so rows scroll under a fixed heading ----
  sheet["!freeze"] = { xSplit: 0, ySplit: HEADER_R + 1 };
  sheet["!autofilter"] = {
    ref: `${xlsxUtils.encode_cell({ r: HEADER_R, c: 0 })}:${xlsxUtils.encode_cell({ r: Math.max(HEADER_R, lastDataR), c: colCount - 1 })}`
  };

  const wb = xlsxUtils.book_new();
  wb.Props = {
    Title: "Statement of Account",
    Subject: meta.clientName ? `${meta.clientName} · ${meta.from} — ${meta.to}` : `All clients · ${meta.from} — ${meta.to}`,
    Company: "CSC ZYPRUS PROPERTY GROUP LTD"
  };
  xlsxUtils.book_append_sheet(wb, sheet, "Statement");

  const out = xlsxWrite(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}
