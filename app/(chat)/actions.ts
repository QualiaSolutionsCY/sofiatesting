"use server";

import { generateText, type UIMessage } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { myProvider } from "@/lib/ai/providers";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatByIdForUser,
  getMessageById,
  updateChatVisiblityById,
} from "@/lib/db/queries";
import { createLogger } from "@/lib/logger";

const logger = createLogger("chat:actions");

// Zod schemas for server action input validation
const titleMessageSchema = z.object({
  message: z.custom<UIMessage>((val) => {
    // UIMessage is already typed by AI SDK, just validate it exists
    return val !== null && val !== undefined && typeof val === "object";
  }, "Invalid message format"),
});

const messageIdSchema = z.object({
  id: z.string().uuid("Invalid message ID format"),
});

const chatVisibilitySchema = z.object({
  chatId: z.string().uuid("Invalid chat ID format"),
  visibility: z.enum(["public", "private"] as const),
});

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { message: validatedMessage } = titleMessageSchema.parse({ message });

  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized: Please sign in to generate title");
  }

  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(validatedMessage),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const { id: validatedId } = messageIdSchema.parse({ id });

  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized: Please sign in to delete messages");
  }

  const [message] = await getMessageById({ id: validatedId });

  if (!message) {
    logger.warn("deleteTrailingMessages - Message not found", {
      messageId: validatedId,
    });
    return;
  }

  // Verify user owns the chat this message belongs to
  const [ownedChat] = await getChatByIdForUser({
    chatId: message.chatId,
    userId: session.user.id,
  });

  if (!ownedChat) {
    throw new Error(
      "Forbidden: You don't have permission to delete these messages"
    );
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const { chatId: validatedChatId, visibility: validatedVisibility } =
    chatVisibilitySchema.parse({ chatId, visibility });

  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized: Please sign in to update chat visibility");
  }

  // Verify user owns this chat
  const [ownedChat] = await getChatByIdForUser({
    chatId: validatedChatId,
    userId: session.user.id,
  });

  if (!ownedChat) {
    throw new Error("Forbidden: You don't have permission to modify this chat");
  }

  await updateChatVisiblityById({
    chatId: validatedChatId,
    visibility: validatedVisibility,
  });
}
