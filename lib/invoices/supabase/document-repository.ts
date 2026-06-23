import "server-only";

import { sampleDocuments } from "@/lib/invoices/data/sample-records";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import {
  fromDocumentRow,
  toDocumentRow,
  toMessageEventRows,
  toPaymentRow,
  toRevisionRow,
  toStorageObjectRow,
  type InvoiceDocumentRow
} from "./document-mappers";
import { createServiceSupabaseClient, getSupabasePersistenceMode } from "./server";
import { SUPABASE_TABLES } from "./schema";

export type DocumentRepositoryResult = {
  documents: InvoiceDocument[];
  persistenceMode: "supabase" | "fallback";
};

export type StoredDocumentMetadata = {
  filename: string;
  path: string;
  contentType: "application/pdf";
  publicUrl?: string;
};

// Start empty — no seeded sample documents in the left-hand ledger.
let fallbackDocuments: InvoiceDocument[] = cloneDocuments([]);

export async function listInvoiceDocuments(): Promise<DocumentRepositoryResult> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return { documents: cloneDocuments(listLiveFallbackDocuments()), persistenceMode: "fallback" };
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("*")
    .is("deleted_at", null)
    // Latest official invoice NUMBER first; numbers are monotonic-with-creation, so
    // created_at desc is the tiebreak AND the order for drafts (NULL official_number → last).
    // Both columns are immutable after creation, so editing (which only bumps updated_at) never reorders.
    .order("official_number", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to load invoice documents: ${error.message}`);

  return {
    documents: (data as InvoiceDocumentRow[]).map(fromDocumentRow),
    persistenceMode: "supabase"
  };
}

export async function saveInvoiceDocument(
  document: InvoiceDocument,
  reason = "Document saved"
): Promise<DocumentRepositoryResult> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    upsertFallbackDocument(document);
    return { documents: cloneDocuments(fallbackDocuments), persistenceMode: "fallback" };
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .upsert(toDocumentRow(document), { onConflict: "external_id" })
    .select("id")
    .single();

  if (error) throw new Error(`Unable to save invoice document: ${error.message}`);

  const documentId = data.id as string;
  await writeRevision(documentId, document, reason);
  await writeRelatedRows(documentId, document);

  return listInvoiceDocuments();
}

export async function deleteInvoiceDocument(id: string): Promise<DocumentRepositoryResult> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    softDeleteFallbackDocument(id);
    return { documents: cloneDocuments(listLiveFallbackDocuments()), persistenceMode: "fallback" };
  }

  const { error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .update({ deleted_at: new Date().toISOString() })
    .eq("external_id", id);
  if (error) throw new Error(`Unable to delete invoice document: ${error.message}`);

  return listInvoiceDocuments();
}

export async function listDeletedInvoiceDocuments(): Promise<DocumentRepositoryResult> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return { documents: cloneDocuments(listDeletedFallbackDocuments()), persistenceMode: "fallback" };
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw new Error(`Unable to load deleted invoice documents: ${error.message}`);

  return {
    documents: (data as InvoiceDocumentRow[]).map(fromDocumentRow),
    persistenceMode: "supabase"
  };
}

export async function restoreInvoiceDocument(id: string): Promise<DocumentRepositoryResult> {
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    restoreFallbackDocument(id);
    return { documents: cloneDocuments(listLiveFallbackDocuments()), persistenceMode: "fallback" };
  }

  const { error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .update({ deleted_at: null })
    .eq("external_id", id);
  if (error) throw new Error(`Unable to restore invoice document: ${error.message}`);

  return listInvoiceDocuments();
}

export async function retrieveStoredDocument(
  id: string
): Promise<{ metadata?: StoredDocumentMetadata; persistenceMode: "supabase" | "fallback" }> {
  const current = await listInvoiceDocuments();
  const document = current.documents.find((candidate) => candidate.id === id);
  if (!document?.storagePath) return { persistenceMode: current.persistenceMode };

  const storage = toStorageObjectRow(document);
  return {
    persistenceMode: current.persistenceMode,
    metadata: {
      filename: storage.filename,
      path: document.storagePath,
      contentType: storage.content_type,
      publicUrl: storage.public_url
    }
  };
}

export async function saveStoredInvoiceDocument(
  document: InvoiceDocument,
  reason = "Stored PDF metadata saved"
): Promise<DocumentRepositoryResult> {
  return saveInvoiceDocument(document, reason);
}

export async function saveInvoiceDocuments(
  documents: InvoiceDocument[],
  reason = "Documents saved"
): Promise<DocumentRepositoryResult> {
  let result: DocumentRepositoryResult = await listInvoiceDocuments();

  for (const document of documents) {
    result = await saveInvoiceDocument(document, reason);
  }

  return result;
}

export function __resetDocumentRepositoryForTests(documents = sampleDocuments) {
  fallbackDocuments = cloneDocuments(documents);
}

async function writeRevision(documentId: string, document: InvoiceDocument, reason: string) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase
    .from(SUPABASE_TABLES.revisions)
    .select("revision_number")
    .eq("document_id", documentId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previous = typeof data?.revision_number === "number" ? data.revision_number : 0;
  const revision = toRevisionRow(document, previous + 1, reason);

  const { error } = await supabase.from(SUPABASE_TABLES.revisions).insert({
    document_id: documentId,
    revision_number: revision.revision_number,
    reason: revision.reason,
    snapshot: revision.snapshot,
    created_by: revision.created_by
  });

  if (error) throw new Error(`Unable to write document revision: ${error.message}`);
}

async function writeRelatedRows(documentId: string, document: InvoiceDocument) {
  const supabase = createServiceSupabaseClient();
  if (!supabase) return;

  if (document.storageStatus !== "not-generated") {
    const storage = toStorageObjectRow(document);
    await supabase.from(SUPABASE_TABLES.storageObjects).upsert(
      {
        document_id: documentId,
        bucket: storage.bucket,
        path: storage.path,
        filename: storage.filename,
        content_type: storage.content_type,
        public_url: storage.public_url
      },
      { onConflict: "bucket,path" }
    );
  }

  const payment = toPaymentRow(document);
  if (payment) {
    await supabase.from(SUPABASE_TABLES.payments).insert({
      invoice_document_id: documentId,
      paid_amount: payment.paid_amount,
      paid_at: payment.paid_at,
      created_by: payment.created_by
    });
  }

  const latestMessage = toMessageEventRows(document).at(-1);
  if (latestMessage) {
    await supabase.from(SUPABASE_TABLES.messageEvents).insert({
      document_id: documentId,
      target: latestMessage.target,
      status: latestMessage.status,
      message_text: latestMessage.message_text,
      event_at: latestMessage.event_at
    });
  }
}

function upsertFallbackDocument(document: InvoiceDocument) {
  const index = fallbackDocuments.findIndex((current) => current.id === document.id);
  if (index === -1) {
    fallbackDocuments = [document, ...fallbackDocuments];
    return;
  }
  fallbackDocuments = fallbackDocuments.map((current) => (current.id === document.id ? document : current));
}

function listLiveFallbackDocuments() {
  return fallbackDocuments.filter((document) => !document.deletedAt);
}

function listDeletedFallbackDocuments() {
  return fallbackDocuments.filter((document) => Boolean(document.deletedAt));
}

function softDeleteFallbackDocument(id: string) {
  fallbackDocuments = fallbackDocuments.map((document) =>
    document.id === id ? { ...document, deletedAt: new Date().toISOString() } : document
  );
}

function restoreFallbackDocument(id: string) {
  fallbackDocuments = fallbackDocuments.map((document) =>
    document.id === id ? { ...document, deletedAt: undefined } : document
  );
}

function cloneDocuments(documents: InvoiceDocument[]) {
  return structuredClone(documents);
}

export const documentRepositoryMode = getSupabasePersistenceMode;
