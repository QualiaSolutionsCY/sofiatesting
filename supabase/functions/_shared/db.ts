/**
 * Shared Database Client & Operations
 *
 * Singleton Supabase client for all Edge Functions.
 * Includes chat history and message deduplication operations.
 */

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { LogCategory, logger } from "../sophia-bot/utils/logger.ts";
import { withRetry } from "../sophia-bot/utils/retry.ts";
import type { ChatMessage } from "./adapters/types.ts";

// Singleton client
let _client: SupabaseClient | null = null;

/**
 * Get the shared Supabase admin client (singleton)
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  if (!_client) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    _client = createClient(supabaseUrl, supabaseKey);
  }
  return _client;
};

/**
 * Fetch the last 10 messages for a user, ordered chronologically (oldest to newest)
 * This is the format Gemini expects for conversation history
 */
export const getHistory = async (userId: string): Promise<ChatMessage[]> => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await withRetry(
    async () => {
      const result = await supabase
        .from("chat_history")
        .select("role, parts")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (result.error) throw result.error;
      return result;
    },
    { maxRetries: 2, baseDelayMs: 200 },
    "getHistory"
  );

  if (error) {
    logger.error("Error fetching history", error, {
      category: LogCategory.DATABASE,
      operation: "getHistory",
    });
    throw error;
  }

  // Reverse to get chronological order (oldest -> newest) for Gemini
  const reversed = (data || []).reverse();

  // Ensure parts is always an array of objects with text property
  return reversed.map((msg) => ({
    role: msg.role as "user" | "model",
    parts: Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg.parts) }],
  }));
};

/**
 * Insert a new message into chat_history
 */
export const addMessage = async (
  userId: string,
  role: "user" | "model",
  text: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const { error } = await withRetry(
    async () => {
      const result = await supabase.from("chat_history").insert([
        {
          user_id: userId,
          role,
          parts: [{ text }],
        },
      ]);
      if (result.error) throw result.error;
      return result;
    },
    { maxRetries: 2, baseDelayMs: 200 },
    "addMessage"
  );

  if (error) {
    logger.error("Error adding message", error, {
      category: LogCategory.DATABASE,
      operation: "addMessage",
    });
    throw error;
  }
};

/**
 * Attempts to claim a message for processing using atomic INSERT.
 * Returns true if this request should process the message.
 * Returns false if another request already claimed it (duplicate).
 *
 * This uses the database's unique constraint to handle race conditions:
 * - First INSERT succeeds -> this request processes the message
 * - Subsequent INSERTs fail with 23505 -> duplicates, skip processing
 */
export const claimMessageForProcessing = async (
  messageKey: string,
  phoneNumber: string
): Promise<boolean> => {
  const supabase = getSupabaseAdmin();

  try {
    const { error } = await supabase.from("processed_webhooks").insert([
      {
        message_key: messageKey,
        phone_number: phoneNumber,
      },
    ]);

    if (error) {
      // Unique constraint violation (23505) = another request already claimed this message
      if (error.code === "23505") {
        logger.info("Message already claimed by another request", {
          category: LogCategory.DATABASE,
          operation: "claimMessageForProcessing",
          messageKey,
        });
        return false; // Don't process - it's a duplicate
      }

      // Other errors - log but allow processing (fail-open to avoid blocking messages)
      logger.error("Error claiming message", error, {
        category: LogCategory.DATABASE,
        operation: "claimMessageForProcessing",
        messageKey,
      });
      return true;
    }

    // Insert succeeded - this request should process the message
    logger.info("Successfully claimed message for processing", {
      category: LogCategory.DATABASE,
      operation: "claimMessageForProcessing",
      messageKey,
    });
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception claiming message", err, {
      category: LogCategory.DATABASE,
      operation: "claimMessageForProcessing",
      messageKey,
    });
    // On exception, allow processing (fail-open)
    return true;
  }
};

/**
 * @deprecated Use claimMessageForProcessing() instead for race-condition-safe deduplication
 */
export const isMessageProcessed = async (
  messageKey: string
): Promise<boolean> => {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from("processed_webhooks")
      .select("id")
      .eq("message_key", messageKey)
      .limit(1);

    if (error) {
      logger.error("Error checking processed webhooks", error, {
        category: LogCategory.DATABASE,
        operation: "isMessageProcessed",
        messageKey,
      });
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception checking processed webhooks", err, {
      category: LogCategory.DATABASE,
      operation: "isMessageProcessed",
      messageKey,
    });
    return false;
  }
};

/**
 * @deprecated Use claimMessageForProcessing() instead for race-condition-safe deduplication
 */
