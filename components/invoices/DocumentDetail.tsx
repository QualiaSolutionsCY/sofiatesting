"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Download,
  Edit3,
  FileCheck2,
  FilePenLine,
  Mail,
  MessageSquareText,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  UserCheck
} from "lucide-react";
import { downloadDocumentPdf } from "@/lib/invoices/downloads";
import { buildClientEmailMessage } from "@/lib/invoices/email";
import { buildWhatsappMessage } from "@/lib/invoices/whatsapp";
import {
  documentKindLabel,
  formatDate,
  formatMoney,
  getDisplayNumber,
  getUnifiedFilename,
  recurrenceLabel,
  statusLabel
} from "@/lib/invoices/format";
import type {
  InvoiceDocument,
  InvoicePeriod,
  VatMode
} from "@/lib/invoices/types/invoice";
import type { DeliveryRecord } from "@/lib/invoices/types/deliveries";
import { InfoTile } from "./InfoTile";
import { StatusBadge } from "./StatusBadge";
import { TemplatePreview } from "./TemplatePreview";
import type { DocumentActionHandlers } from "./types";

const vatOptions: Array<{ value: VatMode; label: string }> = [
  { value: "plus-vat", label: "Plus VAT" },
  { value: "included-vat", label: "Including VAT" },
  { value: "no-vat", label: "No VAT" }
];

