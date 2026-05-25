/**
 * Telegram Bot API Client for Deno/Supabase Edge Functions
 * Handles communication with Telegram Bot API
 */

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Send a text message to a Telegram chat
 */
export const sendMessage = async (
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<boolean> => {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };

    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
    }

    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Telegram] sendMessage error:", data.description);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Telegram] sendMessage exception:", error);
    return false;
  }
};

/**
 * Send typing indicator to show bot is processing
 */
export const sendChatAction = async (
  chatId: number,
  action: "typing" | "upload_document" = "typing"
): Promise<void> => {
  try {
    await fetch(`${TELEGRAM_API_URL}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (error) {
    // Silently fail - typing indicator is not critical
    console.error("[Telegram] sendChatAction error:", error);
  }
};

/**
 * Split long messages and send them sequentially
 * Telegram max message length is 4096 characters
 */
export const sendLongMessage = async (
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<boolean> => {
  const MAX_LENGTH = 4096;

  if (text.length <= MAX_LENGTH) {
    return sendMessage(chatId, text, replyToMessageId);
  }

  // Split by paragraphs first
  const chunks = splitMessage(text, MAX_LENGTH);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Only reply to original message for first chunk
    const replyId = i === 0 ? replyToMessageId : undefined;

    const success = await sendMessage(chatId, chunk, replyId);
    if (!success) {
      console.error(
        `[Telegram] Failed to send chunk ${i + 1}/${chunks.length}`
      );
      return false;
    }

    // Small delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return true;
};

/**
 * Split text into chunks, preserving paragraph structure
 */
const splitMessage = (text: string, maxLength: number): string[] => {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = "";

  // First try to split by double newlines (paragraphs)
  const paragraphs = text.split("\n\n");

  for (const paragraph of paragraphs) {
    // If single paragraph is too long, split by sentences
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }

      // Split long paragraph by sentences
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      for (const sentence of sentences) {
        if ((current + sentence).length > maxLength) {
          if (current) chunks.push(current.trim());
          // If single sentence is still too long, force split
          if (sentence.length > maxLength) {
            chunks.push(...forceSplit(sentence, maxLength));
            current = "";
          } else {
            current = sentence;
          }
        } else {
          current += sentence;
        }
      }
    } else if ((current + "\n\n" + paragraph).length > maxLength) {
      // Paragraph fits, but adding it would exceed limit
      if (current) chunks.push(current.trim());
      current = paragraph;
    } else {
      // Add paragraph to current chunk
      current += (current ? "\n\n" : "") + paragraph;
    }
  }

  if (current) chunks.push(current.trim());

  return chunks.filter((c) => c.length > 0);
};

/**
 * Force split text at maxLength boundaries
 * Used as last resort for very long unbreakable text
 */
const forceSplit = (text: string, maxLength: number): string[] => {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Try to find a space to break at
    let breakPoint = remaining.lastIndexOf(" ", maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = maxLength;
    }
    chunks.push(remaining.substring(0, breakPoint).trim());
    remaining = remaining.substring(breakPoint).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

// ==========================================
// LEAD FORWARDING FUNCTIONS
// ==========================================

/**
 * Forward a message from one chat to another
 * Used to forward lead messages to agents
 * @returns The forwarded message ID if successful, null otherwise
 */
export const forwardMessage = async (
  chatId: number,
  fromChatId: number,
  messageId: number
): Promise<number | null> => {
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/forwardMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        from_chat_id: fromChatId,
        message_id: messageId,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Telegram] forwardMessage error:", data.description);
      return null;
    }

    // Return the new message ID in the destination chat
    return data.result?.message_id || null;
  } catch (error) {
    console.error("[Telegram] forwardMessage exception:", error);
    return null;
  }
};

/**
 * Send a message with reply markup (for context when forwarding leads)
 */
export const sendMessageWithContext = async (
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<number | null> => {
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };

    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
    }

    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error(
        "[Telegram] sendMessageWithContext error:",
        data.description
      );
      return null;
    }

    return data.result?.message_id || null;
  } catch (error) {
    console.error("[Telegram] sendMessageWithContext exception:", error);
    return null;
  }
};
