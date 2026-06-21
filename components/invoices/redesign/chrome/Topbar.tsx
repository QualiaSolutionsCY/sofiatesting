"use client";

import { FileCog, Plus, Search, Settings as SettingsIcon } from "lucide-react";
import type { Doc } from "@/lib/invoices/redesign/types";

interface TopbarProps {
  docs: Doc[];
  onNew: () => void;
  onPalette: () => void;
  onOpenSettings: () => void;
  onEditTemplate: () => void;
}

export function Topbar({
  docs,
  onNew,
  onPalette,
  onOpenSettings,
  onEditTemplate,
}: TopbarProps) {
  const needsReview = docs.filter(
    (d) => d.stage === "sent-to-marios" || d.stage === "correction-needed"
  ).length;

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Invoices</h1>
        {needsReview > 0 ? (
          <span
            className="topbar-count"
            title={`${needsReview} need your review`}
          >
            <span aria-hidden className="topbar-count-dot" />
            {needsReview} for review
          </span>
        ) : (
          <span className="topbar-count is-empty">All caught up</span>
        )}
      </div>
      <div className="topbar-actions">
        <button className="palette-trigger" onClick={onPalette} type="button">
          <Search size={15} strokeWidth={1.6} />
          <span>Search or jump…</span>
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </button>
        <button
          aria-label="Edit invoice template"
          className="icon-button topbar-settings"
          onClick={onEditTemplate}
          title="Edit invoice template"
          type="button"
        >
          <FileCog size={15} strokeWidth={1.6} />
        </button>
        <button
          aria-label="Settings"
          className="icon-button topbar-settings"
          onClick={onOpenSettings}
          title="Settings"
          type="button"
        >
          <SettingsIcon size={15} strokeWidth={1.6} />
        </button>
        <button className="primary-action" onClick={onNew} type="button">
          <Plus size={14} strokeWidth={1.6} /> New invoice
        </button>
      </div>
    </header>
  );
}
