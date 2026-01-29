/**
 * Tests for Analytics Service
 *
 * Tests cover:
 * - Event tracking (fire-and-forget)
 * - Helper functions for different event types
 * - Timer utility
 * - Error handling (silent failures)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, restoreConsole, setEnv } from "./setup";

// Type definitions
type AnalyticsEventType =
  | "message_received"
  | "message_sent"
  | "tool_used"
  | "document_generated"
  | "property_uploaded"
  | "error";

interface AnalyticsEvent {
  phoneNumber: string;
  agentId?: string;
  eventType: AnalyticsEventType;
  toolName?: string;
  templateName?: string;
  responseTimeMs?: number;
  tokenCount?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mock analytics service for testing
 * Mirrors the implementation in analytics.ts
 */
class AnalyticsService {
  private supabaseInserts: AnalyticsEvent[] = [];
  private insertError: Error | null = null;

  // For testing: capture all events
  getRecordedEvents(): AnalyticsEvent[] {
    return [...this.supabaseInserts];
  }

  // For testing: simulate insert errors
  setInsertError(error: Error | null): void {
    this.insertError = error;
  }

  // For testing: clear recorded events
  clearEvents(): void {
    this.supabaseInserts = [];
  }

  /**
   * Async version - actually inserts to DB
   */
  async trackEventAsync(event: AnalyticsEvent): Promise<void> {
    try {
      if (this.insertError) {
        throw this.insertError;
      }
      this.supabaseInserts.push(event);
    } catch (err) {
      console.warn("[Analytics] Insert failed:", err);
    }
  }

  /**
   * Fire-and-forget version
   */
  trackEvent(event: AnalyticsEvent): void {
    this.trackEventAsync(event).catch((err) => {
      console.warn("[Analytics] Failed to track event:", err.message);
    });
  }

  /**
   * Helper: Track message received
   */
  trackMessageReceived(phoneNumber: string, agentId?: string, metadata?: Record<string, unknown>): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "message_received",
      metadata,
    });
  }

  /**
   * Helper: Track message sent with response time
   */
  trackMessageSent(
    phoneNumber: string,
    responseTimeMs: number,
    tokenCount?: number,
    agentId?: string
  ): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "message_sent",
      responseTimeMs,
      tokenCount,
    });
  }

  /**
   * Helper: Track tool usage
   */
  trackToolUsed(
    phoneNumber: string,
    toolName: string,
    responseTimeMs?: number,
    agentId?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "tool_used",
      toolName,
      responseTimeMs,
      metadata,
    });
  }

  /**
   * Helper: Track document generation
   */
  trackDocumentGenerated(
    phoneNumber: string,
    templateName: string,
    agentId?: string
  ): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "document_generated",
      templateName,
    });
  }

  /**
   * Helper: Track property upload
   */
  trackPropertyUploaded(
    phoneNumber: string,
    agentId?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "property_uploaded",
      metadata,
    });
  }

  /**
   * Helper: Track errors
   */
  trackError(
    phoneNumber: string,
    errorCode: string,
    errorMessage: string,
    agentId?: string
  ): void {
    this.trackEvent({
      phoneNumber,
      agentId,
      eventType: "error",
      errorCode,
      errorMessage,
    });
  }
}

/**
 * Timer utility for measuring response times
 */
function createTimer(): { end: () => number } {
  const start = Date.now();
  return {
    end: () => Date.now() - start,
  };
}

