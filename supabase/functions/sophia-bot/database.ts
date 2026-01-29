import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "./utils/logger.ts";

// Validate required environment variables at module load time
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is required but not set");
}

if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is required but not set");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetch the last 10 messages for a user, ordered chronologically (oldest to newest)
 * This is the format Gemini expects for conversation history
 *
 * Uses a subquery pattern: get the 10 most recent, then order by oldest first
 */
export async function getHistory(userId: string): Promise<Array<{role: string, parts: Array<{text: string}>}>> {
  // First get the 10 most recent messages (descending), then we'll process them
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, parts, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logger.error("Error fetching history", error as Error, { category: LogCategory.DATABASE, operation: "getHistory" });
    throw error;
  }

  // Sort by created_at ascending (oldest first) for Gemini's expected format
  // This is more efficient than reverse() as it doesn't allocate a new array
  const messages = data || [];
  messages.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeA - timeB;
  });

  // Ensure parts is always an array of objects with text property
  return messages.map(msg => ({
    role: msg.role,
    parts: Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg.parts) }]
  }));
}

/**
 * Insert a new message into chat_history
 */
export async function addMessage(userId: string, role: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('chat_history')
    .insert([{
      user_id: userId,
      role: role, // 'user' or 'model'
      parts: [{ text: text }]
    }]);

  if (error) {
    logger.error("Error adding message", error as Error, { category: LogCategory.DATABASE, operation: "addMessage" });
    throw error;
  }
}

/**
 * Attempts to claim a message for processing using atomic INSERT.
 * Returns true if this request should process the message.
 * Returns false if another request already claimed it (duplicate).
 *
 * This uses the database's unique constraint to handle race conditions:
 * - First INSERT succeeds -> this request processes the message
 * - Subsequent INSERTs fail with 23505 -> duplicates, skip processing
 */
export async function claimMessageForProcessing(messageKey: string, phoneNumber: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('processed_webhooks')
      .insert([{
        message_key: messageKey,
        phone_number: phoneNumber
      }]);

    if (error) {
      // Unique constraint violation (23505) = another request already claimed this message
      if (error.code === '23505') {
        logger.debug("Message already claimed by another request", { category: LogCategory.DATABASE, operation: "claimMessage", messageKey });
        return false; // Don't process - it's a duplicate
      }

      // Other errors - log but allow processing (fail-open to avoid blocking messages)
      logger.error("Error claiming message", error as Error, { category: LogCategory.DATABASE, operation: "claimMessage" });
      return true;
    }

    // Insert succeeded - this request should process the message
    logger.debug("Successfully claimed message for processing", { category: LogCategory.DATABASE, operation: "claimMessage", messageKey });
    return true;
  } catch (err) {
    logger.error("Exception claiming message", err as Error, { category: LogCategory.DATABASE, operation: "claimMessage" });
    // On exception, allow processing (fail-open)
    return true;
  }
}

/**
 * @deprecated Use claimMessageForProcessing() instead for race-condition-safe deduplication
 */
export async function isMessageProcessed(messageKey: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('processed_webhooks')
      .select('id')
      .eq('message_key', messageKey)
      .limit(1);

    if (error) {
      logger.error("Error checking processed webhooks", error as Error, { category: LogCategory.DATABASE, operation: "isMessageProcessed" });
      return false;
    }

    return data && data.length > 0;
  } catch (err) {
    logger.error("Exception checking processed webhooks", err as Error, { category: LogCategory.DATABASE, operation: "isMessageProcessed" });
    return false;
  }
}

/**
 * @deprecated Use claimMessageForProcessing() instead for race-condition-safe deduplication
 */
export async function markMessageProcessed(messageKey: string, phoneNumber: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('processed_webhooks')
      .insert([{
        message_key: messageKey,
        phone_number: phoneNumber
      }]);

    if (error) {
      if (error.code !== '23505') {
        logger.error("Error marking message as processed", error as Error, { category: LogCategory.DATABASE, operation: "markMessageProcessed" });
      }
    }
  } catch (err) {
    logger.error("Exception marking message as processed", err as Error, { category: LogCategory.DATABASE, operation: "markMessageProcessed" });
  }
}

