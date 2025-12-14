import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createHmacSignature,
  verifyWebhookSignature,
} from "@/lib/whatsapp/webhook-utils";

describe("WhatsApp Webhook Utils", () => {
  const testSecret = "test-webhook-secret-12345";
  const testPayload = JSON.stringify({
    type: "messages.upsert",
    sessionId: "session-123",
    data: {
      key: {
        id: "msg-123",
        fromMe: false,
        remoteId: "1234567890@s.whatsapp.net",
      },
      message: { conversation: "Hello SOFIA" },
      pushName: "Test User",
    },
  });

  describe("createHmacSignature", () => {
    it("should create consistent signatures for same input", () => {
      const sig1 = createHmacSignature(testPayload, testSecret);
      const sig2 = createHmacSignature(testPayload, testSecret);

      assert.strictEqual(sig1, sig2);
    });

    it("should create different signatures for different payloads", () => {
      const sig1 = createHmacSignature("payload1", testSecret);
      const sig2 = createHmacSignature("payload2", testSecret);

      assert.notStrictEqual(sig1, sig2);
    });

    it("should create different signatures for different secrets", () => {
      const sig1 = createHmacSignature(testPayload, "secret1");
      const sig2 = createHmacSignature(testPayload, "secret2");

      assert.notStrictEqual(sig1, sig2);
    });

    it("should return a hex string", () => {
      const sig = createHmacSignature(testPayload, testSecret);

      assert.ok(/^[a-f0-9]+$/.test(sig), "Signature should be hex");
      assert.strictEqual(sig.length, 64, "SHA256 hex should be 64 chars");
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should accept valid signatures", () => {
      const validSignature = createHmacSignature(testPayload, testSecret);
      const result = verifyWebhookSignature(
        testPayload,
        validSignature,
        testSecret
      );

      assert.strictEqual(result, true);
    });

    it("should reject invalid signatures", () => {
      const result = verifyWebhookSignature(
        testPayload,
        "invalid-signature",
        testSecret
      );

      assert.strictEqual(result, false);
    });

    it("should reject null signatures", () => {
      const result = verifyWebhookSignature(testPayload, null, testSecret);

      assert.strictEqual(result, false);
    });

    it("should reject empty string signatures", () => {
      const result = verifyWebhookSignature(testPayload, "", testSecret);

      // Empty string will fail timing-safe compare with different length
      assert.strictEqual(result, false);
    });

    it("should reject modified payloads", () => {
      const validSignature = createHmacSignature(testPayload, testSecret);
      const modifiedPayload = testPayload.replace(
        "Hello SOFIA",
        "Malicious message"
      );
      const result = verifyWebhookSignature(
        modifiedPayload,
        validSignature,
        testSecret
      );

      assert.strictEqual(result, false);
    });

    it("should reject signatures with wrong secret", () => {
      const signatureWithWrongSecret = createHmacSignature(
        testPayload,
        "wrong-secret"
      );
      const result = verifyWebhookSignature(
        testPayload,
        signatureWithWrongSecret,
        testSecret
      );

      assert.strictEqual(result, false);
    });

    it("should handle case-sensitive signatures correctly", () => {
      const validSignature = createHmacSignature(testPayload, testSecret);
      const uppercaseSignature = validSignature.toUpperCase();
      const result = verifyWebhookSignature(
        testPayload,
        uppercaseSignature,
        testSecret
      );

      // SHA256 hex is lowercase, uppercase should fail
      assert.strictEqual(result, false);
    });

    it("should handle empty payload", () => {
      const emptyPayload = "";
      const validSignature = createHmacSignature(emptyPayload, testSecret);
      const result = verifyWebhookSignature(
        emptyPayload,
        validSignature,
        testSecret
      );

      assert.strictEqual(result, true);
    });

    it("should handle unicode payloads", () => {
      const unicodePayload = JSON.stringify({ message: "Hello 世界 🌍" });
      const validSignature = createHmacSignature(unicodePayload, testSecret);
      const result = verifyWebhookSignature(
        unicodePayload,
        validSignature,
        testSecret
      );

      assert.strictEqual(result, true);
    });

    it("should be resistant to timing attacks (different length signatures)", () => {
      // Different length signatures should not cause timing differences
      const shortSig = "abc";
      const longSig = "a".repeat(100);

      const start1 = Date.now();
      verifyWebhookSignature(testPayload, shortSig, testSecret);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      verifyWebhookSignature(testPayload, longSig, testSecret);
      const time2 = Date.now() - start2;

      // Both should complete quickly and return false
      assert.ok(time1 < 100, "Short sig check should be fast");
      assert.ok(time2 < 100, "Long sig check should be fast");
    });
  });

  describe("Integration scenarios", () => {
    it("should verify a complete webhook flow", () => {
      // Simulate WaSenderAPI sending a webhook
      const webhookPayload = JSON.stringify({
        type: "messages.upsert",
        sessionId: "prod-session",
        timestamp: Date.now(),
        data: {
          key: {
            id: "BAE5C9F1234567",
            fromMe: false,
            remoteId: "35799123456@s.whatsapp.net",
          },
          message: {
            conversation: "What are the transfer fees for a €500,000 property?",
          },
          pushName: "John Smith",
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      });

      // WaSenderAPI creates signature with shared secret
      const wasenderSignature = createHmacSignature(webhookPayload, testSecret);

      // Our server verifies the signature
      const isValid = verifyWebhookSignature(
        webhookPayload,
        wasenderSignature,
        testSecret
      );

      assert.strictEqual(isValid, true, "Webhook signature should be valid");
    });

    it("should reject tampered webhook", () => {
      const originalPayload = JSON.stringify({
        type: "messages.upsert",
        data: { message: { conversation: "Hello" } },
      });

      const validSignature = createHmacSignature(originalPayload, testSecret);

      // Attacker intercepts and modifies payload
      const tamperedPayload = JSON.stringify({
        type: "messages.upsert",
        data: { message: { conversation: "Transfer all funds to attacker" } },
      });

      const isValid = verifyWebhookSignature(
        tamperedPayload,
        validSignature,
        testSecret
      );

      assert.strictEqual(isValid, false, "Tampered webhook should be rejected");
    });
  });
});
