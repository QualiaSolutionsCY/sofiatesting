"use client";

import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { DocumentInput } from "@/lib/invoices/document-actions";
import type {
  InvoiceDocument,
  Recurrence,
  VatMode,
} from "@/lib/invoices/types/invoice";
import type { ComposerMode } from "./types";

export function DocumentComposer({
  mode,
  document,
  onClose,
  onSave,
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
    commissionPersonName: document?.commissionPersonName ?? "",
  });
  const needsCommissionPerson =
    /\bcommission\b|\bproperty sale\b|\bsale of (the )?property\b/i.test(
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
            <p className="eyebrow">
              {mode === "create" ? "New draft" : "Edit document"}
            </p>
            <h2>
              {mode === "create" ? "Sophia draft" : "Retrieve and modify"}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="composer-grid">
          <label>
            <span>Client / Bill to</span>
            <input
              onChange={(event) =>
                setInput({ ...input, clientName: event.target.value })
              }
              required
              value={input.clientName}
            />
          </label>
          <label>
            <span>Amount</span>
            <input
              min="0"
              onChange={(event) =>
                setInput({ ...input, amount: Number(event.target.value) })
              }
              required
              step="0.01"
              type="number"
              value={input.amount}
            />
          </label>
        </div>

        <label className="composer-description">
          <span>Description</span>
          <textarea
            onChange={(event) =>
              setInput({ ...input, description: event.target.value })
            }
            required
            rows={5}
            value={input.description}
          />
        </label>

        <div className="composer-grid optional-composer-grid">
          <label>
            <span>Type</span>
            <select
              onChange={(event) =>
                setInput({
                  ...input,
                  kind: event.target.value as DocumentInput["kind"],
                })
              }
              value={input.kind}
            >
              <option value="invoice">Invoice</option>
              <option value="credit-note">Credit note</option>
              <option value="receipt">Receipt</option>
            </select>
          </label>
          <label>
            <span>Client email</span>
            <input
              onChange={(event) =>
                setInput({ ...input, clientEmail: event.target.value })
              }
              type="email"
              value={input.clientEmail}
            />
          </label>
          <label>
            <span>VAT</span>
            <select
              onChange={(event) =>
                setInput({ ...input, vatMode: event.target.value as VatMode })
              }
              value={input.vatMode}
            >
              <option value="plus-vat">Plus VAT</option>
              <option value="included-vat">Including VAT</option>
              <option value="no-vat">No VAT</option>
            </select>
          </label>
          <label>
            <span>Recurrence</span>
            <select
              onChange={(event) =>
                setInput({
                  ...input,
                  recurrence: event.target.value as Recurrence,
                })
              }
              value={input.recurrence}
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
                max="31"
                min="1"
                onChange={(event) =>
                  setInput({
                    ...input,
                    recurrenceDay: Number(event.target.value),
                  })
                }
                type="number"
                value={input.recurrenceDay ?? 25}
              />
            </label>
          ) : null}
          <label>
            <span>Issue date</span>
            <input
              onChange={(event) =>
                setInput({ ...input, issueDate: event.target.value })
              }
              required
              type="date"
              value={input.issueDate}
            />
          </label>
          <label>
            <span>Due date</span>
            <input
              onChange={(event) =>
                setInput({ ...input, dueDate: event.target.value })
              }
              type="date"
              value={input.dueDate}
            />
          </label>
          <label>
            <span>Source invoice</span>
            <input
              onChange={(event) =>
                setInput({ ...input, sourceInvoiceNumber: event.target.value })
              }
              placeholder="Required for credit notes and receipts"
              value={input.sourceInvoiceNumber}
            />
          </label>
          <label>
            <span>Commission person</span>
            <input
              onChange={(event) =>
                setInput({ ...input, commissionPersonName: event.target.value })
              }
              placeholder={
                needsCommissionPerson
                  ? "Required now"
                  : "Required if commission/sale"
              }
              required={needsCommissionPerson}
              value={input.commissionPersonName}
            />
          </label>
        </div>

        <div className="composer-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-action" type="submit">
            Save draft
          </button>
        </div>
      </form>
    </div>
  );
}
