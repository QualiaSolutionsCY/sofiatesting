import { describe, expect, it } from "vitest";
import {
  maskEmailForLogging,
  maskPhoneNumber,
  maskPhoneNumberWithPrefix,
  shouldMaskPhone,
} from "../../../supabase/functions/sophia-bot/rules/phone-masking.ts";

describe("phone-masking", () => {
  describe("maskPhoneNumber", () => {
    // Standard 8-digit numbers
    it("masks standard 8-digit Cyprus number", () => {
      expect(maskPhoneNumber("99123456")).toBe("99**3456");
    });

    it("masks different standard number", () => {
      expect(maskPhoneNumber("96555444")).toBe("96**5444");
    });

    // With country code prefix
    it("strips +357 prefix and masks", () => {
      expect(maskPhoneNumber("+357 99123456")).toBe("99**3456");
      expect(maskPhoneNumber("+35799123456")).toBe("99**3456");
    });

    it("strips 357 prefix (no +) and masks", () => {
      expect(maskPhoneNumber("35799123456")).toBe("99**3456");
    });

    // Non-digit character handling
    it("strips spaces and special characters", () => {
      expect(maskPhoneNumber("99 12 34 56")).toBe("99**3456");
      expect(maskPhoneNumber("99-12-34-56")).toBe("99**3456");
      expect(maskPhoneNumber("+357 (99) 123-456")).toBe("99**3456");
    });

    // Invalid inputs
    it("returns original for invalid length", () => {
      expect(maskPhoneNumber("12345")).toBe("12345"); // too short
      expect(maskPhoneNumber("123456789012")).toBe("123456789012"); // too long (no valid prefix)
    });

    it("returns original for empty string", () => {
      expect(maskPhoneNumber("")).toBe("");
    });
  });

  describe("maskPhoneNumberWithPrefix", () => {
    it("adds +357 prefix to masked number", () => {
      expect(maskPhoneNumberWithPrefix("99123456")).toBe("+357 99**3456");
    });

    it("adds +357 prefix when stripping existing prefix", () => {
      expect(maskPhoneNumberWithPrefix("+357 99123456")).toBe("+357 99**3456");
    });

    it("returns original for invalid number", () => {
      expect(maskPhoneNumberWithPrefix("12345")).toBe("12345");
    });
  });

  describe("shouldMaskPhone", () => {
    it("returns true for client context", () => {
      expect(shouldMaskPhone("client")).toBe(true);
    });

    it("returns false for agent context", () => {
      expect(shouldMaskPhone("agent")).toBe(false);
    });
  });

  describe("maskEmailForLogging", () => {
    it("masks standard email", () => {
      expect(maskEmailForLogging("john@example.com")).toBe("j***@example.com");
    });

    it("masks email with dots", () => {
      expect(maskEmailForLogging("john.doe@example.com")).toBe(
        "j***@example.com"
      );
    });

    it("masks single character local part", () => {
      expect(maskEmailForLogging("a@b.com")).toBe("a***@b.com");
    });

    it("handles invalid email (no @)", () => {
      expect(maskEmailForLogging("notanemail")).toBe("[invalid-email]");
    });

    it("handles invalid email (@ at start)", () => {
      expect(maskEmailForLogging("@example.com")).toBe("[invalid-email]");
    });

    it("handles empty string", () => {
      expect(maskEmailForLogging("")).toBe("[invalid-email]");
    });

    it("handles non-string input", () => {
      expect(maskEmailForLogging(null as any)).toBe("[invalid-email]");
      expect(maskEmailForLogging(undefined as any)).toBe("[invalid-email]");
    });
  });
});
