import {
  documentKindLabel,
  formatDate,
  formatMoney,
  getDisplayNumber
} from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export function TemplatePreview({ document }: { document: InvoiceDocument }) {
  const displayNumber = getDisplayNumber(document);
  const sourceLabel = document.kind === "credit-note" ? "Source Invoice" : "Invoice Number";

  return (
    <section className="template-preview" aria-label="Print-ready document preview">
      <div className="template-preview-bar">
        <span>Print preview</span>
        <strong>{displayNumber}</strong>
      </div>
      <div className="template-header">
        <div>
          <strong>CSC ZYPRUS PROPERTY GROUP LTD</strong>
          <span>HE344546</span>
          <span>Tombs of the Kings Avenue 96, 8046 Paphos, Cyprus</span>
          <span>T: 77776477 E: info@zyprus.com</span>
          <span>V.A.T Reg. No. : 10344546O</span>
          <span>CREA License No. 378/E · CREA Reg No. 742</span>
        </div>
        <div>
          <h3>{documentKindLabel(document.kind)}</h3>
          <dl className="template-meta">
            <div>
              <dt>Date:</dt>
              <dd>{formatDate(document.issueDate)}</dd>
            </div>
            <div>
              <dt>{documentKindLabel(document.kind)} No.:</dt>
              <dd>{displayNumber}</dd>
            </div>
          </dl>
          {document.kind === "receipt" ? (
            <span>Payment Amount: {formatMoney(document.paidAmount ?? document.total)}</span>
          ) : null}
          {document.dueDate ? <span>Due Date: {formatDate(document.dueDate)}</span> : null}
        </div>
      </div>

      <div className="template-bill-to">
        <strong>{document.billToLabel}:</strong>
        <span>{document.clientName}</span>
      </div>
      {document.label ? <p className="template-note">{document.label.toUpperCase()}</p> : null}

      <table className="template-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Description</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {document.sourceInvoiceNumber ? (
            <tr className="template-source-row">
              <td />
              <td>
                {sourceLabel}: {document.sourceInvoiceNumber}
              </td>
              <td />
              <td />
            </tr>
          ) : null}
          <tr>
            <td>1</td>
            <td>{document.description}</td>
            <td>{formatMoney(document.amount)}</td>
            <td>{formatMoney(document.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="template-totals">
        <span>Subtotal {formatMoney(document.amount)}</span>
        <span>V.A.T {formatMoney(document.vatAmount)}</span>
        <strong>Total {formatMoney(document.total)}</strong>
        {document.kind === "invoice" ? <strong>Balance Due {formatMoney(document.total)}</strong> : null}
        {document.kind === "receipt" ? (
          <strong>Paid Today {formatMoney(document.paidAmount ?? document.total)}</strong>
        ) : null}
      </div>

      {document.kind === "invoice" ? (
        <div className="template-bank">
          <strong>Banking Details</strong>
          <span>Hellenic Bank</span>
          <span>Account Name: CSC ZYPRUS PROPERTY GROUP LTD</span>
          <span>Account Number: 502-01-734364-01</span>
          <span>IBAN: CY97 0050 0502 0005 0201 7343 6401</span>
          <span>BIC: HEBACY2N</span>
        </div>
      ) : document.kind === "credit-note" ? (
        <p className="template-note">Please contact us for more information about this credit note.</p>
      ) : (
        <p className="template-note">Thank you.</p>
      )}
    </section>
  );
}
