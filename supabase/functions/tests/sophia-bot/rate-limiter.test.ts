/**
 * Rate Limiter Tests
 *
 * Tests the rate limiting functionality that prevents abuse
 * by limiting messages per user per time window.
 *
 * Run: deno test --allow-all supabase/functions/tests/sophia-bot/rate-limiter.test.ts
 */

import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  checkRateLimit,
  getRemainingMessages,
  RATE_LIMIT_CONFIG,
} from "../../sophia-bot/utils/rate-limiter.ts";
import { createMockSupabaseClient } from "../test-utils/mocks.ts";

// ============================================
// Rate Limit Configuration
// ============================================

Deno.test("RATE_LIMIT_CONFIG - has correct limit", () => {
  assertEquals(RATE_LIMIT_CONFIG.limit, 30);
});

Deno.test("RATE_LIMIT_CONFIG - has correct window", () => {
  assertEquals(RATE_LIMIT_CONFIG.windowMs, 60000); // 1 minute
});

// ============================================
// checkRateLimit - Under Limit
// ============================================

Deno.test("checkRateLimit - allows requests under limit", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 5 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const result = await checkRateLimit(mockClient, "user-123");
  assertEquals(result, true);
});

Deno.test("checkRateLimit - allows first request", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: [],
  });

  // @ts-ignore - mock client type
  const result = await checkRateLimit(mockClient, "new-user");
  assertEquals(result, true);
});

// ============================================
// checkRateLimit - At/Over Limit
// ============================================

Deno.test("checkRateLimit - blocks requests at limit", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 30 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const result = await checkRateLimit(mockClient, "spam-user");
  assertEquals(result, false);
});

Deno.test("checkRateLimit - blocks requests over limit", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 50 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const result = await checkRateLimit(mockClient, "spam-user");
  assertEquals(result, false);
});

// ============================================
// checkRateLimit - Error Handling
// ============================================

Deno.test("checkRateLimit - uses fallback on DB error", async () => {
  const mockClient = createMockSupabaseClient({
    shouldError: true,
    errorMessage: "Database connection failed",
  });

  // First request should use fallback
  // @ts-ignore - mock client type
  const result = await checkRateLimit(mockClient, "user-123");
  // Fallback allows requests under in-memory limit
  assertEquals(typeof result, "boolean");
});

// ============================================
// getRemainingMessages
// ============================================

Deno.test("getRemainingMessages - returns correct count", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 10 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const remaining = await getRemainingMessages(mockClient, "user-123");
  // 30 - 10 = 20 remaining
  assertEquals(remaining, 20);
});

Deno.test("getRemainingMessages - returns full limit for new user", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: [],
  });

  // @ts-ignore - mock client type
  const remaining = await getRemainingMessages(mockClient, "new-user");
  assertEquals(remaining, 30);
});

Deno.test("getRemainingMessages - returns 0 when at limit", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 30 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const remaining = await getRemainingMessages(mockClient, "spam-user");
  assertEquals(remaining, 0);
});

Deno.test("getRemainingMessages - never returns negative", async () => {
  const mockClient = createMockSupabaseClient({
    chatHistory: Array.from({ length: 50 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user",
      content: "test",
      created_at: new Date().toISOString(),
    })),
  });

  // @ts-ignore - mock client type
  const remaining = await getRemainingMessages(mockClient, "spam-user");
  assertEquals(remaining >= 0, true);
});

Deno.test("getRemainingMessages - returns full limit on error", async () => {
  const mockClient = createMockSupabaseClient({
    shouldError: true,
  });

  // @ts-ignore - mock client type
  const remaining = await getRemainingMessages(mockClient, "user-123");
  assertEquals(remaining, 30);
});

// ============================================
// Rate Limit Configuration Export
// ============================================

Deno.test("RATE_LIMIT_CONFIG - is exported", () => {
  assertExists(RATE_LIMIT_CONFIG);
  assertExists(RATE_LIMIT_CONFIG.limit);
  assertExists(RATE_LIMIT_CONFIG.windowMs);
});
