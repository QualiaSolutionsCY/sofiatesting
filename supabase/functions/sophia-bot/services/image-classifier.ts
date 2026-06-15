/**
 * AI Vision Image Classifier
 * Uses Claude Sonnet 4.6 via OpenRouter to auto-classify images as
 * room types (exterior, living room, kitchen, etc.), title deeds, or floor plans.
 * Room-type classification enables mandatory photo ordering on all uploads.
 */

import { LogCategory, logger } from "../utils/logger.ts";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const VISION_MODEL = "anthropic/claude-sonnet-4.6";
// Bank-portal listings get the strongest vision model for room-type ordering /
// title-deed detection (their galleries are larger and less predictable).
const VISION_MODEL_BANK = "anthropic/claude-opus-4.8";
const VISION_TIMEOUT_MS = 20_000;

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

/** Room-type classifications matching the mandatory photo order */
export type RoomType =
  | "exterior_front"
  | "exterior_other"
  | "pool"
  | "garden"
  | "living_room"
  | "kitchen"
  | "additional_room"
  | "bedroom"
  | "bathroom"
  | "other"
  | "satellite";

/** Priority order for room types (lower = first in gallery, satellite always LAST) */
export const ROOM_TYPE_ORDER: Record<RoomType, number> = {
  exterior_front: 1,
  exterior_other: 2,
  pool: 3,
  garden: 4,
  living_room: 5,
  kitchen: 6,
  additional_room: 7,
  bedroom: 8,
  bathroom: 9,
  other: 10,
  satellite: 99, // Google Earth / satellite always last
};

interface ClassificationResult {
  titleDeedIndices: number[];
  floorPlanIndices: number[];
  /** Room-type classification for each image (same length as input, excluding title deeds/floor plans) */
  roomTypes: (RoomType | "title_deed" | "floor_plan")[];
}

const EMPTY_RESULT: ClassificationResult = {
  titleDeedIndices: [],
  floorPlanIndices: [],
  roomTypes: [],
};

const CLASSIFICATION_PROMPT = `You are an image classifier for real estate listings. For each image, classify it as exactly one of:
- "exterior_front" — the BEST exterior/building front shot: main facade, street view of building, entrance with full building visible
- "exterior_other" — other exterior shots: side views, back of building, construction site, views FROM the property
- "satellite" — Google Earth screenshots, satellite/aerial views, map screenshots, drone overview of entire area (NOT a drone photo of the property itself)
- "pool" — swimming pool (private or communal), pool area, pool terrace
- "garden" — garden, yard, terrace, patio, outdoor seating area, balcony with plants
- "living_room" — living room, lounge, salon, sitting area, open-plan living space
- "kitchen" — kitchen, cooking area, open-plan kitchen section
- "additional_room" — office, laundry room, storage room, utility room, playroom, hallway, staircase, dining room (separate from living)
- "bedroom" — bedroom, master bedroom, sleeping area
- "bathroom" — bathroom, shower room, WC, toilet
- "other" — any property photo that doesn't fit above categories
- "title_deed" — ONLY official printed/typed documents: title deed certificates, land registry papers, contracts with official stamps/seals/signatures. Must clearly show a DOCUMENT with printed text. Photos showing papers in background are NOT title deeds.
- "floor_plan" — architectural floor plan drawing, blueprint, layout diagram with room labels and measurements

RULES:
- Classify the FIRST clear exterior/building front shot as "exterior_front". Additional exterior shots are "exterior_other".
- When in doubt between room types, pick the best match. When truly ambiguous, use "other".
- Only use "title_deed" if the ENTIRE image is a scan/photo of an official document.

Respond with JSON only: {"classifications":["exterior_front","living_room","bedroom",...]}
The array must have exactly the same number of entries as images provided, in the same order.`;

/**
 * Classify images using AI vision. Returns indices of title deeds and floor plans.
 * Graceful fallback: returns empty arrays on any failure (timeout, API error, parse error).
 */
export async function classifyImagesWithVision(
  imageUrls: string[],
  opts?: { isBankListing?: boolean }
): Promise<ClassificationResult> {
  // Bank listings use Opus 4.8 for photo ordering; everyone else stays on
  // Sonnet 4.6 to control cost (vision runs on every upload).
  const visionModel = opts?.isBankListing ? VISION_MODEL_BANK : VISION_MODEL;
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
        model: visionModel,
        messages: [{ role: "user", content }],
        temperature: 0,
        max_tokens: 1024,
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
    const validRoomTypes: Set<string> = new Set([
      "exterior_front",
      "exterior_other",
      "pool",
      "garden",
      "living_room",
      "kitchen",
      "additional_room",
      "bedroom",
      "bathroom",
      "other",
      "title_deed",
      "floor_plan",
      "satellite",
    ]);

    // Normalize classifications to valid types
    const roomTypes: (RoomType | "title_deed" | "floor_plan")[] = [];
    for (let i = 0; i < classifications.length; i++) {
      const c = classifications[i].toLowerCase().trim();
      if (c === "title_deed") {
        titleDeedIndices.push(i);
        roomTypes.push("title_deed");
      } else if (c === "floor_plan") {
        floorPlanIndices.push(i);
        roomTypes.push("floor_plan");
      } else if (validRoomTypes.has(c)) {
        roomTypes.push(c as RoomType);
      } else {
        // Unknown classification from AI → default to "other"
        roomTypes.push("other");
      }
    }

    // False-positive guard: if only 1 title deed out of 25+ images, likely a misclassification
    // Relaxed from 10 to 25 — the old threshold dropped real title deed photos in normal batches
    if (titleDeedIndices.length === 1 && safeUrls.length >= 25) {
      const fpIdx = titleDeedIndices[0];
      logger.info(
        "Dropping likely false-positive title deed classification (1 out of 25+ images)",
        {
          category: LogCategory.IMAGE,
          operation: "classifyImages",
          droppedIndex: fpIdx,
          totalImages: imageUrls.length,
        }
      );
      // Reclassify the false-positive as "other"
      roomTypes[fpIdx] = "other";
      titleDeedIndices.length = 0;
    }

    logger.info("Vision classification complete", {
      category: LogCategory.IMAGE,
      operation: "classifyImages",
      classifications,
      roomTypes,
      titleDeeds: titleDeedIndices.length,
      floorPlans: floorPlanIndices.length,
    });

    return { titleDeedIndices, floorPlanIndices, roomTypes };
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
