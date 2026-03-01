import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { handleTelegramMessage } from "@/lib/telegram/message-handler";
import type { TelegramUpdate } from "@/lib/telegram/types";

const logger = createLogger("telegram:webhook");

// Extended duration to allow AI responses to complete (Telegram timeout is 60s)
export const maxDuration = 60;

// Get the webhook secret from environment
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// Deduplication configuration
const DEDUP_PREFIX = "telegram:dedup:";
const DEDUP_TTL_SECONDS = 300; // 5 minutes - matches WhatsApp for consistency

// In-memory fallback cache (used if Redis unavailable)
const memoryDedup = new Map<string, number>();
let lastMemoryCleanup = Date.now();
const MEMORY_CLEANUP_INTERVAL = 10_000; // Clean every 10 seconds

// Redis client (lazy initialization)
let redisClient: Redis | null = null;

/**
 * Get Redis client with lazy initialization
 */
const getRedis = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    const parsedRedisUrl = new URL(redisUrl);
    const redisToken = parsedRedisUrl.password;

    if (!redisToken) {
      return null;
    }

    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    return redisClient;
  } catch {
    return null;
  }
};

/**
 * Check if message was already processed (Redis with in-memory fallback)
 * Returns true if duplicate, false if new message
 */
const isMessageProcessed = async (messageKey: string): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const key = `${DEDUP_PREFIX}${messageKey}`;
      const exists = await redis.get(key);

      if (exists) {
        return true; // Already processed
      }

      // Mark as processed with TTL (Redis handles expiration automatically)
      await redis.set(key, 1, { ex: DEDUP_TTL_SECONDS });
      return false;
    } catch (error) {
      logger.error("Redis dedup failed", error);
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory deduplication with periodic cleanup
  const now = Date.now();

  // Only cleanup every 10 seconds (not on every call - O(1) amortized)
  if (now - lastMemoryCleanup > MEMORY_CLEANUP_INTERVAL) {
    const ttlMs = DEDUP_TTL_SECONDS * 1000;
    for (const [id, timestamp] of memoryDedup.entries()) {
      if (now - timestamp > ttlMs) {
        memoryDedup.delete(id);
      }
    }
    lastMemoryCleanup = now;
  }

  // Check if message was already processed
  if (memoryDedup.has(messageKey)) {
    return true;
  }

  // Mark as processed
  memoryDedup.set(messageKey, now);
  return false;
};

/**
 * Telegram Bot Webhook Handler
 * This endpoint receives updates from Telegram Bot API
 * Set webhook URL: https://your-domain.com/api/telegram/webhook
 *
 * Security: Validates X-Telegram-Bot-Api-Secret-Token header
 * Set webhook with secret_token parameter to enable validation
 *
 * ASYNC PROCESSING:
 * - Returns 200 OK immediately to prevent Telegram timeout
 * - Processes message asynchronously in background
 * - Serverless function stays alive until processing completes (up to maxDuration)
 */
export async function POST(request: Request) {
  // Validate secret token if configured
  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secretToken !== TELEGRAM_WEBHOOK_SECRET) {
      logger.warn("Invalid or missing secret token", {
        hasToken: !!secretToken,
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Log warning if secret is not configured (should be set in production)
    logger.warn(
      "TELEGRAM_WEBHOOK_SECRET not configured - webhook is unprotected"
    );
  }

  try {
    const body = (await request.json()) as TelegramUpdate;

    logger.info("Message received", {
      update_id: body.update_id,
      has_message: !!body.message,
      has_edited_message: !!body.edited_message,
      chat_id: body.message?.chat.id,
      from_user: body.message?.from?.username,
      message_text: body.message?.text?.substring(0, 100),
    });

    // Handle new message - ASYNC (no await)
    if (body.message) {
      // Deduplication check - prevent reprocessing if Telegram retries webhook delivery
      const messageKey = `${body.update_id}-${body.message.chat.id}`;
      if (await isMessageProcessed(messageKey)) {
        logger.debug("Duplicate message, skipping", { messageKey });
        return NextResponse.json({ ok: true });
      }

      // Process message asynchronously - don't await
      // The serverless function will stay alive until completion
      const startTime = Date.now();

      handleTelegramMessage(body.message)
        .then(() => {
          const duration = Date.now() - startTime;
          logger.info("Message processed successfully", {
            update_id: body.update_id,
            chat_id: body.message?.chat.id,
            duration_ms: duration,
          });
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          logger.error("Error in async message handler", error, {
            update_id: body.update_id,
            chat_id: body.message?.chat.id,
            from_user: body.message?.from?.username,
            message_text: body.message?.text?.substring(0, 100),
            duration_ms: duration,
          });
        });

      // Return immediately to prevent Telegram timeout
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Handle edited message
    if (body.edited_message) {
      // You can handle edited messages if needed
      logger.debug("Edited message received, ignoring");
      return NextResponse.json({ ok: true });
    }

    // No message to process
    logger.debug("No message to process");
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error processing webhook", error);

    // Return 200 even on error to prevent Telegram from retrying
    // (log the error for debugging)
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}

/**
 * Health check endpoint
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "SOFIA Telegram Bot",
    timestamp: new Date().toISOString(),
  });
}
