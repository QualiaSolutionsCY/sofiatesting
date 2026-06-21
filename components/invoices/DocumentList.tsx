import { FileCheck2, FileText, Filter, Search } from "lucide-react";
import {
  documentKindLabel,
  formatDate,
  formatMoney,
  getDisplayNumber,
  recurrenceLabel,
  statusLabel,
} from "@/lib/invoices/format";
import type {
  ApprovalStatus,
  DocumentFilters,
  DocumentKind,
  InvoiceDocument,
  PaymentStatus,
  Recurrence,
} from "@/lib/invoices/types/invoice";

const statusOptions: Array<"all" | ApprovalStatus> = [
  "all",
  "draft",
  "sent-to-marios",
  "approved",
  "numbered",
  "sent-to-accounting",
  "correction-needed",
  "corrected-resend",
  "cancelled",
  "credited",
];

const recurrenceOptions: Array<"all" | Recurrence> = [
  "all",
  "none",
  "monthly",
  "yearly",
];
const paymentOptions: Array<"all" | PaymentStatus> = [
  "all",
  "unpaid",
  "paid",
  "not-required",
];

export function DocumentList({
  documents,
  filters,
  selectedId,
  onFilterChange,
  onSelect,
}: {
  documents: InvoiceDocument[];
  filters: DocumentFilters;
  selectedId: string;
  onFilterChange: (filters: DocumentFilters) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="list-pane">
      <div className="list-pane-header">
        <div>
          <p className="eyebrow">Editable invoice workbook</p>
          <h2>May monthly invoices</h2>
          <p>May 2026 · Zyprus monthly cycle</p>
        </div>
        <span>{documents.length} rows</span>
      </div>
      <div className="list-controls">
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="Search by invoice number"
              onChange={(event) =>
                onFilterChange({ ...filters, search: event.target.value })
              }
              placeholder="Search invoice number — or press ⌘K"
              value={filters.search}
            />
          </div>
          <label className="toolbar-status">
            <span className="sr-only">Status</span>
            <select
              onChange={(event) =>
                onFilterChange({
                  ...filters,
                  status: event.target.value as DocumentFilters["status"],
                })
              }
              value={filters.status}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <details className="filters-disclosure">
          <summary>
            <Filter aria-hidden size={14} />
            <span>More filters</span>
            {activeAdvancedFilterCount(filters) > 0 ? (
              <em>{activeAdvancedFilterCount(filters)} active</em>
            ) : null}
          </summary>
          <div className="filters-disclosure-body">
            <label className="select-filter">
              <span>Payment</span>
              <select
                onChange={(event) =>
                  onFilterChange({
                    ...filters,
                    paymentStatus: event.target
                      .value as DocumentFilters["paymentStatus"],
                  })
                }
                value={filters.paymentStatus}
              >
                {paymentOptions.map((status) => (
                  <option key={status} value={status}>
                    {status === "all"
                      ? "All payments"
                      : status.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>

            <div className="filter-row list-tabs">
              <SegmentedFilter<"all" | DocumentKind>
                format={(value) =>
                  value === "all"
                    ? "All documents"
                    : `${documentKindLabel(value)} list`
                }
                label="Document lists"
                onChange={(value) =>
                  onFilterChange({ ...filters, kind: value })
                }
                options={["all", "invoice", "credit-note"]}
                value={filters.kind}
              />
              <SegmentedFilter<"all" | Recurrence>
                format={(value) =>
                  value === "all" ? "All" : recurrenceLabel(value)
                }
                label="Recurrence"
                onChange={(value) =>
                  onFilterChange({ ...filters, recurrence: value })
                }
                options={recurrenceOptions}
                value={filters.recurrence}
              />
            </div>

            <div className="date-client-filters">
              <label>
                <span>Client</span>
                <input
                  onChange={(event) =>
                    onFilterChange({
                      ...filters,
                      clientSearch: event.target.value,
                    })
                  }
                  placeholder="Filter client"
                  value={filters.clientSearch}
                />
              </label>
              <label>
                <span>From</span>
                <input
                  onChange={(event) =>
                    onFilterChange({ ...filters, dateFrom: event.target.value })
                  }
                  type="date"
                  value={filters.dateFrom}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  onChange={(event) =>
                    onFilterChange({ ...filters, dateTo: event.target.value })
                  }
                  type="date"
                  value={filters.dateTo}
                />
              </label>
            </div>
          </div>
        </details>
      </div>

      <div className="document-list-header">
        <span>Client</span>
        <span>Number</span>
        <span>Issued</span>
        <span>Total</span>
        <span>Stage</span>
      </div>
      <div className="document-list">
        {documents.map((document) => (
          <button
            className={`document-row ${document.id === selectedId ? "is-selected" : ""}`}
            key={document.id}
            onClick={() => onSelect(document.id)}
            type="button"
          >
            <span className="row-client">
              <span aria-hidden className="row-icon">
                {document.kind === "invoice" ? (
                  <FileText size={16} />
                ) : (
                  <FileCheck2 size={16} />
                )}
              </span>
              <span className="row-client-main">
                <span className="row-title">{document.clientName}</span>
                <span className="row-meta">
                  {documentKindLabel(document.kind)} ·{" "}
                  {document.paymentStatus.replaceAll("-", " ")}
                </span>
              </span>
            </span>
            <span className="row-number">{getDisplayNumber(document)}</span>
            <span className="row-date">{formatDate(document.issueDate)}</span>
            <span className="row-total">{formatMoney(document.total)}</span>
            <span className={`stage-chip stage-${document.status}`}>
              {statusLabel(document.status)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function activeAdvancedFilterCount(filters: DocumentFilters) {
  let count = 0;
  if (filters.paymentStatus !== "all") count += 1;
  if (filters.kind !== "all") count += 1;
  if (filters.recurrence !== "all") count += 1;
  if (filters.clientSearch.trim()) count += 1;
  if (filters.dateFrom) count += 1;
  if (filters.dateTo) count += 1;
  return count;
}

type SegmentedFilterProps<T extends string> = {
  label: string;
  value: T;
  options: T[];
  format: (value: T) => string;
  onChange: (value: T) => void;
};

function SegmentedFilter<T extends string>({
  label,
  value,
  options,
  format,
  onChange,
}: SegmentedFilterProps<T>) {
  return (
    <div aria-label={label} className="segmented">
      {options.map((option) => (
        <button
          className={option === value ? "active" : ""}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}
