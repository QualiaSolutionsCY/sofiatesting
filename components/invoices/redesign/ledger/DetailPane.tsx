"use client";

import {
  Activity,
  AlertTriangle,
  Command,
  Copy,
  Download,
  Eye,
  FileMinus,
  Hash,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CLIENTS, ENTITY, clientById, fmt, metrics } from "@/lib/invoices/redesign/data";
import { STAGES } from "@/lib/invoices/redesign/data";
import { nextNumber, primaryAction, stageHeadline } from "@/lib/invoices/redesign/stages";
import type { Doc } from "@/lib/invoices/redesign/types";
import { TemplatePreview } from "./TemplatePreview";

interface DetailPaneProps {
  doc: Doc | null;
  allDocs: Doc[];
  sharedCc: string;
  accountingEmail: string;
  operator: string;
  onAct: (action: string) => void;
  onOpenLightbox: (doc: Doc) => void;
  onUpdateDoc: (docId: string, form: InlineDocFormState) => void;
  onCorrectResendDoc: (docId: string, form: InlineDocFormState, reason: string) => void;
}

type VatMode = "plus-vat" | "included-vat" | "no-vat";

interface InlineDocFormState {
  client: string;
  period: string;
  issued: string;
  due: string;
  vatMode: VatMode;
  description: string;
  lines: Array<{ key: string; desc: string; qty: number; unitPrice: number }>;
  correctionReason: string;
}

function docToFormState(doc: Doc): InlineDocFormState {
  return {
    client: doc.client,
    period: doc.period || "",
    issued: doc.issued,
    due: doc.due ?? "",
    vatMode: doc.vatMode || (doc.vatRate === 0 ? "no-vat" : "plus-vat"),
    description: doc.description,
    lines: (doc.lines || []).map((l, i) => ({
      key: `${doc.id}-${i}`,
      desc: l.desc,
      qty: l.qty,
      unitPrice: l.unitPrice
    })),
    correctionReason: ""
  };
}

function computeVat(sub: number, mode: VatMode): { vatAmount: number; total: number; effectiveRate: number } {
  if (mode === "no-vat") return { vatAmount: 0, total: sub, effectiveRate: 0 };
  if (mode === "included-vat") {
    const net = sub / 1.19;
    return { vatAmount: sub - net, total: sub, effectiveRate: 19 };
  }
  const vatAmount = sub * 0.19;
  return { vatAmount, total: sub + vatAmount, effectiveRate: 19 };
}

