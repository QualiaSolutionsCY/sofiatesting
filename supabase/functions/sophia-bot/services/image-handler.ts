/**
 * Image Handler Service
 * Processes, validates, and orders property images for upload
 */

import { LogCategory, logger } from "../utils/logger.ts";
import { validateImageUrl } from "../utils/url-validator.ts";

export interface ProcessedImage {
  url: string;
  order: number;
  needsCropping: boolean;
  privacyIssues: string[];
  classification: ImageClassification;
}

export type ImageClassification =
  | "exterior_front"
  | "exterior_other"
  | "pool"
  | "garden"
  | "living_room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "other"
  | "unknown";

// Image order priority (lower = first)
const IMAGE_ORDER: Record<ImageClassification, number> = {
  exterior_front: 1,
  exterior_other: 2,
  pool: 3,
  garden: 4,
  living_room: 5,
  kitchen: 6,
  bedroom: 7,
  bathroom: 8,
  other: 9,
  unknown: 10,
};

// Domains that likely have watermarks we should warn about
const WATERMARK_DOMAINS = [
  "bazaraki.com",
  "bazaraki.cy",
  "facebook.com",
  "fb.com",
  "rightmove.co.uk",
  "zoopla.co.uk",
];

/**
 * Check if URL is from a domain known to have watermarks
 */
function hasKnownWatermark(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return WATERMARK_DOMAINS.some(
      (domain) =>
        urlObj.hostname.includes(domain) ||
        url.toLowerCase().includes(domain.replace(".", ""))
    );
  } catch {
    return false;
  }
}

/**
 * Detect privacy issues in image URL or metadata
 * (This is a simple check - in production you might use AI vision)
 */
function detectPrivacyIssues(url: string): string[] {
  const issues: string[] = [];

  // Check for street view or location metadata
  if (url.toLowerCase().includes("streetview")) {
    issues.push("May contain Google Street View content");
  }

  // Check for personal information in URL
  if (
    url.toLowerCase().includes("personal") ||
    url.toLowerCase().includes("private")
  ) {
    issues.push("URL suggests private/personal content");
  }

  return issues;
}

/**
 * Simple image classification based on filename
 * In production, you'd use AI vision for this
 */
function classifyImage(url: string): ImageClassification {
  const filename = url.toLowerCase();

  // Exterior
  if (
    filename.includes("front") ||
    filename.includes("facade") ||
    filename.includes("entrance")
  ) {
    return "exterior_front";
  }
  if (
    filename.includes("exterior") ||
    filename.includes("outside") ||
    filename.includes("building")
  ) {
    return "exterior_other";
  }

  // Outdoor features
  if (filename.includes("pool") || filename.includes("swimming")) {
    return "pool";
  }
  if (
    filename.includes("garden") ||
    filename.includes("yard") ||
    filename.includes("terrace") ||
    filename.includes("patio")
  ) {
    return "garden";
  }

  // Interior rooms
  if (
    filename.includes("living") ||
    filename.includes("lounge") ||
    filename.includes("salon")
  ) {
    return "living_room";
  }
  if (filename.includes("kitchen") || filename.includes("cooking")) {
    return "kitchen";
  }
  if (
    filename.includes("bedroom") ||
    filename.includes("master") ||
    filename.includes("sleep")
  ) {
    return "bedroom";
  }
  if (
    filename.includes("bathroom") ||
    filename.includes("bath") ||
    filename.includes("shower") ||
    filename.includes("wc")
  ) {
    return "bathroom";
  }

  // Generic interior
  if (filename.includes("interior") || filename.includes("inside")) {
    return "other";
  }

  return "unknown";
}

// Image validation timeout in milliseconds
const IMAGE_VALIDATION_TIMEOUT_MS = 5000; // 5 seconds per image

/**
 * Validate image URL is accessible and safe
 * Checks both security (SSRF) and accessibility
 * Returns detailed error information for debugging
 */
