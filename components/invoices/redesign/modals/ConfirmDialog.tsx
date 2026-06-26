"use client";

import { useEffect, useState } from "react";
import type { ConfirmState } from "@/lib/invoices/redesign/types";

interface ConfirmDialogProps {
  state: ConfirmState | null;
  onClose: () => void;
}

export function ConfirmDialog({ state, onClose }: ConfirmDialogProps) {
  const [reason, setReason] = useState("");

  // Seed the field with the existing value (e.g. the current recipient email or saved
  // message) so the operator can EDIT it, not retype from scratch. Falls back to empty.
  useEffect(() => {
    setReason(state?.prompt?.initial ?? "");
  }, [state]);

  const reasonRequired = !!state?.prompt?.required;
  const reasonMissing = reasonRequired && reason.trim().length === 0;

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "Enter" && !state.prompt) {
        state.onConfirm?.();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;

  const confirm = () => {
    if (reasonMissing) return;
    state.onConfirm?.(reason.trim() || undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="confirm-shell" onClick={(event) => event.stopPropagation()}>
        <h3>{state.title}</h3>
        <p>{state.body}</p>
        {state.prompt ? (
          <label className="confirm-prompt">
            <span>{state.prompt.label}</span>
            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={state.prompt.placeholder}
            />
          </label>
        ) : null}
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>
            {state.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            className={state.danger ? "danger" : "primary"}
            onClick={confirm}
            disabled={reasonMissing}
            autoFocus={!state.prompt}
          >
            {state.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
