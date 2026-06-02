"use client";

import { useEffect } from "react";
import type { ConfirmState } from "@/lib/invoices/redesign/types";

interface ConfirmDialogProps {
  state: ConfirmState | null;
  onClose: () => void;
}

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "Enter") {
        state.onConfirm?.();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="confirm-shell" onClick={(event) => event.stopPropagation()}>
        <h3>{state.title}</h3>
        <p>{state.body}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>
            {state.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={state.danger ? "danger" : "primary"}
            onClick={() => {
              state.onConfirm?.();
              onClose();
            }}
            autoFocus
          >
            {state.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
