"use client";

import { Check, Eye, Pause, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clientById, fmt } from "@/lib/invoices/redesign/data";

// Auto-saved per-row delivery drafts (client email + message) for the recurring run.
// Persisted to localStorage so a half-filled recipient/message survives closing the
// overlay or a page reload — the operator never re-types a delivery they already set.
// Keyed by `${cadence}:${rowId}`; ONLY the delivery fields are stored (never the
// rolled description/amount, which must always come fresh from the upcoming instance).
const DELIVERY_DRAFT_KEY = "sophia.run.delivery-drafts.v1";

interface DeliveryDraft {
  recipients?: string;
  message?: string;
}

function readDeliveryDrafts(): Record<string, DeliveryDraft> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(DELIVERY_DRAFT_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeDeliveryDrafts(map: Record<string, DeliveryDraft>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DELIVERY_DRAFT_KEY, JSON.stringify(map));
  } catch {
    // Best-effort: a full/blocked localStorage must not break the run.
  }
}

export interface MonthlyRow {
  id: string;
  client: string;
  net: number;
  extra: number;
  // Number column. For UPCOMING (not-yet-issued) rows this is blank "" — the next
  // instance has no official № until it's materialized on approve (R4).
  draftNo: string;
  period: string;
  sub: number;
  total: number;
  note?: string;
  // Precomputed, rolled-forward fields — the SINGLE source of truth shared by the
  // list, the PDF preview, and the create path (R15). description/lines already
  // have the month advanced (June → July) so no consumer re-rolls or fabricates a
  // "Recurring charge" line.
  description?: string;
  // The issue date for the UPCOMING instance (already advanced one month, R4).
  issued?: string;
  lines?: Array<{ desc: string; qty: number; unitPrice: number }>;
  // Per-row client delivery (R17): email recipient(s) + message override sent with
  // the materialized invoice. recipients absent = no email for this row.
  recipients?: string;
  message?: string;
}

interface MonthlyRunProps {
  open: boolean;
  onClose: () => void;
  onApproveAll: (rows: MonthlyRow[]) => void;
  onPreview: (rows: MonthlyRow[]) => void;
  onPause: () => void;
  // Real monthly-recurring invoices to run this batch from.
  rows?: MonthlyRow[];
  // Which cadence this run shows — scopes the auto-saved delivery drafts so a
  // monthly row's draft never leaks onto the same client's yearly row (R14).
  cadence?: "monthly" | "yearly";
}

