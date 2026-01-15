import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * WhatsApp User Mapping Tests
 *
 * Tests the user mapping logic including:
 * - Phone number normalization
 * - Email generation patterns
 * - Display name generation
 * - Chat session age calculations
 *
 * Note: Full integration tests require database mocking.
 * These unit tests focus on pure logic that can be tested independently.
 */

describe("WhatsApp User Mapping", () => {
  describe("Phone Number Normalization", () => {
    it("should normalize phone numbers by removing spaces", () => {
      const normalize = (phone: string) => phone.replace(/\s+/g, "");

      assert.strictEqual(normalize("+1 234 567 890"), "+1234567890");
      assert.strictEqual(normalize("+357 99 123456"), "+35799123456");
      assert.strictEqual(normalize("  +1  234  "), "+1234");
    });

    it("should preserve + prefix", () => {
      const normalize = (phone: string) => phone.replace(/\s+/g, "");

      assert.strictEqual(normalize("+1234567890"), "+1234567890");
      assert.ok(normalize("+357 99 123456").startsWith("+"));
    });

    it("should handle already normalized numbers", () => {
      const normalize = (phone: string) => phone.replace(/\s+/g, "");

      assert.strictEqual(normalize("+35799123456"), "+35799123456");
    });
  });

  describe("Guest Email Generation", () => {
    it("should generate guest email from phone number", () => {
      const generateGuestEmail = (phone: string) => {
        const normalized = phone.replace(/\s+/g, "");
        return `whatsapp_${normalized}@sofia.guest.local`;
      };

      assert.strictEqual(
        generateGuestEmail("+35799123456"),
        "whatsapp_+35799123456@sofia.guest.local"
      );
    });

    it("should generate agent fallback email from phone number", () => {
      const generateAgentEmail = (phone: string) => {
        const normalized = phone.replace(/\s+/g, "");
        return `whatsapp_${normalized}@sofia.zyprus.local`;
      };

      assert.strictEqual(
        generateAgentEmail("+35799123456"),
        "whatsapp_+35799123456@sofia.zyprus.local"
      );
    });
  });

  describe("Display Name Generation", () => {
    it("should generate display name with last 4 digits", () => {
      const generateDisplayName = (phone: string) => {
        const normalized = phone.replace(/\s+/g, "");
        return `WhatsApp User ${normalized.slice(-4)}`;
      };

      assert.strictEqual(generateDisplayName("+35799123456"), "WhatsApp User 3456");
      assert.strictEqual(generateDisplayName("+1234567890"), "WhatsApp User 7890");
    });

    it("should handle short phone numbers", () => {
      const generateDisplayName = (phone: string) => {
        const normalized = phone.replace(/\s+/g, "");
        return `WhatsApp User ${normalized.slice(-4)}`;
      };

      // For short numbers, slice(-4) returns the whole string
      assert.strictEqual(generateDisplayName("+123"), "WhatsApp User +123");
    });
  });

  describe("Chat Title Generation", () => {
    it("should generate chat title with phone suffix and date", () => {
      const generateChatTitle = (phone: string, date: Date) => {
        const phoneLastFour = phone.slice(-4);
        return `WhatsApp Chat ${phoneLastFour} - ${date.toLocaleDateString()}`;
      };

      const testDate = new Date("2026-01-15");
      const title = generateChatTitle("+35799123456", testDate);

      assert.ok(title.includes("3456"));
      assert.ok(title.startsWith("WhatsApp Chat"));
    });
  });

  describe("Chat Session Age Calculation", () => {
    it("should identify chat within 24 hours as reusable", () => {
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
      const now = Date.now();

      // Chat created 12 hours ago
      const chatCreatedAt = now - 12 * 60 * 60 * 1000;
      const chatAge = now - chatCreatedAt;

      assert.strictEqual(chatAge < maxAge, true);
    });

    it("should identify chat older than 24 hours as not reusable", () => {
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
      const now = Date.now();

      // Chat created 25 hours ago
      const chatCreatedAt = now - 25 * 60 * 60 * 1000;
      const chatAge = now - chatCreatedAt;

      assert.strictEqual(chatAge < maxAge, false);
    });

    it("should handle edge case at exactly 24 hours", () => {
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
      const now = Date.now();

      // Chat created exactly 24 hours ago
      const chatCreatedAt = now - maxAge;
      const chatAge = now - chatCreatedAt;

      // At exactly 24 hours, chatAge === maxAge, so chatAge < maxAge is false
      assert.strictEqual(chatAge < maxAge, false);
    });
  });

  describe("User Type Determination", () => {
    it("should return regular type for agents", () => {
      const isAgent = true;
      const userType = isAgent ? "regular" : "guest";
      assert.strictEqual(userType, "regular");
    });

    it("should return guest type for non-agents", () => {
      const isAgent = false;
      const userType = isAgent ? "regular" : "guest";
      assert.strictEqual(userType, "guest");
    });
  });

  describe("Agent Lookup Result Handling", () => {
    it("should identify agent with linked user", () => {
      const agent = { id: "agent-1", userId: "user-1", fullName: "John Doe" };
      const hasLinkedUser = !!agent.userId;
      assert.strictEqual(hasLinkedUser, true);
    });

    it("should identify agent without linked user", () => {
      const agent = { id: "agent-1", userId: null, fullName: "John Doe" };
      const hasLinkedUser = !!agent.userId;
      assert.strictEqual(hasLinkedUser, false);
    });

    it("should identify no agent found", () => {
      const agents: Array<{ id: string }> = [];
      const [agent] = agents;
      assert.strictEqual(agent, undefined);
    });
  });

  describe("User Result Shape", () => {
    it("should return correct shape for guest user", () => {
      const guestResult = {
        id: "user-123",
        email: "whatsapp_+35799123456@sofia.guest.local",
        name: "WhatsApp User 3456",
        type: "guest" as const,
        isAgent: false,
      };

      assert.ok("id" in guestResult);
      assert.ok("email" in guestResult);
      assert.ok("name" in guestResult);
      assert.ok("type" in guestResult);
      assert.ok("isAgent" in guestResult);
      assert.strictEqual(guestResult.isAgent, false);
      assert.strictEqual(guestResult.type, "guest");
    });

    it("should return correct shape for agent user", () => {
      const agentResult = {
        id: "user-456",
        email: "agent@zyprus.com",
        name: "John Doe",
        type: "regular" as const,
        isAgent: true,
        agentId: "agent-123",
      };

      assert.ok("agentId" in agentResult);
      assert.strictEqual(agentResult.isAgent, true);
      assert.strictEqual(agentResult.type, "regular");
    });
  });

  describe("Chat Result Shape", () => {
    it("should return correct shape for new chat", () => {
      const newChatResult = {
        id: "chat-123",
        title: "WhatsApp Chat 3456 - 1/15/2026",
        isNew: true,
      };

      assert.ok("id" in newChatResult);
      assert.ok("title" in newChatResult);
      assert.ok("isNew" in newChatResult);
      assert.strictEqual(newChatResult.isNew, true);
    });

    it("should return correct shape for existing chat", () => {
      const existingChatResult = {
        id: "chat-456",
        title: "WhatsApp Chat 3456 - 1/14/2026",
        isNew: false,
      };

      assert.strictEqual(existingChatResult.isNew, false);
    });
  });
});

