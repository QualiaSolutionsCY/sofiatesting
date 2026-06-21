import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { createLogger } from "@/lib/logger";

const logger = createLogger("rate-limit");

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /**
   * true when the limiter could not reach its backing store and the request
   * is being rejected fail-closed. Callers SHOULD surface this as HTTP 503
   * (service unavailable) rather than 429, since the limit state is unknown.
   */
  unavailable?: boolean;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 60 seconds
const WINDOW_SECONDS = WINDOW_MS / 1000;
const MAX_REQUESTS = 10;
const KEY_PREFIX = "ratelimit:";

// ---------------------------------------------------------------------------
// Redis (distributed) backend
// ---------------------------------------------------------------------------
// In-memory Map state does NOT survive serverless cold starts and is NOT
// shared across concurrent function instances, so an attacker can bypass the
// limit by spreading requests across warm-up boundaries / instances. The
// authoritative limiter therefore lives in Redis. When Redis is configured but
// unreachable we fail CLOSED (reject the request) rather than silently allowing
// unbounded traffic.

let redisClient: Redis | null = null;
let redisInitAttempted = false;
let warnedMissingRedis = false;

/**
 * Lazily initialize the Upstash Redis client from REDIS_URL.
 * Mirrors the project's established webhook-route pattern: the auth token is
 * the password component of the REDIS_URL.
 * Returns null when Redis is not configured.
 */
const getRedis = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }
  if (redisInitAttempted) {
    return null;
  }
  redisInitAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    const parsedRedisUrl = new URL(redisUrl);
    const redisToken = parsedRedisUrl.password;

    if (!redisToken) {
      logger.warn("REDIS_URL is set but has no token; rate limiting degraded");
      return null;
    }

    redisClient = new Redis({ url: redisUrl, token: redisToken });
    return redisClient;
  } catch (error) {
    logger.warn("Failed to initialize Redis for rate limiting", { error });
    return null;
  }
};

/**
 * Hash the client IP so we never persist a raw address while still tracking
 * per-IP. Combining userId + ipHash prevents one userId from sharing a single
 * limit budget across many source IPs.
 */
const hashIp = (ip: string): string =>
  createHash("sha256").update(ip).digest("hex").slice(0, 16);

const buildKey = (userId: string, ip?: string): string => {
  const ipPart = ip ? `:${hashIp(ip)}` : "";
  return `${KEY_PREFIX}${userId}${ipPart}`;
};

// ---------------------------------------------------------------------------
// In-memory backend (cleanup + check)
// ---------------------------------------------------------------------------

const cleanupExpired = (now: number): void => {
  for (const [key, e] of rateLimitMap.entries()) {
    if (now >= e.resetAt) {
      rateLimitMap.delete(key);
    }
  }
};

const memoryRateLimit = (key: string): RateLimitResult => {
  const now = Date.now();
  cleanupExpired(now);

  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + WINDOW_MS;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  rateLimitMap.set(key, entry);
  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Distributed, fail-closed sliding-window rate limiter.
 *
 * This is the limiter new/updated callers SHOULD use. It is async because it
 * performs a Redis round-trip. Behavior:
 *   - Redis configured + reachable: authoritative sliding-window count shared
 *     across all serverless instances. Keyed by userId + hashed IP.
 *   - Redis configured + UNREACHABLE: fails CLOSED — returns
 *     { allowed: false, unavailable: true }. Caller should respond 503.
 *   - Redis NOT configured: logs a loud one-time warning and falls back to the
 *     best-effort in-memory limiter (acceptable for local/dev only).
 */
export const rateLimitAsync = async (
  userId: string,
  ip?: string
): Promise<RateLimitResult> => {
  const redis = getRedis();
  const key = buildKey(userId, ip);

  if (!redis) {
    if (!warnedMissingRedis) {
      warnedMissingRedis = true;
      logger.warn(
        "REDIS_URL not configured — rate limiting falls back to per-instance " +
          "in-memory state, which does NOT survive cold starts or span " +
          "concurrent instances. Configure REDIS_URL in production."
      );
    }
    return memoryRateLimit(key);
  }

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  try {
    // Sliding window via sorted set: each request is a member scored by its
    // timestamp. Drop anything older than the window, count what remains,
    // then add the current request only if under the limit.
    const member = `${now}:${Math.random().toString(36).slice(2)}`;

    const pipeline = redis.multi();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    const results = (await pipeline.exec()) as [number, number];
    const countInWindow = Number(results[1] ?? 0);

    const oldestResetAt = now + WINDOW_MS;

    if (countInWindow >= MAX_REQUESTS) {
      // Compute when the oldest in-window request expires so callers can set
      // an accurate Retry-After / reset header.
      const oldest = await redis.zrange<string[]>(key, 0, 0, {
        withScores: true,
      });
      const oldestScore = oldest?.[1] ? Number(oldest[1]) : windowStart;
      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestScore + WINDOW_MS,
      };
    }

    const writePipeline = redis.multi();
    writePipeline.zadd(key, { score: now, member });
    writePipeline.expire(key, WINDOW_SECONDS + 1);
    await writePipeline.exec();

    return {
      allowed: true,
      remaining: MAX_REQUESTS - (countInWindow + 1),
      resetAt: oldestResetAt,
    };
  } catch (error) {
    // Redis is configured but failed — fail CLOSED. Silently allowing the
    // request here is exactly the bypass the finding warns about.
    logger.error("Redis rate-limit check failed; failing closed", { error });
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + WINDOW_MS,
      unavailable: true,
    };
  }
};

/**
 * Synchronous best-effort rate limiter (legacy signature).
 *
 * Retained for backward compatibility with existing synchronous callers. It
 * cannot consult Redis (that requires an await), so it is per-instance and
 * non-distributed. New code and security-sensitive routes SHOULD migrate to
 * {@link rateLimitAsync}, which is distributed and fail-closed.
 *
 * The optional `ip` argument lets callers scope the limit by userId + IP so a
 * single userId cannot share one budget across many source IPs.
 */
export const rateLimit = (userId: string, ip?: string): RateLimitResult => {
  return memoryRateLimit(buildKey(userId, ip));
};
