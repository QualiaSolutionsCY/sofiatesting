/**
 * Reset Upload Session Handler
 *
 * Clears pending images, pending documents, and chat history
 * when a user wants to cancel/restart a property upload.
 */

import { getSupabaseAdmin } from "../../../_shared/db.ts";
import { clearPendingDocuments } from "../../services/pending-documents.ts";
import { clearPendingImages } from "../../services/pending-images.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import type { ToolResult } from "./property-listing.ts";

/**
 * Clear all pending upload state for a user:
 * - pending_images
 * - pending_documents
 * - chat_history (so next listing starts fresh)
 */
export async function handleResetUploadSession(
  _args: Record<string, unknown>,
  phoneNumber?: string
): Promise<ToolResult> {
  if (!phoneNumber) {
    return { error: "Cannot reset session — no phone number available." };
  }

  const cleanPhone = phoneNumber.replace(/\D/g, "");

  logger.info("Resetting upload session", {
    category: LogCategory.TOOL,
    operation: "resetUploadSession",
    phoneNumber: cleanPhone,
  });

  const results: string[] = [];

  // 1. Clear pending images
  try {
    await clearPendingImages(cleanPhone);
    results.push("images cleared");
  } catch (err) {
    logger.warn("Failed to clear pending images during reset", {
      category: LogCategory.IMAGE,
      error: String(err),
    });
  }

  // 2. Clear pending documents
  try {
    await clearPendingDocuments(cleanPhone);
    results.push("documents cleared");
  } catch (err) {
    logger.warn("Failed to clear pending documents during reset", {
      category: LogCategory.GENERAL,
      error: String(err),
    });
  }

  // 3. Clear chat history so next listing starts with clean context
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("chat_history").delete().eq("user_id", phoneNumber);
    results.push("conversation history cleared");
  } catch (err) {
    logger.warn("Failed to clear chat history during reset", {
      category: LogCategory.DATABASE,
      error: String(err),
    });
  }

  logger.info("Upload session reset complete", {
    category: LogCategory.TOOL,
    operation: "resetUploadSession",
    results,
  });

  return {
    success: true,
    message:
      "Done! I've cleared all previous photos, documents, and conversation history. You're starting fresh — send me the details for your new property whenever you're ready.",
  };
}
