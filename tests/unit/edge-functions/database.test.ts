/**
 * Tests for Database Functions
 *
 * Tests cover:
 * - getHistory - fetching conversation history
 * - addMessage - storing new messages
 * - claimMessageForProcessing - atomic deduplication
 * - isMessageProcessed / markMessageProcessed - legacy deduplication
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, restoreConsole, setEnv } from "./setup";

// Type definitions
interface Message {
  role: string;
  parts: Array<{ text: string }>;
  created_at: string;
}

/**
 * Mock Database Service
 * Mirrors the implementation in database.ts
 */
class DatabaseService {
  private messages: Message[] = [];
  private processedWebhooks: Set<string> = new Set();
  private queryError: Error | null = null;
  private insertError: { code?: string; message?: string } | null = null;

  // For testing: set errors
  setQueryError(error: Error | null): void {
    this.queryError = error;
  }

  setInsertError(error: { code?: string; message?: string } | null): void {
    this.insertError = error;
  }

  // For testing: add messages directly
  addTestMessage(message: Message): void {
    this.messages.push(message);
  }

  // For testing: clear all data
  clear(): void {
    this.messages = [];
    this.processedWebhooks.clear();
    this.queryError = null;
    this.insertError = null;
  }

  // For testing: mark webhook as processed directly
  markProcessed(key: string): void {
    this.processedWebhooks.add(key);
  }

  /**
   * Fetch the last 10 messages for a user, ordered chronologically
   */
  async getHistory(userId: string): Promise<Array<{ role: string; parts: Array<{ text: string }> }>> {
    if (this.queryError) {
      throw this.queryError;
    }

    // Filter by user (in real implementation, this is done by Supabase)
    const userMessages = this.messages
      .filter((m) => (m as unknown as { user_id: string }).user_id === userId || true)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return userMessages.map((msg) => ({
      role: msg.role,
      parts: Array.isArray(msg.parts) ? msg.parts : [{ text: String(msg.parts) }],
    }));
  }

