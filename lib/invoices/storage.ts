import "server-only";

import { getUnifiedFilename } from "@/lib/invoices/format";
import { buildDocumentPdfBytes } from "@/lib/invoices/pdf";
import {
  GENERATED_DOCUMENT_PREFIX,
  SUPABASE_BUCKETS,
} from "@/lib/invoices/supabase/schema";
import { createServiceSupabaseClient } from "@/lib/invoices/supabase/server";
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
      reason:
        "Supabase server credentials are not configured. Add the required server env values.",
    };
  }

  const { error } = await supabase.storage.from(bucket).upload(path, contents, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (error) {
    return { ok: false, reason: error.message };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signError || !signed?.signedUrl) {
    return {
      ok: false,
      reason: signError?.message ?? "Could not sign the stored PDF URL.",
    };
  }
  return { ok: true, file: { path, publicUrl: signed.signedUrl } };
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
        publicUrl: undefined,
      },
    };
  }

  const { data: signed } = await supabase.storage
    .from(SUPABASE_BUCKETS.invoices)
    .createSignedUrl(document.storagePath, 60 * 60 * 24 * 7);
  return {
    ok: true,
    file: { path: document.storagePath, publicUrl: signed?.signedUrl },
  };
}
