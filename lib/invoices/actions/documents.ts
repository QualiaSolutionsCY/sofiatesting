"use server";

import {
  createDocument,
  type DashboardDocumentControls,
  type DocumentInput,
  updateDocumentDashboardControls,
  updateDocumentFromInput
} from "@/lib/invoices/document-actions";
import { getNextDraftSequence, getNextOfficialNumber } from "@/lib/invoices/numbering";
import {
  deleteInvoiceDocument,
  listInvoiceDocuments,
  retrieveStoredDocument,
  saveInvoiceDocument,
  saveInvoiceDocuments,
  type StoredDocumentMetadata
} from "@/lib/invoices/supabase/document-repository";
import {
  cancelManualDelivery,
  listDeliveryRecordsForDocument,
  queueAccountingHandoff,
  queueClientEmail,
  queueCorrectedResend,
  queueCreditNoteDelivery,
  queueDraftToMarios,
  retryManualDelivery
} from "@/lib/invoices/supabase/integration-repository";
import { storeDocumentPdfInSupabase } from "@/lib/invoices/storage";
import { INVOICE_AUTHORIZED_AGENTS } from "@/lib/invoices/constants";
import { getDisplayNumber, getUnifiedFilename, isCommissionDescription } from "@/lib/invoices/format";
import { buildDocumentPdfBytes } from "@/lib/invoices/pdf";
import { createLogger } from "@/lib/logger";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import type { DeliveryRecord } from "@/lib/invoices/types/deliveries";
import {
  applyOfficialNumberToDocument,
  cancelInvoiceWithCreditNote,
  forwardToAccounting,
  markApproved,
  markCorrectedForResend,
  markRegeneratedStoredDocument,
  markPaidWithReceipt,
  markStorageReady,
  sendDraftToMarios
} from "@/lib/invoices/workflow-actions";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export type DocumentsActionResult = {
  documents: InvoiceDocument[];
  selectedId?: string;
  persistenceMode: "supabase" | "fallback";
  storageFile?: StoredDocumentMetadata;
  deliveries?: DeliveryRecord[];
};

export async function loadDocumentsAction(): Promise<DocumentsActionResult> {
  const result = await listInvoiceDocuments();
  const selectedId = result.documents[0]?.id;
  return {
    ...result,
    selectedId,
    deliveries: selectedId ? await listDeliveryRecordsForDocument(selectedId) : []
  };
}

export async function createDocumentAction(input: DocumentInput): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const sequence = getNextDraftSequence(current.documents, input.kind);
  const created = createDocument(input, sequence);
  const result = await saveInvoiceDocument(created, "Draft created");
  return { ...result, selectedId: created.id };
}

export async function updateDocumentAction(
  id: string,
  input: DocumentInput
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = updateDocumentFromInput(document, input);
  const result = await saveInvoiceDocument(updated, "Document edited");
  return { ...result, selectedId: id };
}

export async function updateDashboardControlsAction(
  id: string,
  input: DashboardDocumentControls
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = updateDocumentDashboardControls(document, input);
  const result = await saveInvoiceDocument(updated, "Dashboard controls updated");
  return { ...result, selectedId: id };
}