export function MonthlyRunOverlay({ open, onClose, onApproveAll, onPreview, onPause, rows, cadence = "monthly" }: MonthlyRunProps) {
  const source = useMemo<MonthlyRow[]>(() => rows ?? [], [rows]);

  // In-memory, per-row edits for the UPCOMING materialization (R5). Editing a row
  // here affects ONLY the invoice this run creates — it never mutates the issued
  // ledger docs the batch was derived from. Seeded from the incoming rows; reset
  // whenever the run reopens with a fresh source.
  const [edited, setEdited] = useState<MonthlyRow[]>(source);
  const run = edited;

  const [picked, setPicked] = useState<Set<string>>(() => new Set(source.map((r) => r.id)));

  // Row ids currently showing the "Draft saved" cue. Each auto-save flashes the cue
  // for its row, then it fades. Per-row debounce + flash timers live in refs so they
  // survive re-renders and can be cleared on unmount.
  const [savedRows, setSavedRows] = useState<Set<string>>(new Set());
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (open) {
      // Seed from the rolled-forward source, then layer any auto-saved delivery draft
      // (client email + message) on top so an in-progress delivery survives reopen.
      const drafts = readDeliveryDrafts();
      setEdited(
        source.map((r) => {
          const d = drafts[`${cadence}:${r.id}`];
          return d
            ? { ...r, recipients: d.recipients ?? r.recipients, message: d.message ?? r.message }
            : r;
        })
      );
      setPicked(new Set(source.map((r) => r.id)));
    }
  }, [open, source, cadence]);

  // Clear any pending timers on unmount so a debounced save can't fire into a gone tree.
  useEffect(
    () => () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
      Object.values(flashTimers.current).forEach(clearTimeout);
    },
    []
  );

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

  // Patch one upcoming row in memory. `net`/`sub`/`total` are kept in sync when the
  // amount is edited so the selected-total and the materialized invoice agree.
  const patchRow = (id: string, patch: Partial<MonthlyRow>) => {
    setEdited((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.sub !== undefined) {
          // Derive the VAT rate from the row's PREVIOUS net→total ratio (default
          // 19%) so the recomputed total tracks the edited net amount.
          const rate = r.total && r.sub ? r.total / r.sub - 1 : 0.19;
          next.net = patch.sub;
          next.total = patch.sub * (1 + rate);
        }
        return next;
      })
    );
  };

  // Patch + auto-save a delivery field (client email / message). Updates the in-memory
  // row immediately, then debounces a write to the localStorage draft and flashes the
  // "Draft saved" cue for that row. Only delivery fields are persisted (see DRAFT_KEY).
  const patchDelivery = (id: string, patch: DeliveryDraft) => {
    patchRow(id, patch);
    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      const map = readDeliveryDrafts();
      const key = `${cadence}:${id}`;
      map[key] = { ...(map[key] || {}), ...patch };
      writeDeliveryDrafts(map);
      // Flash "saved" for this row, then fade.
      setSavedRows((prev) => new Set(prev).add(id));
      clearTimeout(flashTimers.current[id]);
      flashTimers.current[id] = setTimeout(() => {
        setSavedRows((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 1600);
    }, 450);
  };

  // Drop the auto-saved drafts for rows we just materialized — the delivery has been
  // consumed, so it must not reappear as a stale draft on next month's run.
  const clearDrafts = (ids: string[]) => {
    const map = readDeliveryDrafts();
    ids.forEach((id) => delete map[`${cadence}:${id}`]);
    writeDeliveryDrafts(map);
  };

  const pickedRows = run.filter((r) => picked.has(r.id));
  const total = pickedRows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="run-backdrop" onClick={onClose}>
      <div className="run-shell" onClick={(event) => event.stopPropagation()}>
        <div className="run-head">
          <div>
            <p className="eyebrow">Monthly run · Europe/Nicosia</p>
            <h2>
              {run.length === 0
                ? "No recurring drafts pending"
                : `${run.length} draft${run.length === 1 ? "" : "s"} ready for your review`}
            </h2>
            <p className="by-sophia">
              {run.length === 0 ? (
                <>No active recurring leases have generated drafts yet.</>
              ) : (
                <>
                  <em>Sophia</em> prepared these from active leases. Approve all, or untick the ones to hold.
                </>
              )}
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
          {run.length === 0 ? (
            <div className="list-empty" style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)" }}>
              No recurring drafts to review.
            </div>
          ) : null}
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
                  {/* Editable upcoming-row fields (R5/R17): description, amount,
                      recipient email and the delivery message. Edits affect ONLY
                      the invoice this run materializes — never the issued ledger. */}
                  <div className="run-edit">
                    <input
                      type="text"
                      className="run-edit-field run-edit-desc"
                      value={r.description ?? ""}
                      placeholder="Description (rolled forward)"
                      aria-label="Description"
                      onChange={(e) => patchRow(r.id, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      className="run-edit-amount"
                      value={r.sub}
                      placeholder="Net amount"
                      aria-label="Net amount"
                      onChange={(e) => patchRow(r.id, { sub: Number(e.target.value) || 0 })}
                    />
                    <input
                      type="email"
                      className="run-edit-field run-edit-email"
                      value={r.recipients ?? ""}
                      placeholder="Client email (leave blank to skip email)"
                      aria-label="Client email"
                      onChange={(e) => patchDelivery(r.id, { recipients: e.target.value })}
                    />
                    <input
                      type="text"
                      className="run-edit-field run-edit-msg"
                      value={r.message ?? ""}
                      placeholder="Delivery message (optional)"
                      aria-label="Delivery message"
                      onChange={(e) => patchDelivery(r.id, { message: e.target.value })}
                    />
                    <span
                      className={`run-edit-saved ${savedRows.has(r.id) ? "is-shown" : ""}`}
                      aria-live="polite"
                    >
                      <Check size={10} strokeWidth={2.2} /> Draft saved
                    </span>
                  </div>
                </div>
                <div className="amt">{fmt(r.total)}</div>
                {/* Upcoming instances have no number yet (R4) — blank the № cell. */}
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
                clearDrafts(pickedRows.map((r) => r.id));
                onApproveAll(pickedRows);
                onClose();
              }}
            >
              <Send size={14} strokeWidth={1.6} /> Create {pickedRows.length}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
