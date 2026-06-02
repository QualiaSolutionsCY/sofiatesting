"use client";

import { Check, Eye, Pause, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clientById, fmt } from "@/lib/invoices/redesign/data";

interface MonthlyRow {
  id: string;
  client: string;
  net: number;
  extra: number;
  draftNo: string;
  period: string;
  sub: number;
  total: number;
  note?: string;
}

interface MonthlyRunProps {
  open: boolean;
  onClose: () => void;
  onApproveAll: (rows: MonthlyRow[]) => void;
  onPreview: (rows: MonthlyRow[]) => void;
  onPause: () => void;
}

export function MonthlyRunOverlay({ open, onClose, onApproveAll, onPreview, onPause }: MonthlyRunProps) {
  const run = useMemo<MonthlyRow[]>(() => {
    const period = "June 2026";
    const seed = [
      { client: "c1", net: 1850, extra: 145 },
      { client: "c2", net: 3200, extra: 190 },
      { client: "c3", net: 4200, extra: 0 },
      { client: "c4", net: 2900, extra: 180 },
      { client: "c5", net: 6500, extra: 0 },
      { client: "c6", net: 1100, extra: 85 },
      { client: "c7", net: 5400, extra: 0 },
      { client: "c8", net: 1800, extra: 0 },
      { client: "c9", net: 7800, extra: 0 },
      { client: "c10", net: 950, extra: 0 },
      { client: "c2", net: 720, extra: 0, note: "Parking #2 — top-up" } as { client: string; net: number; extra: number; note?: string }
    ];
    return seed.map((s, i) => {
      const sub = s.net + s.extra;
      return {
        ...s,
        id: `mr-${i}`,
        draftNo: `DRAFT-2026-00${45 + i}`,
        period,
        sub,
        total: sub * 1.19
      };
    });
  }, []);

  const [picked, setPicked] = useState<Set<string>>(() => new Set(run.map((r) => r.id)));

  useEffect(() => {
    if (open) setPicked(new Set(run.map((r) => r.id)));
  }, [open, run]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const toggleAll = () => {
    if (picked.size === run.length) setPicked(new Set());
    else setPicked(new Set(run.map((r) => r.id)));
  };

  const pickedRows = run.filter((r) => picked.has(r.id));
  const total = pickedRows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="run-backdrop" onClick={onClose}>
      <div className="run-shell" onClick={(event) => event.stopPropagation()}>
        <div className="run-head">
          <div>
            <p className="eyebrow">Monthly run · 1 June 2026 · 08:00 Europe/Nicosia</p>
            <h2>Eleven drafts ready for your review</h2>
            <p className="by-sophia">
              <em>Sophia</em> prepared these at 08:02 from active leases. Approve all, or untick the ones to hold.
            </p>
          </div>
          <div className="run-sum">
            <strong>{fmt(total).replace("€", "€ ")}</strong>
            <span>
              Selected total · {pickedRows.length} of {run.length}
            </span>
          </div>
        </div>

        <div className="run-controls">
          <div className="left">
            <button
              type="button"
              className="check is-on"
              onClick={toggleAll}
              aria-label="Select all"
              style={{
                background: picked.size === run.length ? "var(--ink)" : "transparent",
                color: picked.size === run.length ? "var(--paper)" : "transparent",
                borderColor: picked.size === run.length ? "var(--ink)" : "var(--rule-strong)"
              }}
            >
              <Check size={11} strokeWidth={1.6} />
            </button>
            <span>
              <b>{picked.size}</b> of {run.length} selected · sorted by lease start
            </span>
          </div>
          <div className="right">
            <button type="button" className="ghost" onClick={() => onPreview(pickedRows)}>
              <Eye size={13} strokeWidth={1.6} /> Preview as PDF batch
            </button>
            <button type="button" className="ghost" onClick={onPause}>
              <Pause size={13} strokeWidth={1.6} /> Pause this run
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              <X size={13} strokeWidth={1.6} /> Close
            </button>
          </div>
        </div>

        <div className="run-list">
          {run.map((r) => {
            const cl = clientById(r.client);
            const on = picked.has(r.id);
            return (
              <div key={r.id} className="run-row">
                <button
                  type="button"
                  className={`check ${on ? "is-on" : ""}`}
                  onClick={() => toggle(r.id)}
                  aria-label={on ? "Deselect" : "Select"}
                >
                  {on ? <Check size={11} strokeWidth={1.6} /> : null}
                </button>
                <div className="who">
                  <strong>{cl.name}</strong>
                  <span>
                    {cl.property} · {r.period}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
                <div className="amt">{fmt(r.total)}</div>
                <div className="ix">{r.draftNo}</div>
              </div>
            );
          })}
        </div>

        <div className="run-foot">
          <div className="tot">
            Selected total (incl. VAT) <b>{fmt(total)}</b>
          </div>
          <div className="acts">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onApproveAll(pickedRows);
                onClose();
              }}
            >
              <Send size={14} strokeWidth={1.6} /> Send {pickedRows.length} to Marios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
