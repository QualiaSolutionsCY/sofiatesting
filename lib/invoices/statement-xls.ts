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

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { vertical: "center" as const }
};
const TOTAL_STYLE = { font: { bold: true } };
const MONEY_FMT = "#,##0.00";

/**
 * Build an Excel (.xlsx) statement of account. Columns:
 * Date · Invoice № · Client · Description · Subtotal · VAT · Total · Status.
 * Bold, filled header row; a bold Totals row at the bottom summing Subtotal / VAT
 * / Total. Money cells carry a numeric value + a #,##0.00 format so Excel treats
 * them as numbers (sortable, summable), not text.
 */
export function buildStatementXlsBlob(docs: Doc[], meta: StatementMeta): Blob {
  const sorted = [...docs].sort((a, b) => (a.issued || "").localeCompare(b.issued || ""));

  const header = ["Date", "Invoice №", "Client", "Description", "Subtotal", "VAT", "Total", "Status"];

  let sumSub = 0;
  let sumVat = 0;
  let sumTotal = 0;

  const dataRows = sorted.map((doc) => {
    const { subtotal, vat, total } = splitVat(doc);
    sumSub += subtotal;
    sumVat += vat;
    sumTotal += total;
    const number = doc.officialNo ? doc.officialNo : doc.draftNo || "—";
    const description = (doc.description || (doc.lines || []).map((l) => l.desc).filter(Boolean).join("; ") || "—")
      .replace(/\s*\n+\s*/g, " · ");
    return [
      formatDate(doc.issued),
      number,
      clientById(doc.client).name,
      description,
      round2(subtotal),
      round2(vat),
      round2(total),
      STATUS_LABEL[doc.stage] ?? doc.stage
    ];
  });

  const totalsRow = ["", "", "", "Total", round2(sumSub), round2(sumVat), round2(sumTotal), ""];

  const aoa = [header, ...dataRows, totalsRow];
  const sheet = xlsxUtils.aoa_to_sheet(aoa);

  const lastRow = aoa.length; // 1-based count of rows including header
  const moneyCols = [4, 5, 6]; // Subtotal, VAT, Total (0-based)

  // Style the header row.
  for (let c = 0; c < header.length; c++) {
    const addr = xlsxUtils.encode_cell({ r: 0, c });
    const cell = sheet[addr];
    if (cell) cell.s = HEADER_STYLE;
  }

  // Number-format the money columns (data rows + totals row).
  for (let r = 1; r < lastRow; r++) {
    for (const c of moneyCols) {
      const cell = sheet[xlsxUtils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = MONEY_FMT;
    }
  }

  // Bold the totals row.
  for (let c = 0; c < header.length; c++) {
    const cell = sheet[xlsxUtils.encode_cell({ r: lastRow - 1, c })];
    if (cell) cell.s = { ...(cell.s ?? {}), ...TOTAL_STYLE };
  }

  // Sensible column widths.
  sheet["!cols"] = [
    { wch: 18 }, // Date
    { wch: 12 }, // Invoice №
    { wch: 24 }, // Client
    { wch: 40 }, // Description
    { wch: 12 }, // Subtotal
    { wch: 12 }, // VAT
    { wch: 12 }, // Total
    { wch: 20 } // Status
  ];

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
