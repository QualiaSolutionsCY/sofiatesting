"use server";

import {
  createDocument,
  type DashboardDocumentControls,
  type DocumentInput,
  updateDocumentDashboardControls,
  updateDocumentFromInput
} from "@/lib/invoices/document-actions";
import { getNextOfficialNumber } from "@/lib/invoices/numbering";
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
  retryManualDelivery,
  queueReceiptDelivery
} from "@/lib/invoices/supabase/integration-repository";
import { storeDocumentPdfInSupabase } from "@/lib/invoices/storage";
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
  const created = createDocument(input, current.documents.length + 1);
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
  return { ...result, selectedId: id, deliveries: await listDeliveryRecordsForDocument(id) };
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

export async function markPaidAndIssueReceiptAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const invoice = findDocument(current.documents, id);
  if (invoice.kind !== "invoice") return { ...current, selectedId: id };

  const { invoice: paidInvoice, receipt } = markPaidWithReceipt(invoice, current.documents.length + 1);
  const result = await saveInvoiceDocuments(
    [paidInvoice, receipt],
    "Invoice paid and receipt draft created"
  );
  await queueReceiptDelivery(receipt);
  return {
    ...result,
    selectedId: receipt.id,
    deliveries: await listDeliveryRecordsForDocument(receipt.id)
  };
}

export async function cancelWithCreditNoteAction(id: string): Promise<DocumentsActionResult> {
  const current = await listInvoiceDocuments();
  const invoice = findDocument(current.documents, id);
  if (invoice.kind !== "invoice") return { ...current, selectedId: id };

  const { invoice: cancelledInvoice, creditNote } = cancelInvoiceWithCreditNote(
    invoice,
    current.documents.length + 1
  );
  const result = await saveInvoiceDocuments(
    [cancelledInvoice, creditNote],
    "Invoice cancelled with linked credit note"
  );
  await queueCreditNoteDelivery(creditNote);
  return {
    ...result,
    selectedId: creditNote.id,
    deliveries: await listDeliveryRecordsForDocument(creditNote.id)
  };
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
