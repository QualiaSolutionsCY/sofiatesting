"use client";

import { amount, clientById } from "@/lib/invoices/redesign/data";
import { creditNoteLineDescription, formatDate } from "@/lib/invoices/format";
import { useTemplateText } from "@/lib/invoices/redesign/template-context";
import type { Client, Doc } from "@/lib/invoices/redesign/types";

interface TemplatePreviewProps {
  doc: Doc;
  clientOverride?: Client;
}

export function TemplatePreview({ doc, clientOverride }: TemplatePreviewProps) {
  const { text: tpl } = useTemplateText();
  const cl = clientOverride ?? clientById(doc.client);
  const isCredit = doc.kind === "credit";
  const isReceipt = doc.kind === "receipt";

  const title = isCredit ? "Credit Note" : isReceipt ? "Receipt" : "Invoice";
  const number = doc.officialNo || doc.draftNo || "—";
  const pdfName =
    doc.pdf ||
    (doc.officialNo
      ? `${tpl.name} ${title} ${doc.officialNo}.pdf`
      : `Sophia draft — ${title.toLowerCase()} ${doc.draftNo || ""}.pdf`);

  const lines = doc.lines || [];
  const lineSum = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  // Respect the document's VAT treatment so the invoice numbers match the composer.
  const rate = doc.vatMode === "no-vat" ? 0 : doc.vatRate || 0;
  const includesVat = doc.vatMode === "included-vat";
  const vat = includesVat ? lineSum - lineSum / (1 + rate / 100) : (lineSum * rate) / 100;
  const sub = includesVat ? lineSum - vat : lineSum;
  const total = includesVat ? lineSum : lineSum + vat;

  return (
    <article className="template-preview" aria-label={`${title} preview`}>
      <div className="template-preview-bar">
        <span>Print-ready preview · A4</span>
        <strong>{pdfName}</strong>
      </div>

      <div className="template-header">
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 6 }}>{tpl.name}</div>
          <div style={{ fontSize: ".85rem", lineHeight: 1.6, color: "var(--ink-soft)" }}>
            {tpl.regNo}
            <br />
            {tpl.address}
            <br />
            {tpl.contactLine}
            <br />
            V.A.T Reg. No. : {tpl.vatNo}
            <br />
            CREA License No. {tpl.creaLicense}
            <br />
            CREA Reg No. {tpl.creaReg}
          </div>
        </div>
        <div>
          {/* Title centred OVER the meta column (right), matching Invoice 11491. */}
          <h3 className="template-title">{title}</h3>
          <dl className="template-meta">
            <div>
              <dt>No.</dt>
              <dd>{number}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{formatDate(doc.issued)}</dd>
            </div>
            {doc.due && !isCredit && !isReceipt ? (
              <div>
                <dt>Due</dt>
                <dd>{formatDate(doc.due)}</dd>
              </div>
            ) : null}
            {/* No "Applies to: Invoice N" on credit notes — the number is already in
                the line-item description, so it would just duplicate it. */}
          </dl>
        </div>
      </div>

      <div className="template-bill-to">
        <div style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 2 }}>Bill To</div>
        <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{cl.name}</div>
        {cl.vat && cl.vat !== "—" ? <div style={{ color: "var(--ink-soft)" }}>VAT&nbsp;{cl.vat}</div> : null}
      </div>

      <table className="template-table template-table-ruled">
        <thead>
          <tr>
            <th>Item</th>
            <th>Description</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="template-desc-cell" style={{ whiteSpace: "pre-line" }}>
                {isCredit ? creditNoteLineDescription(doc.appliesTo ?? doc.officialNo ?? undefined, l.desc) : l.desc}
              </td>
              <td>€{amount(l.unitPrice)}</td>
              <td>€{amount(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
          {false && isCredit && doc.appliesTo ? (
            <tr className="template-source-row">
              <td colSpan={4} style={{ textAlign: "left" }}>
                Reference — original Invoice {doc.appliesTo}, issued {formatDate(doc.issued)}, fully credited.
              </td>
            </tr>
          ) : null}
          {/* Filler row stretches the ruled table to fill the page like a printed invoice. */}
          <tr className="template-filler-row" aria-hidden>
            <td />
            <td />
            <td />
            <td />
          </tr>
        </tbody>
      </table>

      <div className="template-totals">
        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 24px" }}>
          <span style={{ color: "var(--ink-soft)" }}>Subtotal</span>
          <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>€{amount(sub)}</span>
          <span style={{ color: "var(--ink-soft)" }}>V.A.T</span>
          <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>€{amount(vat)}</span>
          <span style={{ fontWeight: 700, paddingTop: 6, borderTop: "1px solid oklch(0.78 0.004 95)" }}>
            Total
          </span>
          <span
            style={{
              fontWeight: 700,
              paddingTop: 6,
              borderTop: "1px solid oklch(0.78 0.004 95)",
              textAlign: "right",
              whiteSpace: "nowrap"
            }}
          >
            €{amount(total)}
          </span>
          <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>
            {isCredit ? "Balance credited" : "Balance Due"}
          </span>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", textAlign: "right", whiteSpace: "nowrap" }}>
            €{amount(total)}
          </span>
        </div>
      </div>

      {isCredit ? null : (
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
            {isReceipt ? "Acknowledgement" : "Banking Details"}
          </div>
          <div style={{ color: "var(--ink-soft)", lineHeight: 1.55 }}>
            {isReceipt ? (
              <>{tpl.receiptNote}</>
            ) : (
              // Matches pdf.ts "Banking Details" block — no settlement note, just the
              // bank lines, so the on-screen preview and the downloaded PDF agree.
              <>
                {tpl.bankName}
                <br />
                Account Name: {tpl.accountName}
                <br />
                Account Number: <span style={{ fontFamily: "var(--font-mono)" }}>{tpl.accountNumber}</span>
                <br />
                IBAN: <span style={{ fontFamily: "var(--font-mono)" }}>{tpl.iban}</span>
                <br />
                BIC: <span style={{ fontFamily: "var(--font-mono)" }}>{tpl.bic}</span>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
