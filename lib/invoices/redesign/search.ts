import { clientById } from "@/lib/invoices/redesign/data";
import { formatDate } from "@/lib/invoices/format";
import type { Doc } from "@/lib/invoices/redesign/types";

/**
 * Free-text match for an invoice / receipt / credit-note across every field Marios
 * searches by (Marios #22): client name + property, the official / draft / receipt
 * numbers, the PDF filename, the description + line items, the amount (raw and
 * grouped forms), and BOTH the raw and the displayed date so either form matches.
 *
 * Single source of truth shared by the left-list filter (ListPane) and the top
 * ⌘K palette (CommandPalette) so the two search surfaces never diverge. An empty
 * query matches everything.
 */
export function matchesDocQuery(doc: Doc, query: string): boolean {
  const q = (query || "").trim().toLowerCase();
  if (!q) return true;

  const cl = clientById(doc.client);
  // Include the amount (raw, and with thousands separators) so the search can
  // match by value, e.g. "5950" or "5,950".
  const total = Math.abs(doc.total || 0);
  const amountForms = [
    String(total),
    total.toLocaleString("en-GB"),
    total.toLocaleString("en-GB", { minimumFractionDigits: 2 })
  ];
  const lineText = (doc.lines || []).map((l) => l.desc).join(" ");
  const hay = [
    cl.name,
    cl.property,
    doc.officialNo,
    doc.draftNo,
    doc.pdf,
    doc.receiptNo,
    doc.description,
    lineText,
    doc.issued,
    formatDate(doc.issued),
    ...amountForms
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return hay.includes(q.replace(/[€,\s]/g, "")) || hay.includes(q);
}
