import {
  createCreditNoteFromInvoice,
  createReceiptFromInvoice,
} from "@/lib/invoices/document-actions";
import {
  documentKindLabel,
  getUnifiedFilename,
  statusLabel,
} from "@/lib/invoices/format";
import type {
  ApprovalStatus,
  InvoiceDocument,
} from "@/lib/invoices/types/invoice";

type Actor = "Sophia" | "Marios";

function appendTimeline(
  document: InvoiceDocument,
  label: string,
  actor: Actor,
  at = new Date().toISOString()
): InvoiceDocument {
  return {
    ...document,
    approvalTimeline: [...document.approvalTimeline, { label, at, by: actor }],
  };
}

export function transitionDocumentStatus(
  document: InvoiceDocument,
  status: ApprovalStatus,
  at = new Date().toISOString()
): InvoiceDocument {
  return appendTimeline(
    {
      ...document,
      status,
      whatsappStatus:
        status === "sent-to-marios" || status === "sent-to-accounting"
          ? "queued"
          : document.whatsappStatus,
    },
    statusLabel(status),
    status === "approved" ? "Marios" : "Sophia",
    at
  );
}

export function sendDraftToMarios(document: InvoiceDocument): InvoiceDocument {
  return transitionDocumentStatus(document, "sent-to-marios");
}

export function markApproved(document: InvoiceDocument): InvoiceDocument {
  return transitionDocumentStatus(document, "approved");
}

export function forwardToAccounting(
  document: InvoiceDocument
): InvoiceDocument {
  return transitionDocumentStatus(document, "sent-to-accounting");
}

export function markCorrectedForResend(
  document: InvoiceDocument,
  reason = "Corrected document ready. Accounting must ignore the previous version."
): InvoiceDocument {
  return {
    ...transitionDocumentStatus(document, "corrected-resend"),
    correctionReason: document.correctionReason ?? reason,
    storageStatus: "needs-regeneration",
    whatsappStatus: "queued",
    notes: [...document.notes, reason],
  };
}

export function applyOfficialNumberToDocument(
  document: InvoiceDocument,
  officialNumber: string
): InvoiceDocument {
  const trimmed = officialNumber.trim();
  if (!trimmed) return document;

  return appendTimeline(
    {
      ...document,
      officialNumber: trimmed,
      officialNumberPendingReason: undefined,
      status: "numbered",
      receiptNumber:
        document.kind === "receipt" ? trimmed : document.receiptNumber,
      storageStatus: "needs-regeneration",
    },
    `${documentKindLabel(document.kind)} number ${trimmed} applied`,
    "Sophia"
  );
}

export function markStorageReady(document: InvoiceDocument): InvoiceDocument {
  return {
    ...document,
    storageStatus: "stored",
    storagePath: `generated/${getUnifiedFilename(document)}`,
    notes: [...document.notes, "Marked ready for Supabase Storage upload."],
  };
}

export function markRegeneratedStoredDocument(
  document: InvoiceDocument
): InvoiceDocument {
  return appendTimeline(
    {
      ...markStorageReady(document),
      notes: [
        ...document.notes,
        "Regenerated PDF stored after correction. Use this file and ignore previous versions.",
      ],
    },
    "Regenerated PDF stored",
    "Sophia"
  );
}

export function markPaidWithReceipt(
  invoice: InvoiceDocument,
  index: number,
  at = new Date().toISOString()
): { invoice: InvoiceDocument; receipt: InvoiceDocument } {
  const receipt = createReceiptFromInvoice(invoice, index);

  return {
    invoice: {
      ...invoice,
      // Once paid + receipted the invoice leaves the Approved/Numbered bucket and
      // moves to the terminal "Paid · receipt sent to accounting" state, so it no
      // longer lingers under "Approved".
      status: "sent-to-accounting",
      paymentStatus: "paid",
      paidAt: at,
      paidAmount: invoice.total,
      receiptNumber: receipt.draftNumber,
      approvalTimeline: [
        ...invoice.approvalTimeline,
        {
          label: "Marked paid and receipt draft issued",
          at,
          by: "Sophia",
        },
      ],
      notes: [
        ...invoice.notes,
        `Receipt draft ${receipt.draftNumber} created.`,
      ],
    },
    receipt,
  };
}

export function cancelInvoiceWithCreditNote(
  invoice: InvoiceDocument,
  index: number,
  reason = "Invoice cancelled and linked credit-note draft created."
): { invoice: InvoiceDocument; creditNote: InvoiceDocument } {
  const creditNote = createCreditNoteFromInvoice(invoice, index);
  const at = new Date().toISOString();

  return {
    invoice: {
      ...invoice,
      // Credited (not "cancelled"): the invoice leaves the Approved/Numbered bucket
      // and shows as "Credited", linked to the credit note that replaces it.
      status: "credited",
      linkedCreditNoteNumber: creditNote.draftNumber,
      storageStatus: "needs-regeneration",
      approvalTimeline: [
        ...invoice.approvalTimeline,
        {
          label: "Cancelled with linked credit note",
          at,
          by: "Sophia",
        },
      ],
      notes: [...invoice.notes, reason],
    },
    creditNote,
  };
}