export const markMessageProcessed = async (
  messageKey: string,
  phoneNumber: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  try {
    const { error } = await supabase.from("processed_webhooks").insert([
      {
        message_key: messageKey,
        phone_number: phoneNumber,
      },
    ]);

    if (error && error.code !== "23505") {
      logger.error("Error marking message as processed", error, {
        category: LogCategory.DATABASE,
        operation: "markMessageProcessed",
        messageKey,
      });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Exception marking message as processed", err, {
      category: LogCategory.DATABASE,
      operation: "markMessageProcessed",
      messageKey,
    });
  }
};

// =====================================================
// Document Tracking for Email Attachments
// =====================================================

export interface LastDocument {
  document_url: string;
  document_name: string;
  document_type: string | null;
  created_at: string;
}

/**
 * Save a generated document URL for later email attachment
 */
export const saveLastDocument = async (
  userId: string,
  documentUrl: string,
  documentName: string,
  documentType?: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  // Delete old documents for this user (keep only recent ones)
  await supabase
    .from("last_documents")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Older than 24h

  // Insert new document
  const { error } = await supabase.from("last_documents").insert([
    {
      user_id: userId,
      document_url: documentUrl,
      document_name: documentName,
      document_type: documentType || null,
    },
  ]);

  if (error) {
    logger.error("Error saving last document", error, {
      category: LogCategory.DATABASE,
      operation: "saveLastDocument",
      documentName,
    });
  } else {
    logger.info("Saved document for user", {
      category: LogCategory.DATABASE,
      operation: "saveLastDocument",
      documentName,
    });
  }
};

/**
 * Get the most recent document for a user (for email attachment)
 */
export const getLastDocument = async (
  userId: string
): Promise<LastDocument | null> => {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("last_documents")
    .select("document_url, document_name, document_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as LastDocument;
};

/**
 * Clear document after successful email send
 */
export const clearLastDocument = async (userId: string): Promise<void> => {
  const supabase = getSupabaseAdmin();

  await supabase.from("last_documents").delete().eq("user_id", userId);

  logger.info("Cleared documents for user", {
    category: LogCategory.DATABASE,
    operation: "clearLastDocument",
  });
};

// =====================================================
// Listing Upload Tracking (for publication notifications)
// =====================================================

/**
 * Track a successfully uploaded listing for later notification when published.
 * Table: listing_uploads (see SQL at bottom of this file)
 */
export const trackListingUpload = async (
  zyprusListingId: string,
  agentPhone: string,
  agentName: string,
  propertyTitle: string,
  listingUrl: string
): Promise<void> => {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("listing_uploads").insert([
    {
      zyprus_listing_id: zyprusListingId,
      agent_phone: agentPhone,
      agent_name: agentName,
      property_title: propertyTitle,
      listing_url: listingUrl,
      status: "draft",
    },
  ]);

  if (error) {
    // Non-critical — don't fail the upload over tracking
    logger.error("Error tracking listing upload", error, {
      category: LogCategory.DATABASE,
      operation: "trackListingUpload",
      zyprusListingId,
    });
  }
};

/**
 * Get all draft listings that haven't been checked recently.
 * Used by the polling function to avoid hammering the API.
 */
export const getPendingListingUploads = async (): Promise<
  Array<{
    id: string;
    zyprus_listing_id: string;
    agent_phone: string;
    agent_name: string;
    property_title: string;
    listing_url: string;
    created_at: string;
  }>
> => {
  const supabase = getSupabaseAdmin();

  // Only check listings that are still "draft" and were uploaded at least 5 min ago
  // (gives reviewer time to publish before we start polling)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("listing_uploads")
    .select(
      "id, zyprus_listing_id, agent_phone, agent_name, property_title, listing_url, created_at"
    )
    .eq("status", "draft")
    .lt("created_at", fiveMinAgo)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data;
};

/**
 * Mark a listing as published (notification sent).
 */
export const markListingPublished = async (id: string): Promise<void> => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("listing_uploads")
    .update({ status: "published", notified_at: new Date().toISOString() })
    .eq("id", id);
};

/**
 * Mark a listing as expired (still draft after 30 days — stop checking).
 */
export const markListingExpired = async (id: string): Promise<void> => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("listing_uploads")
    .update({ status: "expired" })
    .eq("id", id);
};

/*
 * SQL to create the listing_uploads table:
 *
 * CREATE TABLE IF NOT EXISTS listing_uploads (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   zyprus_listing_id TEXT NOT NULL,
 *   agent_phone TEXT NOT NULL,
 *   agent_name TEXT NOT NULL,
 *   property_title TEXT NOT NULL,
 *   listing_url TEXT NOT NULL,
 *   status TEXT NOT NULL DEFAULT 'draft',  -- draft, published, expired
 *   notified_at TIMESTAMPTZ,
 *   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   UNIQUE(zyprus_listing_id)
 * );
 *
 * CREATE INDEX idx_listing_uploads_status ON listing_uploads(status);
 * CREATE INDEX idx_listing_uploads_created ON listing_uploads(created_at);
 */
