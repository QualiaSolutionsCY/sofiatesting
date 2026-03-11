/**
 * Pending Images Service
 *
 * Accumulates property listing images across multiple WhatsApp webhook calls.
 * WhatsApp sends each photo as a separate message, so we need to track them
 * together until the user confirms all photos are sent.
 *
 * Images auto-expire after 1 hour and are cleared after successful upload.
 */

import { getContext } from "../utils/context.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { getSupabaseAdmin } from "../../_shared/db.ts";

const supabase = getSupabaseAdmin();

// Auto-expire images older than 1 hour
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export interface PendingImageRecord {
  url: string;
  contentHash: string;
  messageTimestamp?: number;
}

/**
 * Add images to pending queue for a user.
 * Uses content_hash for deduplication — same image content with different URLs
 * will be rejected by the UNIQUE(phone_number, content_hash) index.
 */
export async function addPendingImages(
  phoneNumber: string,
  images: PendingImageRecord[],
  correlationId?: string
): Promise<void> {
  if (!images || images.length === 0) return;

  // Get correlation ID from context if not provided
  const ctx = getContext();
  const corrId = correlationId || ctx.correlationId;

  logger.info("Adding images to pending queue", {
    category: LogCategory.IMAGE,
    operation: "addPendingImages",
    correlationId: corrId,
    imageCount: images.length,
  });

  // Build records with content_hash for content-based deduplication
  const records = images.map((img) => ({
    phone_number: phoneNumber,
    image_url: img.url,
    content_hash: img.contentHash,
    ...(img.messageTimestamp ? { message_timestamp: img.messageTimestamp } : {}),
  }));

  // Use upsert with ignoreDuplicates on content_hash
  // This prevents the SAME image content from being stored twice,
  // even when WhatsApp re-decrypts it into a different temporary URL
  const { error } = await supabase.from("pending_images").upsert(records, {
    onConflict: "phone_number,image_url",
    ignoreDuplicates: true,
  });

  if (error) {
    // If the content_hash unique constraint fires, that's expected (dedup working!)
    if (error.code === "23505" && error.message?.includes("content_hash")) {
      logger.info("Content-hash dedup: duplicate image(s) skipped", {
        category: LogCategory.IMAGE,
        operation: "addPendingImages",
        correlationId: corrId,
      });
    } else {
      logger.error("Failed to add pending images", error, {
        category: LogCategory.IMAGE,
        operation: "addPendingImages",
        correlationId: corrId,
        imageCount: images.length,
      });
    }
  } else {
    logger.info("Successfully added pending images", {
      category: LogCategory.IMAGE,
      operation: "addPendingImages",
      correlationId: corrId,
      imageCount: images.length,
    });
  }
}

// Track last cleanup time to avoid per-request cleanup overhead
let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up expired images - called periodically, not on every request
 */
async function cleanupExpiredImages(): Promise<void> {
  const now = Date.now();
  // Only cleanup every 5 minutes to reduce database load
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanupTime = now;

  const expiryTime = new Date(now - EXPIRY_MS).toISOString();
  await supabase.from("pending_images").delete().lt("created_at", expiryTime);
}

/**
 * Get all pending images for a user (accumulated across multiple webhook calls)
 * Cleanup runs periodically (every 5 min) to reduce per-request overhead
 */
export async function getPendingImages(phoneNumber: string): Promise<string[]> {
  const ctx = getContext();

  // Periodic cleanup (non-blocking, fire and forget)
  cleanupExpiredImages().catch((error) => {
    logger.warn("Periodic image cleanup failed (non-critical)", {
      category: LogCategory.IMAGE,
      operation: "cleanupExpiredImages",
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // Get all pending images for this user
  // Order by message_timestamp (WhatsApp send time) to preserve the order the agent sent them
  // Falls back to created_at for images without timestamp (legacy rows)
  const { data, error } = await supabase
    .from("pending_images")
    .select("image_url, message_timestamp")
    .eq("phone_number", phoneNumber)
    .order("message_timestamp", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Failed to get pending images", error, {
      category: LogCategory.IMAGE,
      operation: "getPendingImages",
      correlationId: ctx.correlationId,
    });
    return [];
  }

  const urls = data?.map((row) => row.image_url) || [];
  logger.info("Retrieved pending images", {
    category: LogCategory.IMAGE,
    operation: "getPendingImages",
    correlationId: ctx.correlationId,
    imageCount: urls.length,
  });

  return urls;
}

/**
 * Get count of pending images for a user
 */
export async function getPendingImageCount(
  phoneNumber: string
): Promise<number> {
  const { count, error } = await supabase
    .from("pending_images")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", phoneNumber);

  if (error) {
    logger.error("Failed to count pending images", error, {
      category: LogCategory.IMAGE,
      operation: "getPendingImageCount",
    });
    return 0;
  }

  return count || 0;
}

/**
 * Clear all pending images for a user (call after successful upload)
 */
export async function clearPendingImages(phoneNumber: string): Promise<void> {
  logger.info("Clearing pending images", {
    category: LogCategory.IMAGE,
    operation: "clearPendingImages",
  });

  const { error } = await supabase
    .from("pending_images")
    .delete()
    .eq("phone_number", phoneNumber);

  if (error) {
    logger.error("Failed to clear pending images", error, {
      category: LogCategory.IMAGE,
      operation: "clearPendingImages",
    });
  } else {
    logger.info("Successfully cleared pending images", {
      category: LogCategory.IMAGE,
      operation: "clearPendingImages",
    });
  }
}
