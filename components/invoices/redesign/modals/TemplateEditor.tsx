"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  TEMPLATE_DEFAULTS,
  type TemplateText,
  useTemplateText,
} from "@/lib/invoices/redesign/template-context";

interface TemplateEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const FIELDS: Array<{
  key: keyof TemplateText;
  label: string;
  multiline?: boolean;
}> = [
  { key: "name", label: "Company name" },
  { key: "regNo", label: "Company reg. no. (HE…)" },
  { key: "address", label: "Address" },
  { key: "contactLine", label: "Contact line (T: … E: …)" },
  { key: "vatNo", label: "V.A.T Reg. No." },
  { key: "creaLicense", label: "CREA License No." },
  { key: "creaReg", label: "CREA Reg No." },
  { key: "bankName", label: "Bank" },
  { key: "accountName", label: "Account name" },
  { key: "accountNumber", label: "Account number" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC / SWIFT" },
  {
    key: "settlementNote",
    label: "Settlement note (invoices)",
    multiline: true,
  },
  {
    key: "receiptNote",
    label: "Acknowledgement note (receipts)",
    multiline: true,
  },
];

export function TemplateEditor({
  open,
  onClose,
  onSaved,
}: TemplateEditorProps) {
  const { text, setText } = useTemplateText();
  const [draft, setDraft] = useState<TemplateText>(text);

  useEffect(() => {
    if (open) setDraft(text);
  }, [open, text]);

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
        className="template-editor"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="template-editor-head">
          <div>
            <p className="eyebrow">Invoice template</p>
            <h2>Edit template text</h2>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className="template-editor-body">
          {FIELDS.map((field) => (
            <label className="template-editor-field" key={field.key}>
              <span>{field.label}</span>
              {field.multiline ? (
                <textarea
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                  rows={2}
                  value={draft[field.key]}
                />
              ) : (
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                  value={draft[field.key]}
                />
              )}
            </label>
          ))}
        </div>

        <div className="template-editor-foot">
          <button
            className="ghost"
            onClick={() => setDraft(TEMPLATE_DEFAULTS)}
            type="button"
          >
            Reset to defaults
          </button>
          <div className="template-editor-foot-actions">
            <button className="ghost" onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => {
                setText(draft);
                onSaved?.();
                onClose();
              }}
              type="button"
            >
              Save template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
