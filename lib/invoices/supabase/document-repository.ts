import "server-only";

import { createLogger } from "@/lib/logger";
import { sampleDocuments } from "@/lib/invoices/data/sample-records";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import {
  fromDocumentRow,
  toApprovalRows,
  toDocumentRow,
  toMessageEventRows,
  toPaymentRow,
  toRevisionRow,
  toStorageObjectRow,
  type ApprovalRow,
  type InvoiceDocumentRow
} from "./document-mappers";
import { createServiceSupabaseClient, getSupabasePersistenceMode } from "./server";
import { SUPABASE_TABLES } from "./schema";

const approvalLogger = createLogger("invoices:approvals");

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

  const rows = data as InvoiceDocumentRow[];
  const approvalsByDocument = await loadApprovalsByDocument(supabase, rows);

  return {
    documents: rows.map((row) => fromDocumentRow(row, approvalsByDocument.get(row.id ?? "") ?? [])),
    persistenceMode: "supabase"
  };
}

/**
 * Fetch the durable approval events for the given document rows and group them by the
 * internal document_id FK, so each document's approvalTimeline is rebuilt from real
 * history instead of a fabricated single entry. Best-effort: if the read fails, return
 * an empty map and let fromDocumentRow fall back to the status-derived entry.
 */
async function loadApprovalsByDocument(
  supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  rows: InvoiceDocumentRow[]
): Promise<Map<string, ApprovalRow[]>> {
  const ids = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
  const grouped = new Map<string, ApprovalRow[]>();
  if (ids.length === 0) return grouped;

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.approvals)
    .select("document_id, event_label, event_status, official_number, event_at")
    .in("document_id", ids)
    .order("event_at", { ascending: true });

  if (error || !data) return grouped;

  for (const approval of data as ApprovalRow[]) {
    const bucket = grouped.get(approval.document_id) ?? [];
    bucket.push(approval);
    grouped.set(approval.document_id, bucket);
  }
  return grouped;
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

  let row = toDocumentRow(document);
  let { data, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .upsert(row, { onConflict: "external_id" })
    .select("id")
    .single();

  // Official-number collision: the partial unique index invoice_documents_kind_official_number_key
  // (kind, official_number) makes a concurrent number race fail LOUDLY here instead of
  // silently writing a duplicate legal number. Re-allocate transactionally via the
  // allocate_official_number RPC (advisory-locked max+1 per kind) and retry the upsert
  // once. The retry only re-numbers a NUMBERED document — drafts have no official_number
  // and never collide on this index.
  if (error && isOfficialNumberConflict(error) && document.officialNumber) {
    const reallocated = await reallocateOfficialNumber(supabase, document.kind);
    if (reallocated) {
      row = toDocumentRow({ ...document, officialNumber: reallocated });
      ({ data, error } = await supabase
        .from(SUPABASE_TABLES.documents)
        .upsert(row, { onConflict: "external_id" })
        .select("id")
        .single());
    }
  }

  if (error) throw new Error(`Unable to save invoice document: ${error.message}`);
  if (!data) throw new Error("Unable to save invoice document: no row returned");

  const documentId = data.id as string;
  const persisted: InvoiceDocument = { ...document, officialNumber: row.official_number };
  await writeRevision(documentId, persisted, reason);
  await writeRelatedRows(documentId, persisted);

  return listInvoiceDocuments();
}

/** True when an upsert error is a unique-violation on the official-number index. */
function isOfficialNumberConflict(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23505" &&
    (error.message ?? "").includes("invoice_documents_kind_official_number_key")
  );
}

/** Re-allocate the next official number for a kind via the transactional RPC. */
async function reallocateOfficialNumber(
  supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  kind: InvoiceDocument["kind"]
): Promise<string | null> {
  const { data, error } = await supabase.rpc("allocate_official_number", { p_kind: kind });
  if (error || data === null || data === undefined) return null;
  return String(data);
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

  const rows = data as InvoiceDocumentRow[];
  const approvalsByDocument = await loadApprovalsByDocument(supabase, rows);

  return {
    documents: rows.map((row) => fromDocumentRow(row, approvalsByDocument.get(row.id ?? "") ?? [])),
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

  // Durable approval audit trail. Insert ONLY the latest approval event each save
  // (mirroring the single-event message pattern above) so re-saving the same document
  // appends one row per transition instead of duplicating the whole timeline. The FK
  // column is document_id (matching revisions/payments), confirmed against the live
  // invoice_approvals schema (document_id, event_label, event_status, official_number,
  // event_at). Without this, invoice_approvals stays empty and there is no record of
  // who approved each invoice.
  const latestApproval = toApprovalRows(document).at(-1);
  if (latestApproval) {
    // Best-effort, matching the storage/payment/message inserts above: an audit-row
    // hiccup must never break a working save or its downstream delivery. The happy
    // path writes the row; failures are surfaced in the error field, not thrown.
    const { error } = await supabase.from(SUPABASE_TABLES.approvals).insert({
      document_id: documentId,
      event_label: latestApproval.event_label,
      event_status: latestApproval.event_status,
      official_number: latestApproval.official_number ?? null,
      event_at: latestApproval.event_at
    });
    if (error) approvalLogger.error("Unable to write approval event", undefined, { documentId, error: error.message });
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
