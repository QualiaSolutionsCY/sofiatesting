import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListingProgress,
  CALCULATOR_SELECTIONS,
  createDefaultSession,
  getCalculatorFromSelection,
  getListingTypeFromSelection,
  getTemplateFromSelection,
  isEmailTemplate,
  isSessionExpired,
  LISTING_TYPE_SELECTIONS,
  mergeSessionUpdates,
  TEMPLATE_SELECTIONS,
} from "@/lib/whatsapp/session-utils";

describe("WhatsApp Session Utils", () => {
  describe("createDefaultSession", () => {
    it("should create a session with lastActivity set", () => {
      const before = Date.now();
      const session = createDefaultSession();
      const after = Date.now();

      assert.ok(session.lastActivity >= before);
      assert.ok(session.lastActivity <= after);
    });

    it("should create sessions with no menu by default", () => {
      const session = createDefaultSession();

      assert.strictEqual(session.currentMenu, undefined);
      assert.strictEqual(session.listingData, undefined);
      assert.strictEqual(session.pendingAction, undefined);
    });
  });

  describe("mergeSessionUpdates", () => {
    it("should merge updates into existing session", () => {
      const current = createDefaultSession();
      const updated = mergeSessionUpdates(current, {
        currentMenu: "templates",
      });

      assert.strictEqual(updated.currentMenu, "templates");
    });

    it("should update lastActivity on merge", () => {
      const current = { ...createDefaultSession(), lastActivity: 1000 };
      const before = Date.now();
      const updated = mergeSessionUpdates(current, {});
      const after = Date.now();

      assert.ok(updated.lastActivity >= before);
      assert.ok(updated.lastActivity <= after);
      assert.ok(updated.lastActivity > 1000);
    });

    it("should preserve existing fields not in updates", () => {
      const current = {
        ...createDefaultSession(),
        currentMenu: "templates" as const,
        listingData: { type: "apartment" },
      };
      const updated = mergeSessionUpdates(current, {
        currentMenu: "calculator",
      });

      assert.strictEqual(updated.currentMenu, "calculator");
      assert.deepStrictEqual(updated.listingData, { type: "apartment" });
    });

    it("should handle nested listingData updates", () => {
      const current = {
        ...createDefaultSession(),
        listingData: { type: "apartment", price: "500000" },
      };
      const updated = mergeSessionUpdates(current, {
        listingData: { type: "house", location: "Limassol" },
      });

      // New listingData replaces old (not deep merge)
      assert.strictEqual(updated.listingData?.type, "house");
      assert.strictEqual(updated.listingData?.location, "Limassol");
      assert.strictEqual(updated.listingData?.price, undefined);
    });
  });

  describe("isSessionExpired", () => {
    it("should return false for recent session", () => {
      const session = createDefaultSession();
      const expired = isSessionExpired(session);

      assert.strictEqual(expired, false);
    });

    it("should return true for old session", () => {
      const session = { lastActivity: Date.now() - 2_000_000 }; // ~33 minutes ago
      const expired = isSessionExpired(session);

      assert.strictEqual(expired, true);
    });

    it("should respect custom TTL", () => {
      const session = { lastActivity: Date.now() - 5000 }; // 5 seconds ago

      // Not expired with 10 second TTL
      assert.strictEqual(isSessionExpired(session, 10_000), false);

      // Expired with 3 second TTL
      assert.strictEqual(isSessionExpired(session, 3000), true);
    });

    it("should handle edge case at exactly TTL", () => {
      const ttl = 1000;
      const session = { lastActivity: Date.now() - ttl - 1 };

      assert.strictEqual(isSessionExpired(session, ttl), true);
    });
  });

  describe("Template selection mappings", () => {
    it("should have 8 template selections", () => {
      assert.strictEqual(Object.keys(TEMPLATE_SELECTIONS).length, 8);
    });

    it("should map selection 1 to seller_registration", () => {
      assert.strictEqual(TEMPLATE_SELECTIONS[1], "seller_registration");
    });

    it("should map selection 8 to other", () => {
      assert.strictEqual(TEMPLATE_SELECTIONS[8], "other");
    });

    describe("getTemplateFromSelection", () => {
      it("should return template ID for valid selection", () => {
        assert.strictEqual(getTemplateFromSelection(1), "seller_registration");
        assert.strictEqual(
          getTemplateFromSelection(4),
          "marketing_agreement_exclusive"
        );
      });

      it("should return null for invalid selection", () => {
        assert.strictEqual(getTemplateFromSelection(0), null);
        assert.strictEqual(getTemplateFromSelection(9), null);
        assert.strictEqual(getTemplateFromSelection(-1), null);
      });
    });
  });

  describe("Calculator selection mappings", () => {
    it("should have 3 calculator selections", () => {
      assert.strictEqual(Object.keys(CALCULATOR_SELECTIONS).length, 3);
    });

    it("should map selections correctly", () => {
      assert.strictEqual(CALCULATOR_SELECTIONS[1], "vat");
      assert.strictEqual(CALCULATOR_SELECTIONS[2], "transfer_fees");
      assert.strictEqual(CALCULATOR_SELECTIONS[3], "capital_gains");
    });

    describe("getCalculatorFromSelection", () => {
      it("should return calculator type for valid selection", () => {
        assert.strictEqual(getCalculatorFromSelection(1), "vat");
        assert.strictEqual(getCalculatorFromSelection(3), "capital_gains");
      });

      it("should return null for invalid selection", () => {
        assert.strictEqual(getCalculatorFromSelection(0), null);
        assert.strictEqual(getCalculatorFromSelection(4), null);
      });
    });
  });

  describe("Listing type selection mappings", () => {
    it("should have 4 listing type selections", () => {
      assert.strictEqual(Object.keys(LISTING_TYPE_SELECTIONS).length, 4);
    });

    it("should map selections correctly", () => {
      assert.strictEqual(LISTING_TYPE_SELECTIONS[1], "apartment");
      assert.strictEqual(LISTING_TYPE_SELECTIONS[2], "house");
      assert.strictEqual(LISTING_TYPE_SELECTIONS[3], "land");
      assert.strictEqual(LISTING_TYPE_SELECTIONS[4], "commercial");
    });

    describe("getListingTypeFromSelection", () => {
      it("should return property type for valid selection", () => {
        assert.strictEqual(getListingTypeFromSelection(1), "apartment");
        assert.strictEqual(getListingTypeFromSelection(4), "commercial");
      });

      it("should return null for invalid selection", () => {
        assert.strictEqual(getListingTypeFromSelection(0), null);
        assert.strictEqual(getListingTypeFromSelection(5), null);
      });
    });
  });

  describe("isEmailTemplate", () => {
    it("should return true for email templates", () => {
      assert.strictEqual(isEmailTemplate("followup_viewed"), true);
      assert.strictEqual(isEmailTemplate("valuation_report"), true);
      assert.strictEqual(isEmailTemplate("introduction_email"), true);
      assert.strictEqual(isEmailTemplate("welcome_email"), true);
    });

    it("should return false for document templates", () => {
      assert.strictEqual(isEmailTemplate("seller_registration"), false);
      assert.strictEqual(isEmailTemplate("bank_registration_property"), false);
      assert.strictEqual(isEmailTemplate("viewing_form"), false);
      assert.strictEqual(
        isEmailTemplate("marketing_agreement_exclusive"),
        false
      );
    });

    it("should return false for unknown templates", () => {
      assert.strictEqual(isEmailTemplate("unknown_template"), false);
      assert.strictEqual(isEmailTemplate(""), false);
    });
  });

  describe("buildListingProgress", () => {
    it("should show all fields as needed for empty data", () => {
      const result = buildListingProgress({});

      assert.ok(result.message.includes("⏳ Property Type: _needed_"));
      assert.ok(result.message.includes("⏳ Location: _needed_"));
      assert.strictEqual(result.nextNeeded, "Property Type");
      assert.strictEqual(result.isComplete, false);
    });

    it("should show completed fields with checkmarks", () => {
      const result = buildListingProgress({
        type: "apartment",
        location: "Limassol",
      });

      assert.ok(result.message.includes("✅ Property Type: apartment"));
      assert.ok(result.message.includes("✅ Location: Limassol"));
      assert.ok(result.message.includes("⏳ Price: _needed_"));
      assert.strictEqual(result.nextNeeded, "Price");
    });

    it("should indicate completion when all fields filled", () => {
      const result = buildListingProgress({
        type: "apartment",
        location: "Limassol",
        price: "500000",
        size: "150",
        bedrooms: 3,
        bathrooms: 2,
      });

      assert.strictEqual(result.nextNeeded, null);
      assert.strictEqual(result.isComplete, true);
      assert.ok(result.message.includes("✨ *All basic info collected!*"));
      assert.ok(result.message.includes("Swimming pool"));
    });

    it("should handle partial data correctly", () => {
      const result = buildListingProgress({
        type: "house",
        price: "750000",
        // location, size, bedrooms, bathrooms missing
      });

      assert.ok(result.message.includes("✅ Property Type: house"));
      assert.ok(result.message.includes("⏳ Location: _needed_"));
      assert.ok(result.message.includes("✅ Price: 750000"));
      assert.strictEqual(result.nextNeeded, "Location");
    });

    it("should handle undefined listingData", () => {
      const result = buildListingProgress(undefined);

      assert.strictEqual(result.nextNeeded, "Property Type");
      assert.strictEqual(result.isComplete, false);
    });

    it("should format numbers correctly", () => {
      const result = buildListingProgress({
        type: "apartment",
        location: "Paphos",
        price: "1000000",
        size: "200",
        bedrooms: 4,
        bathrooms: 3,
      });

      assert.ok(result.message.includes("✅ Bedrooms: 4"));
      assert.ok(result.message.includes("✅ Bathrooms: 3"));
    });
  });
});
