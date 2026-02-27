import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  type SQL,
} from "drizzle-orm";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatSDKError } from "../errors";
import { logger } from "../logger";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import { db } from "./client";

const log = logger.db;
import {
  chat,
  type DBMessage,
  document,
  type InferInsertModel,
  landListing,
  listingUploadAttempt,
  message,
  propertyListing,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    log.error("Failed to get user by email", error, { email });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    log.error("Failed to create user", error, { email });
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    log.error("Failed to create guest user", error, { email });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    log.error("Failed to save chat", error, { chatId: id, userId });
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    // CASCADE delete handles vote, message, and stream deletion automatically
    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    log.error("Failed to delete chat by id", error, { chatId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    // CASCADE delete handles vote, message, and stream deletion automatically
    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (error) {
    log.error("Failed to delete all chats by user id", error, { userId });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    // Build WHERE conditions (combine all into single where() call)
    const conditions: SQL<any>[] = [eq(chat.userId, id)];

    // Use subquery for cursor-based pagination (single query instead of two)
    if (startingAfter) {
      conditions.push(
        gt(
          chat.createdAt,
          db
            .select({ createdAt: chat.createdAt })
            .from(chat)
            .where(eq(chat.id, startingAfter))
            .limit(1) as any
        )
      );
    } else if (endingBefore) {
      conditions.push(
        lt(
          chat.createdAt,
          db
            .select({ createdAt: chat.createdAt })
            .from(chat)
            .where(eq(chat.id, endingBefore))
            .limit(1) as any
        )
      );
    }

    // Execute single optimized query with combined conditions
    const filteredChats = await db
      .select()
      .from(chat)
      .where(and(...conditions))
      .orderBy(desc(chat.createdAt))
      .limit(extendedLimit);

    // If cursor was provided but no results, the cursor ID doesn't exist
    if ((startingAfter || endingBefore) && filteredChats.length === 0) {
      const cursorId = (startingAfter || endingBefore) as string;
      throw new ChatSDKError(
        "not_found:database",
        `Chat with id ${cursorId} not found`
      );
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    log.error("Failed to get chats by user id", error, { userId: id, limit });
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to get chats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (error) {
    log.error("Failed to get chat by id", error, { chatId: id });
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    log.error("Failed to save messages", error, { count: messages.length });
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    log.error("Failed to get messages by chat id", error, { chatId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

/**
 * Get messages from the last N days for a chat
 * Used by WhatsApp and Telegram handlers to provide conversation history context
 */
export async function getMessagesByChatIdWithHistory({
  id,
  days = 30,
}: {
  id: string;
  days?: number;
}) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return await db
      .select()
      .from(message)
      .where(and(eq(message.chatId, id), gte(message.createdAt, cutoffDate)))
      .orderBy(asc(message.createdAt))
      .limit(200);
  } catch (error) {
    log.error("Failed to get messages with history", error, { chatId: id, days });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages with history"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (error) {
    log.error("Failed to vote message", error, { chatId, messageId, type });
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    log.error("Failed to get votes by chat id", error, { chatId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    log.error("Failed to save document", error, { documentId: id, userId, kind });
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    log.error("Failed to get documents by id", error, { documentId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    log.error("Failed to get document by id", error, { documentId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    log.error("Failed to delete documents by id after timestamp", error, {
      documentId: id,
      timestamp: timestamp.toISOString(),
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    log.error("Failed to save suggestions", error, { count: suggestions.length });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    log.error("Failed to get suggestions by document id", error, { documentId });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    log.error("Failed to get message by id", error, { messageId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (error) {
    log.error("Failed to delete messages by chat id after timestamp", error, {
      chatId,
      timestamp: timestamp.toISOString(),
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    log.error("Failed to update chat visibility by id", error, { chatId, visibility });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store merged server-enriched usage object
  context: AppUsage;
}) {
  try {
    return await db
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    log.warn("Failed to update lastContext for chat", { chatId, error: String(error) });
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    log.error("Failed to get message count by user id", error, {
      userId: id,
      differenceInHours,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    log.error("Failed to create stream id", error, { streamId, chatId });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    log.error("Failed to get stream ids by chat id", error, { chatId });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// Property Listing Management Functions
export async function createPropertyListing(
  data: InferInsertModel<typeof propertyListing>
) {
  try {
    const [listing] = await db.insert(propertyListing).values(data).returning();
    return listing;
  } catch (error) {
    log.error("Failed to create property listing", error, {
      userId: data.userId,
      chatId: data.chatId,
      name: data.name,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create property listing"
    );
  }
}

export async function getListingById({ id }: { id: string }) {
  try {
    const [listing] = await db
      .select()
      .from(propertyListing)
      .where(
        and(eq(propertyListing.id, id), isNull(propertyListing.deletedAt))
      );

    return listing;
  } catch (error) {
    log.error("Failed to get listing by id", error, { listingId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get listing by id"
    );
  }
}

export async function getListingsByUserId({
  userId,
  limit = 10,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(propertyListing)
      .where(
        and(
          eq(propertyListing.userId, userId),
          isNull(propertyListing.deletedAt)
        )
      )
      .orderBy(desc(propertyListing.createdAt))
      .limit(limit);
  } catch (error) {
    log.error("Failed to get listings by user id", error, { userId, limit });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get listings by user id"
    );
  }
}

export async function updateListingStatus({
  id,
  status,
  zyprusListingId,
  zyprusListingUrl,
  publishedAt,
}: {
  id: string;
  status: string;
  zyprusListingId?: string;
  zyprusListingUrl?: string;
  publishedAt?: Date;
}) {
  try {
    await db
      .update(propertyListing)
      .set({
        status,
        zyprusListingId,
        zyprusListingUrl,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(propertyListing.id, id));
  } catch (error) {
    log.error("Failed to update listing status", error, {
      listingId: id,
      status,
      zyprusListingId,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update listing status"
    );
  }
}

export async function logListingUploadAttempt(data: {
  listingId: string;
  attemptNumber: number;
  status: string;
  errorMessage?: string;
  errorCode?: string;
  apiResponse?: any;
  durationMs?: number;
}) {
  try {
    await db.insert(listingUploadAttempt).values({
      id: generateUUID(),
      listingId: data.listingId,
      attemptNumber: data.attemptNumber,
      status: data.status,
      errorMessage: data.errorMessage,
      errorCode: data.errorCode,
      apiResponse: data.apiResponse,
      attemptedAt: new Date(),
      completedAt: new Date(),
      durationMs: data.durationMs,
    });
  } catch (error) {
    log.error("Failed to log upload attempt", error, {
      listingId: data.listingId,
      attemptNumber: data.attemptNumber,
      status: data.status,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to log upload attempt"
    );
  }
}

// ===================================================================
// LAND LISTING MANAGEMENT FUNCTIONS
// ===================================================================

export async function createLandListing(
  data: InferInsertModel<typeof landListing>
) {
  try {
    const [listing] = await db.insert(landListing).values(data).returning();
    return listing;
  } catch (error) {
    log.error("Failed to create land listing", error, {
      userId: data.userId,
      chatId: data.chatId,
      name: data.name,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create land listing"
    );
  }
}

export async function getLandListingById({ id }: { id: string }) {
  try {
    const [listing] = await db
      .select()
      .from(landListing)
      .where(and(eq(landListing.id, id), isNull(landListing.deletedAt)));

    return listing;
  } catch (error) {
    log.error("Failed to get land listing by id", error, { listingId: id });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get land listing by id"
    );
  }
}

export async function getLandListingsByUserId({
  userId,
  limit = 10,
}: {
  userId: string;
  limit?: number;
}) {
  try {
    return await db
      .select()
      .from(landListing)
      .where(and(eq(landListing.userId, userId), isNull(landListing.deletedAt)))
      .orderBy(desc(landListing.createdAt))
      .limit(limit);
  } catch (error) {
    log.error("Failed to get land listings by user id", error, { userId, limit });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get land listings by user id"
    );
  }
}

export async function updateLandListingStatus({
  id,
  status,
  zyprusListingId,
  zyprusListingUrl,
  publishedAt,
}: {
  id: string;
  status: string;
  zyprusListingId?: string;
  zyprusListingUrl?: string;
  publishedAt?: Date;
}) {
  try {
    await db
      .update(landListing)
      .set({
        status,
        zyprusListingId,
        zyprusListingUrl,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(landListing.id, id));
  } catch (error) {
    log.error("Failed to update land listing status", error, {
      listingId: id,
      status,
      zyprusListingId,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update land listing status"
    );
  }
}

/**
 * Update listing duplicate detection status and AI notes
 * Used to flag potential duplicates after checkForDuplicates()
 */
export async function updateListingDuplicateStatus({
  id,
  duplicateDetected,
  propertyNotes,
  type = "property",
}: {
  id: string;
  duplicateDetected: boolean;
  propertyNotes?: string;
  type?: "property" | "land";
}) {
  try {
    if (type === "land") {
      await db
        .update(landListing)
        .set({
          duplicateDetected,
          notes: propertyNotes,
          updatedAt: new Date(),
        })
        .where(eq(landListing.id, id));
    } else {
      await db
        .update(propertyListing)
        .set({
          duplicateDetected,
          propertyNotes,
          updatedAt: new Date(),
        })
        .where(eq(propertyListing.id, id));
    }
  } catch (error) {
    log.error("Failed to update listing duplicate status", error, {
      listingId: id,
      duplicateDetected,
      type,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update listing duplicate status"
    );
  }
}
