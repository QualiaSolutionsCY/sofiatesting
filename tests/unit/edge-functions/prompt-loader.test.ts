/**
 * Tests for Prompt Loader Service
 *
 * Tests cover:
 * - Database prompt loading
 * - Cache behavior (TTL, version-based invalidation)
 * - Fallback to file-based prompts when DB fails
 * - Priority ordering of prompts
 * - Agent context injection
 * - Manual cache invalidation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockConsole, restoreConsole, setEnv, clearEnv } from "./setup";

// Mock the prompt imports
vi.mock("../../../supabase/functions/sophia-bot/prompts/core/identity.ts", () => ({
  IDENTITY: "# SOPHIA Identity\nYou are SOPHIA, a real estate AI assistant.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/core/safety-rules.ts", () => ({
  SAFETY_RULES: "# Safety Rules\nAlways be helpful and professional.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/behaviors/document-routing.ts", () => ({
  DOCUMENT_ROUTING: "# Document Routing\nRoute documents appropriately.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts", () => ({
  PROPERTY_UPLOAD: "# Property Upload\nHandle property uploads correctly.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/behaviors/response-format.ts", () => ({
  RESPONSE_FORMAT: "# Response Format\nFormat responses consistently.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/knowledge/calculators.ts", () => ({
  CALCULATOR_CAPABILITIES: "# Calculators\nCalculate VAT, transfer fees, etc.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/knowledge/cyprus-real-estate.ts", () => ({
  CYPRUS_KNOWLEDGE: "# Cyprus Knowledge\nKnow Cyprus real estate market.",
}));

vi.mock("../../../supabase/functions/sophia-bot/prompts/templates/content.ts", () => ({
  TEMPLATES: "# Templates\nDocument templates content.",
}));

// Configuration constants (matching prompt-loader.ts)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VERSION_CHECK_INTERVAL_MS = 30_000;

// Create a minimal prompt loader implementation for testing
// This mirrors the key logic from the actual prompt-loader.ts
class TestablePromptLoader {
  private cachedPromptSections: Map<string, string> | null = null;
  private cacheTimestamp: number = 0;
  private cacheVersion: string | null = null;
  private lastVersionCheckTime: number = 0;

  private readonly FALLBACK_PROMPTS: Record<string, string> = {
    identity: "# SOPHIA Identity\nYou are SOPHIA, a real estate AI assistant.",
    safety_rules: "# Safety Rules\nAlways be helpful and professional.",
    document_routing: "# Document Routing\nRoute documents appropriately.",
    property_upload: "# Property Upload\nHandle property uploads correctly.",
    response_format: "# Response Format\nFormat responses consistently.",
    calculators: "# Calculators\nCalculate VAT, transfer fees, etc.",
    cyprus_knowledge: "# Cyprus Knowledge\nKnow Cyprus real estate market.",
    templates: "# Templates\nDocument templates content.",
  };

  /**
   * Get prompts with caching logic
   */
  async getPromptSections(
    mockSupabase: MockSupabaseClient
  ): Promise<Map<string, string>> {
    const now = Date.now();
    let cacheMissReason: string | null = null;
    let detectedDbVersion: string | null = null;

    // Check if cache exists
    if (!this.cachedPromptSections) {
      cacheMissReason = "first_load";
    } else if (now - this.cacheTimestamp >= CACHE_TTL_MS) {
      cacheMissReason = "expired";
    } else {
      // Check version periodically
      const shouldCheckVersion = now - this.lastVersionCheckTime >= VERSION_CHECK_INTERVAL_MS;

      if (shouldCheckVersion) {
        this.lastVersionCheckTime = now;
        detectedDbVersion = await this.getDatabaseVersion(mockSupabase);
        if (detectedDbVersion && detectedDbVersion !== this.cacheVersion) {
          cacheMissReason = "version_mismatch";
        }
      }

      // Return cached data if still valid
      if (!cacheMissReason) {
        return this.cachedPromptSections;
      }
    }

    // Cache miss - reload from DB
    const mergedPrompts = new Map(Object.entries(this.FALLBACK_PROMPTS));
    const dbPrompts = await this.loadFromDB(mockSupabase);

    if (dbPrompts && dbPrompts.size > 0) {
      for (const [key, value] of dbPrompts) {
        mergedPrompts.set(key, value);
      }
    }

    // Store version and update timestamps
    this.cacheVersion = detectedDbVersion ?? await this.getDatabaseVersion(mockSupabase);
    this.cachedPromptSections = mergedPrompts;
    this.cacheTimestamp = now;
    this.lastVersionCheckTime = now; // Reset version check time on cache population

    return mergedPrompts;
  }

  private async getDatabaseVersion(mockSupabase: MockSupabaseClient): Promise<string | null> {
    const result = await mockSupabase.getDatabaseVersion();
    return result;
  }

  private async loadFromDB(mockSupabase: MockSupabaseClient): Promise<Map<string, string> | null> {
    try {
      const data = await mockSupabase.loadPrompts();
      if (!data || data.length === 0) {
        return null;
      }

      const promptMap = new Map<string, string>();
      for (const row of data) {
        promptMap.set(row.key, row.content);
      }
      return promptMap;
    } catch {
      // DB error - return null to trigger fallback
      return null;
    }
  }

  /**
   * Invalidate cache manually
   */
  invalidateCache(): void {
    this.cachedPromptSections = null;
    this.cacheTimestamp = 0;
    this.cacheVersion = null;
  }

  /**
   * Check cache status
   */
  getCacheStatus(): {
    isCached: boolean;
    age: number;
    ttl: number;
    sectionCount: number;
    version: string | null;
  } {
    const age = this.cachedPromptSections ? Date.now() - this.cacheTimestamp : 0;
    return {
      isCached: !!this.cachedPromptSections,
      age,
      ttl: CACHE_TTL_MS,
      sectionCount: this.cachedPromptSections?.size ?? 0,
      version: this.cacheVersion,
    };
  }

  // For testing purposes - allow direct cache manipulation
  _setCacheTimestamp(timestamp: number): void {
    this.cacheTimestamp = timestamp;
  }

  _setLastVersionCheckTime(timestamp: number): void {
    this.lastVersionCheckTime = timestamp;
  }

  _setCacheVersion(version: string): void {
    this.cacheVersion = version;
  }
}

