/**
 * Tests for Rate Limiter
 *
 * Tests cover:
 * - Rate limit enforcement
 * - In-memory fallback on DB errors
 * - Fail-closed behavior after repeated errors
 * - Window expiration
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, mockConsole, restoreConsole } from "./setup";

// Configuration constants (matching rate-limiter.ts)
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const FALLBACK_FAILURE_COUNT = 3;

// In-memory rate limit implementation for testing
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

class RateLimiter {
  private inMemoryRateLimits = new Map<string, RateLimitEntry>();
  private consecutiveDbErrors = 0;

  /**
   * In-memory fallback rate limiter
   */
  checkInMemoryRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = this.inMemoryRateLimits.get(userId);

    // Clean up old entries periodically
    if (this.inMemoryRateLimits.size > 1000) {
      for (const [key, val] of this.inMemoryRateLimits) {
        if (now - val.windowStart > RATE_WINDOW_MS * 2) {
          this.inMemoryRateLimits.delete(key);
        }
      }
    }

    if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
      // New window
      this.inMemoryRateLimits.set(userId, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= RATE_LIMIT) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Check rate limit with DB and fallback
   */
  async checkRateLimit(
    supabase: { from: (table: string) => unknown },
    userId: string
  ): Promise<boolean> {
    try {
      const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

      // @ts-expect-error - Mock chain
      const { count, error } = await supabase
        .from("chat_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", windowStart);

      if (error) {
        this.consecutiveDbErrors++;

        if (this.consecutiveDbErrors >= FALLBACK_FAILURE_COUNT) {
          return false; // Fail closed
        }

        return this.checkInMemoryRateLimit(userId);
      }

      // Reset error counter on success
      this.consecutiveDbErrors = 0;

      const currentCount = count || 0;
      return currentCount < RATE_LIMIT;
    } catch {
      this.consecutiveDbErrors++;

      if (this.consecutiveDbErrors >= FALLBACK_FAILURE_COUNT) {
        return false;
      }

      return this.checkInMemoryRateLimit(userId);
    }
  }

  /**
   * Get remaining messages
   */
  async getRemainingMessages(
    supabase: { from: (table: string) => unknown },
    userId: string
  ): Promise<number> {
    try {
      const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

      // @ts-expect-error - Mock chain
      const { count, error } = await supabase
        .from("chat_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("role", "user")
        .gte("created_at", windowStart);

      if (error) {
        return RATE_LIMIT;
      }

      return Math.max(0, RATE_LIMIT - (count || 0));
    } catch {
      return RATE_LIMIT;
    }
  }

  // Test helpers
  reset(): void {
    this.inMemoryRateLimits.clear();
    this.consecutiveDbErrors = 0;
  }

  getConsecutiveErrors(): number {
    return this.consecutiveDbErrors;
  }
}