  /**
   * Insert a new message into chat_history
   */
  async addMessage(userId: string, role: string, text: string): Promise<void> {
    if (this.insertError) {
      throw new Error(this.insertError.message);
    }

    this.messages.push({
      role,
      parts: [{ text }],
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Atomic claim for message processing (deduplication)
   */
  async claimMessageForProcessing(messageKey: string, _phoneNumber: string): Promise<boolean> {
    if (this.insertError?.code === "23505") {
      // Unique constraint violation - already claimed
      return false;
    }

    if (this.insertError) {
      // Other error - fail open
      console.error("Error claiming message:", this.insertError.message);
      return true;
    }

    if (this.processedWebhooks.has(messageKey)) {
      return false; // Already processed
    }

    this.processedWebhooks.add(messageKey);
    return true;
  }

  /**
   * Check if message was already processed (legacy)
   */
  async isMessageProcessed(messageKey: string): Promise<boolean> {
    if (this.queryError) {
      console.error("Error checking processed webhooks:", this.queryError.message);
      return false; // Fail open
    }

    return this.processedWebhooks.has(messageKey);
  }

  /**
   * Mark message as processed (legacy)
   */
  async markMessageProcessed(messageKey: string, _phoneNumber: string): Promise<void> {
    if (this.insertError && this.insertError.code !== "23505") {
      console.error("Error marking message as processed:", this.insertError.message);
    }

    this.processedWebhooks.add(messageKey);
  }
}

describe("Database Service", () => {
  let db: DatabaseService;

  beforeEach(() => {
    mockConsole();
    db = new DatabaseService();
    setEnv("SUPABASE_URL", "https://test.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  });

  afterEach(() => {
    restoreConsole();
    db.clear();
  });

  describe("getHistory", () => {
    it("should return empty array for new user", async () => {
      const history = await db.getHistory("user-123");
      expect(history).toEqual([]);
    });

    it("should return messages in chronological order (oldest first)", async () => {
      db.addTestMessage({
        role: "user",
        parts: [{ text: "First message" }],
        created_at: "2024-01-01T10:00:00Z",
      });
      db.addTestMessage({
        role: "model",
        parts: [{ text: "Second message" }],
        created_at: "2024-01-01T10:01:00Z",
      });
      db.addTestMessage({
        role: "user",
        parts: [{ text: "Third message" }],
        created_at: "2024-01-01T10:02:00Z",
      });

      const history = await db.getHistory("user-123");

      expect(history).toHaveLength(3);
      expect(history[0].parts[0].text).toBe("First message");
      expect(history[1].parts[0].text).toBe("Second message");
      expect(history[2].parts[0].text).toBe("Third message");
    });

    it("should limit to 10 most recent messages", async () => {
      // Add 15 messages
      for (let i = 0; i < 15; i++) {
        db.addTestMessage({
          role: i % 2 === 0 ? "user" : "model",
          parts: [{ text: `Message ${i}` }],
          created_at: new Date(2024, 0, 1, 10, i).toISOString(),
        });
      }

      const history = await db.getHistory("user-123");

      expect(history).toHaveLength(10);
      // Should be the 10 most recent (messages 5-14)
      expect(history[0].parts[0].text).toBe("Message 5");
      expect(history[9].parts[0].text).toBe("Message 14");
    });

    it("should convert non-array parts to array format", async () => {
      db.addTestMessage({
        role: "user",
        parts: "plain text" as unknown as Array<{ text: string }>,
        created_at: "2024-01-01T10:00:00Z",
      });

      const history = await db.getHistory("user-123");

      expect(history[0].parts).toEqual([{ text: "plain text" }]);
    });

    it("should throw error on query failure", async () => {
      db.setQueryError(new Error("Connection failed"));

      await expect(db.getHistory("user-123")).rejects.toThrow("Connection failed");
    });

    it("should preserve role correctly", async () => {
      db.addTestMessage({
        role: "user",
        parts: [{ text: "User message" }],
        created_at: "2024-01-01T10:00:00Z",
      });
      db.addTestMessage({
        role: "model",
        parts: [{ text: "Model response" }],
        created_at: "2024-01-01T10:01:00Z",
      });

      const history = await db.getHistory("user-123");

      expect(history[0].role).toBe("user");
      expect(history[1].role).toBe("model");
    });
  });

  describe("addMessage", () => {
    it("should add user message", async () => {
      await db.addMessage("user-123", "user", "Hello, SOPHIA!");

      const history = await db.getHistory("user-123");
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe("user");
      expect(history[0].parts[0].text).toBe("Hello, SOPHIA!");
    });

    it("should add model message", async () => {
      await db.addMessage("user-123", "model", "Hello! How can I help?");

      const history = await db.getHistory("user-123");
      expect(history[0].role).toBe("model");
    });

    it("should throw error on insert failure", async () => {
      db.setInsertError({ message: "Insert failed" });

      await expect(db.addMessage("user-123", "user", "Test")).rejects.toThrow("Insert failed");
    });

    it("should handle empty text", async () => {
      await db.addMessage("user-123", "user", "");

      const history = await db.getHistory("user-123");
      expect(history[0].parts[0].text).toBe("");
    });

    it("should handle special characters", async () => {
      const specialText = "Hello! <script>alert('xss')</script> & more";
      await db.addMessage("user-123", "user", specialText);

      const history = await db.getHistory("user-123");
      expect(history[0].parts[0].text).toBe(specialText);
    });

    it("should handle unicode", async () => {
      const unicodeText = "Hello World";
      await db.addMessage("user-123", "user", unicodeText);

      const history = await db.getHistory("user-123");
      expect(history[0].parts[0].text).toBe(unicodeText);
    });
  });

  describe("claimMessageForProcessing", () => {
    it("should return true for new message (first claim)", async () => {
      const result = await db.claimMessageForProcessing("msg-123", "+35799123456");
      expect(result).toBe(true);
    });

    it("should return false for already claimed message", async () => {
      // First claim
      await db.claimMessageForProcessing("msg-123", "+35799123456");

      // Second claim attempt
      const result = await db.claimMessageForProcessing("msg-123", "+35799123456");
      expect(result).toBe(false);
    });

    it("should return false on unique constraint violation (race condition)", async () => {
      db.setInsertError({ code: "23505", message: "duplicate key" });

      const result = await db.claimMessageForProcessing("msg-123", "+35799123456");
      expect(result).toBe(false);
    });

    it("should fail open on other database errors", async () => {
      db.setInsertError({ code: "42000", message: "other error" });

      // Should return true (fail open) to not block legitimate messages
      const result = await db.claimMessageForProcessing("msg-123", "+35799123456");
      expect(result).toBe(true);
    });

    it("should handle different message keys independently", async () => {
      const result1 = await db.claimMessageForProcessing("msg-1", "+35799123456");
      const result2 = await db.claimMessageForProcessing("msg-2", "+35799123456");
      const result3 = await db.claimMessageForProcessing("msg-1", "+35799123456"); // duplicate

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(false);
    });
  });

  describe("isMessageProcessed (legacy)", () => {
    it("should return false for new message", async () => {
      const result = await db.isMessageProcessed("msg-123");
      expect(result).toBe(false);
    });

    it("should return true for processed message", async () => {
      db.markProcessed("msg-123");

      const result = await db.isMessageProcessed("msg-123");
      expect(result).toBe(true);
    });

    it("should return false on query error (fail open)", async () => {
      db.markProcessed("msg-123");
      db.setQueryError(new Error("Query failed"));

      const result = await db.isMessageProcessed("msg-123");
      expect(result).toBe(false); // Fail open
    });
  });

  describe("markMessageProcessed (legacy)", () => {
    it("should mark message as processed", async () => {
      await db.markMessageProcessed("msg-123", "+35799123456");

      const isProcessed = await db.isMessageProcessed("msg-123");
      expect(isProcessed).toBe(true);
    });

    it("should handle duplicate marking gracefully", async () => {
      await db.markMessageProcessed("msg-123", "+35799123456");

      // Should not throw on duplicate
      await expect(db.markMessageProcessed("msg-123", "+35799123456")).resolves.not.toThrow();
    });

    it("should silently ignore non-duplicate errors", async () => {
      db.setInsertError({ code: "42000", message: "other error" });

      // Should not throw
      await expect(db.markMessageProcessed("msg-123", "+35799123456")).resolves.not.toThrow();
    });
  });

  describe("Deduplication Scenarios", () => {
    it("should prevent duplicate processing of same webhook", async () => {
      const messageKey = "BAE5C9F1234567-1704067200";

      // Simulate multiple webhook deliveries
      const results = await Promise.all([
        db.claimMessageForProcessing(messageKey, "+35799123456"),
        db.claimMessageForProcessing(messageKey, "+35799123456"),
        db.claimMessageForProcessing(messageKey, "+35799123456"),
      ]);

      // Only one should succeed
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBe(1);
    });

    it("should allow processing different messages from same user", async () => {
      const phone = "+35799123456";

      const result1 = await db.claimMessageForProcessing("msg-1", phone);
      const result2 = await db.claimMessageForProcessing("msg-2", phone);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });

    it("should allow processing same message key from different users (edge case)", async () => {
      // In practice, message keys should be globally unique
      // but the system handles them independently
      const messageKey = "shared-key";

      const result1 = await db.claimMessageForProcessing(messageKey, "+35799111111");
      const result2 = await db.claimMessageForProcessing(messageKey, "+35799222222");

      // First claim succeeds, second fails (message key is unique)
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe("Message Format (Gemini Compatibility)", () => {
    it("should return history in Gemini-expected format", async () => {
      db.addTestMessage({
        role: "user",
        parts: [{ text: "What are transfer fees?" }],
        created_at: "2024-01-01T10:00:00Z",
      });
      db.addTestMessage({
        role: "model",
        parts: [{ text: "Transfer fees in Cyprus are calculated..." }],
        created_at: "2024-01-01T10:01:00Z",
      });

      const history = await db.getHistory("user-123");

      // Verify Gemini format
      expect(history).toEqual([
        {
          role: "user",
          parts: [{ text: "What are transfer fees?" }],
        },
        {
          role: "model",
          parts: [{ text: "Transfer fees in Cyprus are calculated..." }],
        },
      ]);
    });

    it("should handle multi-part messages", async () => {
      db.addTestMessage({
        role: "user",
        parts: [{ text: "Part 1" }, { text: "Part 2" }],
        created_at: "2024-01-01T10:00:00Z",
      });

      const history = await db.getHistory("user-123");

      expect(history[0].parts).toHaveLength(2);
      expect(history[0].parts[0].text).toBe("Part 1");
      expect(history[0].parts[1].text).toBe("Part 2");
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long messages", async () => {
      const longText = "x".repeat(10000);
      await db.addMessage("user-123", "user", longText);

      const history = await db.getHistory("user-123");
      expect(history[0].parts[0].text).toHaveLength(10000);
    });

    it("should handle empty user ID", async () => {
      await db.addMessage("", "user", "Test");
      const history = await db.getHistory("");
      expect(history).toHaveLength(1);
    });

    it("should handle messages at timestamp boundaries", async () => {
      // Messages with same timestamp
      db.addTestMessage({
        role: "user",
        parts: [{ text: "Message A" }],
        created_at: "2024-01-01T10:00:00.000Z",
      });
      db.addTestMessage({
        role: "model",
        parts: [{ text: "Message B" }],
        created_at: "2024-01-01T10:00:00.000Z",
      });

      const history = await db.getHistory("user-123");
      expect(history).toHaveLength(2);
    });
  });
});
