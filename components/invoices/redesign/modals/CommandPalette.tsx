"use client";

import {
  ChevronRight,
  Clock,
  Command,
  FileText,
  Filter,
  Lock,
  Plus,
  Repeat,
  Search,
  Sliders,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { clientById, fmt } from "@/lib/invoices/redesign/data";
import { formatDate } from "@/lib/invoices/format";
import { matchesDocQuery } from "@/lib/invoices/redesign/search";
import type { Doc, PaletteItem } from "@/lib/invoices/redesign/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onAction: (item: PaletteItem) => void;
  docs: Doc[];
}

export function CommandPalette({ open, onClose, onAction, docs }: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActiveIdx(0);
  }, [open]);

  const groups = useMemo(() => {
    const ql = q.toLowerCase();

    const actionList: PaletteItem[] = ([
      { id: "new-invoice", type: "action" as const, action: "new-invoice", title: "New invoice draft", subtitle: "Open the composer", icon: <Plus size={14} strokeWidth={1.6} /> },
      { id: "run-monthly", type: "action" as const, action: "run-monthly", title: "Preview monthly run", subtitle: "Recurring monthly drafts ready to send", icon: <Repeat size={14} strokeWidth={1.6} /> },
      { id: "run-yearly", type: "action" as const, action: "run-yearly", title: "Preview yearly run", subtitle: "Recurring yearly drafts ready to send", icon: <Repeat size={14} strokeWidth={1.6} /> },
      { id: "filter-marios", type: "action" as const, action: "filter-marios", title: "Filter — needs Marios", subtitle: "Sent to review + corrections", icon: <Filter size={14} strokeWidth={1.6} /> },
      { id: "filter-unpaid", type: "action" as const, action: "filter-unpaid", title: "Filter — unpaid issued", subtitle: "Approved, awaiting payment", icon: <Clock size={14} strokeWidth={1.6} /> },
      { id: "open-settings", type: "action" as const, action: "open-settings", title: "Settings", subtitle: "Delivery, integrations, identity", icon: <Sliders size={14} strokeWidth={1.6} /> },
      { id: "show-shortcuts", type: "action" as const, action: "show-shortcuts", title: "Keyboard shortcuts", subtitle: "Press ? anytime", icon: <Command size={14} strokeWidth={1.6} /> },
      { id: "show-tour", type: "action" as const, action: "show-tour", title: "Replay guided tour", subtitle: "4-step intro to the ledger", icon: <Sparkles size={14} strokeWidth={1.6} /> },
      { id: "sign-out", type: "action" as const, action: "sign-out", title: "Sign out", subtitle: "Lock the ledger", icon: <Lock size={14} strokeWidth={1.6} /> }
    ] satisfies PaletteItem[]).filter((a) => !ql || (a.title + " " + a.subtitle).toLowerCase().includes(ql));

    const groups: { label: string; items: PaletteItem[] }[] = [];

    // Document matches — the top "Search or jump…" bar now finds actual invoices
    // by client / number / date / amount / description (Marios #22), not just UI
    // actions. Only when the operator has typed something, capped so the palette
    // stays snappy. Selecting one routes through onAction (type: "doc").
    if (ql) {
      const docItems: PaletteItem[] = docs
        .filter((d) => matchesDocQuery(d, q))
        .slice(0, 8)
        .map((d) => {
          const cl = clientById(d.client);
          const number = d.officialNo ? `№ ${d.officialNo}` : d.draftNo || "Draft";
          return {
            id: `doc-${d.id}`,
            type: "doc" as const,
            target: d.id,
            title: `${cl.name} — ${number}`,
            subtitle: `${formatDate(d.issued)} · ${fmt(Math.abs(d.total))}`,
            icon: <FileText size={14} strokeWidth={1.6} />
          };
        });
      if (docItems.length) groups.push({ label: "Invoices", items: docItems });
    }

    groups.push({ label: "Options & pages", items: actionList });
    return groups;
  }, [q, docs]);

  const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = items[activeIdx];
        if (item) onAction(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIdx, items, onAction, onClose]);

  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(Math.max(0, items.length - 1));
  }, [items.length, activeIdx]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Search size={17} strokeWidth={1.6} />
          <input
            autoFocus
            placeholder="Type a client, invoice number, or action…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <kbd className="palette-kbd">ESC</kbd>
        </div>
        <div className="palette-results">
          {items.length === 0 ? (
            <p className="palette-empty">No results for &quot;{q}&quot;</p>
          ) : (
            groups.map((g) =>
              g.items.length ? (
                <div key={g.label} className="palette-group">
                  <p className="palette-group-label">{g.label}</p>
                  <ul>
                    {g.items.map((it) => {
                      const idx = items.indexOf(it);
                      return (
                        <li key={it.id}>
                          <button
                            type="button"
                            className={`palette-item ${idx === activeIdx ? "is-active" : ""}`}
                            onMouseEnter={() => setActiveIdx(idx)}
                            onClick={() => onAction(it)}
                          >
                            <span className="palette-item-icon">{it.icon}</span>
                            <div className="palette-item-body">
                              <strong>{it.title}</strong>
                              <small>{it.subtitle}</small>
                            </div>
                            <ChevronRight size={14} strokeWidth={1.6} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null
            )
          )}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>ESC</kbd> Close
          </span>
          <span style={{ marginLeft: "auto" }}>Sophia · ⌘K</span>
        </div>
      </div>
    </div>
  );
}
