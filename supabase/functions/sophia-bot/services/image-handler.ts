/**
 * Image Handler Service
 * Processes, validates, and orders property images for upload
 */

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
  if (url.toLowerCase().includes("personal") || url.toLowerCase().includes("private")) {
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

/**
 * Validate image URL is accessible and safe
 * Checks both security (SSRF) and accessibility
 */
async function checkImageAccessible(url: string): Promise<boolean> {
  try {
    // P0 SECURITY: Validate URL before making any request (SSRF prevention)
    const securityCheck = validateImageUrl(url);
    if (!securityCheck.valid) {
      console.warn(`[Image Handler] SSRF blocked: ${securityCheck.error}`, {
        url: url.substring(0, 100),
      });
      return false;
    }

    // Try HEAD first, fall back to GET if HEAD fails (some servers like picsum don't support HEAD)
    let response = await fetch(url, { method: "HEAD" });
    if (!response.ok && response.status === 405) {
      // HEAD not allowed, try GET with a range to minimize data transfer
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-1024" },
      });
    }

    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");
    return contentType?.startsWith("image/") || false;
  } catch {
    return false;
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

  // Sort by order priority
  return processed.sort((a, b) => a.order - b.order);
}

/**
 * Validate that all images are accessible
 */
export async function validateImages(
  images: ProcessedImage[]
): Promise<{ valid: ProcessedImage[]; invalid: string[] }> {
  const valid: ProcessedImage[] = [];
  const invalid: string[] = [];

  await Promise.all(
    images.map(async (img) => {
      const isValid = await checkImageAccessible(img.url);
      if (isValid) {
        valid.push(img);
      } else {
        invalid.push(img.url);
      }
    })
  );

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

