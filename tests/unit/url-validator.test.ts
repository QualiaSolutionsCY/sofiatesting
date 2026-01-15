import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUrlSafe,
  validateDocumentUrl,
  validateExternalUrl,
} from "@/lib/ai/security/url-validator";

/**
 * URL Validator Tests
 *
 * Tests SSRF prevention functionality including:
 * - Allowlist validation for trusted domains
 * - Blocking of private IP ranges
 * - Protocol enforcement (HTTPS only)
 * - Cloud metadata endpoint blocking
 *
 * These are security-critical tests to prevent Server-Side Request Forgery.
 */

describe("URL Validator", () => {
  describe("validateExternalUrl", () => {
    describe("Allowed domains", () => {
      it("should allow Supabase storage URLs", () => {
        const result = validateExternalUrl(
          "https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/public/documents/test.docx"
        );
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.hostname, "vceeheaxcrhmpqueudqx.supabase.co");
      });

      it("should allow any supabase.co subdomain", () => {
        const result = validateExternalUrl(
          "https://storage.supabase.co/files/test.pdf"
        );
        assert.strictEqual(result.valid, true);
      });

      it("should allow exact supabase.co domain", () => {
        const result = validateExternalUrl("https://supabase.co/docs");
        assert.strictEqual(result.valid, true);
      });
    });

    describe("Blocked domains", () => {
      it("should block non-allowlisted domains", () => {
        const result = validateExternalUrl("https://evil.com/malware.docx");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("not in the allowed list"));
      });

      it("should block google.com", () => {
        const result = validateExternalUrl("https://google.com/file.docx");
        assert.strictEqual(result.valid, false);
      });

      it("should block github.com", () => {
        const result = validateExternalUrl(
          "https://github.com/repo/file.docx"
        );
        assert.strictEqual(result.valid, false);
      });

      it("should block domains that contain allowed domain as substring", () => {
        // evil-supabase.co should NOT be allowed just because it contains "supabase.co"
        const result = validateExternalUrl(
          "https://evil-supabase.co/file.docx"
        );
        assert.strictEqual(result.valid, false);
      });
    });

    describe("Protocol enforcement", () => {
      it("should block HTTP (non-secure) URLs", () => {
        const result = validateExternalUrl(
          "http://vceeheaxcrhmpqueudqx.supabase.co/file.docx"
        );
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("HTTPS"));
      });

      it("should block FTP URLs", () => {
        const result = validateExternalUrl("ftp://files.example.com/file.docx");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("HTTPS"));
      });

      it("should block file:// URLs", () => {
        const result = validateExternalUrl("file:///etc/passwd");
        assert.strictEqual(result.valid, false);
      });

      it("should block javascript: URLs", () => {
        const result = validateExternalUrl("javascript:alert(1)");
        assert.strictEqual(result.valid, false);
      });
    });

    describe("Private IP blocking (SSRF)", () => {
      it("should block localhost", () => {
        const result = validateExternalUrl("https://localhost/admin");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("not allowed"));
      });

      it("should block 127.0.0.1 (loopback)", () => {
        const result = validateExternalUrl("https://127.0.0.1/internal");
        assert.strictEqual(result.valid, false);
      });

      it("should block 10.x.x.x (Class A private)", () => {
        const result = validateExternalUrl("https://10.0.0.1/internal");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("private"));
      });

      it("should block 172.16-31.x.x (Class B private)", () => {
        const result = validateExternalUrl("https://172.16.0.1/internal");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("private"));
      });

      it("should block 172.31.x.x (Class B private upper range)", () => {
        const result = validateExternalUrl("https://172.31.255.1/internal");
        assert.strictEqual(result.valid, false);
      });

      it("should NOT block 172.15.x.x (not private)", () => {
        // 172.15.x.x is NOT in the private range (172.16-31.x.x)
        // But it should still be blocked as a raw IP
        const result = validateExternalUrl("https://172.15.0.1/file");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("IP addresses are not allowed"));
      });

      it("should block 192.168.x.x (Class C private)", () => {
        const result = validateExternalUrl("https://192.168.1.1/admin");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("private"));
      });

      it("should block 0.0.0.0", () => {
        const result = validateExternalUrl("https://0.0.0.0/file");
        assert.strictEqual(result.valid, false);
      });
    });

    describe("Cloud metadata endpoint blocking", () => {
      it("should block AWS metadata endpoint (169.254.169.254)", () => {
        const result = validateExternalUrl(
          "https://169.254.169.254/latest/meta-data/"
        );
        assert.strictEqual(result.valid, false);
      });

      it("should block any 169.254.x.x (link-local)", () => {
        const result = validateExternalUrl("https://169.254.1.1/metadata");
        assert.strictEqual(result.valid, false);
      });

      it("should block GCP metadata endpoint", () => {
        const result = validateExternalUrl(
          "https://metadata.google.internal/computeMetadata/v1/"
        );
        assert.strictEqual(result.valid, false);
      });

      it("should block Azure metadata endpoint", () => {
        const result = validateExternalUrl(
          "https://metadata.azure.com/metadata/instance"
        );
        assert.strictEqual(result.valid, false);
      });
    });

    describe("Raw IP address blocking", () => {
      it("should block any raw IPv4 address even if public", () => {
        const result = validateExternalUrl("https://8.8.8.8/file.docx");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("IP addresses are not allowed"));
      });

      it("should suggest using domain name", () => {
        const result = validateExternalUrl("https://1.2.3.4/file");
        assert.ok(result.error?.includes("domain name"));
      });
    });

    describe("Invalid URLs", () => {
      it("should reject invalid URL format", () => {
        const result = validateExternalUrl("not-a-valid-url");
        assert.strictEqual(result.valid, false);
        assert.ok(result.error?.includes("Invalid URL"));
      });

      it("should reject empty string", () => {
        const result = validateExternalUrl("");
        assert.strictEqual(result.valid, false);
      });

      it("should reject URL without protocol", () => {
        const result = validateExternalUrl("supabase.co/file.docx");
        assert.strictEqual(result.valid, false);
      });

      it("should reject URLs with only spaces", () => {
        const result = validateExternalUrl("   ");
        assert.strictEqual(result.valid, false);
      });
    });

    describe("Edge cases", () => {
      it("should be case-insensitive for hostname", () => {
        const result = validateExternalUrl(
          "https://VCEEHEAXCRHMPQUEUDQX.SUPABASE.CO/file.docx"
        );
        assert.strictEqual(result.valid, true);
      });

      it("should handle URLs with ports", () => {
        const result = validateExternalUrl(
          "https://vceeheaxcrhmpqueudqx.supabase.co:443/file.docx"
        );
        assert.strictEqual(result.valid, true);
      });

      it("should handle URLs with query parameters", () => {
        const result = validateExternalUrl(
          "https://vceeheaxcrhmpqueudqx.supabase.co/file.docx?token=abc123"
        );
        assert.strictEqual(result.valid, true);
      });

      it("should handle URLs with fragments", () => {
        const result = validateExternalUrl(
          "https://vceeheaxcrhmpqueudqx.supabase.co/file.docx#section"
        );
        assert.strictEqual(result.valid, true);
      });

      it("should handle URLs with encoded characters", () => {
        const result = validateExternalUrl(
          "https://vceeheaxcrhmpqueudqx.supabase.co/file%20name.docx"
        );
        assert.strictEqual(result.valid, true);
      });
    });
  });

  describe("isUrlSafe", () => {
    it("should return true for valid HTTPS Supabase URLs", () => {
      assert.strictEqual(
        isUrlSafe("https://vceeheaxcrhmpqueudqx.supabase.co/file.docx"),
        true
      );
    });

    it("should return false for HTTP URLs", () => {
      assert.strictEqual(isUrlSafe("http://example.com/file.docx"), false);
    });

    it("should return false for localhost", () => {
      assert.strictEqual(isUrlSafe("https://localhost/file"), false);
    });

    it("should return false for private IPs", () => {
      assert.strictEqual(isUrlSafe("https://192.168.1.1/file"), false);
    });

    it("should return false for invalid URLs", () => {
      assert.strictEqual(isUrlSafe("not-a-url"), false);
    });

    it("should be fast for use as a quick check", () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        isUrlSafe("https://vceeheaxcrhmpqueudqx.supabase.co/file.docx");
      }
      const duration = performance.now() - start;

      // Should complete 1000 checks in under 50ms
      assert.ok(duration < 50, `Took ${duration}ms, expected < 50ms`);
    });
  });

  describe("validateDocumentUrl", () => {
    it("should return URL unchanged if valid", () => {
      const url =
        "https://vceeheaxcrhmpqueudqx.supabase.co/storage/file.docx";
      const result = validateDocumentUrl(url);
      assert.strictEqual(result, url);
    });

    it("should throw for invalid URLs", () => {
      assert.throws(
        () => validateDocumentUrl("https://evil.com/malware.docx"),
        /validation failed/
      );
    });

    it("should throw for private IPs", () => {
      assert.throws(
        () => validateDocumentUrl("https://192.168.1.1/file.docx"),
        /validation failed/
      );
    });

    it("should throw for HTTP URLs", () => {
      assert.throws(
        () =>
          validateDocumentUrl(
            "http://vceeheaxcrhmpqueudqx.supabase.co/file.docx"
          ),
        /HTTPS/
      );
    });
  });
});
