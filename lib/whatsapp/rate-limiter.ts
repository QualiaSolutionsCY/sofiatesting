/**
 * WhatsApp Webhook Rate Limiter
 *
 * Protects against abuse by limiting requests per phone number.
 * Uses Redis (Upstash) with in-memory fallback for resilience.
 *
 * Default limits:
 * - 30 requests per minute per phone number
 * - Prevents message flooding and abuse
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { logger } from "@/lib/logger";

// Configuration
const REQUESTS_PER_MINUTE = 30;
const RATE_LIMIT_PREFIX = "whatsapp:ratelimit";

// In-memory fallback state
const memoryLimits = new Map<string, { count: number; resetAt: number }>();
let lastMemoryCleanup = Date.now();
const MEMORY_CLEANUP_INTERVAL_MS = 60_000; // Clean every minute

// Redis client (lazy initialization)
let redisRateLimiter: Ratelimit | null = null;

/**
 * Get Redis rate limiter with lazy initialization
 * Returns null if Redis is not configured
 */
const getRedisRateLimiter = (): Ratelimit | null => {
  if (redisRateLimiter) {
    return redisRateLimiter;
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

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    redisRateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(REQUESTS_PER_MINUTE, "1 m"),
      analytics: true,
      prefix: RATE_LIMIT_PREFIX,
    });

    return redisRateLimiter;
  } catch {
    logger.warn("Failed to initialize Redis rate limiter, using in-memory fallback");
    return null;
  }
};

/**
 * Check rate limit using in-memory fallback
 * Used when Redis is unavailable
 */
const checkMemoryRateLimit = (identifier: string): boolean => {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute

  // Periodic cleanup of expired entries
  if (now - lastMemoryCleanup > MEMORY_CLEANUP_INTERVAL_MS) {
    for (const [key, value] of memoryLimits.entries()) {
      if (now > value.resetAt) {
        memoryLimits.delete(key);
      }
    }
    lastMemoryCleanup = now;
  }

  // Check current limit state
  const current = memoryLimits.get(identifier);

  if (!current || now > current.resetAt) {
    // New window or expired - reset counter
    memoryLimits.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (current.count >= REQUESTS_PER_MINUTE) {
    // Rate limit exceeded
    return false;
  }

  // Increment counter
  current.count++;
  return true;
};

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Time until reset (ms) */
  resetIn: number;
  /** Whether Redis or memory was used */
  backend: "redis" | "memory";
}

/**
 * Check if a phone number is within rate limits
 *
 * @param phoneNumber - The phone number to check (will be normalized)
 * @returns Rate limit result with remaining quota
 *
 * @example
 * ```typescript
 * const result = await checkWebhookRateLimit("+1234567890");
 * if (!result.success) {
 *   return new Response("Too Many Requests", { status: 429 });
 * }
 * ```
 */
export const checkWebhookRateLimit = async (
  phoneNumber: string
): Promise<RateLimitResult> => {
  // Normalize phone number (remove non-digits)
  const normalized = phoneNumber.replace(/\D/g, "");
  const identifier = `phone:${normalized}`;

  const rateLimiter = getRedisRateLimiter();

  if (rateLimiter) {
    try {
      const result = await rateLimiter.limit(identifier);

      if (!result.success) {
        logger.warn("WhatsApp rate limit exceeded", {
          phoneNumber: `${normalized.slice(0, 4)}***`,
          remaining: result.remaining,
          resetIn: result.reset - Date.now(),
        });
      }

      return {
        success: result.success,
        remaining: result.remaining,
        resetIn: result.reset - Date.now(),
        backend: "redis",
      };
    } catch (error) {
      logger.error("Redis rate limit check failed", error as Error, {
        phoneNumber: `${normalized.slice(0, 4)}***`,
      });
      // Fall through to memory fallback
    }
  }

  // In-memory fallback
  const success = checkMemoryRateLimit(identifier);
  const current = memoryLimits.get(identifier);

  if (!success) {
    logger.warn("WhatsApp rate limit exceeded (memory)", {
      phoneNumber: `${normalized.slice(0, 4)}***`,
    });
  }

  return {
    success,
    remaining: success ? REQUESTS_PER_MINUTE - (current?.count || 1) : 0,
    resetIn: current?.resetAt ? current.resetAt - Date.now() : 60_000,
    backend: "memory",
  };
};

/**
 * Quick check if rate limiting is enabled
 * Returns true if Redis is configured
 */
export const isRateLimitingEnabled = (): boolean => {
  return !!process.env.REDIS_URL;
};

/**
 * Check if rate limit is disabled via environment variable
 * Use this for emergency bypass
 */
export const isRateLimitingDisabled = (): boolean => {
  return process.env.WHATSAPP_RATE_LIMIT_DISABLED === "true";
};
