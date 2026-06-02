"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { DocumentInput } from "@/lib/invoices/document-actions";
import type { InvoiceDocument, Recurrence, VatMode } from "@/lib/invoices/types/invoice";
import type { ComposerMode } from "./types";

export function DocumentComposer({
  mode,
  document,
  onClose,
  onSave
}: {
  mode: Exclude<ComposerMode, "closed">;
  document?: InvoiceDocument;
  onClose: () => void;
  onSave: (input: DocumentInput) => void;
}) {
  const [input, setInput] = useState<DocumentInput>({
    kind: document?.kind ?? "invoice",
    clientName: document?.clientName ?? "",
    clientEmail: document?.clientEmail ?? "",
    description: document?.description ?? "",
    amount: document?.amount ?? 0,
    vatMode: document?.vatMode ?? "plus-vat",
    issueDate: document?.issueDate ?? new Date().toISOString().slice(0, 10),
    dueDate: document?.dueDate ?? "",
    recurrence: document?.recurrence ?? "monthly",
    recurrenceDay: document?.recurrenceDay ?? 25,
    sourceInvoiceNumber: document?.sourceInvoiceNumber ?? "",
    commissionPersonName: document?.commissionPersonName ?? ""
  });
  const needsCommissionPerson = /\bcommission\b|\bproperty sale\b|\bsale of (the )?property\b/i.test(
    input.description
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(input);
  }

  return (
    <div className="modal-backdrop">
      <form className="composer" onSubmit={submit}>
        <div className="composer-header">
          <div>
            <p className="eyebrow">{mode === "create" ? "New draft" : "Edit document"}</p>
            <h2>{mode === "create" ? "Sophia draft" : "Retrieve and modify"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="composer-grid">
          <label>
            <span>Client / Bill to</span>
            <input
              value={input.clientName}
              onChange={(event) => setInput({ ...input, clientName: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={input.amount}
              onChange={(event) => setInput({ ...input, amount: Number(event.target.value) })}
              required
            />
          </label>
        </div>

        <label className="composer-description">
          <span>Description</span>
          <textarea
            value={input.description}
            onChange={(event) => setInput({ ...input, description: event.target.value })}
            rows={5}
            required
          />
        </label>

        <div className="composer-grid optional-composer-grid">
          <label>
            <span>Type</span>
            <select
              value={input.kind}
              onChange={(event) =>
                setInput({ ...input, kind: event.target.value as DocumentInput["kind"] })
              }
            >
              <option value="invoice">Invoice</option>
              <option value="credit-note">Credit note</option>
              <option value="receipt">Receipt</option>
            </select>
          </label>
          <label>
            <span>Client email</span>
            <input
              type="email"
              value={input.clientEmail}
              onChange={(event) => setInput({ ...input, clientEmail: event.target.value })}
            />
          </label>
          <label>
            <span>VAT</span>
            <select
              value={input.vatMode}
              onChange={(event) => setInput({ ...input, vatMode: event.target.value as VatMode })}
            >
              <option value="plus-vat">Plus VAT</option>
              <option value="included-vat">Including VAT</option>
              <option value="no-vat">No VAT</option>
            </select>
          </label>
          <label>
            <span>Recurrence</span>
            <select
              value={input.recurrence}
              onChange={(event) =>
                setInput({ ...input, recurrence: event.target.value as Recurrence })
              }
            >
              <option value="none">One-off</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {input.recurrence !== "none" ? (
            <label>
              <span>Run day</span>
              <input
                type="number"
                min="1"
                max="31"
                value={input.recurrenceDay ?? 25}
                onChange={(event) =>
                  setInput({ ...input, recurrenceDay: Number(event.target.value) })
                }
              />
            </label>
          ) : null}
          <label>
            <span>Issue date</span>
            <input
              type="date"
              value={input.issueDate}
              onChange={(event) => setInput({ ...input, issueDate: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Due date</span>
            <input
              type="date"
              value={input.dueDate}
              onChange={(event) => setInput({ ...input, dueDate: event.target.value })}
            />
          </label>
          <label>
            <span>Source invoice</span>
            <input
              value={input.sourceInvoiceNumber}
              onChange={(event) => setInput({ ...input, sourceInvoiceNumber: event.target.value })}
              placeholder="Required for credit notes and receipts"
            />
          </label>
          <label>
            <span>Commission person</span>
            <input
              value={input.commissionPersonName}
              onChange={(event) => setInput({ ...input, commissionPersonName: event.target.value })}
              required={needsCommissionPerson}
              placeholder={needsCommissionPerson ? "Required now" : "Required if commission/sale"}
            />
          </label>
        </div>

        <div className="composer-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-action">
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}