export async function sendToMariosAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = sendDraftToMarios(document);
  const result = await saveInvoiceDocument(updated, "Draft sent to Marios");
  await queueDraftToMarios(updated);
  await notifyMariosOverWhatsApp(updated);
  return { ...result, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

/**
 * Admin-panel auto-approval: notify Marios that the invoice is already approved and
 * issued (FYI message + PDF), without sending a review/approval request.
 */
export async function notifyMariosApprovedAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  await notifyMariosOverWhatsApp(document, { approved: true });
  return { ...current, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

const sendLogger = createLogger("invoices:send-to-marios");

/**
 * Actually deliver the review request to Marios over WhatsApp (PDF + caption),
 * using the same WaSenderAPI client the rest of the app sends with. Best-effort:
 * a send failure is logged but never breaks the status transition above.
 */
async function notifyMariosOverWhatsApp(
  document: InvoiceDocument,
  opts: { approved?: boolean } = {}
): Promise<void> {
  const marios = INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === "Marios Polyviou");
  if (!marios) {
    sendLogger.warn("Marios is not in INVOICE_AUTHORIZED_AGENTS; skipping WhatsApp send");
    return;
  }

  const displayNumber = getDisplayNumber(document);
  const correctionLine = document.correctionReason
    ? `\nCorrection: ${document.correctionReason}. Please ignore the previous version.`
    : "";
  // Admin-panel invoices are already approved, so Marios gets a notification, not a
  // review request. He only approves via the Sophia chat flow.
  const caption = document.kind === "receipt"
    ? `Receipt ${displayNumber} — ${document.description}\n` +
      `Client: ${document.clientName}\n\n` +
      `Your copy — PDF attached. (Receipts are not posted to the accounting group.)`
    : document.kind === "credit-note"
    ? `Credit note ${displayNumber}\n` +
      `Client: ${document.clientName}${correctionLine}\n\n` +
      `Your copy — invoice ${document.sourceInvoiceNumber || "—"} was cancelled. PDF attached.`
    : opts.approved
    ? `Invoice issued: ${displayNumber}\n` +
      `Client: ${document.clientName}${correctionLine}\n\n` +
      `Approved automatically via the admin panel — no action needed. PDF attached for your records.`
    : `Invoice for review: ${displayNumber}\n` +
      `Client: ${document.clientName}${correctionLine}\n\n` +
      `Reply ✓ to approve, or reply with the correction needed.`;

  try {
    const client = getWhatsAppClient();
    if (!client.isConfigured()) {
      sendLogger.warn("WhatsApp client not configured; review request not sent to Marios");
      return;
    }

    const pdf = Buffer.from(buildDocumentPdfBytes(document));
    const sent = await client.sendDocument({
      to: marios.msisdn,
      document: pdf,
      filename: getUnifiedFilename(document),
      caption,
    });

    if (!sent.success) {
      sendLogger.error("WhatsApp document send to Marios failed; falling back to text", undefined, {
        documentId: document.id,
        error: sent.error,
      });
      await client.sendMessage({ to: marios.msisdn, text: caption });
    }
  } catch (error) {
    sendLogger.error("Unexpected error sending review request to Marios", error, {
      documentId: document.id,
    });
  }
}

export async function approveDocumentAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const approved = markApproved(document);
  const numbered = applyOfficialNumberToDocument(
    approved,
    document.officialNumber ?? getNextOfficialNumber(current.documents, document.kind)
  );
  const result = await saveInvoiceDocument(numbered, "Approved and official number applied");
  return { ...result, selectedId: id };
}

/**
 * Approve WITHOUT assigning an official number. Used by the admin-panel
 * auto-create flow so a freshly created invoice lands in the "approved" status
 * (not "numbered"/unpaid) — the official number is applied later when it's
 * issued. Keeps auto-approved invoices in the Approved bucket for Marios.
 */
export async function markApprovedOnlyAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const result = await saveInvoiceDocument(markApproved(document), "Auto-approved (admin panel)");
  return { ...result, selectedId: id };
}

export async function applyOfficialNumberAction(
  id: string,
  number: string
): Promise<DocumentsActionResult> {
  return mutateOne(
    id,
    (document) => applyOfficialNumberToDocument(document, number),
    "Official number applied"
  );
}

export async function markStoredAction(id: string): Promise<DocumentsActionResult> {
  return storeDocumentPdfAction(id);
}

export async function storeDocumentPdfAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const storage = await storeDocumentPdfInSupabase(document);
  if (!storage.ok && current.persistenceMode === "supabase") {
    throw new Error(storage.reason);
  }

  const stored = markStorageReady(document);
  const result = await saveInvoiceDocument(
    {
      ...stored,
      storagePath: storage.ok ? storage.file.path : stored.storagePath,
      notes: storage.ok
        ? stored.notes
        : [...stored.notes, "Local fallback metadata saved because Supabase Storage is not configured."]
    },
    "PDF stored"
  );
  return {
    ...result,
    selectedId: id,
    storageFile: storage.ok
      ? { filename: storage.file.path.split("/").at(-1) ?? storage.file.path, path: storage.file.path, contentType: "application/pdf", publicUrl: storage.file.publicUrl }
      : undefined
  };
}

export async function retrieveStoredDocumentAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const retrieved = await retrieveStoredDocument(id);
  return { ...current, selectedId: id, storageFile: retrieved.metadata };
}

export async function regenerateStoredDocumentAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const storage = await storeDocumentPdfInSupabase(document);
  if (!storage.ok && current.persistenceMode === "supabase") {
    throw new Error(storage.reason);
  }

  const regenerated = markRegeneratedStoredDocument(document);
  const result = await saveInvoiceDocument(
    {
      ...regenerated,
      storagePath: storage.ok ? storage.file.path : regenerated.storagePath,
      notes: storage.ok
        ? regenerated.notes
        : [...regenerated.notes, "Local fallback regeneration metadata saved because Supabase Storage is not configured."]
    },
    "PDF regenerated"
  );
  return {
    ...result,
    selectedId: id,
    storageFile: storage.ok
      ? { filename: storage.file.path.split("/").at(-1) ?? storage.file.path, path: storage.file.path, contentType: "application/pdf", publicUrl: storage.file.publicUrl }
      : undefined
  };
}

