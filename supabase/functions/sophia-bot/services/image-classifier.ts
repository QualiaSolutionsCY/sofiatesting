/**
 * AI Vision Image Classifier
 * Uses Gemini Flash via OpenRouter to auto-classify images as
 * property photos, title deeds, or floor plans.
 */

import { LogCategory, logger } from "../utils/logger.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.1-pro-preview-customtools";
const VISION_TIMEOUT_MS = 15_000;

/** Block private/internal IPs and cloud metadata endpoints to prevent SSRF */
function isUnsafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be https (or http for dev, but block internal)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return true;
    const hostname = parsed.hostname.toLowerCase();
    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal"
    )
      return true;
    // Block loopback
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    )
      return true;
    // Block private RFC 1918 ranges
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    }
    return false;
  } catch {
    return true; // Malformed URL = unsafe
  }
}

interface ClassificationResult {
  titleDeedIndices: number[];
  floorPlanIndices: number[];
}

const EMPTY_RESULT: ClassificationResult = {
  titleDeedIndices: [],
  floorPlanIndices: [],
};

const CLASSIFICATION_PROMPT = `You are an image classifier for real estate listings. For each image, classify it as exactly one of:
- "property_photo" — interior/exterior property photo, construction site, view from property, any photo taken with a camera
- "title_deed" — ONLY official printed/typed documents: title deed certificates, land registry papers, contracts with official stamps/seals/signatures, government-issued documents. The image must clearly show a DOCUMENT with printed text. Photos that happen to show papers on a wall, framed certificates, or documents in the background are NOT title deeds — classify those as property_photo.
- "floor_plan" — architectural floor plan drawing, blueprint, layout diagram with room labels and measurements

IMPORTANT: When in doubt, classify as "property_photo". Only use "title_deed" if the ENTIRE image is a scan/photo of an official document.

Respond with JSON only: {"classifications":["property_photo","title_deed",...]}
The array must have exactly the same number of entries as images provided, in the same order.`;

/**
 * Classify images using AI vision. Returns indices of title deeds and floor plans.
 * Graceful fallback: returns empty arrays on any failure (timeout, API error, parse error).
 */
export async function classifyImagesWithVision(
  imageUrls: string[]
): Promise<ClassificationResult> {
  if (!OPENROUTER_API_KEY) {
    logger.warn("Vision classification skipped — no OPENROUTER_API_KEY", {
      category: LogCategory.IMAGE,
    });
    return EMPTY_RESULT;
  }

  if (imageUrls.length < 2) {
    return EMPTY_RESULT;
  }

  // SSRF protection: filter out unsafe URLs before sending to vision API
  const safeUrls = imageUrls.filter((url, idx) => {
    if (isUnsafeUrl(url)) {
      logger.warn(
        "Blocked unsafe URL from vision classification (SSRF protection)",
        {
          category: LogCategory.IMAGE,
          operation: "classifyImages",
          index: idx,
          urlPreview: url.substring(0, 80),
        }
      );
      return false;
    }
    return true;
  });

  if (safeUrls.length < 2) {
    return EMPTY_RESULT;
  }

  logger.info("Starting vision classification", {
    category: LogCategory.IMAGE,
    operation: "classifyImages",
    imageCount: safeUrls.length,
    filteredCount: imageUrls.length - safeUrls.length,
  });

  const content: Array<{
    type: string;
    text?: string;
    image_url?: { url: string };
  }> = [{ type: "text", text: CLASSIFICATION_PROMPT }];

  for (const url of safeUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sophia-ai.vercel.app",
        "X-Title": "SOPHIA Image Classifier",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: "user", content }],
        temperature: 0,
        max_tokens: 256,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn("Vision API returned non-OK status", {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
        status: res.status,
      });
      return EMPTY_RESULT;
    }

    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) {
      logger.warn("Vision API returned empty content", {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
      });
      return EMPTY_RESULT;
    }

    const parsed = JSON.parse(rawText);
    if (!parsed || !parsed.classifications) {
      logger.warn(
        "Vision API returned malformed JSON — no classifications field",
        {
          category: LogCategory.IMAGE,
          operation: "classifyImages",
          rawPreview: rawText.substring(0, 200),
        }
      );
      return EMPTY_RESULT;
    }
    const classifications: string[] = parsed.classifications;

    if (
      !Array.isArray(classifications) ||
      classifications.length !== safeUrls.length
    ) {
      logger.warn("Vision classification count mismatch", {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
        expected: safeUrls.length,
        got: classifications?.length,
      });
      return EMPTY_RESULT;
    }

    const titleDeedIndices: number[] = [];
    const floorPlanIndices: number[] = [];

    for (let i = 0; i < classifications.length; i++) {
      const c = classifications[i].toLowerCase().trim();
      if (c === "title_deed") titleDeedIndices.push(i);
      else if (c === "floor_plan") floorPlanIndices.push(i);
    }

    // False-positive guard: if only 1 title deed out of 10+ images, likely a misclassification
    // Real title deed uploads are typically 1-3 docs out of a handful of images, not 1 out of 15+
    if (titleDeedIndices.length === 1 && safeUrls.length >= 10) {
      logger.info(
        "Dropping likely false-positive title deed classification (1 out of 10+ images)",
        {
          category: LogCategory.IMAGE,
          operation: "classifyImages",
          droppedIndex: titleDeedIndices[0],
          totalImages: imageUrls.length,
        }
      );
      titleDeedIndices.length = 0;
    }

    logger.info("Vision classification complete", {
      category: LogCategory.IMAGE,
      operation: "classifyImages",
      classifications,
      titleDeeds: titleDeedIndices.length,
      floorPlans: floorPlanIndices.length,
    });

    return { titleDeedIndices, floorPlanIndices };
  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    logger.warn(
      `Vision classification ${isTimeout ? "timed out" : "failed"} — falling back to manual`,
      {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
        error: err instanceof Error ? err.message : String(err),
      }
    );
    return EMPTY_RESULT;
  }
}
