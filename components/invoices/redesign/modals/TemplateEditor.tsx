"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import {
  TEMPLATE_DEFAULTS,
  TemplateContext,
  useTemplateText,
  type TemplateText
} from "@/lib/invoices/redesign/template-context";
import { TemplatePreview } from "@/components/invoices/redesign/ledger/TemplatePreview";
import type { Client, Doc } from "@/lib/invoices/redesign/types";

interface TemplateEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const FIELDS: Array<{ key: keyof TemplateText; label: string; multiline?: boolean }> = [
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
  { key: "settlementNote", label: "Settlement note (invoices)", multiline: true },
  { key: "receiptNote", label: "Acknowledgement note (receipts)", multiline: true }
];

// A representative invoice so Marios sees his letterhead / bank / CREA edits land
// on a real invoice layout. Only the TEMPLATE text is live — this sample content is
// fixed. clientOverride avoids needing this client in the registry.
const PREVIEW_CLIENT: Client = {
  id: "template-preview",
  name: "Sample Client Ltd",
  property: "Sample Property, Paphos",
  address: "—",
  vat: "—"
};

const PREVIEW_DOC: Doc = {
  id: "template-preview",
  kind: "invoice",
  stage: "numbered",
  draftNo: null,
  officialNo: "11491",
  client: "template-preview",
  issued: "2026-06-30",
  due: "2026-07-30",
  period: "June 2026",
  recurrence: "none",
  vatRate: 19,
  vatMode: "plus-vat",
  lines: [{ desc: "Consulting services — June 2026", qty: 1, unitPrice: 700 }],
  total: 833,
  description: "Consulting services — June 2026",
  timeline: []
};

// zoom (not transform) so the scaled preview's layout box shrinks with it — no
// leftover whitespace / scrollbars. Marios is on Chrome/Safari, both support it.
const PREVIEW_ZOOM = { zoom: 0.46 } as CSSProperties;

export function TemplateEditor({ open, onClose, onSaved }: TemplateEditorProps) {
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
        style={{ width: "min(1040px, 96vw)" }}
      >
        <div className="template-editor-head">
          <div>
            <p className="eyebrow">Invoice template</p>
            <h2>Edit template text</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>

        <div className="template-editor-body" style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
          {/* Left — editable template fields */}
          <div style={{ flex: "1 1 0", minWidth: 0, display: "grid", gap: 14, gridAutoRows: "min-content" }}>
            {FIELDS.map((field) => (
              <label key={field.key} className="template-editor-field">
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea
                    rows={2}
                    value={draft[field.key]}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                ) : (
                  <input
                    value={draft[field.key]}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                )}
              </label>
            ))}
          </div>

          {/* Right — live preview rendered from the DRAFT (updates on every keystroke) */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: 0,
              position: "sticky",
              top: 0,
              alignSelf: "flex-start",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--ink-soft)"
                }}
              >
                Live preview
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--ink-soft)" }}>updates as you type</span>
            </div>
            <div
              style={{
                minHeight: 360,
                maxHeight: "60vh",
                overflow: "auto",
                background: "var(--canvas, #f4f4f5)",
                borderRadius: 10,
                border: "1px solid var(--rule)",
                padding: 12
              }}
            >
              <div style={PREVIEW_ZOOM}>
                <TemplateContext.Provider value={{ text: draft, setText: () => {} }}>
                  <TemplatePreview doc={PREVIEW_DOC} clientOverride={PREVIEW_CLIENT} />
                </TemplateContext.Provider>
              </div>
            </div>
          </div>
        </div>

        <div className="template-editor-foot">
          <button type="button" className="ghost" onClick={() => setDraft(TEMPLATE_DEFAULTS)}>
            Reset to defaults
          </button>
          <div className="template-editor-foot-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setText(draft);
                onSaved?.();
                onClose();
              }}
            >
              Save template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
