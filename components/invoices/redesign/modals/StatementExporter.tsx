"use client";

import { Download, FileBarChart, FileSpreadsheet, FileText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { downloadStatementPdf, downloadStatementXls } from "@/lib/invoices/downloads";
import { fmt } from "@/lib/invoices/redesign/data";
import { buildStatementPdfBlob } from "@/lib/invoices/statement-pdf";
import { buildStatementXlsBlob } from "@/lib/invoices/statement-xls";
import type { Client, Doc } from "@/lib/invoices/redesign/types";

interface StatementExporterProps {
  open: boolean;
  onClose: () => void;
  docs: Doc[];
  clients: Client[];
}

type Format = "pdf" | "xls";

// Anchor the default date range on the newest invoice's issue date rather than the
// real wall clock — the seeded ledger lives in 2026, so Date.now() (which may be a
// different year in a test env) would produce an empty default range. Never called
// in module scope; runs inside the component from the docs prop.
function anchorDate(docs: Doc[]): string {
  const newest = docs
    .map((d) => d.issued)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];
  return newest || new Date().toISOString().slice(0, 10);
}

function yearStart(anchor: string): string {
  const year = anchor.slice(0, 4);
  return `${year}-01-01`;
}

export function StatementExporter({ open, onClose, docs, clients }: StatementExporterProps) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientId, setClientId] = useState("all");
  const [format, setFormat] = useState<Format>("pdf");

  // Reset the range to "Jan 1 of the newest invoice's year → newest invoice" each
  // time the modal opens, so the default always frames the live ledger.
  useEffect(() => {
    if (!open) return;
    const anchor = anchorDate(docs);
    setFrom(yearStart(anchor));
    setTo(anchor);
    setClientId("all");
    setFormat("pdf");
  }, [open, docs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Filter to real invoices whose issue date falls in [from, to], optionally by
  // client. Sorting is left to the builders (both sort by issued ascending).
  const matched = useMemo(() => {
    if (!from || !to) return [];
    const lo = from <= to ? from : to;
    const hi = from <= to ? to : from;
    return docs.filter((d) => {
      if (d.kind !== "invoice") return false;
      if (!d.issued || d.issued < lo || d.issued > hi) return false;
      if (clientId !== "all" && d.client !== clientId) return false;
      return true;
    });
  }, [docs, from, to, clientId]);

  const matchedTotal = useMemo(
    () => matched.reduce((sum, d) => sum + Math.abs(Number(d.total) || 0), 0),
    [matched]
  );

  if (!open) return null;

  const selectedClientName = clientId === "all" ? undefined : clients.find((c) => c.id === clientId)?.name;

  function handleDownload() {
    const meta = { from, to, clientName: selectedClientName };
    const stamp = `${from}_${to}`;
    const clientSlug = selectedClientName ? selectedClientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") : "all-clients";
    if (format === "pdf") {
      const blob = buildStatementPdfBlob(matched, meta);
      downloadStatementPdf(blob, `Statement ${clientSlug} ${stamp}.pdf`);
    } else {
      const blob = buildStatementXlsBlob(matched, meta);
      downloadStatementXls(blob, `Statement ${clientSlug} ${stamp}.xlsx`);
    }
    onClose();
  }

  const labelStyle: React.CSSProperties = {
    fontSize: ".62rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: ".14em",
    fontWeight: 600
  };
  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid var(--rule)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    fontFamily: "var(--font-mono)"
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="composer"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          handleDownload();
        }}
        style={{ width: "min(560px, 100%)" }}
      >
        <div className="composer-header">
          <div>
            <p className="eyebrow">
              <FileBarChart size={12} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Statement of account
            </p>
            <h2>Export a ledger</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>

        <div style={{ marginTop: 22, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>From</span>
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={labelStyle}>To</span>
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} style={inputStyle} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>Client</span>
            <select value={clientId} onChange={(event) => setClientId(event.target.value)} style={inputStyle}>
              <option value="all">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={labelStyle}>Format</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setFormat("pdf")}
                aria-pressed={format === "pdf"}
                className={format === "pdf" ? "secondary-action is-active" : "secondary-action"}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  borderColor: format === "pdf" ? "var(--ink)" : "var(--rule)",
                  fontWeight: format === "pdf" ? 600 : 400
                }}
              >
                <FileText size={14} strokeWidth={1.6} /> PDF
              </button>
              <button
                type="button"
                onClick={() => setFormat("xls")}
                aria-pressed={format === "xls"}
                className={format === "xls" ? "secondary-action is-active" : "secondary-action"}
                style={{
                  flex: 1,
                  justifyContent: "center",
                  borderColor: format === "xls" ? "var(--ink)" : "var(--rule)",
                  fontWeight: format === "xls" ? 600 : 400
                }}
              >
                <FileSpreadsheet size={14} strokeWidth={1.6} /> Excel
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderRadius: "var(--radius)",
              background: "var(--surface-2)",
              border: "1px solid var(--rule)"
            }}
          >
            <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>
              {matched.length === 0
                ? "No invoices match this range"
                : `${matched.length} invoice${matched.length === 1 ? "" : "s"} match`}
            </span>
            {matched.length > 0 ? (
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink)" }}>
                {fmt(matchedTotal)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="composer-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={matched.length === 0}>
            <Download size={14} strokeWidth={1.6} /> Download {format === "pdf" ? "PDF" : "Excel"}
          </button>
        </div>
      </form>
    </div>
  );
}
