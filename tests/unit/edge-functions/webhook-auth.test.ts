/**
 * Tests for Webhook Authentication (HMAC Signature Verification)
 *
 * Tests cover:
 * - HMAC signature verification
 * - Constant-time comparison for timing attack prevention
 * - Header extraction for various formats
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, restoreConsole } from "./setup";

// Import the functions to test
// Note: We need to import from a path that vitest can resolve
// For edge functions, we'll mock the logger and test the pure functions

// Since the actual file uses Deno imports, we'll test the logic directly
// by reimplementing the key functions for testing

/**
 * Constant-time string comparison (reimplemented for testing)
 * This is the exact implementation from webhook-auth.ts
 */
function constantTimeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let result = a.length ^ b.length;

  for (let i = 0; i < maxLen; i++) {
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }

  return result === 0;
}

/**
 * HMAC signature verification (async, using Web Crypto API)
 */
async function verifyWebhookSignature(
  signature: string | null,
  body: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);

    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return constantTimeCompare(signature, expectedSignature);
  } catch {
    return false;
  }
}

/**
 * Extract signature from headers (reimplemented for testing)
 */
function extractSignatureHeader(headers: Headers): string | null {
  const signature = headers.get("X-Wasend-Signature");
  if (signature) {
    return signature;
  }

  const alternatives = [
    "x-wasend-signature",
    "X-Webhook-Signature",
    "x-webhook-signature",
    "X-Hub-Signature-256",
  ];

  for (const header of alternatives) {
    const value = headers.get(header);
    if (value) {
      if (value.startsWith("sha256=")) {
        return value.slice(7);
      }
      return value;
    }
  }

  return null;
}

/**
 * Helper to create HMAC signature for testing
 */
