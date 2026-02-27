/**
 * Tests for Region Validator
 *
 * Tests cover:
 * - Region determination from location strings
 * - Greek variant matching (Pafos/Paphos, Lemesos/Limassol, etc.)
 * - Case insensitivity
 * - Partial matches
 * - Regional access validation (agent region vs property region)
 * - Management "all" region access
 */
import { describe, it, expect } from "vitest";
import {
  determineRegion,
  validateRegionalAccess,
} from "../../../supabase/functions/sophia-bot/rules/region-validator.ts";
import { Agent } from "../../../supabase/functions/sophia-bot/agents/identifier.ts";

/**
 * Create a mock agent for testing
 */
function createMockAgent(overrides: Partial<Agent>): Agent {
  return {
    id: "test-id",
    fullName: "Test Agent",
    mobile: "+35799123456",
    communicationEmail: "test@example.com",
    listingOwnerEmail: "test-owner@example.com",
    region: "paphos",
    role: "agent",
    canUpload: true,
    ...overrides,
  };
}

describe("Region Validator", () => {
  describe("determineRegion() - Standard Names", () => {
    it("should detect Paphos from standard name", () => {
      expect(determineRegion("Paphos")).toBe("paphos");
    });

    it("should detect Limassol from standard name", () => {
      expect(determineRegion("Limassol")).toBe("limassol");
    });

    it("should detect Larnaca from standard name", () => {
      expect(determineRegion("Larnaca")).toBe("larnaca");
    });

    it("should detect Nicosia from standard name", () => {
      expect(determineRegion("Nicosia")).toBe("nicosia");
    });

    it("should detect Famagusta from standard name", () => {
      expect(determineRegion("Famagusta")).toBe("famagusta");
    });
  });

  describe("determineRegion() - Greek Variants", () => {
    it("should detect Paphos from Greek variant Pafos", () => {
      expect(determineRegion("Pafos")).toBe("paphos");
    });

    it("should detect Limassol from Greek variant Lemesos", () => {
      expect(determineRegion("Lemesos")).toBe("limassol");
    });

    it("should detect Larnaca from Greek variant Larnaka", () => {
      expect(determineRegion("Larnaka")).toBe("larnaca");
    });

    it("should detect Nicosia from Greek variant Lefkosia", () => {
      expect(determineRegion("Lefkosia")).toBe("nicosia");
    });

    it("should detect Famagusta from Greek variant Ammochostos", () => {
      expect(determineRegion("Ammochostos")).toBe("famagusta");
    });
  });

  describe("determineRegion() - Case Insensitivity", () => {
    it("should handle uppercase", () => {
      expect(determineRegion("PAPHOS")).toBe("paphos");
      expect(determineRegion("LIMASSOL")).toBe("limassol");
      expect(determineRegion("LARNACA")).toBe("larnaca");
    });

    it("should handle lowercase", () => {
      expect(determineRegion("paphos")).toBe("paphos");
      expect(determineRegion("limassol")).toBe("limassol");
      expect(determineRegion("larnaca")).toBe("larnaca");
    });

    it("should handle mixed case", () => {
      expect(determineRegion("PaPhOs")).toBe("paphos");
      expect(determineRegion("LiMaSsOl")).toBe("limassol");
      expect(determineRegion("LaRnAcA")).toBe("larnaca");
    });
  });

  describe("determineRegion() - Partial Matches", () => {
    it("should detect region from partial match with city center", () => {
      expect(determineRegion("Paphos City Centre")).toBe("paphos");
      expect(determineRegion("Limassol Marina")).toBe("limassol");
      expect(determineRegion("Larnaca Old Town")).toBe("larnaca");
    });

    it("should detect region from partial match with neighborhood", () => {
      expect(determineRegion("Kato Paphos")).toBe("paphos");
      expect(determineRegion("Germasogeia, Limassol")).toBe("limassol");
      expect(determineRegion("Nicosia, Strovolos")).toBe("nicosia");
    });

    it("should detect region when embedded in larger string", () => {
      expect(determineRegion("A beautiful villa in Paphos area")).toBe("paphos");
      expect(determineRegion("Apartment near Limassol beachfront")).toBe("limassol");
      expect(determineRegion("House for sale in Larnaca district")).toBe("larnaca");
    });
  });

  describe("determineRegion() - Unknown Location", () => {
    it("should return null for completely unknown location", () => {
      expect(determineRegion("Unknown Place")).toBe(null);
      expect(determineRegion("Random City")).toBe(null);
      expect(determineRegion("Somewhere in Cyprus")).toBe(null);
    });

    it("should return null for empty string", () => {
      expect(determineRegion("")).toBe(null);
    });

    it("should return null for whitespace-only string", () => {
      expect(determineRegion("   ")).toBe(null);
    });
  });

  describe("validateRegionalAccess() - Matching Region", () => {
    it("should allow access when agent region matches property region", () => {
      const agent = createMockAgent({ region: "paphos" });

      const result = validateRegionalAccess(agent, "Paphos City Centre");

      expect(result.allowed).toBe(true);
      expect(result.propertyRegion).toBe("paphos");
      expect(result.message).toBeUndefined();
    });

    it("should allow access for all regions when agent region matches", () => {
      const regions: Array<"paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta"> = [
        "paphos",
        "limassol",
        "larnaca",
        "nicosia",
        "famagusta",
      ];

      regions.forEach((region) => {
        const agent = createMockAgent({ region });
        const result = validateRegionalAccess(agent, region.charAt(0).toUpperCase() + region.slice(1));

        expect(result.allowed).toBe(true);
        expect(result.propertyRegion).toBe(region);
      });
    });
  });

  describe("validateRegionalAccess() - Agent Region 'all'", () => {
    it("should allow management to upload in any region", () => {
      const management = createMockAgent({
        region: "all",
        role: "management",
      });

      const regions = ["Paphos", "Limassol", "Larnaca", "Nicosia", "Famagusta"];

      regions.forEach((location) => {
        const result = validateRegionalAccess(management, location);

        expect(result.allowed).toBe(true);
        expect(result.propertyRegion).toBeDefined();
      });
    });

    it("should detect correct property region even for 'all' agents", () => {
      const management = createMockAgent({
        region: "all",
        role: "management",
      });

      const result = validateRegionalAccess(management, "Paphos City");

      expect(result.allowed).toBe(true);
      expect(result.propertyRegion).toBe("paphos");
    });

    it("should return 'unknown' region for unrecognized locations when agent has 'all' access", () => {
      const management = createMockAgent({
        region: "all",
        role: "management",
      });

      const result = validateRegionalAccess(management, "Unknown Location");

      expect(result.allowed).toBe(true);
      expect(result.propertyRegion).toBe("unknown");
    });
  });

  describe("validateRegionalAccess() - Region Mismatch", () => {
    it("should deny access when agent region does not match property region", () => {
      const agent = createMockAgent({ region: "paphos" });

      const result = validateRegionalAccess(agent, "Limassol");

      expect(result.allowed).toBe(false);
      expect(result.propertyRegion).toBe("limassol");
      expect(result.message).toContain("not allowed to market a property outside your region");
    });

    it("should provide helpful error message on region mismatch", () => {
      const agent = createMockAgent({ region: "larnaca" });

      const result = validateRegionalAccess(agent, "Nicosia");

      expect(result.allowed).toBe(false);
      expect(result.message).toContain("contact the relevant regional manager");
    });

    it("should deny cross-region access for all combinations", () => {
      const regions: Array<"paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta"> = [
        "paphos",
        "limassol",
        "larnaca",
        "nicosia",
        "famagusta",
      ];

      regions.forEach((agentRegion) => {
        const agent = createMockAgent({ region: agentRegion });

        regions.forEach((propertyRegion) => {
          if (agentRegion !== propertyRegion) {
            const location = propertyRegion.charAt(0).toUpperCase() + propertyRegion.slice(1);
            const result = validateRegionalAccess(agent, location);

            expect(result.allowed).toBe(false);
            expect(result.propertyRegion).toBe(propertyRegion);
          }
        });
      });
    });
  });

  describe("validateRegionalAccess() - Unknown Property Location", () => {
    it("should trust agent when property location cannot be determined", () => {
      const agent = createMockAgent({ region: "paphos" });

      const result = validateRegionalAccess(agent, "Unknown Location");

      expect(result.allowed).toBe(true);
      expect(result.propertyRegion).toBe("paphos"); // Trusts agent's region
      expect(result.message).toBeUndefined();
    });

    it("should use agent's region as propertyRegion for unknown locations", () => {
      const regions: Array<"paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta"> = [
        "paphos",
        "limassol",
        "larnaca",
        "nicosia",
        "famagusta",
      ];

      regions.forEach((region) => {
        const agent = createMockAgent({ region });
        const result = validateRegionalAccess(agent, "Somewhere Unknown");

        expect(result.allowed).toBe(true);
        expect(result.propertyRegion).toBe(region);
      });
    });
  });

  describe("determineRegion() - Edge Cases", () => {
    it("should handle location with extra whitespace", () => {
      expect(determineRegion("  Paphos  ")).toBe("paphos");
      expect(determineRegion("   Limassol   ")).toBe("limassol");
    });

    it("should handle location with special characters", () => {
      expect(determineRegion("Paphos, Cyprus")).toBe("paphos");
      expect(determineRegion("Limassol - Marina")).toBe("limassol");
      expect(determineRegion("Larnaca (City Centre)")).toBe("larnaca");
    });

    it("should prioritize exact matches over partial matches", () => {
      // If region is in REGION_LOCATIONS config, exact match takes precedence
      expect(determineRegion("Paphos")).toBe("paphos");
      expect(determineRegion("Limassol")).toBe("limassol");
    });
  });
});
