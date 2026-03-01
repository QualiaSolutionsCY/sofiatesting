import "server-only";
import { db } from "../db/client";
import { supabaseTelegramGroupMessage } from "../db/schema";
import type { TelegramMessage } from "./types";

/**
 * Index a group message in the telegram_group_messages table.
 *
 * Called from lead-router as fire-and-forget so indexing failures
 * never block lead routing.
 *
 * Phase 12, Plan 01
 */
export async function indexGroupMessage(
  message: TelegramMessage
): Promise<void> {
  const text = message.text || message.caption;
  if (!text) return;

  try {
    await db
      .insert(supabaseTelegramGroupMessage)
      .values({
        groupChatId: message.chat.id,
        groupName: message.chat.title || null,
        messageId: message.message_id,
        senderTelegramId: message.from?.id || null,
        senderName: message.from
          ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
          : null,
        messageText: text.substring(0, 5000),
        messageDate: new Date(message.date * 1000),
      })
      .onConflictDoNothing();
  } catch (error) {
    // Intentionally swallowed — indexing must not block lead routing
    console.error("Error indexing group message:", error);
  }
}
