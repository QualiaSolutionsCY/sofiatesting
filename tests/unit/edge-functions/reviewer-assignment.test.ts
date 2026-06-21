/**
 * Tests for Reviewer Assignment Engine
 *
 * Tests cover:
 * - FOR SALE listings (Paphos/Limassol/Larnaca/Nicosia) - Lauren + regional office
 * - FOR SALE listings (Famagusta only) - requestfamagusta@zyprus.com only
 * - FOR RENT listings - Agent reviews their own
 * - Michelle rentals - Special routing to Demetra
 * - Management role rentals - Allowed (uses communicationEmail as owner)
 * - Assignment input requirements for management
 */
import { describe, expect, it } from "vitest";
import type { Agent } from "../../../supabase/functions/sophia-bot/agents/identifier.ts";
import { assignReviewers } from "../../../supabase/functions/sophia-bot/rules/reviewer-assignment.ts";

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

describe("Reviewer Assignment", () => {
  describe("FOR SALE - Standard Regions (Paphos/Limassol/Larnaca/Nicosia)", () => {
    it("should assign Lauren as reviewer1 and regional office as reviewer2 for Paphos sale", () => {
      const agent = createMockAgent({
        region: "paphos",
        communicationEmail: "paphos-agent@example.com",
        listingOwnerEmail: "paphos-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "paphos");

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe("requestpaphos@zyprus.com");
      expect(result.listingOwner).toBe("paphos-owner@example.com");
      expect(result.listingInstructor).toBe("paphos-owner@example.com");
    });

    it("should assign Lauren as reviewer1 and regional office as reviewer2 for Limassol sale", () => {
      const agent = createMockAgent({
        region: "limassol",
        communicationEmail: "limassol-agent@example.com",
        listingOwnerEmail: "limassol-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "limassol");

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe("requestlimassol@zyprus.com");
      expect(result.listingOwner).toBe("limassol-owner@example.com");
      expect(result.listingInstructor).toBe("limassol-owner@example.com");
    });

    it("should assign Lauren as reviewer1 and regional office as reviewer2 for Larnaca sale", () => {
      const agent = createMockAgent({
        region: "larnaca",
        communicationEmail: "larnaca-agent@example.com",
        listingOwnerEmail: "larnaca-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "larnaca");

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe("requestlarnaca@zyprus.com");
      expect(result.listingOwner).toBe("larnaca-owner@example.com");
      expect(result.listingInstructor).toBe("larnaca-owner@example.com");
    });

    it("should assign Lauren as reviewer1 and regional office as reviewer2 for Nicosia sale", () => {
      const agent = createMockAgent({
        region: "nicosia",
        communicationEmail: "nicosia-agent@example.com",
        listingOwnerEmail: "nicosia-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "nicosia");

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe("requestnicosia@zyprus.com");
      expect(result.listingOwner).toBe("nicosia-owner@example.com");
      expect(result.listingInstructor).toBe("nicosia-owner@example.com");
    });

    it("should use communicationEmail as listingOwner when listingOwnerEmail is ASK", () => {
      const agent = createMockAgent({
        region: "paphos",
        communicationEmail: "management@zyprus.com",
        listingOwnerEmail: "ASK",
        role: "management",
      });

      const result = assignReviewers(agent, "sale", "paphos");

      expect(result.listingOwner).toBe("management@zyprus.com");
      expect(result.listingInstructor).toBe("management@zyprus.com");
    });

    it("should use assignTo parameter when provided (management assigns to specific agent)", () => {
      const agent = createMockAgent({
        region: "all",
        role: "management",
        listingOwnerEmail: "ASK",
      });

      const result = assignReviewers(
        agent,
        "sale",
        "paphos",
        "specific-agent@zyprus.com"
      );

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe("requestpaphos@zyprus.com");
      expect(result.listingOwner).toBe("specific-agent@zyprus.com");
      expect(result.listingInstructor).toBe("specific-agent@zyprus.com");
    });
  });

  describe("FOR SALE - Famagusta Special Rules", () => {
    it("should assign requestfamagusta as reviewer1 with NO reviewer2 for Famagusta sale", () => {
      const agent = createMockAgent({
        region: "famagusta",
        communicationEmail: "famagusta-agent@example.com",
        listingOwnerEmail: "famagusta-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "famagusta");

      expect(result.reviewer1).toBe("requestfamagusta@zyprus.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("famagusta-owner@example.com");
      expect(result.listingInstructor).toBe("famagusta-owner@example.com");
    });

    it("should use communicationEmail as listingOwner when listingOwnerEmail is ASK in Famagusta", () => {
      const agent = createMockAgent({
        region: "famagusta",
        communicationEmail: "management@zyprus.com",
        listingOwnerEmail: "ASK",
        role: "management",
      });

      const result = assignReviewers(agent, "sale", "famagusta");

      expect(result.reviewer1).toBe("requestfamagusta@zyprus.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("management@zyprus.com");
      expect(result.listingInstructor).toBe("management@zyprus.com");
    });

    it("should use assignTo parameter in Famagusta when provided", () => {
      const agent = createMockAgent({
        region: "all",
        role: "management",
        listingOwnerEmail: "ASK",
      });

      const result = assignReviewers(
        agent,
        "sale",
        "famagusta",
        "famagusta-agent@zyprus.com"
      );

      expect(result.reviewer1).toBe("requestfamagusta@zyprus.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("famagusta-agent@zyprus.com");
      expect(result.listingInstructor).toBe("famagusta-agent@zyprus.com");
    });
  });

  describe("FOR RENT - All Regions", () => {
    it("should assign agent's own listingOwnerEmail as reviewer1 with NO reviewer2 for rental", () => {
      const agent = createMockAgent({
        region: "paphos",
        communicationEmail: "agent@example.com",
        listingOwnerEmail: "agent-owner@example.com",
      });

      const result = assignReviewers(agent, "rent", "paphos");

      expect(result.reviewer1).toBe("agent-owner@example.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("agent-owner@example.com");
      expect(result.listingInstructor).toBe("agent-owner@example.com");
    });

    it("should work for rentals in any region", () => {
      const regions: Array<
        "paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta"
      > = ["paphos", "limassol", "larnaca", "nicosia", "famagusta"];

      regions.forEach((region) => {
        const agent = createMockAgent({
          region,
          communicationEmail: `${region}-agent@example.com`,
          listingOwnerEmail: `${region}-owner@example.com`,
        });

        const result = assignReviewers(agent, "rent", region);

        expect(result.reviewer1).toBe(`${region}-owner@example.com`);
        expect(result.reviewer2).toBe(null);
        expect(result.listingOwner).toBe(`${region}-owner@example.com`);
        expect(result.listingInstructor).toBe(`${region}-owner@example.com`);
      });
    });
  });

  describe("Michelle Rentals - Special Routing", () => {
    it("should route Michelle rentals to Demetra with requestlimassol as reviewer2", () => {
      const michelle = createMockAgent({
        fullName: "Michelle",
        communicationEmail: "limassol@zyprus.com",
        listingOwnerEmail: "michelle@zyprus.com",
        region: "limassol",
      });

      const result = assignReviewers(michelle, "rent", "limassol");

      expect(result.reviewer1).toBe("demetra@zyprus.com");
      expect(result.reviewer2).toBe("requestlimassol@zyprus.com");
      expect(result.listingOwner).toBe("demetra@zyprus.com");
      // Instructor is Michelle (the person who sent it), i.e. her
      // communicationEmail — see reviewer-assignment.ts Michelle branch.
      expect(result.listingInstructor).toBe("limassol@zyprus.com");
    });
  });

  describe("Management Role Rentals - Allowed", () => {
    it("should allow rental upload by management (Charalambos) using communicationEmail as owner", () => {
      const management = createMockAgent({
        fullName: "Charalambos",
        communicationEmail: "charalambos@zyprus.com",
        listingOwnerEmail: "ASK",
        region: "all",
        role: "management",
      });

      // Current behavior: management rentals are allowed (c5aee9b). Since
      // listingOwnerEmail is "ASK" and no assignTo is given, the rent branch
      // falls back to communicationEmail as the listing owner.
      expect(() => assignReviewers(management, "rent", "paphos")).not.toThrow();

      const result = assignReviewers(management, "rent", "paphos");

      expect(result.reviewer1).toBe("charalambos@zyprus.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("charalambos@zyprus.com");
      expect(result.listingInstructor).toBe("charalambos@zyprus.com");
    });

    it("should allow rental upload by management (Lauren) using communicationEmail as owner", () => {
      const lauren = createMockAgent({
        fullName: "Lauren",
        communicationEmail: "listings@zyprus.com",
        listingOwnerEmail: "ASK",
        region: "all",
        role: "management",
      });

      // Current behavior: management rentals are allowed (c5aee9b). With
      // listingOwnerEmail "ASK" and no assignTo, the rent branch uses
      // communicationEmail as the listing owner.
      expect(() => assignReviewers(lauren, "rent", "limassol")).not.toThrow();

      const result = assignReviewers(lauren, "rent", "limassol");

      expect(result.reviewer1).toBe("listings@zyprus.com");
      expect(result.reviewer2).toBe(null);
      expect(result.listingOwner).toBe("listings@zyprus.com");
      expect(result.listingInstructor).toBe("listings@zyprus.com");
    });

    it("should allow management to upload sales properties", () => {
      const management = createMockAgent({
        communicationEmail: "management@zyprus.com",
        listingOwnerEmail: "ASK",
        region: "all",
        role: "management",
      });

      // Should NOT throw
      const result = assignReviewers(
        management,
        "sale",
        "paphos",
        "agent@zyprus.com"
      );
      expect(result).toBeDefined();
      expect(result.reviewer1).toBe("zyprus@zyprus.com");
    });
  });

  describe("Unknown Region Handling", () => {
    it("should return null for reviewer2 when region is not in REGIONAL_EMAILS map", () => {
      const agent = createMockAgent({
        region: "paphos",
        communicationEmail: "agent@example.com",
        listingOwnerEmail: "agent-owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "unknown-region");

      expect(result.reviewer1).toBe("zyprus@zyprus.com");
      expect(result.reviewer2).toBe(null); // No regional email for unknown region
      expect(result.listingOwner).toBe("agent-owner@example.com");
      expect(result.listingInstructor).toBe("agent-owner@example.com");
    });
  });

  describe("listingInstructor Always Matches listingOwner", () => {
    it("should set listingInstructor same as listingOwner for standard sale", () => {
      const agent = createMockAgent({
        listingOwnerEmail: "owner@example.com",
      });

      const result = assignReviewers(agent, "sale", "paphos");

      expect(result.listingOwner).toBe("owner@example.com");
      expect(result.listingInstructor).toBe("owner@example.com");
    });

    it("should set listingInstructor same as listingOwner for rental", () => {
      const agent = createMockAgent({
        listingOwnerEmail: "rental-owner@example.com",
      });

      const result = assignReviewers(agent, "rent", "limassol");

      expect(result.listingOwner).toBe("rental-owner@example.com");
      expect(result.listingInstructor).toBe("rental-owner@example.com");
    });

    it("should set listingInstructor same as listingOwner when using assignTo", () => {
      const agent = createMockAgent({
        listingOwnerEmail: "ASK",
        role: "management",
        region: "all",
      });

      const result = assignReviewers(
        agent,
        "sale",
        "paphos",
        "assigned-agent@zyprus.com"
      );

      expect(result.listingOwner).toBe("assigned-agent@zyprus.com");
      expect(result.listingInstructor).toBe("assigned-agent@zyprus.com");
    });
  });
});
