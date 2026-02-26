/**
 * Deno-compatible Telegram Bot API Client
 *
 * Minimal client for Edge Functions (sophia-bot, call-auditor, etc.).
 * Ported from lib/telegram/client.ts — no Node.js deps (no Buffer, no "server-only").
 *
 * Phase 12, Plan 01
 */

import { logger, LogCategory } from "../sophia-bot/utils/logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendMessageParams {
  chatId: number | string;
  text: string;
  replyToMessageId?: number;
  parseMode?: "Markdown" | "HTML" | "MarkdownV2";
}

export interface ChatInfo {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TelegramBotClient {
  private readonly apiUrl: string;

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    this.apiUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Send a text message to a Telegram chat.
   */
  async sendMessage({
    chatId,
    text,
    replyToMessageId,
    parseMode,
  }: SendMessageParams): Promise<unknown> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }

    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
    }

    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      logger.error("Telegram sendMessage error", new Error(data.description ?? "Unknown error"), {
        category: LogCategory.EXTERNAL_API,
        chatId: String(chatId),
        errorCode: data.error_code,
      });
      throw new Error(data.description || "Failed to send message");
    }

    return data.result;
  }

  /**
   * Get information about a chat (group, supergroup, private, or channel).
   */
  async getChat(chatId: number | string): Promise<ChatInfo | null> {
    try {
      const response = await fetch(`${this.apiUrl}/getChat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      });

      const data = await response.json();

      if (!data.ok) {
        logger.error("Telegram getChat error", new Error(data.description ?? "Unknown error"), {
          category: LogCategory.EXTERNAL_API,
          chatId: String(chatId),
        });
        return null;
      }

      return data.result as ChatInfo;
    } catch (error) {
      logger.error(
        "Error getting chat info",
        error instanceof Error ? error : new Error(String(error)),
        { category: LogCategory.EXTERNAL_API, chatId: String(chatId) },
      );
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: TelegramBotClient | null = null;

/**
 * Get the singleton Telegram bot client.
 * Reads TELEGRAM_BOT_TOKEN from Deno.env on first call.
 */
export function getTelegramBot(): TelegramBotClient {
  if (!_instance) {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!token) {
      throw new Error(
        "TELEGRAM_BOT_TOKEN env var is not set. Get your token from @BotFather on Telegram.",
      );
    }
    _instance = new TelegramBotClient(token);
  }
  return _instance;
}
