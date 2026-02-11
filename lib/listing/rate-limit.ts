import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "../logger";

const redisUrl = process.env.REDIS_URL;

// In-memory fallback for when Redis is not configured
let inMemoryCount = new Map<string, { count: number; resetTime: number }>();
const LIMIT = 10; // 10 uploads per hour per user
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

let ratelimit: Ratelimit | null = null;
let redis: Redis | null = null;

// Initialize Redis if available
if (redisUrl) {
  try {
    const parsedRedisUrl = new URL(redisUrl);
    const redisToken = parsedRedisUrl.password;

    if (redisToken) {
      redis = new Redis({
        url: redisUrl,
        token: redisToken,
      });

      ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(LIMIT, "1 h"),
        analytics: true,
        prefix: "@upstash/ratelimit/listing-upload",
      });

      logger.listing.info("Redis rate limiting initialized");
    } else {
      logger.listing.warn("REDIS_URL missing password, using in-memory fallback");
    }
  } catch (error) {
    logger.listing.error("Failed to initialize Redis, using in-memory fallback", error);
  }
} else {
  logger.listing.warn("REDIS_URL not configured, using in-memory fallback");
}

export async function checkRateLimit(userId: string): Promise<boolean> {
  // Use Redis rate limiter if available
  if (ratelimit && redis) {
    try {
      const { success } = await ratelimit.limit(userId);
      return success;
    } catch (error) {
      logger.listing.error("Redis rate limit check failed, falling back to in-memory", error);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const userState = inMemoryCount.get(userId);

  if (!userState) {
    inMemoryCount.set(userId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  // Reset counter if window expired
  if (now > userState.resetTime) {
    inMemoryCount.set(userId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  // Check if under limit
  if (userState.count < LIMIT) {
    userState.count++;
    return true;
  }

  return false;
}
