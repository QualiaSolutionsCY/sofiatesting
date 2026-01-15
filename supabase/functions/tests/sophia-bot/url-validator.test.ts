/**
 * URL Validator Tests - SSRF Prevention
 *
 * Tests the URL validation functions used to prevent SSRF attacks
 * in the sophia-bot Edge Function.
 *
 * Run: deno test --allow-all supabase/functions/tests/sophia-bot/url-validator.test.ts
 */

import { assertEquals } from "jsr:@std/assert@1";
import {
  validateExternalUrl,
  validateImageUrl,
  isUrlSafe,
  safeFetch,
} from "../../sophia-bot/utils/url-validator.ts";

// ============================================
// validateExternalUrl - Document URL Validation
// ============================================

Deno.test("validateExternalUrl - allows Supabase storage URLs", () => {
  const result = validateExternalUrl(
    "https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/sign/documents/test.docx"
  );
  assertEquals(result.valid, true);
  assertEquals(result.hostname, "vceeheaxcrhmpqueudqx.supabase.co");
});

Deno.test("validateExternalUrl - allows general Supabase domains", () => {
  const result = validateExternalUrl(
    "https://example.supabase.co/storage/v1/object/file.pdf"
  );
  assertEquals(result.valid, true);
});

Deno.test("validateExternalUrl - blocks localhost", () => {
  const result = validateExternalUrl("https://localhost/secret");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Access to this host is not allowed");
});

Deno.test("validateExternalUrl - blocks 127.0.0.1", () => {
  const result = validateExternalUrl("https://127.0.0.1/internal");
  assertEquals(result.valid, false);
});

Deno.test("validateExternalUrl - blocks AWS metadata endpoint", () => {
  const result = validateExternalUrl(
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
  );
  assertEquals(result.valid, false);
});

Deno.test("validateExternalUrl - blocks GCP metadata endpoint", () => {
  const result = validateExternalUrl(
    "http://metadata.google.internal/computeMetadata/v1/"
  );
  assertEquals(result.valid, false);
});

Deno.test("validateExternalUrl - blocks private Class A IPs (10.x)", () => {
  const result = validateExternalUrl("https://10.0.0.1/internal");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Access to private networks is not allowed");
});

Deno.test("validateExternalUrl - blocks private Class B IPs (172.16-31.x)", () => {
  assertEquals(validateExternalUrl("https://172.16.0.1/file").valid, false);
  assertEquals(validateExternalUrl("https://172.20.0.1/file").valid, false);
  assertEquals(validateExternalUrl("https://172.31.255.255/file").valid, false);
});

Deno.test("validateExternalUrl - blocks private Class C IPs (192.168.x)", () => {
  const result = validateExternalUrl("https://192.168.1.1/admin");
  assertEquals(result.valid, false);
});

Deno.test("validateExternalUrl - blocks loopback IPs (127.x)", () => {
  assertEquals(validateExternalUrl("https://127.0.0.1/file").valid, false);
  assertEquals(validateExternalUrl("https://127.1.2.3/file").valid, false);
});

Deno.test("validateExternalUrl - blocks link-local IPs (169.254.x)", () => {
  const result = validateExternalUrl("https://169.254.100.50/internal");
  assertEquals(result.valid, false);
});

Deno.test("validateExternalUrl - blocks all raw IP addresses (public IPs)", () => {
  // Even public IPs should be blocked - use domain names
  const result = validateExternalUrl("https://8.8.8.8/file");
  assertEquals(result.valid, false);
  assertEquals(result.error, "IP addresses are not allowed - use a domain name");
});

Deno.test("validateExternalUrl - blocks path traversal attempts", () => {
  const result = validateExternalUrl(
    "https://vceeheaxcrhmpqueudqx.supabase.co/../../../etc/passwd"
  );
  assertEquals(result.valid, false);
  assertEquals(result.error, "Path traversal detected");
});

Deno.test("validateExternalUrl - requires HTTPS", () => {
  const result = validateExternalUrl(
    "http://vceeheaxcrhmpqueudqx.supabase.co/file.docx"
  );
  assertEquals(result.valid, false);
  assertEquals(result.error, "Only HTTPS URLs are allowed");
});

Deno.test("validateExternalUrl - blocks non-allowed domains", () => {
  const result = validateExternalUrl("https://example.com/file.docx");
  assertEquals(result.valid, false);
  assertEquals(result.error?.includes("not in the allowed list"), true);
});

Deno.test("validateExternalUrl - handles invalid URL format", () => {
  const result = validateExternalUrl("not-a-valid-url");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid URL format");
});

Deno.test("validateExternalUrl - handles empty string", () => {
  const result = validateExternalUrl("");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Invalid URL format");
});