export async function forwardAccountingAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = forwardToAccounting(document);
  const result = await saveInvoiceDocument(updated, "Forwarded to accounting");
  await queueAccountingHandoff(updated);
  return { ...result, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

export async function correctResendAction(
  id: string,
  reason: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = markCorrectedForResend(document, reason || undefined);
  const result = await saveInvoiceDocument(updated, "Corrected resend queued");
  await queueCorrectedResend(updated, reason || undefined);
  return { ...result, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

export async function queueClientEmailAction(
  id: string,
  sharedCcEmail: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  await queueClientEmail(document, sharedCcEmail);
  return { ...current, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

export async function markPaidAndIssueReceiptAction(
  id: string,
  opts: { notifyMarios?: boolean } = {}
): Promise<DocumentsActionResult> {
  // notifyMarios defaults true (admin panel relies on it). The Sophia/WhatsApp
  // path passes false: there the bot delivers the receipt PDF to the requester
  // itself, so an extra in-action send would double the PDF generation AND make
  // Marios receive the receipt twice — slowing the reply for no benefit.
  const { notifyMarios = true } = opts;
  const current = await listInvoiceDocuments();
  const invoice = findDocument(current.documents, id);
  if (invoice.kind !== "invoice") return { ...current, selectedId: id };

  const { invoice: paidInvoice, receipt } = markPaidWithReceipt(invoice, current.documents.length + 1);
  // Receipts issued from the admin panel are auto-approved + numbered immediately
  // (no pending-approval step) so they land straight in the receipts list as issued.
  const issuedReceipt = applyOfficialNumberToDocument(
    markApproved(receipt),
    getNextOfficialNumber(current.documents, "receipt")
  );
  const result = await saveInvoiceDocuments(
    [paidInvoice, issuedReceipt],
    "Invoice paid and receipt issued"
  );
  // Receipts go to MARIOS ONLY — never posted to the accounting group.
  if (notifyMarios) await notifyMariosOverWhatsApp(issuedReceipt);
  return {
    ...result,
    selectedId: issuedReceipt.id,
    deliveries: await listDeliveryRecordsForDocument(issuedReceipt.id)
  };
}

export async function cancelWithCreditNoteAction(id: string, reason?: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const invoice = findDocument(current.documents, id);
  if (invoice.kind !== "invoice") return { ...current, selectedId: id };

  const trimmedReason = (reason ?? "").trim();
  const { invoice: cancelledInvoice, creditNote } = cancelInvoiceWithCreditNote(
    invoice,
    current.documents.length + 1,
    trimmedReason ? `Invoice cancelled. Reason: ${trimmedReason}` : undefined
  );
  // Carry the operator's reason onto the credit note so the group message + audit trail show it.
  const creditNoteWithReason = trimmedReason ? { ...creditNote, correctionReason: trimmedReason } : creditNote;
  // Credit notes are auto-approved on creation (never left as drafts): apply the
  // official number immediately and file the note under "Credited".
  const numberedCreditNote = applyOfficialNumberToDocument(
    markApproved(creditNoteWithReason),
    getNextOfficialNumber(current.documents, "credit-note")
  );
  const approvedCreditNote: InvoiceDocument = { ...numberedCreditNote, status: "credited" };
  const result = await saveInvoiceDocuments(
    [cancelledInvoice, approvedCreditNote],
    "Invoice cancelled with auto-approved credit note"
  );
  await queueCreditNoteDelivery(approvedCreditNote);
  await notifyGroupOfCreditNote(cancelledInvoice, approvedCreditNote, trimmedReason);
  // Marios ALWAYS gets his own copy of the credit note, not only the group.
  await notifyMariosOverWhatsApp(approvedCreditNote);
  return {
    ...result,
    selectedId: approvedCreditNote.id,
    deliveries: await listDeliveryRecordsForDocument(approvedCreditNote.id)
  };
}

/**
 * Send the linked credit note to the accounting/CSC group with the operator's reason,
 * so the group reads the cancellation context alongside the credit note PDF. Best-effort.
 */
async function notifyGroupOfCreditNote(
  invoice: InvoiceDocument,
  creditNote: InvoiceDocument,
  reason: string
): Promise<void> {
  const invoiceNumber = getDisplayNumber(invoice);
  const creditNumber = getDisplayNumber(creditNote);
  const reasonLine = reason ? ` The reason is: ${reason}.` : "";
  const caption =
    `Credit note ${creditNumber} regarding the cancellation of invoice ${invoiceNumber}.${reasonLine}\n\n` +
    `Please read it alongside the attached credit note.`;

  // Group number from env only — never fall back to anyone's personal number.
  const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;
  if (!groupMsisdn) {
    sendLogger.warn("No accounting group number configured; credit-note message not sent");
    return;
  }

  try {
    const client = getWhatsAppClient();
    if (!client.isConfigured()) {
      sendLogger.warn("WhatsApp client not configured; credit-note group message not sent");
      return;
    }
    const pdf = Buffer.from(buildDocumentPdfBytes(creditNote));
    const sent = await client.sendDocument({
      to: groupMsisdn,
      document: pdf,
      filename: getUnifiedFilename(creditNote),
      caption
    });
    if (!sent.success) {
      await client.sendMessage({ to: groupMsisdn, text: caption });
    }
  } catch (error) {
    sendLogger.error("Failed to send credit-note group message", error, { documentId: creditNote.id });
  }
}

/**
 * Post a document (with its PDF) to the accounting/CSC WhatsApp group with a caption.
 * Reusable for any flow that must notify the group — e.g. an edited invoice. Returns
 * true if a message went out. Best-effort: never throws.
 */
export async function sendDocumentToAccountingGroup(
  document: InvoiceDocument,
  caption: string
): Promise<boolean> {
  const groupMsisdn = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN?.trim() || undefined;
  if (!groupMsisdn) {
    sendLogger.warn("No accounting group number configured; group message not sent");
    return false;
  }
  try {
    const client = getWhatsAppClient();
    if (!client.isConfigured()) {
      sendLogger.warn("WhatsApp client not configured; group message not sent");
      return false;
    }
    const pdf = Buffer.from(buildDocumentPdfBytes(document));
    const sent = await client.sendDocument({
      to: groupMsisdn,
      document: pdf,
      filename: getUnifiedFilename(document),
      caption
    });
    if (!sent.success) {
      const text = await client.sendMessage({ to: groupMsisdn, text: caption });
      return text.success;
    }
    return true;
  } catch (error) {
    sendLogger.error("Failed to send document to accounting group", error, { documentId: document.id });
    return false;
  }
}

/**
 * Notify the accounting WhatsApp GROUP that an invoice has been issued (admin
 * panel auto-issue flow). Builds the PDF server-side and posts it with an
 * "Invoice issued" caption via the existing group sender. Best-effort: returns
 * false (never throws) so a send failure cannot break the issue/paid flow.
 */
export async function notifyAccountingGroupOfInvoiceAction(id: string): Promise<boolean> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  // Commission invoices post to the group under the AGENT'S NAME only — the
  // invoice number/client/amount already ride on the attached PDF + filename.
  // This matches the Sophia/WhatsApp approval path; the generic "Invoice issued"
  // caption is for every other (non-commission) invoice.
  const caption = isCommissionDescription(document.description)
    ? document.commissionPersonName || document.description
    : `Invoice issued: ${getDisplayNumber(document)} · Client: ${document.clientName}\n\n` +
      `Approved by Marios via the admin panel. PDF attached for accounting.`;
  return sendDocumentToAccountingGroup(document, caption);
}

export async function loadDeliveryRecordsAction(id: string): Promise<DeliveryRecord[]> {
  return listDeliveryRecordsForDocument(id);
}

export async function retryDeliveryAction(
  id: string,
  queueItemId: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const deliveries = await retryManualDelivery(queueItemId);
  return { ...current, selectedId: id, deliveries };
}

export async function cancelDeliveryAction(
  id: string,
  queueItemId: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const deliveries = await cancelManualDelivery(queueItemId);
  return { ...current, selectedId: id, deliveries };
}

export async function deleteDocumentAction(id: string): Promise<DocumentsActionResult> {
  const result = await deleteInvoiceDocument(id);
  return { ...result, selectedId: result.documents[0]?.id };
}

async function mutateOne(
  id: string,
  updater: (document: InvoiceDocument) => InvoiceDocument,
  reason: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const result = await saveInvoiceDocument(updater(document), reason);
  return { ...result, selectedId: id };
}

function findDocument(documents: InvoiceDocument[], id: string): InvoiceDocument {
  const document = documents.find((candidate) => candidate.id === id);
  if (!document) throw new Error(`Document ${id} was not found`);
  return document;
}