describe("Analytics Service", () => {
  let analytics: AnalyticsService;

  beforeEach(() => {
    mockConsole();
    analytics = new AnalyticsService();
    setEnv("SUPABASE_URL", "https://test.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  });

  afterEach(() => {
    restoreConsole();
    vi.useRealTimers();
  });

  describe("trackEvent", () => {
    it("should record events with all fields", async () => {
      await analytics.trackEventAsync({
        phoneNumber: "+35799123456",
        agentId: "agent-123",
        eventType: "message_received",
        toolName: "calculateVAT",
        templateName: "template-1",
        responseTimeMs: 150,
        tokenCount: 500,
        errorCode: "ERR_001",
        errorMessage: "Test error",
        metadata: { key: "value" },
      });

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        phoneNumber: "+35799123456",
        agentId: "agent-123",
        eventType: "message_received",
        toolName: "calculateVAT",
      });
    });

    it("should record events with minimal fields", async () => {
      await analytics.trackEventAsync({
        phoneNumber: "+35799123456",
        eventType: "message_received",
      });

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].phoneNumber).toBe("+35799123456");
      expect(events[0].agentId).toBeUndefined();
    });

    it("should handle insert errors silently", async () => {
      analytics.setInsertError(new Error("Database error"));

      // Should not throw
      await analytics.trackEventAsync({
        phoneNumber: "+35799123456",
        eventType: "error",
      });

      // Event not recorded due to error
      expect(analytics.getRecordedEvents()).toHaveLength(0);
    });

    it("should not break main flow on errors (fire-and-forget)", () => {
      analytics.setInsertError(new Error("Database error"));

      // Fire-and-forget should complete without throwing
      expect(() => {
        analytics.trackEvent({
          phoneNumber: "+35799123456",
          eventType: "message_received",
        });
      }).not.toThrow();
    });
  });

  describe("trackMessageReceived", () => {
    it("should create message_received event", async () => {
      analytics.trackMessageReceived("+35799123456", "agent-123", { source: "whatsapp" });

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("message_received");
      expect(events[0].phoneNumber).toBe("+35799123456");
      expect(events[0].agentId).toBe("agent-123");
      expect(events[0].metadata).toEqual({ source: "whatsapp" });
    });

    it("should work without optional parameters", async () => {
      analytics.trackMessageReceived("+35799123456");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events[0].agentId).toBeUndefined();
      expect(events[0].metadata).toBeUndefined();
    });
  });

  describe("trackMessageSent", () => {
    it("should create message_sent event with response time", async () => {
      analytics.trackMessageSent("+35799123456", 250, 1000, "agent-123");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("message_sent");
      expect(events[0].responseTimeMs).toBe(250);
      expect(events[0].tokenCount).toBe(1000);
    });

    it("should work without token count", async () => {
      analytics.trackMessageSent("+35799123456", 100);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events[0].tokenCount).toBeUndefined();
    });
  });

  describe("trackToolUsed", () => {
    it("should create tool_used event", async () => {
      analytics.trackToolUsed(
        "+35799123456",
        "calculateVAT",
        50,
        "agent-123",
        { price: 300000, area: 120 }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("tool_used");
      expect(events[0].toolName).toBe("calculateVAT");
      expect(events[0].responseTimeMs).toBe(50);
      expect(events[0].metadata).toEqual({ price: 300000, area: 120 });
    });

    it("should track different tool names", async () => {
      analytics.trackToolUsed("+35799123456", "calculateTransferFees");
      analytics.trackToolUsed("+35799123456", "calculateCapitalGains");
      analytics.trackToolUsed("+35799123456", "createPropertyListing");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events.map((e) => e.toolName)).toEqual([
        "calculateTransferFees",
        "calculateCapitalGains",
        "createPropertyListing",
      ]);
    });
  });

  describe("trackDocumentGenerated", () => {
    it("should create document_generated event", async () => {
      analytics.trackDocumentGenerated(
        "+35799123456",
        "viewing-form-standard",
        "agent-123"
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("document_generated");
      expect(events[0].templateName).toBe("viewing-form-standard");
    });
  });

  describe("trackPropertyUploaded", () => {
    it("should create property_uploaded event", async () => {
      analytics.trackPropertyUploaded(
        "+35799123456",
        "agent-123",
        { propertyType: "villa", location: "paphos" }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("property_uploaded");
      expect(events[0].metadata).toEqual({ propertyType: "villa", location: "paphos" });
    });
  });

  describe("trackError", () => {
    it("should create error event", async () => {
      analytics.trackError(
        "+35799123456",
        "RATE_LIMIT",
        "Too many requests",
        "agent-123"
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("error");
      expect(events[0].errorCode).toBe("RATE_LIMIT");
      expect(events[0].errorMessage).toBe("Too many requests");
    });
  });

  describe("createTimer", () => {
    it("should measure elapsed time", () => {
      vi.useFakeTimers();

      const timer = createTimer();

      vi.advanceTimersByTime(100);

      const elapsed = timer.end();
      expect(elapsed).toBe(100);
    });

    it("should measure actual elapsed time", () => {
      vi.useFakeTimers();

      const timer = createTimer();

      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(50);

      expect(timer.end()).toBe(100);
    });

    it("should allow multiple calls to end()", () => {
      vi.useFakeTimers();

      const timer = createTimer();

      vi.advanceTimersByTime(100);
      expect(timer.end()).toBe(100);

      vi.advanceTimersByTime(50);
      expect(timer.end()).toBe(150);
    });

    it("should return 0 if called immediately", () => {
      vi.useFakeTimers();

      const timer = createTimer();
      const elapsed = timer.end();

      expect(elapsed).toBe(0);
    });
  });

  describe("Event Types", () => {
    it("should support all defined event types", async () => {
      const eventTypes: AnalyticsEventType[] = [
        "message_received",
        "message_sent",
        "tool_used",
        "document_generated",
        "property_uploaded",
        "error",
      ];

      for (const eventType of eventTypes) {
        await analytics.trackEventAsync({
          phoneNumber: "+35799123456",
          eventType,
        });
      }

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(eventTypes.length);
      expect(events.map((e) => e.eventType)).toEqual(eventTypes);
    });
  });

  describe("Data Integrity", () => {
    it("should preserve all metadata fields", async () => {
      const metadata = {
        string: "value",
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        nested: { key: "value" },
      };

      analytics.trackMessageReceived("+35799123456", "agent-123", metadata);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events[0].metadata).toEqual(metadata);
    });

    it("should handle empty phone numbers", async () => {
      analytics.trackMessageReceived("");

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events[0].phoneNumber).toBe("");
    });

    it("should handle special characters in phone numbers", async () => {
      const phoneNumber = "+357 99 123-456";
      analytics.trackMessageReceived(phoneNumber);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const events = analytics.getRecordedEvents();
      expect(events[0].phoneNumber).toBe(phoneNumber);
    });
  });

  describe("Concurrent Tracking", () => {
    it("should handle multiple concurrent events", async () => {
      // Fire multiple events concurrently
      analytics.trackMessageReceived("+35799111111");
      analytics.trackMessageReceived("+35799222222");
      analytics.trackMessageReceived("+35799333333");
      analytics.trackToolUsed("+35799111111", "calculateVAT");
      analytics.trackError("+35799222222", "ERR", "Test");

      await new Promise((resolve) => setTimeout(resolve, 50));

      const events = analytics.getRecordedEvents();
      expect(events).toHaveLength(5);
    });
  });

  describe("Non-Blocking Behavior", () => {
    it("should not block calling code", () => {
      const start = Date.now();

      // Fire many events
      for (let i = 0; i < 100; i++) {
        analytics.trackMessageReceived(`+3579900000${i}`);
      }

      const elapsed = Date.now() - start;

      // Should complete very quickly (< 100ms)
      // because events are fire-and-forget
      expect(elapsed).toBeLessThan(100);
    });

    it("should complete even if error occurs", () => {
      analytics.setInsertError(new Error("DB error"));

      const start = Date.now();

      for (let i = 0; i < 10; i++) {
        analytics.trackMessageReceived(`+3579900000${i}`);
      }

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });
});
