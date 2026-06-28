"use server";

import {
  createDocument,
  type DashboardDocumentControls,
  type DocumentInput,
  updateDocumentDashboardControls,
  updateDocumentFromInput
} from "@/lib/invoices/document-actions";
import { getNextDraftSequence, getNextOfficialNumber, officialNumberOnApproval } from "@/lib/invoices/numbering";
import {
  deleteInvoiceDocument,
  listDeletedInvoiceDocuments,
  listInvoiceDocuments,
  restoreInvoiceDocument,
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
import { getDisplayNumber, getUnifiedFilename } from "@/lib/invoices/format";
import { buildDocumentPdfBytes } from "@/lib/invoices/pdf";
import { createLogger } from "@/lib/logger";
import { getWhatsAppClient } from "@/lib/whatsapp/client";
import { Resend } from "resend";
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
  mariosNotified?: boolean;
  accountingGroupNotified?: boolean;
  /** Set when an action was rejected by a server-side rule (e.g. editing a paid
   * invoice). The document set is returned unchanged so callers can surface this
   * message without the action throwing. */
  error?: string;
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
  // Paid-immutable rule, enforced server-side (not only in the DetailPane UI):
  // once an invoice has been paid/forwarded to accounting its figures are locked,
  // so reject the edit and return the unchanged set with a clear error rather
  // than throwing.
  if (document.status === "sent-to-accounting") {
    return {
      ...current,
      selectedId: id,
      error: "This invoice has been paid and forwarded to accounting — its details are locked and can't be edited.",
    };
  }
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

export async function sendToMariosAction(
  id: string,
  messageOverride?: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const updated = sendDraftToMarios(document);
  const result = await saveInvoiceDocument(updated, "Draft sent to Marios");
  await queueDraftToMarios(updated);
  const mariosNotified = await notifyMariosOverWhatsApp(updated, { override: messageOverride });
  return { ...result, selectedId: id, mariosNotified, deliveries: await listDeliveryRecordsForDocument(id) };
}

/**
 * Admin-panel auto-approval: notify Marios that the invoice is already approved and
 * issued (FYI message + PDF), without sending a review/approval request.
 */
export async function notifyMariosApprovedAction(id: string, message?: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  // The operator's approve-dialog message rides with Marios's PDF when provided;
  // blank/undefined keeps the default (just the PDF).
  const override = message?.trim() ? message.trim() : undefined;
  const mariosNotified = await notifyMariosOverWhatsApp(document, { approved: true, override });
  return { ...current, selectedId: id, mariosNotified, deliveries: await listDeliveryRecordsForDocument(id) };
}

const sendLogger = createLogger("invoices:send-to-marios");

/**
 * Actually deliver the review request to Marios over WhatsApp (PDF + caption),
 * using the same WaSenderAPI client the rest of the app sends with. Best-effort:
 * a send failure is logged but never throws. Returns true ONLY when a WhatsApp
 * message (document OR text fallback) actually went out, so callers can gate
 * their "sent to Marios" confirmation on the real result.
 */
async function notifyMariosOverWhatsApp(
  document: InvoiceDocument,
  opts: { approved?: boolean; override?: string } = {}
): Promise<boolean> {
  const marios = INVOICE_AUTHORIZED_AGENTS.find((agent) => agent.name === "Marios Polyviou");
  if (!marios) {
    sendLogger.warn("Marios is not in INVOICE_AUTHORIZED_AGENTS; skipping WhatsApp send");
    return false;
  }

  const displayNumber = getDisplayNumber(document);
  // The cancellation / correction reason is NEVER placed on a caption — it must not
  // appear on or alongside any invoice/receipt/credit-note. (correctionReason stays
  // on the record for the audit trail only.)
  // A caller-supplied caption (Marios edited the message before sending — the
  // "Edit message" action) wins over the default. An empty override means
  // "send blank — just the PDF", per Marios's no-description rule.
  // Admin-panel invoices are already approved, so Marios gets a notification, not a
  // review request. He only approves via the Sophia chat flow.
  const caption = opts.override !== undefined
    ? opts.override.trim()
    : document.kind === "credit-note"
    ? `Credit note ${displayNumber}\n` +
      `Client: ${document.clientName}\n\n` +
      `Your copy — invoice ${document.sourceInvoiceNumber || "—"} was cancelled. PDF attached.`
    // Marios's copy is BLANK — just the PDF, no description (his "be blunt, just
    // the PDF" rule).
    : document.kind === "receipt"
    ? ""
    : opts.approved
    ? ""
    // The review request keeps its instructions so reply-to-approve still works.
    : `Invoice for review: ${displayNumber}\n` +
      `Client: ${document.clientName}\n\n` +
      `Reply ✓ to approve, or reply with the correction needed.`;

  try {
    const client = getWhatsAppClient();
    if (!client.isConfigured()) {
      sendLogger.warn("WhatsApp client not configured; review request not sent to Marios");
      return false;
    }

    const pdf = Buffer.from(buildDocumentPdfBytes(document));
    const sendDoc = () =>
      client.sendDocument({
        to: marios.msisdn,
        document: pdf,
        filename: getUnifiedFilename(document),
        caption,
      });

    // The approve / credit-note flows post the PDF to the accounting group
    // IMMEDIATELY before this Marios send, and WaSender can rate-limit (429) the
    // back-to-back second document send — which previously dropped Marios's copy of
    // the approved invoice / credit note (or fell through to a misleading text).
    // Retry the document send a couple of times with a short backoff so Marios
    // RELIABLY receives the actual PDF, not just a description.
    let sent = await sendDoc();
    for (let attempt = 0; attempt < 2 && !sent.success; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      sent = await sendDoc();
    }

    if (sent.success) {
      return true;
    }

    sendLogger.error("WhatsApp document send to Marios failed after retries; falling back to text", undefined, {
      documentId: document.id,
      error: sent.error,
    });
    // A blank caption (receipts, blank-rule invoices) has NO valid text fallback —
    // WaSender rejects empty/whitespace text (see lib/whatsapp/client.ts), and the
    // empty-caption PDF is the only valid form. Don't fire an empty-text send that
    // would itself fail silently; report the failure instead.
    const fallbackText = caption.trim();
    if (!fallbackText) {
      sendLogger.error("Blank-caption document send to Marios failed; no text fallback possible", undefined, {
        documentId: document.id,
      });
      return false;
    }
    const text = await client.sendMessage({ to: marios.msisdn, text: fallbackText });
    return text.success;
  } catch (error) {
    sendLogger.error("Unexpected error sending review request to Marios", error, {
      documentId: document.id,
    });
    return false;
  }
}

export async function approveDocumentAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const approved = markApproved(document);
  const numbered = applyOfficialNumberToDocument(
    approved,
    document.officialNumber ?? officialNumberOnApproval(current.documents, document)
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

  // The PDF is already uploaded + signed at this point. The metadata save below is
  // SECONDARY — if it throws (e.g. a concurrent write right after approval), we must
  // STILL hand back the signed URL so callers (Sophia's approve / email_invoice) can
  // deliver the PDF. Previously a save failure here threw and dropped the URL, so the
  // approved PDF never reached the chat reply (and Marios).
  const storageFile = storage.ok
    ? { filename: storage.file.path.split("/").at(-1) ?? storage.file.path, path: storage.file.path, contentType: "application/pdf" as const, publicUrl: storage.file.publicUrl }
    : undefined;
  try {
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
    return { ...result, selectedId: id, storageFile };
  } catch {
    return { ...current, selectedId: id, storageFile };
  }
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
  // Actually post the PDF to the accounting group over WhatsApp (the real send) —
  // same caption rule as notifyAccountingGroupOfInvoiceAction: the agent's name
  // only when there's a commission person, otherwise blank (just the PDF).
  const caption =
    updated.requiresCommissionPerson && updated.commissionPersonName
      ? updated.commissionPersonName
      : "";
  const accountingGroupNotified = await sendDocumentToAccountingGroup(updated, caption);
  // Keep the queue row strictly for the audit record (no-op delivery backend).
  await queueAccountingHandoff(updated);
  return {
    ...result,
    selectedId: id,
    accountingGroupNotified,
    deliveries: await listDeliveryRecordsForDocument(id)
  };
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
  // Actually re-send the corrected invoice to the accounting GROUP (+ Marios) over
  // WhatsApp — not just write an internal delivery record — with a note to ignore the
  // previous version. markCorrectedForResend already flagged the PDF needs-regeneration,
  // and sendDocumentToAccountingGroup rebuilds the PDF from `updated`, so the group
  // receives the corrected content. Best-effort: a failed send never breaks the save.
  // Mirrors resendCorrectedInvoiceAction (the inline-editor / Sophia path).
  // The correction reason is NEVER placed on a caption sent with the document.
  const groupCaption =
    `Corrected invoice ${getDisplayNumber(updated)} — please use this version. Ignore the previous one.`;
  await sendDocumentToAccountingGroup(updated, groupCaption);
  await notifyMariosOverWhatsApp(updated, { approved: true });
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

const INVOICE_EMAIL_FROM =
  process.env.INVOICE_EMAIL_FROM || process.env.INVITE_FROM_EMAIL || "CSC Zyprus Property Group <sophia@zyprus.com>";
const sendEmailLogger = createLogger("invoices:send-email");

/**
 * Actually EMAIL the document (invoice / receipt / credit note) PDF to one or
 * more recipients via Resend — the functional "Send email" action. Builds the
 * PDF server-side and attaches it, then records the delivery for the audit trail.
 *
 * `recipients` is back-compatible: a single string still works (the admin panel
 * passes one address), and an array sends to every address in one Resend message
 * (Resend `to:` accepts `string[]`). Used by the Sophia email_invoice flow to
 * deliver a monthly invoice to accounting + Marios CC + the client at once.
 */
export async function sendInvoiceEmailAction(
  id: string,
  recipients: string | string[],
  customMessage?: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email isn't configured (missing RESEND_API_KEY).");

  // Normalize to an array, trim, drop blanks, and validate each address.
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const toList = (Array.isArray(recipients) ? recipients : [recipients])
    .map((r) => (r || "").trim())
    .filter(Boolean);
  if (toList.length === 0) throw new Error("Please enter a valid email address.");
  const invalid = toList.find((r) => !emailRe.test(r));
  if (invalid) throw new Error("Please enter a valid email address.");

  const label = document.kind === "credit-note" ? "Credit note" : document.kind === "receipt" ? "Receipt" : "Invoice";
  const number = getDisplayNumber(document);
  const pdf = Buffer.from(buildDocumentPdfBytes(document));

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: INVOICE_EMAIL_FROM,
    to: toList,
    subject: `${label} ${number} — CSC Zyprus Property Group`,
    text:
      customMessage && customMessage.trim()
        ? customMessage.trim()
        : `Dear ${document.clientName},\n\n` +
          `Please find attached ${label.toLowerCase()} ${number} from CSC Zyprus Property Group.\n\n` +
          `Kind regards,\nCSC Zyprus Property Group`,
    attachments: [{ filename: getUnifiedFilename(document), content: pdf }],
  });
  if (error) {
    sendEmailLogger.error("Resend send failed", undefined, { documentId: id, error: error.message });
    throw new Error(`Email failed: ${error.message ?? "unknown error"}`);
  }

  // Record the delivery (audit trail) — best-effort, never fail the send on it.
  try {
    await queueClientEmail(document, toList.join(", "));
  } catch (e) {
    sendEmailLogger.warn("Delivery record not written after email send", { documentId: id });
  }
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
  // A cancelled / credited invoice has been voided — never issue a receipt
  // against it (mirrors the Sophia intent-handler guard). Return the current
  // state unchanged rather than minting a receipt for money that wasn't owed.
  if (invoice.status === "cancelled" || invoice.status === "credited") {
    return { ...current, selectedId: id };
  }

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
  // Keep the operator's reason on the record (correctionReason) for the audit trail
  // ONLY — never append it to the credit-note description, which is rendered on the
  // PDF body and the on-screen preview. The reason must not appear on any document.
  const creditNoteWithReason = trimmedReason
    ? { ...creditNote, correctionReason: trimmedReason }
    : creditNote;
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
  await notifyGroupOfCreditNote(cancelledInvoice, approvedCreditNote);
  // Marios ALWAYS gets his own copy of the credit note, not only the group.
  await notifyMariosOverWhatsApp(approvedCreditNote);
  return {
    ...result,
    selectedId: approvedCreditNote.id,
    deliveries: await listDeliveryRecordsForDocument(approvedCreditNote.id)
  };
}

