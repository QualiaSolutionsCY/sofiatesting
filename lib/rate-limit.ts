type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60 * 1000; // 60 seconds
const MAX_REQUESTS = 10;

export const rateLimit = (
  userId: string
): { allowed: boolean; remaining: number; resetAt: number } => {
  const now = Date.now();

  // On-demand cleanup of expired entries (replaces setInterval)
  for (const [key, e] of rateLimitMap.entries()) {
    if (now >= e.resetAt) {
      rateLimitMap.delete(key);
    }
  }

  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + WINDOW_MS;
    rateLimitMap.set(userId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  rateLimitMap.set(userId, entry);
  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetAt: entry.resetAt,
  };
};