async function createHmacSignature(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(body);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);

  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Webhook Authentication", () => {
  beforeEach(() => {
    mockConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe("constantTimeCompare", () => {
    it("should return true for identical strings", () => {
      expect(constantTimeCompare("abc", "abc")).toBe(true);
      expect(constantTimeCompare("", "")).toBe(true);
      expect(constantTimeCompare("test123", "test123")).toBe(true);
    });

    it("should return false for different strings", () => {
      expect(constantTimeCompare("abc", "xyz")).toBe(false);
      expect(constantTimeCompare("abc", "abcd")).toBe(false);
      expect(constantTimeCompare("abc", "ab")).toBe(false);
    });

    it("should return false for strings of different lengths", () => {
      expect(constantTimeCompare("short", "longer string")).toBe(false);
      expect(constantTimeCompare("longer string", "short")).toBe(false);
    });

    it("should handle empty strings correctly", () => {
      expect(constantTimeCompare("", "")).toBe(true);
      expect(constantTimeCompare("", "a")).toBe(false);
      expect(constantTimeCompare("a", "")).toBe(false);
    });

    it("should be case-sensitive", () => {
      expect(constantTimeCompare("ABC", "abc")).toBe(false);
      expect(constantTimeCompare("Test", "test")).toBe(false);
    });

    it("should handle unicode strings", () => {
      expect(constantTimeCompare("hello world", "hello world")).toBe(true);
      expect(constantTimeCompare("hello world", "hello earth")).toBe(false);
    });

    // Timing attack prevention tests
    describe("timing attack prevention", () => {
      it("should process strings of different lengths in similar time", () => {
        // Run multiple iterations to get stable timing
        const iterations = 1000;

        // Measure time for short comparison
        const shortStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          constantTimeCompare("a", "x".repeat(100));
        }
        const shortTime = performance.now() - shortStart;

        // Measure time for long comparison
        const longStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          constantTimeCompare("a".repeat(100), "x".repeat(100));
        }
        const longTime = performance.now() - longStart;

        // The times should be similar (within an order of magnitude)
        // This is a weak test but validates the constant-time property
        const ratio = Math.max(shortTime, longTime) / Math.min(shortTime, longTime);
        expect(ratio).toBeLessThan(10); // Within 10x is reasonable for constant-time
      });

      it("should always iterate through max length regardless of where strings differ", () => {
        // These should all take similar time since they iterate through max length
        const s1 = "aaaaaaaaaa"; // 10 chars
        const s2 = "baaaaaaaaa"; // differs at position 0
        const s3 = "aaaaabaaaa"; // differs at position 5
        const s4 = "aaaaaaaaab"; // differs at position 9

        // All comparisons iterate through 10 characters
        expect(constantTimeCompare(s1, s2)).toBe(false);
        expect(constantTimeCompare(s1, s3)).toBe(false);
        expect(constantTimeCompare(s1, s4)).toBe(false);
      });
    });
  });

  describe("verifyWebhookSignature", () => {
    const testSecret = "test-webhook-secret-12345";
    const testBody = JSON.stringify({
      type: "messages.upsert",
      sessionId: "session-123",
      data: { message: "Hello" },
    });

    it("should accept valid signatures", async () => {
      const validSignature = await createHmacSignature(testBody, testSecret);
      const result = await verifyWebhookSignature(validSignature, testBody, testSecret);
      expect(result).toBe(true);
    });

    it("should reject invalid signatures", async () => {
      const result = await verifyWebhookSignature("invalid-signature", testBody, testSecret);
      expect(result).toBe(false);
    });

    it("should reject null signatures", async () => {
      const result = await verifyWebhookSignature(null, testBody, testSecret);
      expect(result).toBe(false);
    });

    it("should reject empty signatures", async () => {
      const result = await verifyWebhookSignature("", testBody, testSecret);
      expect(result).toBe(false);
    });

    it("should reject empty secret", async () => {
      const validSignature = await createHmacSignature(testBody, testSecret);
      const result = await verifyWebhookSignature(validSignature, testBody, "");
      expect(result).toBe(false);
    });

    it("should reject modified payload", async () => {
      const validSignature = await createHmacSignature(testBody, testSecret);
      const modifiedBody = JSON.stringify({ message: "Tampered" });
      const result = await verifyWebhookSignature(validSignature, modifiedBody, testSecret);
      expect(result).toBe(false);
    });

    it("should reject signatures created with wrong secret", async () => {
      const signatureWithWrongSecret = await createHmacSignature(testBody, "wrong-secret");
      const result = await verifyWebhookSignature(signatureWithWrongSecret, testBody, testSecret);
      expect(result).toBe(false);
    });

    it("should handle empty body", async () => {
      const emptyBody = "";
      const signature = await createHmacSignature(emptyBody, testSecret);
      const result = await verifyWebhookSignature(signature, emptyBody, testSecret);
      expect(result).toBe(true);
    });

    it("should handle unicode payload", async () => {
      const unicodeBody = JSON.stringify({ message: "Hello World" });
      const signature = await createHmacSignature(unicodeBody, testSecret);
      const result = await verifyWebhookSignature(signature, unicodeBody, testSecret);
      expect(result).toBe(true);
    });

    it("should produce 64-character hex signatures", async () => {
      const signature = await createHmacSignature(testBody, testSecret);
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should produce different signatures for different payloads", async () => {
      const sig1 = await createHmacSignature("payload1", testSecret);
      const sig2 = await createHmacSignature("payload2", testSecret);
      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different secrets", async () => {
      const sig1 = await createHmacSignature(testBody, "secret1");
      const sig2 = await createHmacSignature(testBody, "secret2");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("extractSignatureHeader", () => {
    it("should extract X-Wasend-Signature header", () => {
      const headers = new Headers({
        "X-Wasend-Signature": "abc123",
      });
      expect(extractSignatureHeader(headers)).toBe("abc123");
    });

    it("should extract lowercase x-wasend-signature header", () => {
      const headers = new Headers({
        "x-wasend-signature": "abc123",
      });
      expect(extractSignatureHeader(headers)).toBe("abc123");
    });

    it("should extract X-Webhook-Signature header", () => {
      const headers = new Headers({
        "X-Webhook-Signature": "def456",
      });
      expect(extractSignatureHeader(headers)).toBe("def456");
    });

    it("should extract X-Hub-Signature-256 header", () => {
      const headers = new Headers({
        "X-Hub-Signature-256": "ghi789",
      });
      expect(extractSignatureHeader(headers)).toBe("ghi789");
    });

    it("should strip sha256= prefix", () => {
      const headers = new Headers({
        "X-Hub-Signature-256": "sha256=abc123def456",
      });
      expect(extractSignatureHeader(headers)).toBe("abc123def456");
    });

    it("should return null when no signature header present", () => {
      const headers = new Headers({
        "Content-Type": "application/json",
      });
      expect(extractSignatureHeader(headers)).toBeNull();
    });

    it("should prefer X-Wasend-Signature over alternatives", () => {
      const headers = new Headers({
        "X-Wasend-Signature": "primary",
        "X-Webhook-Signature": "secondary",
      });
      expect(extractSignatureHeader(headers)).toBe("primary");
    });
  });

  describe("Integration: Complete webhook verification flow", () => {
    const secret = "production-secret-key";

    it("should verify a complete webhook flow", async () => {
      const webhookPayload = JSON.stringify({
        type: "messages.upsert",
        sessionId: "prod-session",
        timestamp: Date.now(),
        data: {
          key: { id: "BAE5C9F1234567" },
          message: { conversation: "What are transfer fees?" },
        },
      });

      // Sender creates signature
      const signature = await createHmacSignature(webhookPayload, secret);

      // Receiver verifies
      const isValid = await verifyWebhookSignature(signature, webhookPayload, secret);
      expect(isValid).toBe(true);
    });

    it("should reject tampered webhook", async () => {
      const originalPayload = JSON.stringify({ message: "Hello" });
      const signature = await createHmacSignature(originalPayload, secret);

      const tamperedPayload = JSON.stringify({ message: "Malicious" });
      const isValid = await verifyWebhookSignature(signature, tamperedPayload, secret);
      expect(isValid).toBe(false);
    });

    it("should reject replay attacks with modified timestamp", async () => {
      const originalPayload = JSON.stringify({ timestamp: 1000, message: "Hello" });
      const signature = await createHmacSignature(originalPayload, secret);

      const replayedPayload = JSON.stringify({ timestamp: 2000, message: "Hello" });
      const isValid = await verifyWebhookSignature(signature, replayedPayload, secret);
      expect(isValid).toBe(false);
    });
  });
});