async function checkImageAccessibleWithError(
  url: string
): Promise<{ valid: boolean; error: string }> {
  try {
    // P0 SECURITY: Validate URL before making any request (SSRF prevention)
    const securityCheck = validateImageUrl(url);
    if (!securityCheck.valid) {
      logger.warn(`[Image Handler] SSRF blocked: ${securityCheck.error}`, {
        category: LogCategory.IMAGE,
        url: url.substring(0, 100),
      });
      return { valid: false, error: `Security: ${securityCheck.error}` };
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      IMAGE_VALIDATION_TIMEOUT_MS
    );

    try {
      // Try HEAD first, fall back to GET if HEAD fails (some servers like picsum don't support HEAD)
      let response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!response.ok && response.status === 405) {
        // HEAD not allowed, try GET with a range to minimize data transfer
        response = await fetch(url, {
          method: "GET",
          headers: { Range: "bytes=0-1024" },
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          valid: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const contentType = response.headers.get("content-type");
      if (!contentType?.startsWith("image/")) {
        return {
          valid: false,
          error: `Not an image (${contentType || "no content-type"})`,
        };
      }

      return { valid: true, error: "" };
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return {
          valid: false,
          error: `Timeout after ${IMAGE_VALIDATION_TIMEOUT_MS}ms`,
        };
      }
      throw fetchErr;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Fetch failed: ${errorMsg}` };
  }
}

/**
 * Process a list of image URLs for upload
 */
export async function processImages(
  imageUrls: string[]
): Promise<ProcessedImage[]> {
  const processed: ProcessedImage[] = [];

  for (const url of imageUrls) {
    // Skip empty URLs
    if (!url || url.trim() === "") {
      continue;
    }

    const classification = classifyImage(url);
    const needsCropping = hasKnownWatermark(url);
    const privacyIssues = detectPrivacyIssues(url);

    processed.push({
      url: url.trim(),
      order: IMAGE_ORDER[classification],
      needsCropping,
      privacyIssues,
      classification,
    });
  }

  // Only sort when images have meaningful filenames (e.g., URL images from ibb.co).
  // WhatsApp images from Supabase Storage all get "unknown" classification (generic UUIDs),
  // so sorting is meaningless and can shuffle the agent's intended order.
  const allUnknown = processed.every((img) => img.classification === "unknown");
  if (allUnknown) {
    return processed; // Preserve original order (created_at ASC from getPendingImages)
  }

  // Sort by order priority when meaningful classifications exist
  return processed.sort((a, b) => a.order - b.order);
}

export interface InvalidImage {
  url: string;
  error: string;
}

/**
 * Validate that all images are accessible
 * IMPORTANT: Preserves original array order (parallel checks complete in random order)
 */
export async function validateImages(
  images: ProcessedImage[]
): Promise<{ valid: ProcessedImage[]; invalid: InvalidImage[] }> {
  // Check all images in parallel but use index to preserve order
  const results = await Promise.all(
    images.map(async (img) => {
      const result = await checkImageAccessibleWithError(img.url);
      return { img, result };
    })
  );

  const valid: ProcessedImage[] = [];
  const invalid: InvalidImage[] = [];

  // Iterate in original order (Promise.all preserves index mapping)
  for (const { img, result } of results) {
    if (result.valid) {
      valid.push(img);
    } else {
      invalid.push({ url: img.url, error: result.error });
    }
  }

  return { valid, invalid };
}

/**
 * Generate warning message for images with issues
 */
export function generateImageWarnings(images: ProcessedImage[]): string {
  const warnings: string[] = [];

  const watermarkImages = images.filter((img) => img.needsCropping);
  if (watermarkImages.length > 0) {
    warnings.push(
      `⚠️ ${watermarkImages.length} image(s) may contain watermarks from other websites. ` +
        "Please crop or replace these before publishing."
    );
  }

  const privacyImages = images.filter((img) => img.privacyIssues.length > 0);
  if (privacyImages.length > 0) {
    warnings.push(
      `⚠️ ${privacyImages.length} image(s) may have privacy concerns. ` +
        "Please review before publishing."
    );
  }

  return warnings.join("\n\n");
}

/**
 * Get image URLs in optimized order
 */
export function getOrderedImageUrls(images: ProcessedImage[]): string[] {
  return images.map((img) => img.url);
}

/**
 * Minimum images required for different property types
 * Reduced to 1 for all types to allow easier WhatsApp uploads
 * Zyprus API only requires 1 image minimum
 */
export function getMinimumImageCount(propertyType: string): number {
  // All property types now only require 1 image minimum
  // The API can accept more, but 1 is sufficient for draft creation
  return 1;
}

/**
 * Check if we have enough images
 */
export function hasEnoughImages(
  images: ProcessedImage[],
  propertyType: string
): { enough: boolean; required: number; provided: number } {
  const required = getMinimumImageCount(propertyType);
  const provided = images.length;

  return {
    enough: provided >= required,
    required,
    provided,
  };
}