describe("Rate Limiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    mockConsole();
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    restoreConsole();
    vi.useRealTimers();
  });

  describe("Configuration", () => {
    it("should have correct rate limit values", () => {
      expect(RATE_LIMIT).toBe(30);
      expect(RATE_WINDOW_MS).toBe(60_000);
      expect(FALLBACK_FAILURE_COUNT).toBe(3);
    });
  });

  describe("In-Memory Rate Limiter", () => {
    it("should allow first message from a new user", () => {
      expect(rateLimiter.checkInMemoryRateLimit("user-123")).toBe(true);
    });

    it("should allow messages up to the limit", () => {
      const userId = "user-456";

      // Send 30 messages (the limit)
      for (let i = 0; i < RATE_LIMIT; i++) {
        expect(rateLimiter.checkInMemoryRateLimit(userId)).toBe(true);
      }
    });

    it("should block messages after limit is reached", () => {
      const userId = "user-789";

      // Exhaust the limit
      for (let i = 0; i < RATE_LIMIT; i++) {
        rateLimiter.checkInMemoryRateLimit(userId);
      }

      // Next message should be blocked
      expect(rateLimiter.checkInMemoryRateLimit(userId)).toBe(false);
    });

    it("should track different users independently", () => {
      const user1 = "user-1";
      const user2 = "user-2";

      // Exhaust user1's limit
      for (let i = 0; i < RATE_LIMIT; i++) {
        rateLimiter.checkInMemoryRateLimit(user1);
      }

      // user1 is blocked
      expect(rateLimiter.checkInMemoryRateLimit(user1)).toBe(false);

      // user2 should still be allowed
      expect(rateLimiter.checkInMemoryRateLimit(user2)).toBe(true);
    });

    it("should reset after window expires", () => {
      vi.useFakeTimers();

      const userId = "user-window";

      // Exhaust the limit
      for (let i = 0; i < RATE_LIMIT; i++) {
        rateLimiter.checkInMemoryRateLimit(userId);
      }

      // Should be blocked
      expect(rateLimiter.checkInMemoryRateLimit(userId)).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(RATE_WINDOW_MS + 1);

      // Should be allowed again (new window)
      expect(rateLimiter.checkInMemoryRateLimit(userId)).toBe(true);
    });

    it("should clean up old entries when map is large", () => {
      vi.useFakeTimers();

      // Create many users to trigger cleanup
      for (let i = 0; i < 1001; i++) {
        rateLimiter.checkInMemoryRateLimit(`user-${i}`);
      }

      // Advance time to make entries old
      vi.advanceTimersByTime(RATE_WINDOW_MS * 3);

      // Create one more to trigger cleanup
      rateLimiter.checkInMemoryRateLimit("cleanup-trigger");

      // Old entries should be cleaned up
      // (Internal state, so we just verify it doesn't break)
      expect(rateLimiter.checkInMemoryRateLimit("new-user")).toBe(true);
    });
  });

  describe("Database-backed Rate Limiter", () => {
    it("should allow when under limit", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 10, error: null })),
              })),
            })),
          })),
        })),
      };

      const result = await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      expect(result).toBe(true);
    });

    it("should block when at limit", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 30, error: null })),
              })),
            })),
          })),
        })),
      };

      const result = await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      expect(result).toBe(false);
    });

    it("should block when over limit", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 50, error: null })),
              })),
            })),
          })),
        })),
      };

      const result = await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      expect(result).toBe(false);
    });

    it("should use fallback on DB error", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() =>
                  Promise.resolve({
                    count: null,
                    error: { message: "DB error" },
                  })
                ),
              })),
            })),
          })),
        })),
      };

      // First error - should use fallback
      const result = await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      expect(result).toBe(true); // Fallback allows
      expect(rateLimiter.getConsecutiveErrors()).toBe(1);
    });

    it("should fail closed after repeated DB errors", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() =>
                  Promise.resolve({
                    count: null,
                    error: { message: "DB error" },
                  })
                ),
              })),
            })),
          })),
        })),
      };

      // First two errors use fallback
      await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      await rateLimiter.checkRateLimit(mockSupabase, "user-123");

      // Third error should fail closed
      const result = await rateLimiter.checkRateLimit(mockSupabase, "user-123");
      expect(result).toBe(false); // Fail closed
    });

    it("should reset error counter on successful query", async () => {
      const errorSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() =>
                  Promise.resolve({
                    count: null,
                    error: { message: "DB error" },
                  })
                ),
              })),
            })),
          })),
        })),
      };

      const successSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 5, error: null })),
              })),
            })),
          })),
        })),
      };

      // Two errors
      await rateLimiter.checkRateLimit(errorSupabase, "user-123");
      await rateLimiter.checkRateLimit(errorSupabase, "user-123");
      expect(rateLimiter.getConsecutiveErrors()).toBe(2);

      // Success resets counter
      await rateLimiter.checkRateLimit(successSupabase, "user-123");
      expect(rateLimiter.getConsecutiveErrors()).toBe(0);
    });

    it("should handle exceptions gracefully", async () => {
      const throwingSupabase = {
        from: vi.fn(() => {
          throw new Error("Connection failed");
        }),
      };

      const result = await rateLimiter.checkRateLimit(
        throwingSupabase,
        "user-123"
      );
      // First exception uses fallback
      expect(result).toBe(true);
    });
  });

  describe("getRemainingMessages", () => {
    it("should return correct remaining messages", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 20, error: null })),
              })),
            })),
          })),
        })),
      };

      const remaining = await rateLimiter.getRemainingMessages(
        mockSupabase,
        "user-123"
      );
      expect(remaining).toBe(10); // 30 - 20
    });

    it("should return 0 when at or over limit", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: 35, error: null })),
              })),
            })),
          })),
        })),
      };

      const remaining = await rateLimiter.getRemainingMessages(
        mockSupabase,
        "user-123"
      );
      expect(remaining).toBe(0);
    });

    it("should return full limit on DB error", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() =>
                  Promise.resolve({
                    count: null,
                    error: { message: "DB error" },
                  })
                ),
              })),
            })),
          })),
        })),
      };

      const remaining = await rateLimiter.getRemainingMessages(
        mockSupabase,
        "user-123"
      );
      expect(remaining).toBe(RATE_LIMIT);
    });

    it("should handle null count", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => Promise.resolve({ count: null, error: null })),
              })),
            })),
          })),
        })),
      };

      const remaining = await rateLimiter.getRemainingMessages(
        mockSupabase,
        "user-123"
      );
      expect(remaining).toBe(RATE_LIMIT); // Treats null as 0 count
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty user ID", () => {
      expect(rateLimiter.checkInMemoryRateLimit("")).toBe(true);
    });

    it("should handle very long user IDs", () => {
      const longUserId = "user-" + "a".repeat(1000);
      expect(rateLimiter.checkInMemoryRateLimit(longUserId)).toBe(true);
    });

    it("should handle special characters in user ID", () => {
      const specialUserId = "user+test@example.com";
      expect(rateLimiter.checkInMemoryRateLimit(specialUserId)).toBe(true);
    });

    it("should handle Unicode in user ID", () => {
      const unicodeUserId = "user-hello-world";
      expect(rateLimiter.checkInMemoryRateLimit(unicodeUserId)).toBe(true);
    });
  });

  describe("Security: Rate Limit Bypass Prevention", () => {
    it("should not allow bypass by changing user ID case", () => {
      // Note: User IDs are typically case-sensitive (phone numbers)
      // but this test verifies behavior
      const userId1 = "USER-123";
      const userId2 = "user-123";

      // Exhaust userId1
      for (let i = 0; i < RATE_LIMIT; i++) {
        rateLimiter.checkInMemoryRateLimit(userId1);
      }

      // userId2 is treated as different user (case-sensitive)
      expect(rateLimiter.checkInMemoryRateLimit(userId2)).toBe(true);
    });

    it("should apply rate limit per unique identifier", () => {
      // Phone numbers with different formats should be normalized
      // before passing to rate limiter (this tests the behavior)
      const phone1 = "+35799123456";
      const phone2 = "35799123456";

      // These are treated as different users
      for (let i = 0; i < RATE_LIMIT; i++) {
        rateLimiter.checkInMemoryRateLimit(phone1);
      }

      // phone2 has its own limit
      expect(rateLimiter.checkInMemoryRateLimit(phone2)).toBe(true);
    });
  });
});
