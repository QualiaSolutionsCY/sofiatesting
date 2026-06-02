"use client";

import { FileMinus, FileText, Receipt as ReceiptIcon, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { STAGES, clientById, fmt } from "@/lib/invoices/redesign/data";
import type { Doc, DocKind, Filters, Stage } from "@/lib/invoices/redesign/types";

interface ListPaneProps {
  docs: Doc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

export function ListPane({ docs, selectedId, onSelect, filters, setFilters }: ListPaneProps) {
  const filtered = useMemo(() => {
    return docs.filter((doc) => {
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
