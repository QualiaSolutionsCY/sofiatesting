import { formatDate, formatMoney, getDisplayNumber } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function buildDocumentPdfBlob(document: InvoiceDocument): Blob {
  return new Blob([asArrayBuffer(buildDocumentPdfBytes(document))], { type: "application/pdf" });
}

export function buildDocumentPdfBytes(document: InvoiceDocument): Uint8Array {
  const lines = [
    "CSC ZYPRUS PROPERTY GROUP LTD",
    `${document.kind === "credit-note" ? "Credit Note" : document.kind === "receipt" ? "Receipt" : "Invoice"} ${getDisplayNumber(document)}`,
    `Date: ${formatDate(document.issueDate)}`,
    `Bill To: ${document.clientName}`,
    `Description: ${document.description}`,
    `Subtotal: ${formatMoney(document.amount)}`,
    `VAT: ${formatMoney(document.vatAmount)}`,
    `Total: ${formatMoney(document.total)}`,
    document.sourceInvoiceNumber ? `Source invoice: ${document.sourceInvoiceNumber}` : "",
    document.correctionReason ? `Correction: ${document.correctionReason}` : ""
  ].filter(Boolean);
  const text = lines
    .map(escapePdfText)
    .map((line, index) => `1 0 0 1 72 ${760 - index * 22} Tm (${line}) Tj`)
    .join("\n");
  const stream = `BT /F1 12 Tf ${text} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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

  return new TextEncoder().encode(parts.join(""));
}

export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
