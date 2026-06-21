"use client";

import { Pause, Play, Repeat, X } from "lucide-react";
import { useEffect } from "react";
import type { RecurringRun } from "@/lib/invoices/redesign/types";

interface RecurringRunsPanelProps {
  open: boolean;
  onClose: () => void;
  runs: RecurringRun[];
  onTogglePaused: (id: string) => void;
  onReviewBatch: (id: string) => void;
}

function formatNext(when: string): string {
  // Input format: "2026-06-01 08:00"
  const [date, time] = when.split(" ");
  if (!date) return when;
  const d = new Date(`${date}T${time || "00:00"}:00`);
  if (isNaN(d.getTime())) return when;
  return (
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }) +
    " · " +
    (time || "08:00")
  );
}

export function RecurringRunsPanel({
  open,
  onClose,
  runs,
  onTogglePaused,
  onReviewBatch,
}: RecurringRunsPanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeCount = runs.filter((r) => !r.paused).length;
  const totalDrafts = runs
    .filter((r) => !r.paused)
    .reduce((s, r) => s + r.count, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="recurring-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="recurring-panel-header">
          <div>
            <p className="eyebrow">
              <Repeat size={11} strokeWidth={1.6} /> Recurring runs
            </p>
            <h2>Manage automated invoice schedules</h2>
            <p className="recurring-panel-lede">
              {activeCount} of {runs.length} active · {totalDrafts} draft
              {totalDrafts === 1 ? "" : "s"} queued across all schedules
            </p>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </header>

        <div className="recurring-panel-list">
          <div className="recurring-panel-row recurring-panel-head">
            <span>Cadence</span>
            <span>Next run</span>
            <span>Drafts queued</span>
            <span>Last run</span>
            <span>Status</span>
            <span />
          </div>
          {runs.map((run) => (
            <div
              className={`recurring-panel-row ${run.paused ? "is-paused" : ""}`}
              key={run.id}
            >
              <span className="recurring-cadence">
                <strong>{run.cadence}</strong>
                <em>{run.id}</em>
              </span>
              <span className="recurring-next">
                {run.paused ? "—" : formatNext(run.nextRun)}
              </span>
              <span className="recurring-count">{run.count}</span>
              <span className="recurring-last">
                {formatNext(run.lastRun)} · {run.lastRunIssued} issued
              </span>
              <span
                className={`recurring-status ${run.paused ? "paused" : "active"}`}
              >
                {run.paused ? "Paused" : "Active"}
              </span>
              <div className="recurring-actions">
                <button
                  className="ghost"
                  disabled={run.paused}
                  onClick={() => onReviewBatch(run.id)}
                  title={
                    run.paused
                      ? "Resume to review the batch"
                      : "Review the upcoming batch"
                  }
                  type="button"
                >
                  Review batch
                </button>
                <button
                  className={run.paused ? "primary" : "ghost"}
                  onClick={() => onTogglePaused(run.id)}
                  type="button"
                >
                  {run.paused ? (
                    <>
                      <Play size={12} strokeWidth={1.6} /> Resume
                    </>
                  ) : (
                    <>
                      <Pause size={12} strokeWidth={1.6} /> Pause
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <footer className="recurring-panel-foot">
          <p>
            Paused schedules don&apos;t fire automatic drafts. The lifetime
            audit trail keeps every previous run visible regardless of current
            status.
          </p>
          <button className="ghost" onClick={onClose} type="button">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
