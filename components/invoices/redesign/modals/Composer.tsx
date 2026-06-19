"use client";

import { FileMinus, FileText, Receipt as ReceiptIcon, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CLIENTS, clientById, fmt } from "@/lib/invoices/redesign/data";
import type { Client, ComposerForm, Doc, DocKind, Line } from "@/lib/invoices/redesign/types";
import { TemplatePreview } from "../ledger/TemplatePreview";

// Auto-defaults for a fresh document: issued today, due in 30 days, period = this month.
const DUE_DAYS_DEFAULT = 30;
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const todayISO = () => toISODate(new Date());
const plus30ISO = () => toISODate(new Date(Date.now() + DUE_DAYS_DEFAULT * 86400000));
const currentPeriod = () =>
  new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });

interface ComposerProps {
  open: boolean;
  onClose: () => void;
  prefill: Partial<Doc> | null;
  onCreate: (form: ComposerForm) => void;
  // All documents — used to offer existing invoices when issuing a receipt.
  invoices?: Doc[];
}

interface LocalLine {
  key: number;
  desc: string;
  qty: number;
  unitPrice: number;
}

export function Composer({ open, onClose, prefill, onCreate, invoices = [] }: ComposerProps) {
  const initial = prefill ?? null;
  const isEdit = !!initial?.id;

  const [kind, setKind] = useState<DocKind>("invoice");
  const [client, setClient] = useState("__new__");
  const [sourceInvoiceId, setSourceInvoiceId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [issued, setIssued] = useState(todayISO());
  const [due, setDue] = useState(plus30ISO());
  const [vatRate, setVatRate] = useState(19);
  const [vatMode, setVatMode] = useState<"plus-vat" | "included-vat" | "no-vat">("plus-vat");
  const [description, setDescription] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "monthly" | "yearly">("none");
  const [recurrenceEmail, setRecurrenceEmail] = useState("");
  const [commission, setCommission] = useState(true);
  const [agent, setAgent] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([{ key: 1, desc: "", qty: 1, unitPrice: 0 }]);
  const [newClient, setNewClient] = useState({ name: "", property: "", address: "", vat: "" });
  const [clientListOpen, setClientListOpen] = useState(false);
  const [creditReason, setCreditReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setNewClient({ name: "", property: "", address: "", vat: "" });
    setSourceInvoiceId("");
    setCreditReason("");
    if (initial) {
      setKind((initial.kind as DocKind) || "invoice");
      setClient(initial.client || CLIENTS[0]?.id || "__new__");
      setPeriod(initial.period || currentPeriod());
      setIssued(initial.issued || todayISO());
      setDue(initial.due || plus30ISO());
      setVatRate(initial.vatRate ?? 19);
      setVatMode(
        initial.vatMode === "included-vat" ? "included-vat" : initial.vatMode === "no-vat" ? "no-vat" : "plus-vat"
      );
      setDescription(initial.description || "");
      setCommission(!!initial.commission);
      setAgent(initial.commission?.agent ?? "");
      const seed: LocalLine[] = initial.lines && initial.lines.length
        ? initial.lines.map((l, i) => ({ key: i + 1, desc: l.desc, qty: l.qty, unitPrice: l.unitPrice }))
        : [{ key: 1, desc: "", qty: 1, unitPrice: 0 }];
      setLines(seed);
    } else {
      setKind("invoice");
      setClient("__new__");
      setPeriod(currentPeriod());
      setIssued(todayISO());
      setDue(plus30ISO());
      setVatRate(19);
      setVatMode("plus-vat");
      setDescription("");
      setRecurrence("none");
      setRecurrenceEmail("");
      setCommission(true);
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
  // "+ VAT" (plus-vat): VAT added on top. "Including VAT" (included-vat): price already
  // contains VAT, back it out. "Excluding VAT" (no-vat): no VAT applied.
  const rate = vatMode === "no-vat" ? 0 : Number(vatRate) || 0;
  const vat = vatMode === "included-vat" ? sub - sub / (1 + rate / 100) : (sub * rate) / 100;
  const total = vatMode === "included-vat" ? sub : sub + vat;

  // Due is entered as a number of days to pay; stored as an actual date (issue + days).
  const dueDays =
    issued && due ? String(Math.max(0, Math.round((Date.parse(due) - Date.parse(issued)) / 86400000))) : "";

  const isNewClient = client === "__new__";
  // Receipts and credit notes are both derived from an existing invoice: same
  // client search + invoice picker, no manual line editing.
  const isSourceMode = kind === "receipt" || kind === "credit";

  // Typeahead: filter existing clients by the typed name. A name with no exact match
  // is treated as a new client and auto-saved when the invoice is created.
  const clientQuery = newClient.name.trim().toLowerCase();
  const clientMatches = (clientQuery ? CLIENTS.filter((c) => c.name.toLowerCase().startsWith(clientQuery)) : CLIENTS).slice(0, 6);

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
      vatMode,
      lines: lines.map(({ desc, qty, unitPrice }) => ({
        desc: desc || "—",
        qty: Number(qty) || 0,
        unitPrice: Number(unitPrice) || 0
      })),
      total: total * (kind === "credit" ? -1 : 1),
      description,
      appliesTo: kind === "credit" ? invoices.find((i) => i.id === sourceInvoiceId)?.officialNo ?? undefined : undefined,
      commission: commission ? { agent, rate: "5%", amount: sub * 0.05 } : undefined,
      timeline: initial?.timeline ?? []
    }),
    [kind, client, isNewClient, issued, due, period, vatRate, vatMode, lines, total, description, commission, agent, sub, sourceInvoiceId, invoices, initial?.id, initial?.draftNo, initial?.officialNo, initial?.stage, initial?.timeline]
  );

  if (!open) return null;

  const updateLine = (key: number, field: keyof LocalLine, value: string | number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  const removeLine = (key: number) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // A receipt or credit note must be tied to a real, selected invoice.
    if (isSourceMode && !sourceInvoiceId) return;

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
      vatMode,
      lines: lines.map(({ desc, qty, unitPrice }) => ({ desc, qty: Number(qty), unitPrice: Number(unitPrice) })),
      description,
      recurrence,
      recurrenceEmail: recurrence !== "none" ? recurrenceEmail.trim() : "",
      commission: commission ? { agent, rate: "5%", amount: sub * 0.05 } : null,
      newClient: createdClient,
      sourceInvoiceId: isSourceMode ? sourceInvoiceId : undefined,
      creditReason: kind === "credit" ? creditReason.trim() : undefined,
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

  // Source mode (receipt/credit): the document is issued against an existing,
  // numbered invoice for the chosen client. Offer only those invoices.
  const sourceInvoices = invoices.filter(
    (inv) => inv.kind === "invoice" && !!inv.officialNo && inv.client === client
  );

  // Picking an invoice mirrors its amount/description/VAT into the receipt or
  // credit note so the live preview and totals are correct, and pins the
  // source-invoice reference.
  function selectInvoiceForSource(invoiceId: string) {
    setSourceInvoiceId(invoiceId);
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    setVatMode(inv.vatMode);
    setVatRate(inv.vatRate);
    setDue(inv.officialNo || "");
    setDescription(
      kind === "credit"
        ? `Credit note for invoice ${inv.officialNo}`
        : inv.description || `Payment received for invoice ${inv.officialNo}`
    );
    const seed: LocalLine[] = inv.lines && inv.lines.length
      ? inv.lines.map((l, i) => ({ key: i + 1, desc: l.desc, qty: l.qty, unitPrice: l.unitPrice }))
      : [{ key: 1, desc: `Invoice ${inv.officialNo}`, qty: 1, unitPrice: Math.abs(inv.total) }];
    setLines(seed);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="composer-header">
          <div>
            <p className="eyebrow">{isEdit ? "Edit document" : `New ${kindLabel}`}</p>
            <h2>{isEdit ? `Edit ${initial?.officialNo ? "№ " + initial.officialNo : initial?.draftNo}` : "Create a draft for Marios"}</h2>
            <p className="composer-doc-number" style={{ marginTop: 4, fontSize: ".8rem", color: "var(--muted)" }}>
              {initial?.officialNo
                ? `Invoice № ${initial.officialNo}`
                : initial?.draftNo
                  ? `Draft ${initial.draftNo}`
                  : "Number is assigned once approved"}
            </p>
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
          <label className="client-combo" style={{ gridColumn: "1 / -1", position: "relative" }}>
            <span>Client name *</span>
            <input
              value={newClient.name}
              autoComplete="off"
              onChange={(event) => {
                const v = event.target.value;
                setNewClient({ ...newClient, name: v });
                const exact = CLIENTS.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
                setClient(exact ? exact.id : "__new__");
                setClientListOpen(v.trim().length > 0);
              }}
              onFocus={() => setClientListOpen(newClient.name.trim().length > 0)}
              onBlur={() => window.setTimeout(() => setClientListOpen(false), 150)}
              placeholder="Start typing — pick an existing client or add a new one"
              required
            />
            {clientListOpen && clientMatches.length > 0 ? (
              <ul className="client-typeahead">
                {clientMatches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setNewClient({
                          name: c.name,
                          property: c.property === "—" ? "" : c.property,
                          address: c.address === "—" ? "" : c.address,
                          vat: c.vat === "—" ? "" : c.vat
                        });
                        setClient(c.id);
                        setClientListOpen(false);
                      }}
                    >
                      <strong>{c.name}</strong>
                      {c.vat && c.vat !== "—" ? <span>{c.vat}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <label>
            <span>Issue date</span>
            <input type="date" value={issued} onChange={(event) => setIssued(event.target.value)} />
          </label>
          <label>
            <span>
              {kind === "receipt" ? "Invoice to receipt" : kind === "credit" ? "Invoice to credit" : "Due (days to pay)"}
            </span>
            {isSourceMode ? (
              <select
                value={sourceInvoiceId}
                onChange={(event) => selectInvoiceForSource(event.target.value)}
                required
              >
                <option value="" disabled>
                  {sourceInvoices.length ? "Select an invoice…" : "No invoices for this client yet"}
                </option>
                {sourceInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    № {inv.officialNo} · {fmt(Math.abs(inv.total))} · {inv.issued}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={0}
                placeholder="e.g. 30"
                value={dueDays}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (!raw) {
                    setDue("");
                    return;
                  }
                  const days = Math.max(0, Number(raw) || 0);
                  const base = issued ? new Date(issued) : new Date();
                  base.setDate(base.getDate() + days);
                  setDue(base.toISOString().slice(0, 10));
                }}
              />
            )}
          </label>
          {!isSourceMode ? (
            <label>
              <span>VAT treatment</span>
              <select
                value={vatMode}
                onChange={(event) => setVatMode(event.target.value as "plus-vat" | "included-vat" | "no-vat")}
              >
                <option value="plus-vat">+ VAT — added on top</option>
                <option value="included-vat">Including VAT — already in price</option>
                <option value="no-vat">Excluding VAT — no VAT</option>
              </select>
            </label>
          ) : null}
        </div>

        {!isSourceMode ? (
        <div className="lines-editor">
          <div className="lines-editor-head">
            <h3>Lines</h3>
            <span>
              {lines.length} item{lines.length === 1 ? "" : "s"} · VAT {rate}%
            </span>
          </div>
          <div className="lines-grid">
            {lines.map((l) => (
              <div className="line-row-stacked" key={l.key}>
                <label className="line-desc-field">
                  <span className="line-field-label">Description</span>
                  <textarea
                    rows={3}
                    value={l.desc}
                    onChange={(event) => updateLine(l.key, "desc", event.target.value)}
                    placeholder={`e.g. Rent — ${cl.property} · ${period}`}
                  />
                </label>
                <div className="line-amounts">
                  <label className="line-amt-field">
                    <span className="line-field-label">Unit €</span>
                    <input
                      className="price"
                      type="number"
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(event) => updateLine(l.key, "unitPrice", event.target.value)}
                    />
                  </label>
                  <div className="line-amt-field">
                    <span className="line-field-label">Line total</span>
                    <span className="line-total">{fmt((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</span>
                  </div>
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      className="line-remove"
                      onClick={() => removeLine(l.key)}
                      aria-label="Remove line"
                      title="Remove line"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="lines-totals">
            <div className="lines-totals-card">
              <div className="row">
                <span>Subtotal</span>
                <b>{fmt(vatMode === "included-vat" ? sub - vat : sub)}</b>
              </div>
              <div className="row">
                <span>VAT {rate}%</span>
                <b>{fmt(vat)}</b>
              </div>
              <div className="row tot">
                <span>Total due</span>
                <b>{fmt(total)}</b>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {kind === "credit" ? (
          <div className="composer-grid">
            <label style={{ gridColumn: "1 / -1" }}>
              <span>Reason for the credit note (sent to the group)</span>
              <textarea
                rows={3}
                value={creditReason}
                onChange={(event) => setCreditReason(event.target.value)}
                placeholder="e.g. Invoice issued in error — cancelling and crediting in full."
              />
            </label>
          </div>
        ) : null}

        {!isSourceMode ? (
        <div className="optional-composer-grid composer-grid">
          <label>
            <span>Recurrence</span>
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}>
              <option value="none">One-off</option>
              <option value="monthly">Monthly · same day each month</option>
              <option value="yearly">Yearly · same date each year</option>
            </select>
          </label>
          {recurrence !== "none" ? (
            <label style={{ gridColumn: "1 / -1" }}>
              <span>Send recurring invoice to (email)</span>
              <input
                type="email"
                value={recurrenceEmail}
                onChange={(event) => setRecurrenceEmail(event.target.value)}
                placeholder="client@example.com — Sophia emails each invoice here"
              />
            </label>
          ) : null}
          <label>
            <span>Commission flag</span>
            <select value={commission ? "yes" : "no"} onChange={(event) => setCommission(event.target.value === "yes")}>
              <option value="no">No track agent</option>
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
        ) : null}

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
          <button type="submit" disabled={(isNewClient && !newClient.name.trim()) || (isSourceMode && !sourceInvoiceId)}>
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
