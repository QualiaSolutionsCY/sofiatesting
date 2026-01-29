import "server-only";
import { logger } from "../logger";
import type { TelegramWebhookInfo } from "./types";

const log = logger.telegram.child("client");

/**
 * Telegram Bot API Client
 * Handles all communication with Telegram Bot API
 */
export class TelegramClient {
  private readonly apiUrl: string;

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Send a text message to a Telegram chat
   */
  async sendMessage({
    chatId,
    text,
    replyToMessageId,
    parseMode,
  }: {
    chatId: number | string;
    text: string;
    replyToMessageId?: number;
    parseMode?: "Markdown" | "HTML" | "MarkdownV2";
  }): Promise<any> {
    try {
      const body: any = {
        chat_id: chatId,
        text,
      };

      // Only include parse_mode if specified (allows plain text mode)
      if (parseMode) {
        body.parse_mode = parseMode;
      }

      if (replyToMessageId) {
        body.reply_to_message_id = replyToMessageId;
      }

      const response = await fetch(`${this.apiUrl}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.ok) {
        log.error("Telegram API error", undefined, {
          description: data.description,
          errorCode: data.error_code,
          chatId,
          textLength: text.length,
        });
        throw new Error(data.description || "Failed to send message");
      }

      return data.result;
    } catch (error) {
      log.error("Error sending Telegram message", error, {
        chatId,
        textLength: text.length,
      });
      throw error;
    }
  }

  /**
   * Send typing action to show bot is processing
   */
  async sendChatAction({
    chatId,
    action = "typing",
  }: {
    chatId: number | string;
    action?: "typing" | "upload_photo" | "upload_document";
  }): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/sendChatAction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          action,
        }),
      });
    } catch (error) {
      log.error("Error sending chat action", error, { chatId, action });
    }
  }

  /**
   * Set webhook URL for receiving updates
   * @param webhookUrl - The HTTPS URL to send updates to
   * @param secretToken - Optional secret token for webhook security (recommended)
   */
  async setWebhook(webhookUrl: string, secretToken?: string): Promise<boolean> {
    try {
      const body: any = {
        url: webhookUrl,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: false,
      };

      // Add secret token if provided (recommended for security)
      if (secretToken) {
        body.secret_token = secretToken;
      }

      const response = await fetch(`${this.apiUrl}/setWebhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      return data.ok;
    } catch (error) {
      log.error("Error setting webhook", error);
      return false;
    }
  }

  /**
   * Get current webhook info
   */
  async getWebhookInfo(): Promise<TelegramWebhookInfo | null> {
    try {
      const response = await fetch(`${this.apiUrl}/getWebhookInfo`);
      const data = await response.json();

      if (data.ok) {
        return data.result;
      }
      return null;
    } catch (error) {
      log.error("Error getting webhook info", error);
      return null;
    }
  }

  /**
   * Delete webhook (for local testing)
   */
  async deleteWebhook(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/deleteWebhook`, {
        method: "POST",
      });
      const data = await response.json();
      return data.ok;
    } catch (error) {
      log.error("Error deleting webhook", error);
      return false;
    }
  }

  /**
   * Get bot information
   */
  async getMe(): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/getMe`);
      const data = await response.json();
      return data.ok ? data.result : null;
    } catch (error) {
      log.error("Error getting bot info", error);
      return null;
    }
  }

  /**
   * Forward a message from one chat to another
   * Used for lead forwarding from groups to individual agents
   */
  async forwardMessage({
    chatId,
    fromChatId,
    messageId,
  }: {
    chatId: number | string;
    fromChatId: number | string;
    messageId: number;
  }): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/forwardMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          from_chat_id: fromChatId,
          message_id: messageId,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        log.error("Telegram forwardMessage error", undefined, {
          description: data.description,
          errorCode: data.error_code,
          chatId,
          fromChatId,
          messageId,
        });
        throw new Error(data.description || "Failed to forward message");
      }

      return data.result;
    } catch (error) {
      log.error("Error forwarding Telegram message", error, {
        chatId,
        fromChatId,
        messageId,
      });
      throw error;
    }
  }

  /**
   * Get file information from Telegram servers
   * Used for downloading photos and documents
   */
  async getFile(fileId: string): Promise<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  } | null> {
    try {
      const response = await fetch(`${this.apiUrl}/getFile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: fileId,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        log.error("Telegram getFile error", undefined, {
          description: data.description,
          fileId,
        });
        return null;
      }

      return data.result;
    } catch (error) {
      log.error("Error getting file from Telegram", error, { fileId });
      return null;
    }
  }

  /**
   * Download a file from Telegram servers
   * Returns the file as a Buffer
   */
  async downloadFile(filePath: string): Promise<Buffer | null> {
    try {
      const botToken = this.apiUrl.split("/bot")[1];
      const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        log.error("Failed to download file", undefined, { status: response.statusText });
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      log.error("Error downloading file from Telegram", error);
      return null;
    }
  }

  /**
   * Get file and download it in one operation
   * Returns file buffer and metadata
   */
  async getAndDownloadFile(fileId: string): Promise<{
    buffer: Buffer;
    fileName?: string;
    mimeType?: string;
  } | null> {
    const fileInfo = await this.getFile(fileId);
    if (!fileInfo?.file_path) {
      return null;
    }

    const buffer = await this.downloadFile(fileInfo.file_path);
    if (!buffer) {
      return null;
    }

    // Extract filename from path
    const fileName = fileInfo.file_path.split("/").pop();

    return {
      buffer,
      fileName,
    };
  }

  /**
   * Get information about a chat
   * Useful for getting group info and storing group IDs
   */
  async getChat(chatId: number | string): Promise<{
    id: number;
    type: "private" | "group" | "supergroup" | "channel";
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
  } | null> {
    try {
      const response = await fetch(`${this.apiUrl}/getChat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        log.error("Telegram getChat error", undefined, {
          description: data.description,
          chatId,
        });
        return null;
      }

      return data.result;
    } catch (error) {
      log.error("Error getting chat info", error, { chatId });
      return null;
    }
  }

  /**
   * Send a long message by splitting it into chunks
   */
  async sendLongMessage({
    chatId,
    text,
    maxLength = 4096,
    replyToMessageId,
    parseMode,
  }: {
    chatId: number | string;
    text: string;
    maxLength?: number;
    replyToMessageId?: number;
    parseMode?: "Markdown" | "HTML" | "MarkdownV2";
  }): Promise<void> {
    if (text.length <= maxLength) {
      await this.sendMessage({ chatId, text, replyToMessageId, parseMode });
      return;
    }

    // Split by paragraphs first to keep formatting
    const paragraphs = text.split("\n\n");
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 > maxLength) {
        // Send current chunk
        if (currentChunk) {
          await this.sendMessage({
            chatId,
            text: currentChunk.trim(),
            replyToMessageId,
            parseMode,
          });
          currentChunk = "";
        }

        // If single paragraph is too long, split by sentences
        if (paragraph.length > maxLength) {
          const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
          for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > maxLength) {
              if (currentChunk) {
                await this.sendMessage({
                  chatId,
                  text: currentChunk.trim(),
                  replyToMessageId,
                  parseMode,
                });
              }
              currentChunk = sentence;
            } else {
              currentChunk += sentence;
            }
          }
        } else {
          currentChunk = paragraph;
        }
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      }
    }

    // Send remaining chunk
    if (currentChunk) {
      await this.sendMessage({
        chatId,
        text: currentChunk.trim(),
        replyToMessageId,
        parseMode,
      });
    }
  }
}

// Singleton instance
let telegramClientInstance: TelegramClient | null = null;

export function getTelegramClient(): TelegramClient {
  if (!telegramClientInstance) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN environment variable is not set. Get your token from @BotFather on Telegram."
      );
    }
    telegramClientInstance = new TelegramClient(botToken);
  }
  return telegramClientInstance;
}
