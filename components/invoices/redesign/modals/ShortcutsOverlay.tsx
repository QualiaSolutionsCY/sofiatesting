"use client";

import { useEffect } from "react";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const ROWS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["/"], label: "Focus search" },
  { keys: ["N"], label: "New document" },
  { keys: ["R"], label: "Open recurring runs" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["↑", "↓"], label: "Navigate (palette / lists)" },
  { keys: ["↵"], label: "Open / confirm" },
  { keys: ["Esc"], label: "Close overlay" },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="shortcuts-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Keyboard shortcuts</h3>
        <div className="shortcuts-list">
          {ROWS.map((r, i) => (
            <div className="shortcut-row" key={i}>
              <span className="label">{r.label}</span>
              <span className="keys">
                {r.keys.map((k, ki) => (
                  <kbd key={ki}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
