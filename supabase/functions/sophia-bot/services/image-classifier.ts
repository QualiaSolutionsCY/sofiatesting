/**
 * AI Vision Image Classifier
 * Uses Gemini Flash via OpenRouter to auto-classify images as
 * property photos, title deeds, or floor plans.
 */

import { logger, LogCategory } from "../utils/logger.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.1-pro-preview-customtools";
const VISION_TIMEOUT_MS = 15_000;

interface ClassificationResult {
  titleDeedIndices: number[];
  floorPlanIndices: number[];
}

const EMPTY_RESULT: ClassificationResult = { titleDeedIndices: [], floorPlanIndices: [] };

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
export async function classifyImagesWithVision(imageUrls: string[]): Promise<ClassificationResult> {
  if (!OPENROUTER_API_KEY) {
    logger.warn("Vision classification skipped — no OPENROUTER_API_KEY", {
      category: LogCategory.IMAGE,
    });
    return EMPTY_RESULT;
  }

  if (imageUrls.length < 2) {
    return EMPTY_RESULT;
  }

  logger.info("Starting vision classification", {
    category: LogCategory.IMAGE,
    operation: "classifyImages",
    imageCount: imageUrls.length,
  });

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: CLASSIFICATION_PROMPT },
  ];

  for (const url of imageUrls) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
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
    const classifications: string[] = parsed.classifications;

    if (!Array.isArray(classifications) || classifications.length !== imageUrls.length) {
      logger.warn("Vision classification count mismatch", {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
        expected: imageUrls.length,
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
    if (titleDeedIndices.length === 1 && imageUrls.length >= 10) {
      logger.info("Dropping likely false-positive title deed classification (1 out of 10+ images)", {
        category: LogCategory.IMAGE,
        operation: "classifyImages",
        droppedIndex: titleDeedIndices[0],
        totalImages: imageUrls.length,
      });
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
    logger.warn(`Vision classification ${isTimeout ? "timed out" : "failed"} — falling back to manual`, {
      category: LogCategory.IMAGE,
      operation: "classifyImages",
      error: err instanceof Error ? err.message : String(err),
    });
    return EMPTY_RESULT;
  }
}
