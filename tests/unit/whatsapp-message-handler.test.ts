import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatForWhatsApp,
  splitSubjectFromBody,
} from "@/lib/whatsapp/text-utils";

describe("WhatsApp Message Handler", () => {
  describe("splitSubjectFromBody", () => {
    it("should split subject from body correctly", () => {
      const input = "Subject: Test Email\n\nDear Client,\nBody text here.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, "Subject: Test Email");
      assert.strictEqual(result.body, "Dear Client,\nBody text here.");
    });

    it("should handle messages without subject", () => {
      const input = "Just a plain message without subject line.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, null);
      assert.strictEqual(
        result.body,
        "Just a plain message without subject line."
      );
    });

    it("should handle Subject followed by Dear pattern", () => {
      const input =
        "Subject: Property Inquiry\nDear Mr. Smith,\n\nThank you for your interest.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, "Subject: Property Inquiry");
      assert.ok(result.body.includes("Dear Mr. Smith"));
    });

    it("should handle Subject with Email Body marker", () => {
      const input =
        "Subject: Important Update\nEmail Body:\n\nHere is the content.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, "Subject: Important Update");
      // Email Body: marker should be removed
      assert.ok(!result.body.includes("Email Body:"));
      assert.ok(result.body.includes("Here is the content"));
    });

    it("should handle case-insensitive subject matching", () => {
      const input = "SUBJECT: Uppercase Test\n\nBody content here.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, "SUBJECT: Uppercase Test");
      assert.strictEqual(result.body, "Body content here.");
    });

    it("should handle subject: lowercase", () => {
      const input = "subject: lowercase test\n\nBody content.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(result.subject, "subject: lowercase test");
      assert.strictEqual(result.body, "Body content.");
    });

    it("should handle long subjects without ReDoS vulnerability", () => {
      // This would hang if ReDoS vulnerability exists
      const longSubject = "Subject: " + "a".repeat(10_000) + "\n\nBody";
      const startTime = Date.now();
      const result = splitSubjectFromBody(longSubject);
      const elapsed = Date.now() - startTime;

      // Should complete in under 100ms (would timeout with ReDoS)
      assert.ok(elapsed < 100, `Regex took too long: ${elapsed}ms`);
      assert.ok(result.subject !== null || result.body !== undefined);
    });

    it("should handle empty string", () => {
      const result = splitSubjectFromBody("");

      assert.strictEqual(result.subject, null);
      assert.strictEqual(result.body, "");
    });

    it("should handle subject with special characters", () => {
      const input =
        "Subject: RE: Property @ Limassol - 500,000€\n\nDetails follow.";
      const result = splitSubjectFromBody(input);

      assert.strictEqual(
        result.subject,
        "Subject: RE: Property @ Limassol - 500,000€"
      );
      assert.strictEqual(result.body, "Details follow.");
    });
  });

  describe("formatForWhatsApp", () => {
    it("should convert markdown bold to WhatsApp bold", () => {
      const input = "This is **bold** text.";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "This is *bold* text.");
    });

    it("should handle multiple bold segments", () => {
      const input = "**First** and **second** bold.";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "*First* and *second* bold.");
    });

    it("should collapse multiple newlines", () => {
      const input = "Line 1\n\n\n\nLine 2";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "Line 1\n\nLine 2");
    });

    it("should trim whitespace", () => {
      const input = "  Some text with spaces  ";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "Some text with spaces");
    });

    it("should preserve single newlines", () => {
      const input = "Line 1\nLine 2\nLine 3";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "Line 1\nLine 2\nLine 3");
    });

    it("should preserve double newlines for paragraphs", () => {
      const input = "Paragraph 1\n\nParagraph 2";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "Paragraph 1\n\nParagraph 2");
    });

    it("should handle empty string", () => {
      const result = formatForWhatsApp("");

      assert.strictEqual(result, "");
    });

    it("should handle text with no formatting", () => {
      const input = "Plain text without any formatting.";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "Plain text without any formatting.");
    });

    it("should combine all formatting operations", () => {
      const input = "  **Title**\n\n\n\nSome **bold** content\n\n  ";
      const result = formatForWhatsApp(input);

      assert.strictEqual(result, "*Title*\n\nSome *bold* content");
    });
  });
});