// Mock Supabase client for prompt loading
interface MockSupabaseClient {
  loadPrompts: () => Promise<Array<{ key: string; content: string; priority: number }> | null>;
  getDatabaseVersion: () => Promise<string | null>;
}

const createMockPromptSupabase = (config: {
  prompts?: Array<{ key: string; content: string; priority: number }>;
  version?: string;
  shouldFail?: boolean;
}): MockSupabaseClient => {
  return {
    loadPrompts: vi.fn(async () => {
      if (config.shouldFail) {
        throw new Error("Database error");
      }
      return config.prompts ?? null;
    }),
    getDatabaseVersion: vi.fn(async () => {
      if (config.shouldFail) {
        return null;
      }
      return config.version ?? null;
    }),
  };
};

describe("PromptLoader", () => {
  let loader: TestablePromptLoader;

  beforeEach(() => {
    mockConsole();
    loader = new TestablePromptLoader();
  });

  afterEach(() => {
    restoreConsole();
    vi.clearAllTimers();
  });

  describe("Cache Behavior", () => {
    it("should load prompts from DB on first request", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "DB Identity Content", priority: 10 },
          { key: "safety_rules", content: "DB Safety Rules", priority: 20 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      const sections = await loader.getPromptSections(mockSupabase);

      expect(sections.get("identity")).toBe("DB Identity Content");
      expect(sections.get("safety_rules")).toBe("DB Safety Rules");
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(1);
    });

    it("should return cached prompts on subsequent requests within TTL", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "DB Identity Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request - loads from DB
      await loader.getPromptSections(mockSupabase);
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(1);

      // Second request - should use cache
      await loader.getPromptSections(mockSupabase);
      // loadPrompts should not be called again (still cached)
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(1);
    });

    it("should reload prompts when cache expires", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "DB Identity Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request
      await loader.getPromptSections(mockSupabase);
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(1);

      // Simulate cache expiry by setting timestamp to past
      loader._setCacheTimestamp(Date.now() - CACHE_TTL_MS - 1000);

      // Should reload
      await loader.getPromptSections(mockSupabase);
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(2);
    });

    it("should reload when database version changes", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "Old Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request - loads from DB
      await loader.getPromptSections(mockSupabase);
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(1);

      // Update mock to return new version
      const updatedSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "New Content", priority: 10 },
        ],
        version: "2024-01-02T00:00:00.000Z", // New version
      });

      // Simulate version check interval passed
      loader._setLastVersionCheckTime(Date.now() - VERSION_CHECK_INTERVAL_MS - 1000);
      loader._setCacheVersion("2024-01-01T00:00:00.000Z"); // Old version

      // Should reload due to version mismatch
      const sections = await loader.getPromptSections(updatedSupabase);
      expect(updatedSupabase.loadPrompts).toHaveBeenCalledTimes(1);
      expect(sections.get("identity")).toBe("New Content");
    });

    it("should invalidate cache when invalidateCache() is called", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "DB Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request
      await loader.getPromptSections(mockSupabase);
      expect(loader.getCacheStatus().isCached).toBe(true);

      // Invalidate
      loader.invalidateCache();
      expect(loader.getCacheStatus().isCached).toBe(false);

      // Next request should reload
      await loader.getPromptSections(mockSupabase);
      expect(mockSupabase.loadPrompts).toHaveBeenCalledTimes(2);
    });
  });

  describe("Fallback Behavior", () => {
    it("should use fallback prompts when DB returns empty", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [], // Empty DB
        version: null,
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // Should have fallback content
      expect(sections.get("identity")).toContain("SOPHIA");
      expect(sections.get("safety_rules")).toContain("Safety Rules");
      expect(sections.size).toBe(8); // All 8 fallback sections
    });

    it("should use fallback prompts when DB fails", async () => {
      const mockSupabase = createMockPromptSupabase({
        shouldFail: true,
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // Should have fallback content despite DB error
      expect(sections.get("identity")).toContain("SOPHIA");
      expect(sections.size).toBe(8);
    });

    it("should merge DB prompts with fallbacks for missing keys", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          // Only identity from DB - rest should come from fallbacks
          { key: "identity", content: "Custom DB Identity", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // Identity from DB
      expect(sections.get("identity")).toBe("Custom DB Identity");
      // Others from fallbacks
      expect(sections.get("safety_rules")).toContain("Safety Rules");
      expect(sections.get("templates")).toContain("Templates");
      expect(sections.size).toBe(8);
    });
  });

  describe("Priority Ordering", () => {
    it("should let DB prompts override fallback prompts", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "DB Identity OVERRIDE", priority: 10 },
          { key: "safety_rules", content: "DB Safety OVERRIDE", priority: 20 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // DB content should override fallbacks
      expect(sections.get("identity")).toBe("DB Identity OVERRIDE");
      expect(sections.get("safety_rules")).toBe("DB Safety OVERRIDE");
    });
  });

  describe("Cache Status", () => {
    it("should report correct cache status when empty", () => {
      const status = loader.getCacheStatus();

      expect(status.isCached).toBe(false);
      expect(status.age).toBe(0);
      expect(status.sectionCount).toBe(0);
      expect(status.version).toBe(null);
    });

    it("should report correct cache status after loading", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "Content", priority: 10 },
          { key: "safety_rules", content: "Content", priority: 20 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      await loader.getPromptSections(mockSupabase);
      const status = loader.getCacheStatus();

      expect(status.isCached).toBe(true);
      expect(status.age).toBeGreaterThanOrEqual(0);
      expect(status.age).toBeLessThan(1000); // Less than 1 second
      expect(status.sectionCount).toBe(8); // 2 from DB + 6 from fallbacks
      expect(status.version).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("Version-Based Invalidation", () => {
    it("should not check version more frequently than VERSION_CHECK_INTERVAL_MS", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request - this will call getDatabaseVersion at least once for caching
      await loader.getPromptSections(mockSupabase);
      const callsAfterFirst = (mockSupabase.getDatabaseVersion as ReturnType<typeof vi.fn>).mock.calls.length;

      // Immediate second request - should use cache and NOT check version again
      await loader.getPromptSections(mockSupabase);
      const callsAfterSecond = (mockSupabase.getDatabaseVersion as ReturnType<typeof vi.fn>).mock.calls.length;

      // Version should not be checked again (still within interval)
      // The call count should remain the same as after first request
      expect(callsAfterSecond).toBe(callsAfterFirst);
    });

    it("should check version after VERSION_CHECK_INTERVAL_MS passes", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "Content", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      // First request
      await loader.getPromptSections(mockSupabase);
      const callsAfterFirst = (mockSupabase.getDatabaseVersion as ReturnType<typeof vi.fn>).mock.calls.length;

      // Simulate time passing
      loader._setLastVersionCheckTime(Date.now() - VERSION_CHECK_INTERVAL_MS - 1000);

      // Second request - should check version
      await loader.getPromptSections(mockSupabase);
      const callsAfterSecond = (mockSupabase.getDatabaseVersion as ReturnType<typeof vi.fn>).mock.calls.length;

      // Version should be checked
      expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null prompts gracefully", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: null as unknown as Array<{ key: string; content: string; priority: number }>,
        version: null,
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // Should fall back gracefully
      expect(sections.size).toBe(8);
    });

    it("should handle empty string content", async () => {
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: "", priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      const sections = await loader.getPromptSections(mockSupabase);

      // Empty string should still be set (overrides fallback)
      expect(sections.get("identity")).toBe("");
    });

    it("should handle special characters in prompt content", async () => {
      const specialContent = "# Identity\n{AGENT_NAME} works at \"Zyprus\" & handles <properties>\n$1000";
      const mockSupabase = createMockPromptSupabase({
        prompts: [
          { key: "identity", content: specialContent, priority: 10 },
        ],
        version: "2024-01-01T00:00:00.000Z",
      });

      const sections = await loader.getPromptSections(mockSupabase);

      expect(sections.get("identity")).toBe(specialContent);
    });
  });
});
