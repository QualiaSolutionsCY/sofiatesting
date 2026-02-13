/**
 * Image Persistence Service
 * Re-uploads decrypted WhatsApp images to Supabase Storage for stable URLs
 *
 * Problem: WaSenderAPI decrypted URLs expire after ~1 hour
 * Solution: Persist images to Supabase Storage immediately after decryption
 *
 * This solves LIST-06 where delayed/retried Zyprus uploads fail due to expired URLs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Persist a single image to Supabase Storage
 *
 * @param url - Temporary decrypted URL from WaSenderAPI
 * @param index - Image index for logging and filename generation
 * @returns Public Supabase Storage URL or null on failure
 */
export async function persistImage(url: string, index: number): Promise<string | null> {
  try {
    // Fetch from temporary URL
    const response = await fetch(url);
    if (!response.ok) {
      logger.error("Failed to fetch image from temporary URL", undefined, {
        category: LogCategory.IMAGE,
        operation: "persistImage",
        imageIndex: index,
        status: response.status,
      });
      return null;
    }

    // Determine extension from content-type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    // Get image data
    const imageBlob = await response.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Generate unique filename
    const filename = `whatsapp-images/wa_img_${Date.now()}_${index}.${ext}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from("documents")
      .upload(filename, imageBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      logger.error("Failed to upload image to Supabase Storage", error, {
        category: LogCategory.IMAGE,
        operation: "persistImage",
        imageIndex: index,
        filename,
      });
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(filename);

    logger.info("Image persisted to Supabase Storage", {
      category: LogCategory.IMAGE,
      operation: "persistImage",
      imageIndex: index,
      publicUrl: urlData.publicUrl,
    });
    return urlData.publicUrl;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("Error persisting image", error, {
      category: LogCategory.IMAGE,
      operation: "persistImage",
      imageIndex: index,
    });
    return null;
  }
}

/**
 * Persist multiple images to Supabase Storage in parallel
 *
 * @param urls - Array of temporary decrypted URLs from WaSenderAPI
 * @returns Array of public Supabase Storage URLs (failures filtered out)
 */
/**
 * Persist a document file (PDF, DOCX, etc.) to Supabase Storage
 *
 * @param url - Temporary decrypted URL from WaSenderAPI
 * @param originalFilename - Original filename from WhatsApp (e.g., "title_deed.pdf")
 * @param mimetype - MIME type of the document
 * @returns Public Supabase Storage URL or null on failure
 */
export async function persistDocument(
  url: string,
  originalFilename?: string,
  mimetype?: string
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.error("Failed to fetch document from temporary URL", undefined, {
        category: LogCategory.GENERAL,
        operation: "persistDocument",
        status: response.status,
      });
      return null;
    }

    const contentType = mimetype || response.headers.get("content-type") || "application/octet-stream";
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();

    // Use original filename or generate one
    const ext = originalFilename?.split(".").pop() || "pdf";
    const safeName = originalFilename
      ? originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_")
      : `document_${Date.now()}.${ext}`;
    const storagePath = `whatsapp-documents/wa_doc_${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, { contentType, upsert: false });

    if (error) {
      logger.error("Failed to upload document to Supabase Storage", error, {
        category: LogCategory.GENERAL,
        operation: "persistDocument",
        storagePath,
      });
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    logger.info("Document persisted to Supabase Storage", {
      category: LogCategory.GENERAL,
      operation: "persistDocument",
      publicUrl: urlData.publicUrl,
      originalFilename,
    });
    return urlData.publicUrl;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("Error persisting document", error, {
      category: LogCategory.GENERAL,
      operation: "persistDocument",
    });
    return null;
  }
}

export async function persistImages(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];

  logger.info("Persisting images to Supabase Storage", {
    category: LogCategory.IMAGE,
    operation: "persistImages",
    imageCount: urls.length,
  });

  const results = await Promise.all(
    urls.map((url, index) => persistImage(url, index))
  );

  // Filter out failures
  const persisted = results.filter((url): url is string => url !== null);

  logger.info("Image persistence completed", {
    category: LogCategory.IMAGE,
    operation: "persistImages",
    successCount: persisted.length,
    totalCount: urls.length,
  });
  return persisted;
}