const periodOptions: Array<{ value: InvoicePeriod; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

export function DocumentDetail({
  document,
  onEdit,
  onSendToMarios,
  onApprove,
  onApplyOfficialNumber,
  onStorePdf,
  onRetrievePdf,
  onRegeneratePdf,
  onForwardAccounting,
  onCorrectResend,
  onQueueClientEmail,
  onRetryDelivery,
  onCancelDelivery,
  onMarkPaidAndIssueReceipt,
  onCancelWithCreditNote,
  onDelete,
  onDashboardControlChange,
  sharedCcEmail,
  deliveryRecords
}: {
  document: InvoiceDocument;
  sharedCcEmail: string;
  deliveryRecords: DeliveryRecord[];
  onDashboardControlChange: (
    id: string,
    input: { vatMode?: VatMode; period?: InvoicePeriod }
  ) => void;
} & DocumentActionHandlers) {
  const [officialNumber, setOfficialNumber] = useState(document.officialNumber ?? "");
  const mariosMessage = buildWhatsappMessage(document, "marios");
  const accountingMessage = buildWhatsappMessage(document, "accounting-group");
  const clientEmailMessage = buildClientEmailMessage(document, sharedCcEmail);
  const stage = getWorkflowStage(document);
  const workflowSteps = getWorkflowSteps(document);
  const primaryAction = getPrimaryAction(document, {
    officialNumber,
    onApplyOfficialNumber,
    onApprove,
    onForwardAccounting,
    onQueueClientEmail,
    onSendToMarios,
    onStorePdf
  });

  useEffect(() => {
    setOfficialNumber(document.officialNumber ?? "");
  }, [document.id, document.officialNumber]);

  return (
    <article className={`detail-pane detail-stage-${stage.tone}`}>
      <div className="detail-header">
        <div className="detail-header-meta">
          <p className="eyebrow">Selected {documentKindLabel(document.kind)}</p>
          <StatusBadge status={document.status} large />
        </div>
        <h2 className="detail-client">{document.clientName}</h2>
        <p className="filename">{getUnifiedFilename(document)}</p>
        <div className="detail-hero">
          <div className="detail-hero-value">
            <span className="eyebrow">Total due</span>
            <strong>{formatMoney(document.total)}</strong>
          </div>
          <div className="detail-hero-controls">
            <label className="detail-inline-control">
              <span>VAT mode</span>
              <select
                value={document.vatMode}
                aria-label={`VAT for ${getDisplayNumber(document)}`}
                onChange={(event) =>
                  onDashboardControlChange(document.id, {
                    vatMode: event.target.value as VatMode
                  })
                }
              >
                {vatOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {document.kind === "invoice" ? (
              <label className="detail-inline-control">
                <span>Period</span>
                <select
                  value={document.recurrence === "yearly" ? "yearly" : "monthly"}
                  aria-label={`Period for ${getDisplayNumber(document)}`}
                  onChange={(event) =>
                    onDashboardControlChange(document.id, {
                      period: event.target.value as InvoicePeriod
                    })
                  }
                >
                  {periodOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="detail-inline-control detail-inline-static">
                <span>Period</span>
                <strong>Not applicable</strong>
              </div>
            )}
            <div className="detail-inline-control detail-inline-static">
              <span>Number</span>
              <strong>{getDisplayNumber(document)}</strong>
            </div>
          </div>
        </div>
      </div>

      <section className="command-band" aria-label="Document workflow + primary action">
        <div className="command-band-stage">
          <span className={`stage-rail stage-rail-${stage.tone}`} aria-hidden />
          <div>
            <p className="eyebrow">Current stage</p>
            <h3>{stage.title}</h3>
            <p className="command-band-description">{stage.description}</p>
          </div>
        </div>
        <ol className="workflow-steps" aria-label="Invoice workflow progress">
          {workflowSteps.map((step) => (
            <li className={`workflow-step is-${step.state}`} key={step.label}>
              <span aria-hidden />
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </li>
          ))}
        </ol>
        <button type="button" className="command-primary-action" onClick={primaryAction.onClick}>
          {primaryAction.icon}
          <span className="command-primary-label">
            <strong>{primaryAction.label}</strong>
            <small>{primaryAction.hint}</small>
          </span>
          <ArrowRight size={16} />
        </button>
      </section>

      <section className="action-strip" aria-label="Workflow actions">
        <div className="action-group action-group-primary">
          <button type="button" onClick={onEdit}>
            <Edit3 size={14} />
            Edit
          </button>
          <button type="button" onClick={() => downloadDocumentPdf(document)}>
            <Download size={14} />
            PDF
          </button>
          <details className="action-more">
            <summary>
              <span>More</span>
              <ChevronDown size={14} aria-hidden />
            </summary>
            <div className="action-more-menu" role="menu">
              <button type="button" role="menuitem" onClick={onForwardAccounting}>
                <MessageSquareText size={14} />
                Forward to accounting
              </button>
              <button type="button" role="menuitem" onClick={onQueueClientEmail}>
                <Mail size={14} />
                Email client
              </button>
              {document.kind === "invoice" ? (
                <button type="button" role="menuitem" onClick={onMarkPaidAndIssueReceipt}>
                  <FileCheck2 size={14} />
                  Mark paid · issue receipt
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={onStorePdf}>
                <Database size={14} />
                Store PDF
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onRetrievePdf}
                disabled={!document.storagePath}
              >
                <Archive size={14} />
                Retrieve stored PDF
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={onRegeneratePdf}
                disabled={document.storageStatus !== "needs-regeneration"}
              >
                <RefreshCw size={14} />
                Regenerate PDF
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const reason = window.prompt(
                    "Correction reason",
                    document.correctionReason ?? ""
                  );
                  if (reason !== null) onCorrectResend(reason);
                }}
              >
                <RefreshCw size={14} />
                Correct resend
              </button>
              <button type="button" role="menuitem" onClick={() => window.print()}>
                <Printer size={14} />
                Print
              </button>
              <hr aria-hidden />
              {document.kind === "invoice" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="danger-action"
                  onClick={onCancelWithCreditNote}
                >
                  <FileCheck2 size={14} />
                  Cancel with credit note
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="danger-action"
                onClick={onDelete}
              >
                <Trash2 size={14} />
                Delete document
              </button>
            </div>
          </details>
        </div>
      </section>

      <div className="detail-grid">
        <InfoTile icon={<FilePenLine size={16} />} label="Current number">
          {getDisplayNumber(document)}
        </InfoTile>
        <InfoTile icon={<UserCheck size={16} />} label="Approval">
          {document.officialNumber ? "Official number applied" : "Waiting for Marios approval"}
        </InfoTile>
        <InfoTile icon={<Archive size={16} />} label="Storage">
          {document.storageStatus.replaceAll("-", " ")}
        </InfoTile>
        <InfoTile icon={<CheckCircle2 size={16} />} label="Payment">
          {document.paymentStatus.replaceAll("-", " ")}
        </InfoTile>
        <InfoTile icon={<Clock3 size={16} />} label="Recurrence">
          {recurrenceLabel(document.recurrence)}
          {document.recurrenceDay ? ` · day ${document.recurrenceDay}` : ""}
        </InfoTile>
      </div>

      {document.storageStatus === "needs-regeneration" ? (
        <p className="storage-warning">
          Regenerate PDF before forwarding. The stored copy is behind the latest correction.
        </p>
      ) : null}

      {document.requiresCommissionPerson ? (
        <section className="warning-band">
          <AlertTriangle size={18} />
          <div>
            <strong>Commission trigger</strong>
            <p>
              Commission is mentioned, so Sophia must include the relevant person or agent name in
              the accounting group message.
            </p>
            <span>{document.commissionPersonName ?? "Missing person name"}</span>
          </div>
        </section>
      ) : null}

      <section className="numbering-panel">
        <div>
          <p className="eyebrow">Sequence control</p>
          <h3>Approval numbering</h3>
          <p>
            Drafts use fake numbers. After approval or payment confirmation, Sophia applies the
            official number from the client-provided sequence.
          </p>
          {!document.officialNumber && document.officialNumberPendingReason ? (
            <strong className="pending-number-note">{document.officialNumberPendingReason}</strong>
          ) : null}
        </div>
        <div className="numbering-controls">
          <input
            value={officialNumber}
            onChange={(event) => setOfficialNumber(event.target.value)}
            placeholder={
              document.kind === "invoice"
                ? "11425"
                : document.kind === "credit-note"
                  ? "10097"
                  : "10387"
            }
            aria-label="Official number"
          />
          <button type="button" onClick={() => onApplyOfficialNumber(officialNumber)}>
            Apply number
          </button>
        </div>
      </section>

      <section className="section-band">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Document control</p>
            <h3>Invoice and receipt details</h3>
          </div>
          <strong>{getDisplayNumber(document)}</strong>
        </div>
        <dl className="facts">
          <div>
            <dt>{document.billToLabel}</dt>
            <dd>{document.clientName}</dd>
          </div>
          <div>
            <dt>Issue date</dt>
            <dd>{formatDate(document.issueDate)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{document.dueDate ? formatDate(document.dueDate) : "Not required"}</dd>
          </div>
          <div>
            <dt>Paid today</dt>
            <dd>{document.paidAmount ? formatMoney(document.paidAmount) : "Not paid"}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{formatMoney(document.amount)}</dd>
          </div>
          <div>
            <dt>VAT</dt>
            <dd>
              {document.vatMode.replaceAll("-", " ")} · {formatMoney(document.vatAmount)}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(document.total)}</dd>
          </div>
          <div>
            <dt>Storage path</dt>
            <dd>{document.storagePath ?? "Not stored yet"}</dd>
          </div>
        </dl>
        <p className="description">{document.description}</p>
        {document.label ? <span className="document-label">{document.label}</span> : null}
      </section>

      <section className="preview-command-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Document preview</p>
            <h3>Client-facing PDF</h3>
          </div>
          <strong>{document.storageStatus.replaceAll("-", " ")}</strong>
        </div>
        <div className="draft-preview-panel">
          <TemplatePreview document={document} />
        </div>
      </section>

      {document.sourceInvoiceNumber ? (
        <section className="section-band compact">
          <h3>{document.kind === "receipt" ? "Receipt source" : "Credit note link"}</h3>
          <p>Linked to source invoice {document.sourceInvoiceNumber}.</p>
        </section>
      ) : null}

      {document.correctionReason ? (
        <section className="section-band compact">
          <h3>Correction resend</h3>
          <p>{document.correctionReason}</p>
        </section>
      ) : null}

      <section className="message-preview">
        <div>
          <span>Client email</span>
          <p>
            To: {clientEmailMessage.to || "Missing client email"} · CC:{" "}
            {clientEmailMessage.cc || "No CC set"}
          </p>
          <p>Subject: {clientEmailMessage.subject}</p>
        </div>
        <div>
          <span>To Marios</span>
          <p>{mariosMessage.text}</p>
        </div>
        <div>
          <span>To accounting group</span>
          <p>{accountingMessage.text}</p>
        </div>
      </section>

      <section className="delivery-control-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Delivery controls</p>
            <h3>Queue, copy, retry</h3>
          </div>
          <strong>{deliveryRecords.length}</strong>
        </div>
        {deliveryRecords.length ? (
          <div className="delivery-card-grid">
            {deliveryRecords.map((delivery) => (
              <article className="delivery-card" key={delivery.queueItemId}>
                <div>
                  <span>{delivery.actionType.replaceAll("-", " ")}</span>
                  <strong>{delivery.target.replaceAll("-", " ")}</strong>
                  <p>
                    {delivery.channel} · {delivery.deliveryStatus.replaceAll("-", " ")}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Provider id</dt>
                    <dd>{delivery.providerMessageId ?? "Pending"}</dd>
                  </div>
                  <div>
                    <dt>Retries</dt>
                    <dd>{delivery.attempts}</dd>
                  </div>
                  {delivery.errorMessage ? (
                    <div>
                      <dt>Error</dt>
                      <dd>{delivery.errorMessage}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="delivery-message">{delivery.subject ? `${delivery.subject}\n` : ""}{delivery.messageText}</p>
                <div className="delivery-card-actions">
                  <button type="button" onClick={() => copyDeliveryMessage(delivery)}>
                    Copy
                  </button>
                  <button type="button" onClick={() => onRetryDelivery(delivery.queueItemId)}>
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelDelivery(delivery.queueItemId)}
                    disabled={delivery.queueStatus === "cancelled"}
                  >
                    Cancel
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-delivery-state">
            No queued deliveries yet. Use Send draft, Forward, Email, receipt, or credit-note actions.
          </p>
        )}
      </section>

      <section className="timeline">
        <h3>Timeline</h3>
        {deliveryRecords.map((delivery) => (
          <div key={`delivery-${delivery.queueItemId}`} className="timeline-event">
            <span />
            <div>
              <strong>
                Delivery {delivery.deliveryStatus.replaceAll("-", " ")} ·{" "}
                {delivery.actionType.replaceAll("-", " ")}
              </strong>
              <p>
                {delivery.providerMessageId ?? "No provider id"} · {delivery.attempts} attempt
                {delivery.attempts === 1 ? "" : "s"}
                {delivery.errorMessage ? ` · ${delivery.errorMessage}` : ""}
              </p>
            </div>
          </div>
        ))}
        {document.approvalTimeline.map((event) => (
          <div key={`${event.label}-${event.at}`} className="timeline-event">
            <span />
            <div>
              <strong>{event.label}</strong>
              <p>
                {formatDate(event.at)} · {event.by}
              </p>
            </div>
          </div>
        ))}
      </section>
    </article>
  );
}

function getWorkflowStage(document: InvoiceDocument) {
  if (document.storageStatus === "needs-regeneration") {
    return {
      tone: "warning",
      title: "Regenerate before handoff",
      description: "The stored PDF is behind the latest correction. Regenerate it before sending."
    };
  }

  if (document.status === "draft") {
    return {
      tone: "neutral",
      title: "Draft ready for Marios",
      description: "Sophia has prepared the document. Send the draft for review before numbering."
    };
  }

  if (document.status === "sent-to-marios") {
    return {
      tone: "attention",
      title: "Waiting for Marios approval",
      description: "Keep this document in review until Marios confirms it can receive the official number."
    };
  }

  if (!document.officialNumber) {
    return {
      tone: "attention",
      title: "Approval received, number pending",
      description: "Apply the official sequence number before final delivery or permanent storage."
    };
  }

  if (document.status === "sent-to-accounting") {
    return {
      tone: "success",
      title: "Accounting handoff complete",
      description: "The document is numbered and ready for audit, storage, and follow-up delivery logs."
    };
  }

  if (document.status === "credited" || document.status === "cancelled") {
    return {
      tone: "warning",
      title: statusLabel(document.status),
      description: "This document is no longer in the normal invoice-send path. Keep the linked record visible."
    };
  }

  return {
    tone: "success",
    title: statusLabel(document.status),
    description: "The document has cleared its main review gate. Continue with storage, client email, or handoff."
  };
}

function getWorkflowSteps(document: InvoiceDocument) {
  const hasMariosReview = document.status !== "draft";
  const hasApproval =
    document.status === "approved" ||
    document.status === "numbered" ||
    document.status === "sent-to-accounting" ||
    document.status === "credited" ||
    Boolean(document.officialNumber);
  const hasNumber = Boolean(document.officialNumber);
  const hasHandoff =
    document.status === "sent-to-accounting" ||
    document.storageStatus === "stored" ||
    document.paymentStatus === "paid";

  return [
    {
      label: "Draft",
      detail: getDisplayNumber(document),
      state: "done"
    },
    {
      label: "Review",
      detail: hasMariosReview ? "Marios engaged" : "Not sent",
      state: hasApproval ? "done" : hasMariosReview ? "current" : "waiting"
    },
    {
      label: "Number",
      detail: hasNumber ? document.officialNumber ?? "" : "Official number pending",
      state: hasNumber ? "done" : hasApproval ? "current" : "waiting"
    },
    {
      label: "Deliver",
      detail: hasHandoff ? "Handoff visible" : "Awaiting final send",
      state: hasHandoff ? "done" : hasNumber ? "current" : "waiting"
    }
  ];
}

function getPrimaryAction(
  document: InvoiceDocument,
  handlers: {
    officialNumber: string;
    onApplyOfficialNumber: (number: string) => void;
    onApprove: () => void;
    onForwardAccounting: () => void;
    onQueueClientEmail: () => void;
    onSendToMarios: () => void;
    onStorePdf: () => void;
  }
) {
  if (document.storageStatus === "needs-regeneration") {
    return {
      label: "Store fresh PDF",
      hint: "Refresh the stored file before anyone forwards this version.",
      icon: <Database size={18} />,
      onClick: handlers.onStorePdf
    };
  }

  if (document.status === "draft") {
    return {
      label: "Send draft",
      hint: "Moves the document into Marios review.",
      icon: <Send size={18} />,
      onClick: handlers.onSendToMarios
    };
  }

  if (document.status === "sent-to-marios") {
    return {
      label: "Approve",
      hint: "Confirms the draft can move into official numbering.",
      icon: <CheckCircle2 size={18} />,
      onClick: handlers.onApprove
    };
  }

  if (!document.officialNumber) {
    return {
      label: "Apply number",
      hint: "Uses the sequence value entered below.",
      icon: <FilePenLine size={18} />,
      onClick: () => handlers.onApplyOfficialNumber(handlers.officialNumber)
    };
  }

  if (document.status !== "sent-to-accounting") {
    return {
      label: "Forward",
      hint: "Queues the accounting handoff copy.",
      icon: <MessageSquareText size={18} />,
      onClick: handlers.onForwardAccounting
    };
  }

  return {
    label: "Email client",
    hint: "Queues the client email with the shared CC.",
    icon: <Mail size={18} />,
    onClick: handlers.onQueueClientEmail
  };
}

function copyDeliveryMessage(delivery: DeliveryRecord) {
  const content = [delivery.subject, delivery.messageText, delivery.attachmentFilename]
    .filter(Boolean)
    .join("\n\n");
  void navigator.clipboard?.writeText(content);
}
