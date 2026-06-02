"use client";

import { FileMinus, FileText, Plus, Receipt as ReceiptIcon, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CLIENTS, clientById, fmt } from "@/lib/invoices/redesign/data";
import type { Client, ComposerForm, Doc, DocKind, Line } from "@/lib/invoices/redesign/types";
import { TemplatePreview } from "../ledger/TemplatePreview";

interface ComposerProps {
  open: boolean;
  onClose: () => void;
  prefill: Partial<Doc> | null;
  onCreate: (form: ComposerForm) => void;
}

interface LocalLine {
  key: number;
  desc: string;
  qty: number;
  unitPrice: number;
}

export function Composer({ open, onClose, prefill, onCreate }: ComposerProps) {
  const initial = prefill ?? null;
  const isEdit = !!initial?.id;

  const [kind, setKind] = useState<DocKind>("invoice");
  const [client, setClient] = useState("c1");
  const [period, setPeriod] = useState("May 2026");
  const [issued, setIssued] = useState("2026-05-26");
  const [due, setDue] = useState("2026-06-09");
  const [vatRate, setVatRate] = useState(19);
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "monthly" | "yearly">("none");
  const [commission, setCommission] = useState(false);
  const [agent, setAgent] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([{ key: 1, desc: "", qty: 1, unitPrice: 0 }]);
  const [newClient, setNewClient] = useState({ name: "", property: "", address: "", vat: "" });

  useEffect(() => {
    if (!open) return;
    setNewClient({ name: "", property: "", address: "", vat: "" });
    if (initial) {
      setKind((initial.kind as DocKind) || "invoice");
      setClient(initial.client || "c1");
      setPeriod(initial.period || "May 2026");
      setIssued(initial.issued || "2026-05-26");
      setDue(initial.due || "2026-06-09");
      setVatRate(initial.vatRate ?? 19);
      setDescription(initial.description || "");
      setCommission(!!initial.commission);
      setAgent(initial.commission?.agent ?? "");
      const seed: LocalLine[] = initial.lines && initial.lines.length
        ? initial.lines.map((l, i) => ({ key: i + 1, desc: l.desc, qty: l.qty, unitPrice: l.unitPrice }))
        : [{ key: 1, desc: "", qty: 1, unitPrice: 0 }];
      setLines(seed);
    } else {
      setKind("invoice");
      setClient("c1");
      setPeriod("May 2026");
      setIssued("2026-05-26");
      setDue("2026-06-09");
      setVatRate(19);
      setDescription("");
      setRecurrence("none");
      setCommission(false);
      setAgent("");
      setLines([{ key: 1, desc: "", qty: 1, unitPrice: 0 }]);
    }
  }, [open, prefill]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sub = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const vat = (sub * (Number(vatRate) || 0)) / 100;
  const total = sub + vat;

  const isNewClient = client === "__new__";

  const previewDoc: Doc = useMemo(
    () => ({
      id: initial?.id ?? "preview",
      kind,
      stage: initial?.stage ?? "draft",
      draftNo: initial?.draftNo ?? `DRAFT-${issued || "preview"}`,
      officialNo: initial?.officialNo ?? null,
      pdf: undefined,
      client: isNewClient ? "preview-new" : client,
      issued,
      due,
      period,
      vatRate,
      vatMode: vatRate === 0 ? "no-vat" : "plus-vat",
      lines: lines.map(({ desc, qty, unitPrice }) => ({
        desc: desc || "—",
        qty: Number(qty) || 0,
        unitPrice: Number(unitPrice) || 0
      })),
      total: total * (kind === "credit" ? -1 : 1),
      description,
      commission: commission ? { agent, rate: "5%", amount: sub * 0.05 } : undefined,
      timeline: initial?.timeline ?? []
    }),
    [kind, client, isNewClient, issued, due, period, vatRate, lines, total, description, commission, agent, sub, initial?.id, initial?.draftNo, initial?.officialNo, initial?.stage, initial?.timeline]
  );

  if (!open) return null;

  const updateLine = (key: number, field: keyof LocalLine, value: string | number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const addLine = () =>
    setLines((ls) => [...ls, { key: Date.now() + Math.random(), desc: "", qty: 1, unitPrice: 0 }]);
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let resolvedClient = client;
    let createdClient: Client | null = null;
    if (client === "__new__") {
      if (!newClient.name.trim()) return;
      const id = "c" + (CLIENTS.length + 1) + "_" + Math.random().toString(36).slice(2, 5);
      createdClient = {
        id,
        name: newClient.name.trim(),
        property: newClient.property.trim() || "—",
        address: newClient.address.trim() || "—",
        vat: newClient.vat.trim() || "—"
      };
      CLIENTS.push(createdClient);
      resolvedClient = id;
    }

    const editingFields: Partial<ComposerForm> = isEdit
      ? {
          editingId: initial?.id,
          draftNo: initial?.draftNo,
          officialNo: initial?.officialNo,
          stage: initial?.stage,
          issued: initial?.issued,
          timeline: initial?.timeline
        }
      : {};

    onCreate({
      kind,
      client: resolvedClient,
      period,
      issued,
      due,
      vatRate,
      lines: lines.map(({ desc, qty, unitPrice }) => ({ desc, qty: Number(qty), unitPrice: Number(unitPrice) })),
      description,
      recurrence,
      commission: commission ? { agent, rate: "5%", amount: sub * 0.05 } : null,
      newClient: createdClient,
      ...editingFields
    });
    onClose();
  }

  const cl = isNewClient
    ? { name: newClient.name || "New client", property: newClient.property || "—" }
    : clientById(client);
  const kindLabel = kind === "credit" ? "credit note" : kind === "receipt" ? "receipt" : "invoice";

  const previewClientOverride: Client | undefined = isNewClient
    ? {
        id: "preview-new",
        name: newClient.name || "New client",
        property: newClient.property || "—",
        address: newClient.address || "—",
        vat: newClient.vat || "—"
      }
    : undefined;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="composer-header">
          <div>
            <p className="eyebrow">{isEdit ? "Edit document" : `New ${kindLabel}`}</p>
            <h2>{isEdit ? `Edit ${initial?.officialNo ? "№ " + initial.officialNo : initial?.draftNo}` : "Create a draft for Marios"}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>

        <div className="composer-body">
        <div className="composer-form-pane">
        <div className="segmented" role="tablist" style={{ marginTop: 18 }}>
          <button type="button" className={kind === "invoice" ? "active" : ""} onClick={() => setKind("invoice")}>
            <FileText size={13} strokeWidth={1.6} /> Invoice
          </button>
          <button type="button" className={kind === "credit" ? "active" : ""} onClick={() => setKind("credit")}>
            <FileMinus size={13} strokeWidth={1.6} /> Credit note
          </button>
          <button type="button" className={kind === "receipt" ? "active" : ""} onClick={() => setKind("receipt")}>
            <ReceiptIcon size={13} strokeWidth={1.6} /> Receipt
          </button>
        </div>

        <div className="composer-grid">
          <label style={{ gridColumn: "1 / -1" }}>
            <span>Client / tenant</span>
            <select value={client} onChange={(event) => setClient(event.target.value)}>
              <option value="__new__">➕ Add a new client…</option>
              <option disabled>──────</option>
              {CLIENTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.property}
                </option>
              ))}
            </select>
          </label>
          {isNewClient ? (
            <>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>Client name *</span>
                <input
                  autoFocus
                  value={newClient.name}
                  onChange={(event) => setNewClient({ ...newClient, name: event.target.value })}
                  placeholder="e.g. Andreas Konstantinou — or company legal name"
                  required
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>Property / reference</span>
                <input
                  value={newClient.property}
                  onChange={(event) => setNewClient({ ...newClient, property: event.target.value })}
                  placeholder="e.g. Apt 4B · Limassol Marina"
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <span>Billing address</span>
                <input
                  value={newClient.address}
                  onChange={(event) => setNewClient({ ...newClient, address: event.target.value })}
                  placeholder="Street, postcode, city"
                />
              </label>
              <label>
                <span>VAT no. (if any)</span>
                <input
                  value={newClient.vat}
                  onChange={(event) => setNewClient({ ...newClient, vat: event.target.value })}
                  placeholder="CY 1… or blank"
                />
              </label>
              <label>
                <span>Period</span>
                <input value={period} onChange={(event) => setPeriod(event.target.value)} />
              </label>
            </>
          ) : (
            <label>
              <span>Period</span>
              <input value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
          )}
          <label>
            <span>Issue date</span>
            <input type="date" value={issued} onChange={(event) => setIssued(event.target.value)} />
          </label>
          <label>
            <span>{kind === "receipt" ? "Reference invoice" : "Due date"}</span>
            <input type={kind === "receipt" ? "text" : "date"} value={due} onChange={(event) => setDue(event.target.value)} />
          </label>
        </div>

        <div className="lines-editor">
          <div className="lines-editor-head">
            <h3>Lines</h3>
            <span>
              {lines.length} item{lines.length === 1 ? "" : "s"} · VAT {vatRate}%
            </span>
          </div>
          <div className="lines-grid">
            <div className="lines-header">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit €</span>
              <span>Line total</span>
              <span />
            </div>
            {lines.map((l) => (
              <div className="line-row" key={l.key}>
                <input
                  value={l.desc}
                  onChange={(event) => updateLine(l.key, "desc", event.target.value)}
                  placeholder={`e.g. Rent — ${cl.property} · ${period}`}
                />
                <input
                  className="qty"
                  type="number"
                  step="1"
                  value={l.qty}
                  onChange={(event) => updateLine(l.key, "qty", event.target.value)}
                />
                <input
                  className="price"
                  type="number"
                  step="0.01"
                  value={l.unitPrice}
                  onChange={(event) => updateLine(l.key, "unitPrice", event.target.value)}
                />
                <span className="line-total">{fmt((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</span>
                <button
                  type="button"
                  className="line-remove"
                  onClick={() => removeLine(l.key)}
                  disabled={lines.length === 1}
                  aria-label="Remove line"
                  title="Remove line"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="add-line" onClick={addLine}>
            <Plus size={14} strokeWidth={1.6} /> Add another line
          </button>

          <div className="lines-totals">
            <div className="lines-totals-card">
              <div className="row">
                <span>Subtotal</span>
                <b>{fmt(sub)}</b>
              </div>
              <div className="row">
                <span>VAT {vatRate}%</span>
                <b>{fmt(vat)}</b>
              </div>
              <div className="row tot">
                <span>Total {kind === "credit" ? "credited" : kind === "receipt" ? "received" : "due"}</span>
                <b>{fmt(total)}</b>
              </div>
            </div>
          </div>
        </div>

        <label style={{ display: "grid", gap: 6, marginTop: 22 }}>
          <span
            style={{
              fontSize: "0.62rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 600
            }}
          >
            Note to Marios (optional)
          </span>
          <textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Context for the review — anything Marios should know about this document."
            style={{
              padding: "10px 12px",
              border: "1px solid var(--rule)",
              borderRadius: "var(--radius)",
              background: "var(--surface-2)",
              fontFamily: "var(--font-sans)",
              fontSize: "0.9rem",
              resize: "vertical"
            }}
          />
        </label>

        <div className="optional-composer-grid composer-grid">
          <label>
            <span>Recurrence</span>
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}>
              <option value="none">One-off</option>
              <option value="monthly">Monthly · same day each month</option>
              <option value="yearly">Yearly · same date each year</option>
            </select>
          </label>
          <label>
            <span>Commission flag</span>
            <select value={commission ? "yes" : "no"} onChange={(event) => setCommission(event.target.value === "yes")}>
              <option value="no">No commission</option>
              <option value="yes">Yes — track agent</option>
            </select>
          </label>
          {commission ? (
            <label style={{ gridColumn: "1 / -1" }}>
              <span>Agent of record</span>
              <input value={agent} onChange={(event) => setAgent(event.target.value)} placeholder="e.g. Christos Lambrou" />
            </label>
          ) : null}
        </div>

        <p className="composer-description">
          <span>What happens next</span>
          {isEdit ? (
            <>Changes will be saved to the existing document. Sophia will note the edit in the audit trail.</>
          ) : (
            <>
              Sophia will prepare a draft with a fake number, route it to Marios via WhatsApp{" "}
              <strong style={{ color: "var(--ink)" }}>CSC Review</strong>, and only apply an official number after Marios approves.
            </>
          )}
        </p>
        </div>

        <aside className="composer-preview-pane" aria-label="Live invoice preview">
          <div className="composer-preview-eyebrow">
            <span>Live preview</span>
            <span className="composer-preview-meta">A4 · updates as you type</span>
          </div>
          <div className="composer-preview-stage">
            <TemplatePreview doc={previewDoc} clientOverride={previewClientOverride} />
          </div>
        </aside>
        </div>

        <div className="composer-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isNewClient && !newClient.name.trim()}>
            <Send size={14} strokeWidth={1.6} />
            {isEdit
              ? "Save changes"
              : `Prepare ${kindLabel} for ${(cl.name || "new client").split(",")[0].split(" ")[0]}`}
          </button>
        </div>
      </form>
    </div>
  );
}
