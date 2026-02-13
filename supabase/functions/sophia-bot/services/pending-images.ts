/**
 * Pending Images Service
 *
 * Accumulates property listing images across multiple WhatsApp webhook calls.
 * WhatsApp sends each photo as a separate message, so we need to track them
 * together until the user confirms all photos are sent.
 *
 * Images auto-expire after 1 hour and are cleared after successful upload.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "../utils/logger.ts";
import { getContext } from "../utils/context.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Auto-expire images older than 1 hour
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Add images to pending queue for a user
 * Now includes correlation ID for debugging
 */
export async function addPendingImages(
  phoneNumber: string,
  imageUrls: string[],
  correlationId?: string
): Promise<void> {
  if (!imageUrls || imageUrls.length === 0) return;

  // Get correlation ID from context if not provided
  const ctx = getContext();
  const corrId = correlationId || ctx.correlationId;

  logger.info("Adding images to pending queue", {
    category: LogCategory.IMAGE,
    operation: "addPendingImages",
    correlationId: corrId,
    imageCount: imageUrls.length,
  });

  // Build records - only include columns that exist in the table
  const records = imageUrls.map(url => ({
    phone_number: phoneNumber,
    image_url: url,
  }));

  // Use upsert with ignoreDuplicates to handle the UNIQUE(phone_number, image_url) constraint
  // This prevents duplicate images when WhatsApp retries the same webhook
  const { error } = await supabase
    .from("pending_images")
    .upsert(records, { onConflict: "phone_number,image_url", ignoreDuplicates: true });

  if (error) {
    logger.error("Failed to add pending images", error, {
      category: LogCategory.IMAGE,
      operation: "addPendingImages",
      correlationId: corrId,
      imageCount: imageUrls.length,
    });
  } else {
    logger.info("Successfully added pending images", {
      category: LogCategory.IMAGE,
      operation: "addPendingImages",
      correlationId: corrId,
      imageCount: imageUrls.length,
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
  await supabase
    .from("pending_images")
    .delete()
    .lt("created_at", expiryTime);
}

/**
 * Get all pending images for a user (accumulated across multiple webhook calls)
 * Cleanup runs periodically (every 5 min) to reduce per-request overhead
 */
export async function getPendingImages(phoneNumber: string): Promise<string[]> {
  const ctx = getContext();

  // Periodic cleanup (non-blocking, fire and forget)
  cleanupExpiredImages().catch(() => {});

  // Get all pending images for this user
  const { data, error } = await supabase
    .from("pending_images")
    .select("image_url")
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Failed to get pending images", error, {
      category: LogCategory.IMAGE,
      operation: "getPendingImages",
      correlationId: ctx.correlationId,
    });
    return [];
  }

  const urls = data?.map(row => row.image_url) || [];
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
export async function getPendingImageCount(phoneNumber: string): Promise<number> {
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
