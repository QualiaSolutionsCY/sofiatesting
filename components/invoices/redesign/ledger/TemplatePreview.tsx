"use client";

import { ENTITY, clientById } from "@/lib/invoices/redesign/data";
import type { Client, Doc } from "@/lib/invoices/redesign/types";

interface TemplatePreviewProps {
  doc: Doc;
  clientOverride?: Client;
}

export function TemplatePreview({ doc, clientOverride }: TemplatePreviewProps) {
  const cl = clientOverride ?? clientById(doc.client);
  const isCredit = doc.kind === "credit";
  const isReceipt = doc.kind === "receipt";

  const title = isCredit ? "Credit Note" : isReceipt ? "Receipt" : "Invoice";
  const number = doc.officialNo || doc.draftNo || "—";
  const pdfName =
    doc.pdf ||
    (doc.officialNo
      ? `${ENTITY.name} ${title} ${doc.officialNo}.pdf`
      : `Sophia draft — ${title.toLowerCase()} ${doc.draftNo || ""}.pdf`);

  const lines = doc.lines || [];
  const sub = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const vat = (sub * (doc.vatRate || 0)) / 100;
  const total = sub + vat;

  return (
    <article className="template-preview" aria-label={`${title} preview`}>
      <div className="template-preview-bar">
        <span>Print-ready preview · A4</span>
        <strong>{pdfName}</strong>
      </div>

      <div className="template-header">
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 6 }}>{ENTITY.name}</div>
          <div style={{ fontSize: ".9rem", lineHeight: 1.55, color: "var(--ink-soft)" }}>
            {ENTITY.address}
            <br />
            Reg. No.&nbsp;{ENTITY.regNo}
            <br />
            VAT No.&nbsp;{ENTITY.vatNo}
          </div>
        </div>
        <div>
          <h3>{title}</h3>
          <dl className="template-meta">
            <div>
              <dt>Number</dt>
              <dd>{number}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{doc.issued}</dd>
            </div>
            {doc.due && !isCredit && !isReceipt ? (
              <div>
                <dt>Due</dt>
                <dd>{doc.due}</dd>
              </div>
            ) : null}
            {doc.period ? (
              <div>
                <dt>Period</dt>
                <dd>{doc.period}</dd>
              </div>
            ) : null}
            {isCredit && doc.appliesTo ? (
              <div>
                <dt>Applies to</dt>
                <dd>Invoice {doc.appliesTo}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="template-bill-to">
        <div
          style={{
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6
          }}
        >
          {isReceipt ? "Received from" : "Bill to"}
        </div>
        <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{cl.name}</div>
        <div style={{ color: "var(--ink-soft)" }}>{cl.address}</div>
        {cl.vat && cl.vat !== "—" ? <div style={{ color: "var(--ink-soft)" }}>VAT&nbsp;{cl.vat}</div> : null}
        <div style={{ color: "var(--ink-soft)", marginTop: 4 }}>Property: {cl.property}</div>
      </div>

      <table className="template-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit · €</th>
            <th>Total · €</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{l.desc}</td>
              <td>{l.qty}</td>
              <td>{l.unitPrice.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
              <td>{(l.qty * l.unitPrice).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          {isCredit && doc.appliesTo ? (
            <tr className="template-source-row">
              <td colSpan={5} style={{ textAlign: "left" }}>
                Reference — original Invoice {doc.appliesTo}, issued {doc.issued}, fully credited.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="template-totals">
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 24px" }}>
          <span style={{ color: "var(--ink-soft)" }}>Subtotal</span>
          <span style={{ textAlign: "right" }}>{sub.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
          <span style={{ color: "var(--ink-soft)" }}>VAT {doc.vatRate || 0}%</span>
          <span style={{ textAlign: "right" }}>{vat.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", paddingTop: 6, borderTop: "1px solid var(--ink-soft)" }}>
            Total {isCredit ? "credited" : "due"}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontSize: "1.1rem",
              paddingTop: 6,
              borderTop: "1px solid var(--ink-soft)",
              textAlign: "right"
            }}
          >
            {total.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="template-bank">
        <div
          style={{
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 4
          }}
        >
          {isReceipt ? "Acknowledgement" : "Settlement"}
        </div>
        <div style={{ color: "var(--ink-soft)", lineHeight: 1.55 }}>
          {isReceipt ? (
            <>This receipt confirms payment of Invoice {doc.appliesTo || doc.officialNo} in full. Issued by {ENTITY.name}.</>
          ) : isCredit ? (
            <>Credit balance applied against tenant account. No payment required.</>
          ) : (
            <>
              Beneficiary: {ENTITY.name}
              <br />
              IBAN: <span style={{ fontFamily: "var(--font-mono)" }}>{ENTITY.iban}</span>
              <br />
              Bank: {ENTITY.bank}
            </>
          )}
        </div>
      </div>

      <div className="template-note">
        <div
          style={{
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 4
          }}
        >
          Note
        </div>
        <div style={{ color: "var(--ink-soft)", lineHeight: 1.55 }}>{doc.description || "—"}</div>
      </div>
    </article>
  );
}
