import "server-only";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { user } from "../db/schema";
import { generateHashedPassword } from "../db/utils";
import { logger } from "../logger";
import { generateUUID } from "../utils";
import type { TelegramUser } from "./types";

const log = logger.telegram.child("user-mapping");

/**
 * Map Telegram user to database user
 * Creates a user if they don't exist
 */
export async function getTelegramUser(
  telegramUser: TelegramUser
): Promise<{ id: string; email: string }> {
  // Create a unique email based on Telegram user ID
  const email = `telegram_${telegramUser.id}@sofia.bot`;

  try {
    // Check if user exists
    const existingUsers = await db
      .select()
      .from(user)
      .where(eq(user.email, email));

    if (existingUsers.length > 0) {
      return existingUsers[0];
    }

    // Create new user for this Telegram user
    const password = generateHashedPassword(generateUUID());
    const [newUser] = await db
      .insert(user)
      .values({ email, password })
      .returning({ id: user.id, email: user.email });

    log.info("Created new user for Telegram user", {
      telegramUsername: telegramUser.username || telegramUser.first_name,
      telegramUserId: telegramUser.id,
    });

    return newUser;
  } catch (error) {
    log.error("Error getting Telegram user", error, {
      telegramUserId: telegramUser.id,
      telegramUsername: telegramUser.username,
    });
    throw new Error("Failed to get or create user for Telegram");
  }
}

/**
 * Get or create a chat session for a Telegram user
 */
export function getTelegramChatId(telegramUserId: number): string {
  // Generate a deterministic UUID based on Telegram user ID
  // This creates a single persistent conversation per Telegram user
  // Use namespace UUID v5 to create a valid UUID from the Telegram ID
  const crypto = require("node:crypto");
  const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // DNS namespace UUID
  const name = `telegram_user_${telegramUserId}`;

  // Create deterministic UUID v5 using SHA-1
  const hash = crypto.createHash("sha1");

  // Convert namespace UUID to bytes (remove dashes)
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  hash.update(namespaceBytes);
  hash.update(name);

  const digest = hash.digest();

  // Format as UUID v5 (RFC 4122)
  // 8-4-4-4-12 hex character format
  const uuid = [
    digest
      .subarray(0, 4)
      .toString("hex"), // 8 hex chars (time_low)
    digest
      .subarray(4, 6)
      .toString("hex"), // 4 hex chars (time_mid)
    digest
      .subarray(6, 8)
      .toString("hex"), // 4 hex chars (time_hi_and_version)
    digest
      .subarray(8, 10)
      .toString("hex"), // 4 hex chars (clock_seq_hi_and_reserved + clock_seq_low)
    digest
      .subarray(10, 16)
      .toString("hex"), // 12 hex chars (node)
  ].join("-");

  // Set version (5) and variant bits as per RFC 4122
  const parts = uuid.split("-");

  // Set version to 5 (0101) in time_hi_and_version (bits 12-15)
  const timeHiAndVersion = Number.parseInt(parts[2], 16);
  parts[2] = ((timeHiAndVersion & 0x0f_ff) | 0x50_00)
    .toString(16)
    .padStart(4, "0");

  // Set variant to 10 in clock_seq_hi_and_reserved (bits 6-7)
  const clockSeq = Number.parseInt(parts[3], 16);
  parts[3] = ((clockSeq & 0x3f_ff) | 0x80_00).toString(16).padStart(4, "0");

  return parts.join("-");
}
