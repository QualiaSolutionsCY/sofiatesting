"use client";

import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  FilePenLine,
  FilePlus2,
  Mail,
  MessageSquareText,
  Search,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteCommand = {
  id: string;
  label: string;
  hint?: string;
  group: "actions" | "documents" | "navigation";
  icon?: React.ReactNode;
  shortcut?: string;
  onRun: () => void;
};

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => {
      const haystack =
        `${command.label} ${command.hint ?? ""} ${command.group}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [commands, query]);

  useEffect(() => {
    setCursor((prev) => (prev >= filtered.length ? 0 : prev));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((value) =>
          Math.min(value + 1, Math.max(filtered.length - 1, 0))
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((value) => Math.max(value - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = filtered[cursor];
        if (command) {
          command.onRun();
          onClose();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, cursor, onClose]);

  if (!open) return null;

  const grouped = filtered.reduce<
    Record<PaletteCommand["group"], PaletteCommand[]>
  >(
    (acc, command) => {
      acc[command.group] = acc[command.group] ?? [];
      acc[command.group].push(command);
      return acc;
    },
    { actions: [], documents: [], navigation: [] }
  );
  let index = 0;

  return (
    <div
      aria-modal="true"
      className="palette-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-search">
          <Search size={16} />
          <input
            aria-label="Command palette search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command, document, or action…"
            ref={inputRef}
            value={query}
          />
          <kbd className="palette-kbd">ESC</kbd>
        </div>
        <div className="palette-results">
          {filtered.length === 0 ? (
            <p className="palette-empty">No matches. Try a different word.</p>
          ) : (
            (Object.keys(grouped) as PaletteCommand["group"][]).map((group) =>
              grouped[group].length === 0 ? null : (
                <div className="palette-group" key={group}>
                  <p className="palette-group-label">{groupLabel(group)}</p>
                  <ul>
                    {grouped[group].map((command) => {
                      const localIndex = index++;
                      const active = localIndex === cursor;
                      return (
                        <li key={command.id}>
                          <button
                            className={`palette-item ${active ? "is-active" : ""}`}
                            onClick={() => {
                              command.onRun();
                              onClose();
                            }}
                            onMouseEnter={() => setCursor(localIndex)}
                            type="button"
                          >
                            <span className="palette-item-icon">
                              {command.icon ?? <ArrowRight size={14} />}
                            </span>
                            <span className="palette-item-body">
                              <strong>{command.label}</strong>
                              {command.hint ? (
                                <small>{command.hint}</small>
                              ) : null}
                            </span>
                            {command.shortcut ? (
                              <kbd className="palette-kbd">
                                {command.shortcut}
                              </kbd>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            )
          )}
        </div>
        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            move
          </span>
          <span>
            <kbd>↵</kbd>
            run
          </span>
          <span>
            <kbd>ESC</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function groupLabel(group: PaletteCommand["group"]) {
  if (group === "actions") return "Actions";
  if (group === "documents") return "Documents";
  return "Navigation";
}

export const COMMAND_ICONS = {
  newDocument: <FilePlus2 size={14} />,
  send: <Send size={14} />,
  approve: <CheckCircle2 size={14} />,
  number: <FilePenLine size={14} />,
  forward: <MessageSquareText size={14} />,
  email: <Mail size={14} />,
  receipt: <FileCheck2 size={14} />,
  storage: <Database size={14} />,
};
