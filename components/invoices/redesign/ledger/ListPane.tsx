"use client";

import { ChevronDown, FileMinus, FileText, Receipt as ReceiptIcon, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { STAGES, clientById, fmt } from "@/lib/invoices/redesign/data";
import type { Doc, DocKind, Filters, Stage } from "@/lib/invoices/redesign/types";

const STAGE_OPTIONS: Array<{ value: "all" | Stage; label: string }> = [
  { value: "all", label: "All statuses" },
  ...Object.values(STAGES).map((s) => ({ value: s.id, label: s.label }))
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
        if (filters.stage !== "all" && doc.stage !== filters.stage) return false;
        if (filters.q) {
          const q = filters.q.toLowerCase();
          const cl = clientById(doc.client);
          const hay = [cl.name, cl.property, doc.officialNo, doc.draftNo, doc.pdf, doc.receiptNo]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
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

  const stageChip = (stage: Stage): ReactNode => {
    const s = Object.values(STAGES).find((x) => x.id === stage);
    return s ? <span className={`stage-chip ${s.chip}`}>{s.label}</span> : null;
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
                  <span className="row-title">{cl.name}</span>
                  <span className="row-meta">
                    <span className="row-number">{number}</span>
                    <span className="row-total">{fmt(doc.total)}</span>
                  </span>
                </div>
                {stageChip(doc.stage)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
