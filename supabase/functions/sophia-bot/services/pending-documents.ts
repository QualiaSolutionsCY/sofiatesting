/**
 * Pending Documents Service
 *
 * Accumulates document attachments (PDFs, title deeds) across WhatsApp webhook calls.
 * Documents auto-expire after 1 hour and are cleared after successful upload.
 */

import { LogCategory, logger } from "../utils/logger.ts";
import { getSupabaseAdmin } from "../../_shared/db.ts";

const supabase = getSupabaseAdmin();

export interface PendingDocument {
  document_url: string;
  filename: string | null;
  mimetype: string | null;
}

/**
 * Add a document to pending queue for a user
 */
export async function addPendingDocument(
  phoneNumber: string,
  documentUrl: string,
  filename?: string,
  mimetype?: string
): Promise<void> {
  const { error } = await supabase.from("pending_documents").upsert(
    {
      phone_number: phoneNumber,
      document_url: documentUrl,
      filename: filename || null,
      mimetype: mimetype || null,
    },
    { onConflict: "phone_number,document_url", ignoreDuplicates: true }
  );

  if (error) {
    logger.error("Failed to add pending document", error, {
      category: LogCategory.GENERAL,
      operation: "addPendingDocument",
    });
  } else {
    logger.info("Document queued for property upload", {
      category: LogCategory.GENERAL,
      operation: "addPendingDocument",
      filename,
      mimetype,
    });
  }
}

/**
 * Get all pending documents for a user
 */
export async function getPendingDocuments(
  phoneNumber: string
): Promise<PendingDocument[]> {
  const { data, error } = await supabase
    .from("pending_documents")
    .select("document_url, filename, mimetype")
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Failed to get pending documents", error, {
      category: LogCategory.GENERAL,
      operation: "getPendingDocuments",
    });
    return [];
  }

  return data || [];
}

/**
 * Clear all pending documents for a user (call after successful upload)
 */
export async function clearPendingDocuments(
  phoneNumber: string
): Promise<void> {
  const { error } = await supabase
    .from("pending_documents")
    .delete()
    .eq("phone_number", phoneNumber);

  if (error) {
    logger.error("Failed to clear pending documents", error, {
      category: LogCategory.GENERAL,
      operation: "clearPendingDocuments",
    });
  }
}
