/**
 * Telegram Channel Adapter
 *
 * Normalizes Telegram webhook payloads into UnifiedMessage format.
 * Handles sending responses back via Telegram Bot API.
 */

import type { UnifiedMessage, UnifiedResponse } from "./types.ts";

/**
 * Telegram Update structure (simplified)
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
  };
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

/**
 * Parse Telegram update into UnifiedMessage
 */
export const parseTelegramMessage = async (
  update: TelegramUpdate,
  botToken: string
): Promise<UnifiedMessage | null> => {
  const msg = update.message || update.edited_message;

  if (!msg) {
    return null;
  }

  // Get phone number from contact or use Telegram user ID as fallback
  let senderPhone = msg.from?.id?.toString() || "";
  if (msg.contact?.phone_number) {
    senderPhone = msg.contact.phone_number.replace(/[^0-9]/g, "");
  }

  // Build sender name
  const senderName = [msg.from?.first_name, msg.from?.last_name]
    .filter(Boolean)
    .join(" ") || msg.from?.username;

  // Build unified message
  const message: UnifiedMessage = {
    channelType: "telegram",
    senderPhone,
    senderName,
    timestamp: new Date(msg.date * 1000),
    conversationId: msg.chat.id.toString(),
    replyToMessageId: msg.reply_to_message?.message_id?.toString(),
  };

  // Handle text
  message.text = msg.text || msg.caption;

  // Handle photos (get largest size)
  if (msg.photo && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];
    const fileUrl = await getTelegramFileUrl(largestPhoto.file_id, botToken);
    if (fileUrl) {
      message.images = [{
        url: fileUrl,
        caption: msg.caption,
      }];
    }
  }

  // Handle documents
  if (msg.document) {
    const fileUrl = await getTelegramFileUrl(msg.document.file_id, botToken);
    if (fileUrl) {
      message.documents = [{
        url: fileUrl,
        filename: msg.document.file_name || "document",
        mimetype: msg.document.mime_type,
      }];
    }
  }

  return message;
};

/**
 * Get file URL from Telegram file_id
 */
export const getTelegramFileUrl = async (
  fileId: string,
  botToken: string
): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );

    if (!response.ok) {
      console.error("[Telegram] Failed to get file:", await response.text());
      return null;
    }

    const data = await response.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
    }

    return null;
  } catch (error) {
    console.error("[Telegram] Error getting file URL:", error);
    return null;
  }
};

/**
 * Generate unique message key for deduplication
 */
export const getTelegramMessageKey = (update: TelegramUpdate): string => {
  const msg = update.message || update.edited_message;
  if (!msg) {
    return `tg_${update.update_id}`;
  }
  return `tg_${msg.chat.id}_${msg.message_id}_${msg.date}`;
};

/**
 * Send text message via Telegram Bot API
 */
export const sendTelegramText = async (
  chatId: string | number,
  text: string,
  botToken: string,
  parseMode: "HTML" | "Markdown" | "MarkdownV2" = "HTML"
): Promise<boolean> => {
  try {
    // Split long messages (Telegram limit is 4096 characters)
    const chunks = splitTelegramMessage(text, 4000);

    for (const chunk of chunks) {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: parseMode,
          }),
        }
      );

      if (!response.ok) {
        console.error("[Telegram] Failed to send message:", await response.text());
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("[Telegram] Error sending message:", error);
    return false;
  }
};

/**
 * Send document via Telegram Bot API
 */
export const sendTelegramDocument = async (
  chatId: string | number,
  document: NonNullable<UnifiedResponse["document"]>,
  botToken: string,
  caption?: string
): Promise<boolean> => {
  try {
    // Convert ArrayBuffer to Blob for FormData
    const blob = new Blob([document.buffer], {
      type: document.mimetype || "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("chat_id", chatId.toString());
    formData.append("document", blob, document.filename);
    if (caption) {
      formData.append("caption", caption);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      console.error("[Telegram] Failed to send document:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Telegram] Error sending document:", error);
    return false;
  }
};

/**
 * Send typing indicator
 */
export const sendTelegramTyping = async (
  chatId: string | number,
  botToken: string
): Promise<void> => {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action: "typing",
      }),
    });
  } catch {
    // Ignore typing indicator errors
  }
};

/**
 * Send unified response via Telegram
 */
export const sendTelegramResponse = async (
  chatId: string | number,
  response: UnifiedResponse,
  botToken: string
): Promise<boolean> => {
  let success = true;

  // Send text if present
  if (response.text) {
    success = await sendTelegramText(chatId, response.text, botToken) && success;
  }

  // Send document if present
  if (response.document) {
    success = await sendTelegramDocument(chatId, response.document, botToken) && success;
  }

  return success;
};

/**
 * Split long message into chunks for Telegram
 */
const splitTelegramMessage = (text: string, maxLength: number): string[] => {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at newline
    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good newline, split at space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // No good space, force split
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
};
