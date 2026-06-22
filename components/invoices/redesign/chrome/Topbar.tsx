"use client";

import { FileCog, Plus, RefreshCw, Search, Settings as SettingsIcon } from "lucide-react";
import type { Doc } from "@/lib/invoices/redesign/types";

interface TopbarProps {
  docs: Doc[];
  onNew: () => void;
  onPalette: () => void;
  onOpenSettings: () => void;
  onEditTemplate: () => void;
  onRefresh: () => void;
}

export function Topbar({ docs, onNew, onPalette, onOpenSettings, onEditTemplate, onRefresh }: TopbarProps) {
  const needsReview = docs.filter((d) => d.stage === "sent-to-marios" || d.stage === "correction-needed").length;

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Invoices</h1>
        {needsReview > 0 ? (
          <span className="topbar-count" title={`${needsReview} need your review`}>
            <span className="topbar-count-dot" aria-hidden />
            {needsReview} for review
          </span>
        ) : (
          <span className="topbar-count is-empty">All caught up</span>
        )}
      </div>
      <div className="topbar-actions">
        <button type="button" className="palette-trigger" onClick={onPalette}>
          <Search size={15} strokeWidth={1.6} />
          <span>Search or jump…</span>
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </button>
        <button
          type="button"
          className="icon-button topbar-settings"
          onClick={onRefresh}
          title="Refresh — pull invoices created over WhatsApp"
          aria-label="Refresh invoices"
        >
          <RefreshCw size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="icon-button topbar-settings"
          onClick={onEditTemplate}
          title="Edit invoice template"
          aria-label="Edit invoice template"
        >
          <FileCog size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="icon-button topbar-settings"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={15} strokeWidth={1.6} />
        </button>
        <button type="button" className="primary-action" onClick={onNew}>
          <Plus size={14} strokeWidth={1.6} /> New invoice
        </button>
      </div>
    </header>
  );
}