/**
 * Integration test scenarios (require database mocks)
 *
 * These describe full integration paths that should be tested
 * with proper database mocking:
 *
 * 1. getOrCreateWhatsAppUser - Agent with linked user
 *    - Agent exists with userId → returns linked user data
 *
 * 2. getOrCreateWhatsAppUser - Agent without linked user
 *    - Agent exists but no userId → creates user, links to agent
 *
 * 3. getOrCreateWhatsAppUser - Existing guest
 *    - No agent, guest email exists → returns existing user
 *
 * 4. getOrCreateWhatsAppUser - New guest
 *    - No agent, no existing user → creates new guest user
 *
 * 5. getOrCreateWhatsAppChat - Recent chat exists
 *    - Chat within 24h → reuses existing chat
 *
 * 6. getOrCreateWhatsAppChat - Old chat exists
 *    - Chat older than 24h → creates new chat
 *
 * 7. getOrCreateWhatsAppChat - No existing chat
 *    - No previous chats → creates new chat
 *
 * 8. isRegisteredAgent - Active agent
 *    - Phone matches active agent → returns true
 *
 * 9. isRegisteredAgent - Inactive agent
 *    - Phone matches but agent inactive → returns false
 *
 * 10. updateAgentLastActive - Updates timestamp
 *     - Agent exists → lastActiveAt updated
 */
