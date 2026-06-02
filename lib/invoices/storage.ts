import "server-only";

import { getUnifiedFilename } from "@/lib/invoices/format";
import { buildDocumentPdfBytes } from "@/lib/invoices/pdf";
import { createServiceSupabaseClient } from "@/lib/invoices/supabase/server";
import { GENERATED_DOCUMENT_PREFIX, SUPABASE_BUCKETS } from "@/lib/invoices/supabase/schema";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export type StoredPdf = {
  path: string;
  publicUrl?: string;
};

export type StorageResult =
  | { ok: true; file: StoredPdf }
  | { ok: false; reason: string };

export async function storeDocumentPdfInSupabase(
  document: InvoiceDocument,
  contents = buildDocumentPdfBytes(document)
): Promise<StorageResult> {
  const supabase = createServiceSupabaseClient();
  const bucket = SUPABASE_BUCKETS.invoices;
  const filename = getUnifiedFilename(document);
  const path = `${GENERATED_DOCUMENT_PREFIX}/${filename}`;

  if (!supabase) {
    return {
      ok: false,
      reason: "Supabase server credentials are not configured. Add the required server env values."
    };
  }

  const { error } = await supabase.storage.from(bucket).upload(path, contents, {
    contentType: "application/pdf",
    upsert: true
  });

  if (error) {
    return { ok: false, reason: error.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { ok: true, file: { path, publicUrl: data.publicUrl } };
}

export async function retrieveDocumentPdfMetadata(
  document: InvoiceDocument
): Promise<StorageResult> {
  if (!document.storagePath) {
    return { ok: false, reason: "Document has no stored PDF path yet." };
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return {
      ok: true,
      file: {
        path: document.storagePath,
        publicUrl: undefined
      }
    };
  }

  const { data } = supabase.storage.from(SUPABASE_BUCKETS.invoices).getPublicUrl(document.storagePath);
  return { ok: true, file: { path: document.storagePath, publicUrl: data.publicUrl } };
}
