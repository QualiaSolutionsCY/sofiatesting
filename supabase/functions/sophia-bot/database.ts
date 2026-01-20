import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetch the last 10 messages for a user, ordered chronologically (oldest to newest)
 * This is the format Gemini expects for conversation history
 */
export async function getHistory(userId: string): Promise<Array<{role: string, parts: Array<{text: string}>}>> {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, parts')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching history:", error);
    throw error;
  }

  // Reverse to get chronological order (oldest -> newest) for Gemini
  const reversed = (data || []).reverse();
  
  // Ensure parts is always an array of objects with text property
  return reversed.map(msg => ({
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
    console.error("Error adding message:", error);
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
        console.log(`Message already claimed by another request (key: ${messageKey})`);
        return false; // Don't process - it's a duplicate
      }

      // Other errors - log but allow processing (fail-open to avoid blocking messages)
      console.error("Error claiming message:", error);
      return true;
    }

    // Insert succeeded - this request should process the message
    console.log(`Successfully claimed message for processing (key: ${messageKey})`);
    return true;
  } catch (error) {
    console.error("Exception claiming message:", error);
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
      console.error("Error checking processed webhooks:", error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error("Exception checking processed webhooks:", error);
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
        console.error("Error marking message as processed:", error);
      }
    }
  } catch (error) {
    console.error("Exception marking message as processed:", error);
  }
}

