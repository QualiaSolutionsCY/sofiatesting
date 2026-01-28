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

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Auto-expire images older than 1 hour
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Add images to pending queue for a user
 */
export async function addPendingImages(phoneNumber: string, imageUrls: string[]): Promise<void> {
  if (!imageUrls || imageUrls.length === 0) return;

  logger.info("Adding images to pending queue", {
    category: LogCategory.IMAGE,
    operation: "addPendingImages",
    imageCount: imageUrls.length,
  });

  const records = imageUrls.map(url => ({
    phone_number: phoneNumber,
    image_url: url,
  }));

  const { error } = await supabase
    .from("pending_images")
    .insert(records);

  if (error) {
    logger.error("Failed to add pending images", error, {
      category: LogCategory.IMAGE,
      operation: "addPendingImages",
      imageCount: imageUrls.length,
    });
  } else {
    logger.info("Successfully added pending images", {
      category: LogCategory.IMAGE,
      operation: "addPendingImages",
      imageCount: imageUrls.length,
    });
  }
}

/**
 * Get all pending images for a user (accumulated across multiple webhook calls)
 * Also cleans up expired images (older than 1 hour)
 */
export async function getPendingImages(phoneNumber: string): Promise<string[]> {
  // First, clean up expired images
  const expiryTime = new Date(Date.now() - EXPIRY_MS).toISOString();

  await supabase
    .from("pending_images")
    .delete()
    .lt("created_at", expiryTime);

  // Now get all pending images for this user
  const { data, error } = await supabase
    .from("pending_images")
    .select("image_url")
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("Failed to get pending images", error, {
      category: LogCategory.IMAGE,
      operation: "getPendingImages",
    });
    return [];
  }

  const urls = data?.map(row => row.image_url) || [];
  logger.info("Retrieved pending images", {
    category: LogCategory.IMAGE,
    operation: "getPendingImages",
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
