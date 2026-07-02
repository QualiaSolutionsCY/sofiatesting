"use client";

import { ChevronDown, FileMinus, FileText, Receipt as ReceiptIcon, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { STAGES, clientById, fmt } from "@/lib/invoices/redesign/data";
import { addOneMonth, formatDate } from "@/lib/invoices/format";
import { matchesDocQuery } from "@/lib/invoices/redesign/search";
import type { Doc, DocKind, Filters } from "@/lib/invoices/redesign/types";

const STAGE_OPTIONS: Array<{ value: Filters["stage"]; label: string }> = [
  // "All Invoices" is the single main filter (Marios's 30-06 ask: drop the extra
  // "Invoices" option that duplicated "All Invoices"). The approved-numbered filter
  // logic below is kept but simply no longer offered as its own dropdown entry.
  { value: "all", label: "All Invoices" },
  { value: STAGES.DRAFT.id, label: STAGES.DRAFT.label },
  { value: STAGES.SENT_TO_MARIOS.id, label: STAGES.SENT_TO_MARIOS.label },
  { value: STAGES.SENT_TO_ACCOUNTING.id, label: "Paid" },
  { value: "kind-receipt", label: "Receipts" },
  { value: STAGES.CREDITED.id, label: STAGES.CREDITED.label },
  { value: STAGES.CANCELLED.id, label: STAGES.CANCELLED.label },
  { value: "recurrence-monthly", label: "Monthly" },
  { value: "recurrence-yearly", label: "Yearly" },
  { value: "deleted", label: "Deleted" }
];

// Numeric sequence from an official ("11479") or draft ("PREFIX-YYYY-11462-DRAFT")
// number — used to sort newest → oldest. Drafts and officials share one sequence
// (numbering.ts), so the highest number is always the most recently created.
function docSeq(doc: Doc): number {
  const raw = doc.officialNo ?? doc.draftNo ?? "";
  const match = raw.match(/(\d+)(?=-DRAFT$)/) ?? raw.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : -1;
}

interface ListPaneProps {
  docs: Doc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

export function ListPane({ docs, selectedId, onSelect, filters, setFilters }: ListPaneProps) {
  const filtered = useMemo(() => {
    return docs
      .filter((doc) => {
        if (filters.kind !== "all" && doc.kind !== filters.kind) return false;
        // Each filter shows ONLY its own kind of document — never mixed.
        if (filters.stage === "approved-numbered") {
          // "Invoices" = every invoice that became real: issued (approved /
          // numbered / paid) AND the ones later voided (cancelled / credited).
          // Marios's rule: "everything under invoice, even the cancelled ones."
          // Drafts (pre-number) stay under the Draft filter.
          if (doc.kind !== "invoice") return false;
          if (
            doc.stage !== STAGES.APPROVED.id &&
            doc.stage !== STAGES.NUMBERED.id &&
            doc.stage !== STAGES.SENT_TO_ACCOUNTING.id &&
            doc.stage !== STAGES.CANCELLED.id &&
            doc.stage !== STAGES.CREDITED.id
          ) {
            return false;
          }
        } else if (filters.stage === "kind-receipt") {
          // "Receipts" = receipt documents only.
          if (doc.kind !== "receipt") return false;
        } else if (filters.stage === STAGES.CREDITED.id) {
          // "Credited" = credit notes only (not the credited invoice).
          if (doc.kind !== "credit") return false;
        } else if (filters.stage === STAGES.CANCELLED.id) {
          // "Cancelled" = the invoice that was cancelled — whether voided before
          // numbering (cancelled) or cancelled via a credit note (credited).
          // The credit note itself lives under "Credited".
          if (doc.kind !== "invoice") return false;
          if (doc.stage !== STAGES.CANCELLED.id && doc.stage !== STAGES.CREDITED.id) return false;
        } else if (filters.stage === "recurrence-monthly") {
          if (doc.kind !== "invoice" || doc.recurrence !== "monthly") return false;
        } else if (filters.stage === "recurrence-yearly") {
          if (doc.kind !== "invoice" || doc.recurrence !== "yearly") return false;
        } else if (filters.stage === "deleted") {
          // The "Deleted" view is fed the already-soft-deleted set from the
          // server, so no extra stage filter is applied — show them all.
        } else if (filters.stage === STAGES.SENT_TO_ACCOUNTING.id) {
          // "Paid" = invoices ACTUALLY marked paid (a receipt was issued) — NOT
          // merely approved. An invoice enters the sent-to-accounting stage on
          // APPROVAL (markApproved), before any payment, so filtering by stage
          // alone counted approved-but-unpaid invoices as "Paid" and pushed the
          // count above the Receipts count. Payment is evidenced by paidOn /
          // receiptNo, which markPaidWithReceipt sets atomically with the receipt,
          // so this makes the Paid count match the Receipts count 1:1.
          if (doc.kind !== "invoice") return false;
          if (!doc.paidOn && !doc.receiptNo) return false;
        } else if (filters.stage !== "all") {
          // Draft / Sent to Marios — invoices only, by stage.
          if (doc.kind !== "invoice") return false;
          if (doc.stage !== filters.stage) return false;
        }
        // Free-text search across client / property / numbers / description /
        // amount / date — shared with the ⌘K palette (redesign/search.ts).
        if (!matchesDocQuery(doc, filters.q)) return false;
        return true;
      })
      // Newest → oldest by the invoice SEQUENCE number (drafts + officials share one
      // sequence — numbering.ts), so the most recently created document is always at
      // the top: a fresh draft OR a just-approved invoice. Editing never reorders,
      // because the number doesn't change on edit.
      .sort((a, b) => docSeq(b) - docSeq(a));
  }, [docs, filters]);

  const kindIcon = (kind: DocKind): ReactNode => {
    if (kind === "credit") return <FileMinus size={13} strokeWidth={1.7} />;
    if (kind === "receipt") return <ReceiptIcon size={13} strokeWidth={1.7} />;
    return <FileText size={13} strokeWidth={1.7} />;
  };

  return (
    <div className="list-pane">
      <div className="list-search">
        <Search size={13} strokeWidth={1.7} />
        <input
          placeholder="Search…"
          value={filters.q}
          onChange={(event) => setFilters({ ...filters, q: event.target.value })}
        />
      </div>

      <div className="list-stage-filter">
        <label className="stage-select-wrapper">
          <span className="sr-only">Filter by status</span>
          <select
            value={filters.stage}
            onChange={(event) =>
              setFilters({ ...filters, stage: event.target.value as Filters["stage"] })
            }
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown size={11} strokeWidth={2} className="stage-select-icon" aria-hidden />
        </label>
      </div>

      <div className="list-count">
        {filtered.length} {filtered.length === 1 ? "invoice" : "invoices"}
      </div>

      <div className="document-list">
        {filtered.length === 0 ? (
          <div className="list-empty">No invoices match.</div>
        ) : (
          filtered.map((doc) => {
            const cl = clientById(doc.client);
            const number = doc.officialNo ? `№ ${doc.officialNo}` : doc.draftNo || "Draft";
            return (
              <button
                key={doc.id}
                type="button"
                className={`document-row ${doc.id === selectedId ? "is-selected" : ""}`}
                onClick={() => onSelect(doc.id)}
              >
                <span className="row-icon">{kindIcon(doc.kind)}</span>
                <div className="row-main">
                  <span className="row-client">{cl.name}</span>
                  <span className="row-meta">
                    <span className="row-title-number">{number}</span>
                    <span className="row-date">{formatDate(doc.issued)}</span>
                    {doc.kind !== "credit" ? (
                      (() => {
                        // A cancelled / credit-noted invoice reads "Cancelled" (red),
                        // never "Unpaid".
                        if (doc.stage === STAGES.CANCELLED.id || doc.stage === STAGES.CREDITED.id) {
                          return <span className="row-pay is-cancelled">Cancelled</span>;
                        }
                        // "Paid" reflects a real payment (paidOn / receiptNo set by
                        // markPaidWithReceipt) — NOT the sent-to-accounting stage, which
                        // is reached on approval before payment. Approved-but-unpaid
                        // invoices read "Approved", not "Paid".
                        const paid = !!doc.paidOn || !!doc.receiptNo;
                        if (paid) return <span className="row-pay is-paid">Paid</span>;
                        if (doc.stage === STAGES.APPROVED.id || doc.stage === STAGES.SENT_TO_ACCOUNTING.id)
                          return <span className="row-pay is-approved">Approved</span>;
                        return <span className="row-pay is-unpaid">Unpaid</span>;
                      })()
                    ) : null}
                    {/* Credit notes store a negative total; show the magnitude here (the
                        "Credited" label carries the sign) so the row reads €7,140 not €-7,140. */}
                    <span className="row-total">{fmt(Math.abs(doc.total))}</span>
                    {/* Monthly invoices show when the next one is due to be created. */}
                    {doc.kind === "invoice" && doc.recurrence === "monthly" && doc.issued ? (
                      <span className="row-date" title="Next monthly invoice">↻ {formatDate(addOneMonth(doc.issued))}</span>
                    ) : null}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