function DocumentTab({
  doc,
  onAct,
  onOpenLightbox,
  onUpdate,
  onCorrectResend
}: {
  doc: Doc;
  onAct: (action: string) => void;
  onOpenLightbox: (doc: Doc) => void;
  onUpdate: (form: InlineDocFormState) => void;
  onCorrectResend: (form: InlineDocFormState, reason: string) => void;
}) {
  // Already-sent docs (numbered, sent-to-accounting) → correction-resend mode required
  const isSent = !!doc.officialNo || doc.stage === "numbered" || doc.stage === "sent-to-accounting";
  const editable = doc.stage !== "credited" && doc.kind !== "receipt"; // credited docs and issued receipts are final — they need a separate new invoice
  const requiresCorrectionReason = isSent && editable;
  const [form, setForm] = useState<InlineDocFormState>(() => docToFormState(doc));
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");

  // The form follows the SERVER doc: it re-loads on select AND re-syncs the instant a
  // save lands (so saved changes show live and the toolbar leaves "Unsaved changes").
  // Edits live in `form`, never in `doc`, so this key is stable while typing — it only
  // changes when a different doc is selected or the saved content comes back changed.
  const baselineKey = JSON.stringify(docToFormState(doc));
  useEffect(() => {
    setForm(docToFormState(doc));
    setSaveState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineKey]);

  const dirty = useMemo(() => {
    const baseline = docToFormState(doc);
    const formNoReason = { ...form, correctionReason: "" };
    return JSON.stringify(formNoReason) !== JSON.stringify(baseline);
  }, [form, doc]);

  const canSubmit = dirty && (!requiresCorrectionReason || form.correctionReason.trim().length > 0);

  useEffect(() => {
    if (saveState === "saving") return;
    setSaveState(dirty ? "dirty" : "idle");
  }, [dirty, saveState]);

  const updateField = <K extends keyof InlineDocFormState>(field: K, value: InlineDocFormState[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateLine = (key: string, field: "desc" | "qty" | "unitPrice", value: string | number) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l) =>
        l.key === key ? { ...l, [field]: field === "desc" ? value : Number(value) || 0 } : l
      )
    }));
  };

  const addLine = () => {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { key: `${doc.id}-${Date.now()}`, desc: "", qty: 1, unitPrice: 0 }]
    }));
  };

  const removeLine = (key: string) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((l) => l.key !== key) : prev.lines
    }));
  };

  const sub = form.lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);
  const { vatAmount: vat, total, effectiveRate } = computeVat(sub, form.vatMode);

  const cl = clientById(form.client);
  const previewDoc: Doc = useMemo(
    () => ({
      ...doc,
      client: form.client,
      period: form.period,
      issued: form.issued,
      due: form.due || undefined,
      vatRate: effectiveRate,
      vatMode: form.vatMode,
      description: form.description,
      lines: form.lines.map(({ desc, qty, unitPrice }) => ({ desc: desc || "—", qty, unitPrice })),
      total: total * (doc.kind === "credit" ? -1 : 1)
    }),
    [doc, form, total, effectiveRate]
  );

  // Save quietly — persist the edit WITHOUT re-sending to the group (drafts, and now
  // also already-sent invoices when the operator doesn't need to notify anyone).
  const handleSaveQuiet = () => {
    setSaveState("saving");
    onUpdate(form);
    setTimeout(() => setSaveState("saved"), 600);
    setTimeout(() => setSaveState("idle"), 2200);
  };
  // Save AND re-send the corrected copy to Marios + the group (reason required).
  const handleCorrectResend = () => {
    setSaveState("saving");
    onCorrectResend(form, form.correctionReason.trim());
    setTimeout(() => setSaveState("saved"), 600);
    setTimeout(() => setSaveState("idle"), 2200);
  };

  const handleDiscard = () => {
    setForm(docToFormState(doc));
    setSaveState("idle");
  };

  return (
    <>
      {doc.stage === "correction-needed" && doc.correction ? (
        <div className="warning-band">
          <AlertTriangle size={18} strokeWidth={1.6} />
          <div>
            <strong>Marios asked for a correction</strong>
            <p>{doc.correction.reason}</p>
            <span>
              {doc.correction.at} · from {doc.correction.from}
            </span>
          </div>
        </div>
      ) : null}

      {doc.stage === "approved" ? (
        <div className="numbering-panel">
          <div>
            <p className="eyebrow">Numbering</p>
            <h3>Approved — ready to receive next sequence number</h3>
            <p>
              Next in line:{" "}
              <strong style={{ fontFamily: "var(--font-mono)" }}>{nextNumber(doc)}</strong>. Confirm to lock and proceed to delivery.
            </p>
            <span className="pending-number-note">Sophia will keep the draft number in the audit trail.</span>
          </div>
          <div className="numbering-controls">
            <input defaultValue={nextNumber(doc)} />
            <button type="button" onClick={() => onAct("number")}>
              <Hash size={14} strokeWidth={1.6} /> Lock &amp; number
            </button>
          </div>
        </div>
      ) : null}

      <div className="inline-editor">
        <aside className="inline-editor-form" aria-label="Edit invoice fields">
          <div className="inline-editor-toolbar">
            <span className="inline-editor-title">
              {editable ? "Edit invoice" : "Invoice details"}
            </span>
            <span className={`inline-editor-status inline-editor-status-${saveState}`}>
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && "Saved"}
              {saveState === "dirty" && "Unsaved changes"}
              {saveState === "idle" && (editable ? "Saved" : "Read only")}
            </span>
            {editable && saveState === "dirty" ? (
              <div className="inline-editor-actions">
                <button type="button" className="ghost" onClick={handleDiscard}>
                  Discard
                </button>
                {requiresCorrectionReason ? (
                  <>
                    <button
                      type="button"
                      className="ghost"
                      onClick={handleSaveQuiet}
                      disabled={!dirty}
                      title="Save the change without notifying the group"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleCorrectResend}
                      disabled={!canSubmit}
                      title={!canSubmit ? "Add a correction reason first" : undefined}
                    >
                      Correct &amp; resend
                    </button>
                  </>
                ) : (
                  <button type="button" className="primary" onClick={handleSaveQuiet} disabled={!canSubmit}>
                    Save changes
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <fieldset className="inline-editor-fieldset" disabled={!editable}>
            <div className="inline-editor-row">
              <label className="inline-editor-field">
                <span>Invoice number</span>
                <input
                  value={doc.officialNo ?? doc.draftNo ?? ""}
                  readOnly
                  disabled
                  style={{ fontFamily: "var(--font-mono)" }}
                />
              </label>
              <label className="inline-editor-field">
                <span>Status</span>
                <input
                  value={
                    doc.officialNo
                      ? `№ ${doc.officialNo} · locked`
                      : doc.stage === "approved"
                        ? `Next: ${nextNumber(doc)} (assign below)`
                        : "Draft — sequence assigned after Marios approval"
                  }
                  readOnly
                  disabled
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}
                />
              </label>
            </div>

            {doc.stage === "approved" ? (
              <div className="inline-editor-callout brand">
                <Hash size={16} strokeWidth={1.6} />
                <div>
                  <strong>Marios approved — Sophia will number this automatically</strong>
                  <p>
                    Next in sequence: <b style={{ fontFamily: "var(--font-mono)" }}>{nextNumber(doc)}</b> (fake until client provides real sequence). On approval landing, Sophia stamps the number and forwards to the accounting group — no manual step needed.
                  </p>
                </div>
              </div>
            ) : null}

            {requiresCorrectionReason ? (
              <div className="inline-editor-correction">
                <div className="inline-editor-correction-head">
                  <RefreshCw size={14} strokeWidth={1.6} />
                  <strong>This invoice was already sent</strong>
                </div>
                <p>
                  Editing now triggers a <b>correction & resend</b>. Sophia will save the new content, mark this invoice as <i>corrected</i>, and send the client + accounting an updated version with a clear note to ignore the previous one. Reason required.
                </p>
                <label className="inline-editor-field" style={{ marginTop: 8 }}>
                  <span>Reason for correction *</span>
                  <textarea
                    rows={2}
                    value={form.correctionReason}
                    onChange={(event) => updateField("correctionReason", event.target.value)}
                    placeholder="e.g. CAM line was double-counted, tenant moved to annual prepay, address typo…"
                  />
                </label>
              </div>
            ) : null}

            <label className="inline-editor-field">
              <span>Client / tenant</span>
              <select
                value={form.client}
                onChange={(event) => updateField("client", event.target.value)}
              >
                {CLIENTS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.property}
                  </option>
                ))}
                {!CLIENTS.find((c) => c.id === form.client) ? (
                  <option value={form.client}>{cl.name}</option>
                ) : null}
              </select>
            </label>

            <div className="inline-editor-row">
              <label className="inline-editor-field">
                <span>Issue date</span>
                <input
                  type="date"
                  value={form.issued}
                  onChange={(event) => updateField("issued", event.target.value)}
                />
              </label>
            </div>

            <div className="inline-editor-row">
              <label className="inline-editor-field">
                <span>{doc.kind === "credit" ? "Applies to invoice" : "Due (days to pay)"}</span>
                {doc.kind === "credit" ? (
                  // Credit notes apply to a SOURCE INVOICE — show that invoice's
                  // number (read-only), not the editable due-date field this used
                  // to (mis)bind to, which rendered a date under an invoice label.
                  <input type="text" value={doc.appliesTo ?? "—"} readOnly />
                ) : (
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 14"
                    value={
                      form.issued && form.due
                        ? String(Math.max(0, Math.round((Date.parse(form.due) - Date.parse(form.issued)) / 86400000)))
                        : ""
                    }
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (!raw) {
                        updateField("due", "");
                        return;
                      }
                      const days = Math.max(0, Number(raw) || 0);
                      const base = form.issued ? new Date(form.issued) : new Date();
                      base.setDate(base.getDate() + days);
                      updateField("due", base.toISOString().slice(0, 10));
                    }}
                  />
                )}
              </label>
              <label className="inline-editor-field">
                <span>VAT mode</span>
                <select
                  value={form.vatMode}
                  onChange={(event) => updateField("vatMode", event.target.value as VatMode)}
                >
                  <option value="plus-vat">Plus VAT (19% added on top)</option>
                  <option value="included-vat">Including VAT (19% already inside)</option>
                  <option value="no-vat">No VAT (exempt)</option>
                </select>
              </label>
            </div>

            <div className="inline-editor-lines">
              <div className="inline-editor-lines-head">
                <span>Line items</span>
                <em>
                  {form.lines.length} item{form.lines.length === 1 ? "" : "s"} · VAT {effectiveRate}%
                </em>
              </div>
              <div className="inline-editor-lines-grid">
                <div className="inline-editor-lines-header">
                  <span>Description</span>
                  <span>Unit €</span>
                  <span>Line total</span>
                  <span />
                </div>
                {form.lines.map((l) => (
                  <div className="inline-editor-line-row" key={l.key}>
                    <input
                      value={l.desc}
                      onChange={(event) => updateLine(l.key, "desc", event.target.value)}
                      placeholder="What's being billed"
                    />
                    <input
                      type="number"
                      className="price"
                      step="0.01"
                      value={l.unitPrice}
                      onChange={(event) => updateLine(l.key, "unitPrice", event.target.value)}
                    />
                    <span className="line-total">{fmt(l.qty * l.unitPrice)}</span>
                    <button
                      type="button"
                      className="line-remove"
                      onClick={() => removeLine(l.key)}
                      disabled={form.lines.length === 1}
                      aria-label="Remove line"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {editable ? (
                <button type="button" className="inline-editor-add-line" onClick={addLine}>
                  + Add another line
                </button>
              ) : null}

              <div className="inline-editor-totals">
                <div className="row">
                  <span>Subtotal</span>
                  <strong>{fmt(sub)}</strong>
                </div>
                <div className="row">
                  <span>VAT {effectiveRate}%</span>
                  <strong>{fmt(vat)}</strong>
                </div>
                <div className="row tot">
                  <span>Total {doc.kind === "credit" ? "credited" : "due"}</span>
                  <strong>{fmt(total)}</strong>
                </div>
              </div>
            </div>

            {doc.commission ? (
              <div className="inline-editor-callout brand">
                <Activity size={16} strokeWidth={1.6} />
                <div>
                  <strong>Commission flagged · {doc.commission.agent}</strong>
                  <p>
                    Agent of record: <b>{doc.commission.agent}</b> · rate <b>{doc.commission.rate}</b> · amount{" "}
                    <b>{fmt(doc.commission.amount)}</b>.
                  </p>
                </div>
              </div>
            ) : null}
          </fieldset>
        </aside>

        <main className="inline-editor-preview" aria-label="Live invoice preview">
          <div className="inline-editor-preview-eyebrow">
            <span>Live preview</span>
            <button
              type="button"
              className="inline-editor-preview-expand"
              onClick={() => onOpenLightbox(previewDoc)}
              title="Open fullscreen"
            >
              Open fullscreen
            </button>
          </div>
          <div className="inline-editor-preview-stage">
            <TemplatePreview doc={previewDoc} />
          </div>
        </main>
      </div>
    </>
  );
}

function DeliveryPlan({
  doc,
  sharedCc,
  accountingEmail,
  onAct
}: {
  doc: Doc;
  sharedCc: string;
  accountingEmail: string;
  onAct: (action: string) => void;
}) {
  const cl = clientById(doc.client);
  const hasNumber = !!doc.officialNo;
  const clientHandle = cl.name.split(",")[0].split(" ")[0];
  const clientEmail = `${cl.name
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 9)}@example.com`;
  const clientPhone = hasNumber ? "+357 99 ••• 451" : "—";

  type ChannelState = "ok" | "ready" | "wait" | "off";
  type Channel = { ic: React.ReactNode; addr: string; state: ChannelState; stateLabel: string };

  const reviewState: ChannelState =
    doc.stage === "draft"
      ? "ready"
      : doc.stage === "sent-to-marios" || doc.stage === "corrected-resend"
        ? "wait"
        : doc.stage === "correction-needed"
          ? "wait"
          : "ok";
  const reviewLabel =
    doc.stage === "draft"
      ? "Ready to send"
      : doc.stage === "sent-to-marios" || doc.stage === "corrected-resend"
        ? "Waiting on Marios"
        : doc.stage === "correction-needed"
          ? "Correction requested"
          : doc.stage === "approved"
            ? "Approved"
            : "Delivered";

  const clientReady = hasNumber;
  const clientDelivered = doc.stage === "sent-to-accounting";
  const accountingDelivered = doc.stage === "sent-to-accounting";

  type Card = {
    key: string;
    eyebrow: string;
    title: string;
    channels: Channel[];
    msg: string;
    actions: Array<{ label: string; id: string }>;
    disabled?: boolean;
  };

  const cards: Card[] = [
    {
      key: "review",
      eyebrow: "Review channel",
      title: "Marios · CSC Review",
      channels: [
        {
          ic: <MessageCircle size={12} strokeWidth={1.6} />,
          addr: "Marios · +357 99 921560",
          state: reviewState,
          stateLabel: reviewLabel
        }
      ],
      msg: hasNumber
        ? `Just the PDF — no message (blank). Use “Edit message” to add a note for the group.`
        : doc.stage === "correction-needed"
          ? `Marios — corrected draft for ${cl.name}, ${cl.property} ready for re-review. ${fmt(doc.total)}. — Sophia`
          : `Marios — new draft for ${cl.name}, ${cl.property}. Total ${fmt(doc.total)}. Reply ✓ to approve, or write back with corrections. — Sophia`,
      actions: [
        { label: "Resend", id: "whatsapp-marios-resend" },
        { label: "Edit message", id: "whatsapp-marios-edit" }
      ]
    },
    {
      key: "client",
      eyebrow: "Client delivery · on Marios's behalf",
      title: cl.name,
      // Client delivery is EMAIL ONLY (Marios's request) — the client is never
      // messaged on WhatsApp; only the accounting group + Marios get WhatsApp.
      channels: [
        {
          ic: <Mail size={12} strokeWidth={1.6} />,
          addr: clientReady ? clientEmail : "—",
          state: clientDelivered ? "ok" : clientReady ? "ready" : "off",
          stateLabel: clientDelivered ? "Delivered" : clientReady ? "Ready" : "Locked"
        }
      ],
      msg: hasNumber
        ? `Hello ${clientHandle}, on behalf of Marios at CSC Zyprus — your ${
            doc.kind === "credit" ? "credit note" : doc.kind === "receipt" ? "receipt" : "invoice"
          } ${doc.officialNo} for ${doc.period} is attached. Total ${fmt(doc.total)}.${
            doc.due && doc.kind === "invoice" ? ` Due ${doc.due}.` : ""
          } — via Sophia`
        : "Disabled until the invoice is numbered.",
      actions: [
        { label: "Send email", id: "client-send-all" },
        { label: "Edit message", id: "client-edit" }
      ],
      disabled: !hasNumber
    },
    {
      key: "accounting",
      eyebrow: "Accounting CC · dual channel",
      title: "Zyprus Accounting",
      channels: [
        {
          ic: <MessageCircle size={12} strokeWidth={1.6} />,
          addr: sharedCc || "+357 99 040 117",
          state: accountingDelivered ? "ok" : "wait",
          stateLabel: accountingDelivered ? "Sent" : "On payment"
        },
        {
          ic: <Mail size={12} strokeWidth={1.6} />,
          addr: accountingEmail || "accounting@zyprus.cy",
          state: accountingDelivered ? "ok" : "wait",
          stateLabel: accountingDelivered ? "Sent" : "On payment"
        }
      ],
      msg: accountingDelivered
        ? `Payment received · ${doc.officialNo} · ${fmt(doc.total)} · receipt ${doc.receiptNo} attached. From Marios C., via Sophia.`
        : "Triggers automatically once the invoice is marked paid. Both WhatsApp and email will be CC'd with the receipt.",
      actions: [
        { label: "Resend both", id: "accounting-resend" },
        { label: "Configure", id: "accounting-configure" }
      ],
      disabled: !accountingDelivered
    }
  ];

  const activeCount = cards.filter((c) => !c.disabled).length;

  return (
    <div className="delivery-control-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sending</p>
          <h3>How this gets delivered</h3>
        </div>
        <strong>
          {activeCount} of {cards.length} channels ready
        </strong>
      </div>
      <div className="delivery-card-grid">
        {cards.map((c) => (
          <div key={c.key} className="delivery-card">
            <div>
              <span>{c.eyebrow}</span>
              <strong>{c.title}</strong>
            </div>
            <div className="channels">
              {c.channels.map((ch, i) => (
                <div key={i} className="channel">
                  <span className="channel-ic">{ch.ic}</span>
                  <span className="channel-addr">{ch.addr}</span>
                  <span className={`channel-state ${ch.state === "ready" ? "ok" : ch.state}`}>{ch.stateLabel}</span>
                </div>
              ))}
            </div>
            <pre className="delivery-message">{c.msg}</pre>
            <div className="delivery-card-actions">
              {c.actions.map((a) => (
                <button key={a.id} type="button" disabled={c.disabled} onClick={() => onAct(a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ events }: { events: Doc["timeline"] }) {
  return (
    <section className="timeline">
      <div className="section-heading">
        <div>
          <p className="eyebrow">History</p>
          <h3>Everything that's happened to this {events.length === 1 ? "document" : "document, newest first"}</h3>
        </div>
        <strong>{events.length} {events.length === 1 ? "event" : "events"}</strong>
      </div>
      {events
        .slice()
        .reverse()
        .map((e, i) => (
          <div key={i} className="timeline-event">
            <span />
            <div>
              <strong>{e.what}</strong>
              <p>{e.body !== "—" ? e.body : ""}</p>
            </div>
            <div className="row-date">
              {e.at} · {e.who}
            </div>
          </div>
        ))}
    </section>
  );
}

export function DetailPane({ doc, allDocs, sharedCc, accountingEmail, operator, onAct, onOpenLightbox, onUpdateDoc, onCorrectResendDoc }: DetailPaneProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  // The Actions menu must auto-close when you switch to another document or click
  // away — don't force the user to click the toggle again (Marios's note). Native
  // <details> doesn't close on outside-click, so we handle both here.
  useEffect(() => {
    setMoreOpen(false);
  }, [doc?.id]);
  useEffect(() => {
    if (!moreOpen) return;
    const onAway = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [moreOpen]);

  if (!doc) {
    const m = metrics(allDocs);
    const opName = operator ? operator.split(" ")[0] : "";
    const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    return (
      <aside className="detail-pane">
        <div className="welcome-state">
          <span className="welcome-mark">Z</span>
          <p className="eyebrow">Today · {today}</p>
          <h2>{opName ? `Good morning, ${opName}.` : "Good morning."}</h2>
          <p className="welcome-lede">
            {m.today === 0
              ? "Nothing's waiting on you right now. Pick an invoice from the list, or start a new one."
              : `${m.today} invoice${m.today === 1 ? "" : "s"} ${m.today === 1 ? "needs" : "need"} your review. Pick one from the list to begin.`}
          </p>
          <div className="welcome-stats">
            <div className={`welcome-stat ${m.today ? "attention" : ""}`}>
              <span>Need your review</span>
              <strong>{m.today}</strong>
            </div>
            <div className={`welcome-stat ${m.awaitingNumber ? "warn" : ""}`}>
              <span>Approved · waiting for number</span>
              <strong>{m.awaitingNumber}</strong>
            </div>
            <div className="welcome-stat">
              <span>Sent · waiting for payment</span>
              <strong>{m.unpaid}</strong>
            </div>
            <div className="welcome-stat success">
              <span>Paid this month</span>
              <strong>{m.paidThisMonth}</strong>
            </div>
          </div>
          <p className="welcome-hint">
            <Command size={13} strokeWidth={1.6} />
            <span>
              Press <kbd>⌘K</kbd> to find anything, <kbd>N</kbd> for new, <kbd>?</kbd> for shortcuts
            </span>
          </p>
        </div>
      </aside>
    );
  }

  const cl = clientById(doc.client);
  const stage = Object.values(STAGES).find((s) => s.id === doc.stage) ?? STAGES.DRAFT;
  const head = stageHeadline(doc.stage);
  const action = primaryAction(doc.stage, doc);

  const linked = doc.creditedBy ? allDocs.find((dd) => dd.id === doc.creditedBy) : null;
  const linkedInvoice = doc.kind === "credit" && doc.appliesToId ? allDocs.find((dd) => dd.id === doc.appliesToId) : null;
  const hasRelated = !!(linked || linkedInvoice || doc.receiptNo);

  const showBanner =
    doc.stage === "correction-needed" || doc.stage === "approved" || doc.stage === "cancelled";
  const kindLabel = doc.kind === "credit" ? "Credit note" : doc.kind === "receipt" ? "Receipt" : "Invoice";
  const numberLabel = doc.officialNo ? `№ ${doc.officialNo}` : doc.draftNo || "Draft";

  return (
    <aside className="detail-pane">
      <header className="detail-header">
        <div className="detail-header-actions">
          <button type="button" className="primary-action stage-cta" onClick={() => onAct(stage.id)} title={action.small}>
            {action.icon}
            <span>{action.label}</span>
          </button>
          <button type="button" className="icon-button" title="Preview PDF" aria-label="Preview PDF" onClick={() => onAct("preview")}>
            <Eye size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-button" title="Download PDF" aria-label="Download PDF" onClick={() => onAct("download")}>
            <Download size={15} strokeWidth={1.6} />
          </button>
          <details
            ref={moreRef}
            className="overflow-menu"
            open={moreOpen}
            onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary aria-label="Actions" title="Actions">
              <MoreHorizontal size={15} strokeWidth={1.6} />
              <span className="overflow-menu-label">Actions</span>
            </summary>
            <div className="overflow-menu-items" role="menu">
              {doc.deletedAt ? (
                <button type="button" role="menuitem" onClick={() => { onAct("restore"); setMoreOpen(false); }}>
                  <RefreshCw size={13} strokeWidth={1.7} /> Restore
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => { onAct("duplicate"); setMoreOpen(false); }}>
                <Copy size={13} strokeWidth={1.7} /> Duplicate as new draft
              </button>
              {doc.kind === "invoice" && doc.stage === "numbered" ? (
                <>
                  <button type="button" role="menuitem" onClick={() => { onAct("receipt"); setMoreOpen(false); }}>
                    <Receipt size={13} strokeWidth={1.7} /> Issue a receipt
                  </button>
                  <button type="button" role="menuitem" onClick={() => { onAct("credit"); setMoreOpen(false); }}>
                    <FileMinus size={13} strokeWidth={1.7} /> Issue a credit note
                  </button>
                </>
              ) : null}
              <button type="button" role="menuitem" onClick={() => { onAct("regenerate"); setMoreOpen(false); }}>
                <RefreshCw size={13} strokeWidth={1.7} /> Regenerate PDF
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => { onAct("cancel"); setMoreOpen(false); }}
              >
                <Trash2 size={13} strokeWidth={1.7} /> Cancel this {kindLabel.toLowerCase()}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => { onAct("delete"); setMoreOpen(false); }}
              >
                <Trash2 size={13} strokeWidth={1.7} /> Delete
              </button>
            </div>
          </details>
        </div>
        <div className="detail-header-main">
          <p className="eyebrow">
            {kindLabel}
            <span className={`stage-chip stage-chip-inline ${stage.chip || ""}`}>{stage.label}</span>
          </p>
          <h2>{cl.name}</h2>
          <p className="detail-header-meta">
            <strong className="detail-number">{numberLabel}</strong>
            <span>·</span>
            <span>{cl.property}</span>
            {doc.period ? (
              <>
                <span>·</span>
                <span>{doc.period}</span>
              </>
            ) : null}
            <span>·</span>
            <span className="detail-amount">{fmt(Math.abs(doc.total))}</span>
          </p>
        </div>
      </header>

      {showBanner ? (
        <div className={`stage-banner stage-banner-${doc.stage === "correction-needed" || doc.stage === "cancelled" ? "warn" : "info"}`}>
          {doc.stage === "correction-needed" ? (
            <AlertTriangle size={16} strokeWidth={1.7} />
          ) : doc.stage === "cancelled" ? (
            <AlertTriangle size={16} strokeWidth={1.7} />
          ) : (
            <Hash size={16} strokeWidth={1.7} />
          )}
          <div>
            <strong>{head.title}</strong>
            <p>{head.body}</p>
          </div>
        </div>
      ) : null}

      <DocumentTab
        doc={doc}
        onAct={onAct}
        onOpenLightbox={onOpenLightbox}
        onUpdate={(form) => onUpdateDoc(doc.id, form)}
        onCorrectResend={(form, reason) => onCorrectResendDoc(doc.id, form, reason)}
      />

      <section className="detail-section" id="sending">
        <DeliveryPlan doc={doc} sharedCc={sharedCc} accountingEmail={accountingEmail} onAct={onAct} />
      </section>

      {hasRelated ? (
        <section className="detail-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Related</p>
              <h3>{linked || linkedInvoice ? "Linked documents" : "Receipt issued"}</h3>
            </div>
          </div>
          <dl className="facts">
            {linked ? (
              <div>
                <dt>Cancelled by</dt>
                <dd>Credit Note {linked.officialNo}</dd>
              </div>
            ) : null}
            {linkedInvoice ? (
              <div>
                <dt>Credits invoice</dt>
                <dd>№ {linkedInvoice.officialNo}</dd>
              </div>
            ) : null}
            {doc.receiptNo ? (
              <div>
                <dt>Receipt issued</dt>
                <dd>№ {doc.receiptNo}</dd>
              </div>
            ) : null}
            {doc.paidOn ? (
              <div>
                <dt>Paid on</dt>
                <dd>{doc.paidOn}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="detail-section" id="history">
        <Timeline events={doc.timeline || []} />
      </section>
    </aside>
  );
}
