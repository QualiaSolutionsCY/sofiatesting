"use client";

import { ChevronDown, FileMinus, FileText, Receipt as ReceiptIcon, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { STAGES, clientById, fmt } from "@/lib/invoices/redesign/data";
import { formatDate } from "@/lib/invoices/format";
import type { Doc, DocKind, Filters } from "@/lib/invoices/redesign/types";

const STAGE_OPTIONS: Array<{ value: Filters["stage"]; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: STAGES.DRAFT.id, label: STAGES.DRAFT.label },
  { value: STAGES.SENT_TO_MARIOS.id, label: STAGES.SENT_TO_MARIOS.label },
  { value: "approved-numbered", label: "Invoices" },
  { value: STAGES.SENT_TO_ACCOUNTING.id, label: "Paid" },
  { value: "kind-receipt", label: "Receipts" },
  { value: STAGES.CREDITED.id, label: STAGES.CREDITED.label },
  { value: STAGES.CANCELLED.id, label: STAGES.CANCELLED.label },
  { value: "recurrence-monthly", label: "Monthly" },
  { value: "recurrence-yearly", label: "Yearly" }
];

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
        if (filters.stage === "approved-numbered") {
          // Approved bucket is invoices only — receipts live under "Receipts" and
          // credit notes under "Credited", even though they're also numbered.
          if (doc.kind !== "invoice") return false;
          if (doc.stage !== STAGES.APPROVED.id && doc.stage !== STAGES.NUMBERED.id) return false;
        } else if (filters.stage === "recurrence-monthly") {
          if (doc.recurrence !== "monthly") return false;
        } else if (filters.stage === "recurrence-yearly") {
          if (doc.recurrence !== "yearly") return false;
        } else if (filters.stage === "kind-receipt") {
          if (doc.kind !== "receipt") return false;
        } else if (filters.stage !== "all" && doc.stage !== filters.stage) {
          return false;
        }
        if (filters.q) {
          const q = filters.q.toLowerCase();
          const cl = clientById(doc.client);
          // Include the amount (raw, with and without thousands separators) so the
          // search can match by value, e.g. "5950" or "5,950".
          const total = Math.abs(doc.total || 0);
          const amountForms = [
            String(total),
            total.toLocaleString("en-GB"),
            total.toLocaleString("en-GB", { minimumFractionDigits: 2 })
          ];
          const hay = [cl.name, cl.property, doc.officialNo, doc.draftNo, doc.pdf, doc.receiptNo, doc.issued, ...amountForms]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q.replace(/[€,\s]/g, "") ) && !hay.includes(q)) return false;
        }
        return true;
      });
    // No re-sort: order is inherited from the repository (updated_at desc),
    // so the most recently created/updated invoice stays on top.
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
                        const paid = !!doc.paidOn || !!doc.receiptNo || doc.stage === STAGES.SENT_TO_ACCOUNTING.id;
                        if (paid) return <span className="row-pay is-paid">Paid</span>;
                        if (doc.stage === STAGES.APPROVED.id) return <span className="row-pay is-approved">Approved</span>;
                        return <span className="row-pay is-unpaid">Unpaid</span>;
                      })()
                    ) : null}
                    {/* Credit notes store a negative total; show the magnitude here (the
                        "Credited" label carries the sign) so the row reads €7,140 not €-7,140. */}
                    <span className="row-total">{fmt(Math.abs(doc.total))}</span>
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
