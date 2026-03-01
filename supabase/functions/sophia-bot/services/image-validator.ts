/**
 * Early Image Validation Service
 *
 * Validates image URLs at webhook ingress (before storage).
 * Provides clear, user-friendly error messages for invalid images.
 *
 * Validation order:
 * 1. URL format validation
 * 2. Security check (SSRF prevention)
 * 3. Content-type check (HEAD request)
 * 4. Accessibility check
 */

import { getContext } from "../utils/context.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { validateImageUrl } from "../utils/url-validator.ts";

export interface ImageValidationResult {
  valid: boolean;
  url: string;
  error?: string;
  userMessage?: string; // User-friendly message
}

export interface BatchValidationResult {
  valid: ImageValidationResult[];
  invalid: ImageValidationResult[];
  summary: string; // User-friendly summary
}

// Common invalid URL patterns (AI hallucinations)
const HALLUCINATED_PATTERNS = [
  /images\.zyprus\.com/i, // Fake domain
  /^ibb\.co\//, // ibb.co sharing page (not i.ibb.co direct)
  /placeholder/i,
  /example\.com/i,
  /sample-image/i,
  /property-photo-\d+\.jpg$/i, // Generic placeholder pattern
];

/**
 * Validate a single image URL at ingress
 * Returns user-friendly message if invalid
 */
export async function validateImageAtIngress(
  url: string
): Promise<ImageValidationResult> {
  const ctx = getContext();

  // 1. Basic URL format
  if (!url || url.trim() === "") {
    return {
      valid: false,
      url,
      error: "Empty URL",
      userMessage: "No image URL provided.",
    };
  }

  const trimmedUrl = url.trim();

  // 2. Check for hallucinated URLs
  for (const pattern of HALLUCINATED_PATTERNS) {
    if (pattern.test(trimmedUrl)) {
      logger.warn("Hallucinated image URL detected", {
        category: LogCategory.IMAGE,
        operation: "validateImageAtIngress",
        correlationId: ctx.correlationId,
        urlPreview: trimmedUrl.substring(0, 100),
      });
      return {
        valid: false,
        url: trimmedUrl,
        error: "Hallucinated URL pattern",
        userMessage:
          "This image URL doesn't look valid. Please send a photo directly from your phone gallery.",
      };
    }
  }

  // 3. ibb.co specific check (common user mistake)
  if (trimmedUrl.includes("ibb.co") && !trimmedUrl.includes("i.ibb.co")) {
    return {
      valid: false,
      url: trimmedUrl,
      error: "ibb.co sharing link instead of direct image",
      userMessage:
        "This is a sharing link, not a direct image URL. Please use the direct image link (starting with i.ibb.co) or send photos directly from your gallery.",
    };
  }

  // 4. Security validation (SSRF prevention)
  const securityCheck = validateImageUrl(trimmedUrl);
  if (!securityCheck.valid) {
    logger.warn("Image URL failed security check", {
      category: LogCategory.IMAGE,
      operation: "validateImageAtIngress",
      correlationId: ctx.correlationId,
      error: securityCheck.error,
    });
    return {
      valid: false,
      url: trimmedUrl,
      error: securityCheck.error,
      userMessage:
        "This image URL cannot be accessed for security reasons. Please send photos directly from your gallery.",
    };
  }

  // 5. Check accessibility with HEAD request (timeout 5s)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response: Response;
    try {
      response = await fetch(trimmedUrl, {
        method: "HEAD",
        signal: controller.signal,
      });
    } catch {
      // Some servers don't support HEAD, try GET with range
      response = await fetch(trimmedUrl, {
        method: "GET",
        headers: { Range: "bytes=0-1024" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return {
        valid: false,
        url: trimmedUrl,
        error: `HTTP ${response.status}`,
        userMessage:
          response.status === 404
            ? "This image could not be found. It may have been deleted."
            : response.status === 403
              ? "Access to this image is forbidden."
              : "This image could not be accessed. Please try a different image.",
      };
    }

    // 6. Content-type check
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return {
        valid: false,
        url: trimmedUrl,
        error: `Not an image: ${contentType}`,
        userMessage:
          "This URL doesn't point to an image. Please send a photo directly from your gallery.",
      };
    }

    logger.info("Image URL validated successfully", {
      category: LogCategory.IMAGE,
      operation: "validateImageAtIngress",
      correlationId: ctx.correlationId,
    });

    return { valid: true, url: trimmedUrl };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    if (error.name === "AbortError") {
      return {
        valid: false,
        url: trimmedUrl,
        error: "Timeout",
        userMessage:
          "This image took too long to load. Please try a different image or send directly from your gallery.",
      };
    }

    return {
      valid: false,
      url: trimmedUrl,
      error: error.message,
      userMessage:
        "This image could not be accessed. Please send photos directly from your gallery.",
    };
  }
}

/**
 * Validate multiple images at ingress
 * Returns summary for user
 */
export async function validateImagesAtIngress(
  urls: string[]
): Promise<BatchValidationResult> {
  const results = await Promise.all(urls.map(validateImageAtIngress));

  const valid = results.filter((r) => r.valid);
  const invalid = results.filter((r) => !r.valid);

  let summary = "";
  if (invalid.length === 0) {
    summary = `All ${valid.length} image(s) validated successfully.`;
  } else if (valid.length === 0) {
    summary = `None of the ${invalid.length} image(s) could be validated. Please send photos directly from your phone gallery.`;
  } else {
    summary = `${valid.length} of ${urls.length} image(s) validated. ${invalid.length} could not be used.`;
  }

  return { valid, invalid, summary };
}