// ============================================
// validateImageUrl - Image URL Validation
// ============================================

Deno.test("validateImageUrl - allows public HTTPS URLs", () => {
  const result = validateImageUrl("https://example.com/image.jpg");
  assertEquals(result.valid, true);
});

Deno.test("validateImageUrl - allows HTTP URLs for images", () => {
  const result = validateImageUrl("http://example.com/image.jpg");
  assertEquals(result.valid, true);
});

Deno.test("validateImageUrl - blocks localhost", () => {
  const result = validateImageUrl("http://localhost/image.jpg");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Access to this host is not allowed");
});

Deno.test("validateImageUrl - blocks private IPs", () => {
  assertEquals(validateImageUrl("http://10.0.0.1/image.jpg").valid, false);
  assertEquals(validateImageUrl("http://192.168.1.1/image.jpg").valid, false);
  assertEquals(validateImageUrl("http://172.16.0.1/image.jpg").valid, false);
});

Deno.test("validateImageUrl - blocks metadata endpoints", () => {
  assertEquals(
    validateImageUrl("http://169.254.169.254/image.jpg").valid,
    false
  );
});

Deno.test("validateImageUrl - blocks path traversal", () => {
  const result = validateImageUrl("https://example.com/../../../etc/passwd");
  assertEquals(result.valid, false);
  assertEquals(result.error, "Path traversal detected");
});

Deno.test("validateImageUrl - allows public IPs (unlike document URLs)", () => {
  // Image URLs can use public IPs since they may come from various sources
  const result = validateImageUrl("https://8.8.8.8/image.jpg");
  assertEquals(result.valid, true);
});

// ============================================
// isUrlSafe - Quick Safety Check
// ============================================

Deno.test("isUrlSafe - returns true for safe HTTPS URLs", () => {
  assertEquals(isUrlSafe("https://example.com/page"), true);
  assertEquals(isUrlSafe("https://supabase.co/storage/file"), true);
});

Deno.test("isUrlSafe - returns false for HTTP URLs", () => {
  assertEquals(isUrlSafe("http://example.com/page"), false);
});

Deno.test("isUrlSafe - returns false for localhost", () => {
  assertEquals(isUrlSafe("https://localhost/page"), false);
});

Deno.test("isUrlSafe - returns false for private IPs", () => {
  assertEquals(isUrlSafe("https://10.0.0.1/page"), false);
  assertEquals(isUrlSafe("https://192.168.1.1/page"), false);
});

Deno.test("isUrlSafe - returns false for invalid URLs", () => {
  assertEquals(isUrlSafe("not-a-url"), false);
  assertEquals(isUrlSafe(""), false);
});

// ============================================
// safeFetch - Validated Fetch
// ============================================

Deno.test("safeFetch - throws on invalid URLs", async () => {
  try {
    await safeFetch("http://localhost/secret");
    // Should not reach here
    assertEquals(true, false, "Should have thrown");
  } catch (error) {
    assertEquals(
      (error as Error).message.includes("SSRF blocked"),
      true
    );
  }
});

Deno.test("safeFetch - throws on private IPs", async () => {
  try {
    await safeFetch("https://10.0.0.1/internal");
    assertEquals(true, false, "Should have thrown");
  } catch (error) {
    assertEquals(
      (error as Error).message.includes("SSRF blocked"),
      true
    );
  }
});

// ============================================
// Edge Cases
// ============================================

Deno.test("validateExternalUrl - handles URLs with query params", () => {
  const result = validateExternalUrl(
    "https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/sign/docs/file.docx?token=abc123"
  );
  assertEquals(result.valid, true);
});

Deno.test("validateExternalUrl - handles URLs with fragments", () => {
  const result = validateExternalUrl(
    "https://vceeheaxcrhmpqueudqx.supabase.co/file.pdf#page=5"
  );
  assertEquals(result.valid, true);
});

Deno.test("validateExternalUrl - handles URLs with ports", () => {
  // Should still check domain
  const result = validateExternalUrl(
    "https://vceeheaxcrhmpqueudqx.supabase.co:443/file.docx"
  );
  assertEquals(result.valid, true);
});

Deno.test("validateExternalUrl - case insensitive hostname check", () => {
  const result = validateExternalUrl(
    "https://VCEEHEAXCRHMPQUEUDQX.SUPABASE.CO/file.docx"
  );
  assertEquals(result.valid, true);
});

Deno.test("validateImageUrl - handles encoded URLs", () => {
  const result = validateImageUrl(
    "https://example.com/image%20with%20spaces.jpg"
  );
  assertEquals(result.valid, true);
});
