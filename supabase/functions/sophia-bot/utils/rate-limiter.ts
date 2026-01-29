/**
 * Rate limiting utility for Sophia WhatsApp Bot
 *
 * Prevents abuse by limiting messages per user per time window.
 * Uses the chat_history table with in-memory fallback on DB errors.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "./logger.ts";

// Configuration - aligned with local lib/whatsapp rate limit
const RATE_LIMIT = 30; // messages per minute per user (was 10)
const RATE_WINDOW_MS = 60_000; // 1 minute window

// P2 SECURITY: In-memory fallback rate limiter for DB failures
interface RateLimitEntry {
  count: number;
  windowStart: number;
}
const inMemoryRateLimits = new Map<string, RateLimitEntry>();
const FALLBACK_FAILURE_COUNT = 3; // After this many DB failures, fail-closed
let consecutiveDbErrors = 0;

/**
 * In-memory fallback rate limiter
 */
function checkInMemoryRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = inMemoryRateLimits.get(userId);

  // Clean up old entries periodically (simple approach)
  if (inMemoryRateLimits.size > 1000) {
    for (const [key, val] of inMemoryRateLimits) {
      if (now - val.windowStart > RATE_WINDOW_MS * 2) {
        inMemoryRateLimits.delete(key);
      }
    }
  }

  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    // New window
    inMemoryRateLimits.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    logger.warn(`[Fallback Rate Limit] Limit exceeded for user`, { category: LogCategory.GENERAL });
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Checks if a user is within their rate limit
 *
 * @param supabase - Supabase client instance
 * @param userId - User identifier (typically phone number)
 * @returns true if user can send messages, false if rate limited
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

    const { count, error } = await supabase
      .from("chat_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", windowStart);

    if (error) {
      // P2 SECURITY: Use fallback rate limiter on DB error
      logger.error("Rate limit check error", new Error(error.message), { category: LogCategory.DATABASE });
      consecutiveDbErrors++;

      if (consecutiveDbErrors >= FALLBACK_FAILURE_COUNT) {
        // Too many DB failures - fail closed for security
        logger.warn("[Rate Limit] Too many DB errors, failing closed", { category: LogCategory.GENERAL });
        return false;
      }

      // Use in-memory fallback
      logger.debug("[Rate Limit] Using in-memory fallback", { category: LogCategory.GENERAL });
      return checkInMemoryRateLimit(userId);
    }

    // Reset error counter on success
    consecutiveDbErrors = 0;

    const currentCount = count || 0;
    const withinLimit = currentCount < RATE_LIMIT;

    if (!withinLimit) {
      logger.warn(`Rate limit exceeded for user. Count: ${currentCount}/${RATE_LIMIT}`, { category: LogCategory.GENERAL });
    }

    return withinLimit;
  } catch (error) {
    logger.error("Rate limit check exception", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.DATABASE });
    consecutiveDbErrors++;

    if (consecutiveDbErrors >= FALLBACK_FAILURE_COUNT) {
      return false; // Fail closed after repeated errors
    }

    return checkInMemoryRateLimit(userId);
  }
}

/**
 * Gets remaining messages allowed for a user in the current window
 *
 * @param supabase - Supabase client instance
 * @param userId - User identifier
 * @returns Number of remaining messages allowed
 */
export async function getRemainingMessages(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  try {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

    const { count, error } = await supabase
      .from("chat_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", windowStart);

    if (error) {
      return RATE_LIMIT; // Return full limit on error
    }

    return Math.max(0, RATE_LIMIT - (count || 0));
  } catch {
    return RATE_LIMIT;
  }
}

/**
 * Rate limit configuration (exported for testing/customization)
 */
export const RATE_LIMIT_CONFIG = {
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW_MS,
} as const;

