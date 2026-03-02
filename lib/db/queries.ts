import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
} from "drizzle-orm";
import { ChatSDKError } from "../errors";
import { logger } from "../logger";
import { generateUUID } from "../utils";
import { db } from "./client";

const log = logger.db;

import {
  chat,
  type DBMessage,
  type InferInsertModel,
  landListing,
  listingUploadAttempt,
  message,
  propertyListing,
  type User,
  user,
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

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat ?? null;
  } catch (error) {
    log.error("Failed to get chat by id", error, { chatId: id });
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
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
  visibility: "private" | "public";
}) {
  try {
    return await db
      .insert(chat)
      .values({
        id,
        createdAt: new Date(),
        userId,
        title,
        visibility,
      })
      .onConflictDoNothing();
  } catch (error) {
    log.error("Failed to save chat", error, { chatId: id, userId });
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
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
    log.error("Failed to get messages with history", error, {
      chatId: id,
      days,
    });
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages with history"
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
    log.error("Failed to get land listings by user id", error, {
      userId,
      limit,
    });
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
