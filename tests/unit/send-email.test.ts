import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

/**
 * Send Email Tool Tests
 *
 * Tests the sendEmailTool input validation using the same Zod schema.
 *
 * Note: We recreate the schema here because the actual tool file has
 * dependencies that conflict with Node.js test runner (server-only imports
 * through the module resolution chain).
 *
 * The actual tool is validated during build and integration tests.
 */

// Recreate the same Zod schema used in send-email.ts
const sendEmailSchema = z.object({
  recipientEmail: z
    .string()
    .email("Must be a valid email address"),
  recipientName: z
    .string()
    .optional(),
  subject: z.string(),
  content: z.string(),
  contentType: z
    .enum(["property_info", "calculation", "general", "document"])
    .optional(),
  documentUrl: z
    .string()
    .url()
    .optional(),
  documentTitle: z
    .string()
    .optional(),
});

describe("Send Email Schema Validation", () => {
  describe("Email Format Validation", () => {
    it("should accept valid email addresses", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "valid@example.com",
        subject: "Test Subject",
        content: "Test content",
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid email addresses", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "not-an-email",
        subject: "Test Subject",
        content: "Test content",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject empty email", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "",
        subject: "Test Subject",
        content: "Test content",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("Required Fields", () => {
    it("should require subject", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        content: "Test content",
      });
      assert.strictEqual(result.success, false);
    });

    it("should require content", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test Subject",
      });
      assert.strictEqual(result.success, false);
    });

    it("should require recipientEmail", () => {
      const result = sendEmailSchema.safeParse({
        subject: "Test Subject",
        content: "Test content",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("Optional Fields", () => {
    it("should accept all optional fields", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        recipientName: "John Doe",
        subject: "Test Subject",
        content: "Test content",
        contentType: "property_info",
        documentUrl: "https://example.com/doc.docx",
        documentTitle: "My Document",
      });
      assert.strictEqual(result.success, true);
    });

    it("should work without optional fields", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test Subject",
        content: "Test content",
      });
      assert.strictEqual(result.success, true);
    });
  });

  describe("ContentType Enum", () => {
    const validTypes = ["property_info", "calculation", "general", "document"];

    for (const type of validTypes) {
      it(`should accept contentType: ${type}`, () => {
        const result = sendEmailSchema.safeParse({
          recipientEmail: "test@example.com",
          subject: "Test",
          content: "Content",
          contentType: type,
        });
        assert.strictEqual(result.success, true);
      });
    }

    it("should reject invalid contentType", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test",
        content: "Content",
        contentType: "invalid_type",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("DocumentUrl Validation", () => {
    it("should accept valid HTTPS URL", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test",
        content: "Content",
        documentUrl: "https://example.com/doc.docx",
      });
      assert.strictEqual(result.success, true);
    });

    it("should accept valid HTTP URL", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test",
        content: "Content",
        documentUrl: "http://example.com/doc.docx",
      });
      assert.strictEqual(result.success, true);
    });

    it("should reject invalid URL", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test",
        content: "Content",
        documentUrl: "not-a-url",
      });
      assert.strictEqual(result.success, false);
    });

    it("should reject relative path", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "test@example.com",
        subject: "Test",
        content: "Content",
        documentUrl: "/path/to/doc.docx",
      });
      assert.strictEqual(result.success, false);
    });
  });

  describe("Real-world Email Examples", () => {
    it("should validate property inquiry email", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "buyer@example.com",
        recipientName: "Maria Smith",
        subject: "Property Details - 3 Bedroom Apartment in Limassol",
        content: "Here are the details for the property you inquired about...",
        contentType: "property_info",
      });
      assert.strictEqual(result.success, true);
    });

    it("should validate calculation result email", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "client@company.com",
        subject: "Transfer Fees Calculation for €500,000 Property",
        content: "Transfer fees: €15,000\nVAT: €95,000\nTotal: €610,000",
        contentType: "calculation",
      });
      assert.strictEqual(result.success, true);
    });

    it("should validate document attachment email", () => {
      const result = sendEmailSchema.safeParse({
        recipientEmail: "agent@realestate.com",
        recipientName: "John Agent",
        subject: "Viewing Form - Property Ref 12345",
        content: "Please find attached the viewing form for the property.",
        contentType: "document",
        documentUrl: "https://storage.example.com/forms/viewing-12345.docx",
        documentTitle: "Viewing Form - 12345",
      });
      assert.strictEqual(result.success, true);
    });
  });
});

/**
 * Tool Registry Tests
 *
 * Note: Full registry integration tests are skipped in unit tests because
 * the registry imports modules with "server-only" which fails in Node.
 * Registry validation happens via:
 * - Build passes (which imports all modules)
 * - The validateToolRegistry() function at runtime
 */