/**
 * Send the linked credit note to the accounting/CSC group, referencing the cancelled
 * invoice number only — the cancellation reason is NEVER included on or alongside the
 * document. Best-effort.
 */
async function notifyGroupOfCreditNote(
  invoice: InvoiceDocument,
  creditNote: InvoiceDocument
): Promise<void> {
  const invoiceNumber = getDisplayNumber(invoice);
  const creditNumber = getDisplayNumber(creditNote);
  const caption =
    `Credit note ${creditNumber} regarding the cancellation of invoice ${invoiceNumber}.`;

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
      // The group caption is sometimes intentionally blank (just the PDF). A blank
      // text fallback is impossible — WaSender rejects empty/whitespace text — so
      // only attempt the text fallback when there is a non-empty caption.
      if (!caption.trim()) {
        sendLogger.error("Blank-caption document send to accounting group failed; no text fallback possible", undefined, {
          documentId: document.id,
        });
        return false;
      }
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
export async function notifyAccountingGroupOfInvoiceAction(id: string, message?: string): Promise<boolean> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  // The operator's approve-dialog message rides with the PDF when provided. Else the
  // AGENT'S NAME for a commission invoice, otherwise BLANK — just the PDF (Marios's
  // rule). The invoice number/client/amount ride on the attached PDF + filename.
  const written = message?.trim();
  const caption = written
    ? written
    : document.requiresCommissionPerson && document.commissionPersonName
      ? document.commissionPersonName
      : "";
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

/**
 * Marios's "Correct & resend": after the corrected content is saved, the
 * invoice is re-posted to the accounting group AND Marios IMMEDIATELY over
 * WhatsApp (the real sender — not the manual queue) with a note to ignore the
 * previous version. The invoice keeps its number and list position; only the
 * content + correction reason change. Best-effort sends never break the save.
 */
export async function resendCorrectedInvoiceAction(
  id: string,
  reason: string
): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const document = findDocument(current.documents, id);
  const trimmed = (reason || "").trim();
  const corrected: InvoiceDocument = {
    ...document,
    correctionReason: trimmed || document.correctionReason,
    storageStatus: "needs-regeneration",
    whatsappStatus: "queued",
    approvalTimeline: [
      ...document.approvalTimeline,
      { label: trimmed ? `Corrected & resent: ${trimmed}` : "Corrected & resent", at: new Date().toISOString(), by: "Marios" }
    ]
  };
  const result = await saveInvoiceDocument(corrected, "Corrected and resent to the group");
  // Record the delivery for the audit trail (best-effort).
  try {
    await queueCorrectedResend(corrected, trimmed || undefined);
  } catch (error) {
    sendLogger.warn("Corrected-resend delivery record not written", { documentId: id });
  }
  // Resend immediately to the accounting group + Marios with the ignore-previous
  // note. The correction reason is NEVER placed on the caption.
  const groupCaption =
    `Corrected invoice ${getDisplayNumber(corrected)} — please use this version. Ignore the previous one.`;
  await sendDocumentToAccountingGroup(corrected, groupCaption);
  await notifyMariosOverWhatsApp(corrected, { approved: true });
  return { ...result, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
}

/**
 * Auto-email the approved invoice to Marios (his copy), used by the admin
 * auto-approve-on-create flow. Best-effort: skips silently when RESEND_API_KEY
 * or the INVOICE_MARIOS_EMAIL recipient is not configured, so it never breaks
 * the create flow (and never sends during local testing without an inbox set).
 */
export async function autoEmailApprovedInvoiceAction(id: string): Promise<boolean> {
  const to = process.env.INVOICE_MARIOS_EMAIL?.trim();
  if (!to || !process.env.RESEND_API_KEY) {
    sendEmailLogger.warn("Auto-email skipped (INVOICE_MARIOS_EMAIL or RESEND_API_KEY not set)", { documentId: id });
    return false;
  }
  try {
    await sendInvoiceEmailAction(id, to);
    return true;
  } catch (error) {
    sendEmailLogger.warn("Auto-email of approved invoice to Marios failed", { documentId: id });
    return false;
  }
}

/** Load soft-deleted documents for the "Deleted" view (Marios wants deleted
 * invoices retained and visible, not gone forever). */
export async function loadDeletedDocumentsAction(): Promise<DocumentsActionResult> {
  const result = await listDeletedInvoiceDocuments();
  return { ...result, selectedId: result.documents[0]?.id };
}

/** Restore a soft-deleted document back to the live list. */
export async function restoreDocumentAction(id: string): Promise<DocumentsActionResult> {
  const result = await restoreInvoiceDocument(id);
  return { ...result, selectedId: id };
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
