/**
 * Image Processor Module
 * Handles steps 7-7b: pending images retrieval, AI Vision classification,
 * title deed image splitting, floor plan processing, photo reordering, pending documents retrieval
 */

import {
  classifyImagesWithVision,
  ROOM_TYPE_ORDER,
  type RoomType,
} from "../../services/image-classifier.ts";
import {
  clearPendingDocuments,
  getPendingDocuments,
} from "../../services/pending-documents.ts";
import {
  clearPendingImages,
  getPendingImages,
} from "../../services/pending-images.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import { isDocumentUrl } from "../validators/location.ts";

export interface ProcessedImages {
  imageUrls: string[];
  titleDeedImageUrls: string[];
  floorPlanUrls: string[];
  documentUrls: string[]; // Title deed documents → field_title_deed_file
  otherDocumentUrls: string[]; // Other documents → field_other_document
}

export async function processListingImages(
  args: Record<string, unknown>,
  agentPhone: string
): Promise<ProcessedImages> {
  logger.info("Image processing started", {
    category: LogCategory.IMAGE,
    operation: "processListingImages",
    agentPhone,
  });

  // 7. Process images (sync classification)
  // CRITICAL FIX: Fetch images from pending_images table instead of trusting AI-provided URLs
  // The AI often hallucinates fake URLs like "images.zyprus.com" or "i.ibb.co/xxx"
  // Real images are stored in Supabase Storage and tracked in pending_images table
  let imageUrls: string[] = [];

  if (agentPhone) {
    const pendingImages = await getPendingImages(agentPhone);
    logger.info("Retrieved pending images", {
      category: LogCategory.IMAGE,
      count: pendingImages.length,
    });

    // Merge pending images with any direct URLs from tool arguments
    // Filter out document URLs (DOCX, PDF) that AI might confuse as images
    const rawDirectUrls = (args.imageUrls as string[]) || [];
    const directUrls = rawDirectUrls.filter((url) => {
      if (isDocumentUrl(url)) {
        logger.warn("Filtered out document URL from imageUrls", {
          category: LogCategory.IMAGE,
          operation: "processListingImages",
          urlPreview: url.substring(0, 100),
        });
        return false;
      }
      return true;
    });

    // P4a: When the tool call already carries a gallery (args.imageUrls — the
    // bank/portal scrape flow extracts photos directly), USE those and do NOT
    // let stale pending_images (left over from a PREVIOUS property) override
    // them. Only fall back to pending_images when no direct URLs were provided
    // (the normal WhatsApp flow where photos arrive as separate messages).
    if (directUrls.length > 0) {
      logger.info(
        "Using direct imageUrls from tool args (ignoring pending_images to avoid stale photos)",
        {
          category: LogCategory.IMAGE,
          operation: "processListingImages",
          directCount: directUrls.length,
          pendingCount: pendingImages.length,
          source: "args.imageUrls",
        }
      );
      imageUrls = directUrls.filter((url) => {
        const isFake =
          url.includes("images.zyprus.com") ||
          (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
          url.includes("placeholder") ||
          url.includes("example.com");
        if (isFake) {
          logger.warn("Filtered out fake/hallucinated URL", {
            category: LogCategory.IMAGE,
            operation: "processListingImages",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
    } else if (pendingImages.length > 0) {
      logger.info("Using images from pending_images table", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        imageCount: pendingImages.length,
        source: "pending_images",
      });
      imageUrls = pendingImages;
    } else {
      // Fallback to AI-provided URLs only if no pending images found
      // Filter out obviously fake URLs (hallucinated by AI)
      imageUrls = directUrls.filter((url) => {
        const isFake =
          url.includes("images.zyprus.com") ||
          (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
          url.includes("placeholder") ||
          url.includes("example.com");
        if (isFake) {
          logger.warn("Filtered out fake/hallucinated URL", {
            category: LogCategory.IMAGE,
            operation: "processListingImages",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
      logger.info("No pending images - using AI-provided URLs", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        imageCount: imageUrls.length,
        source: "ai",
      });
    }

    // Log total image count for debugging
    logger.info("Total images for upload", {
      category: LogCategory.IMAGE,
      pending: pendingImages.length,
      direct: directUrls.length,
      total: imageUrls.length,
    });
  } else {
    // Filter out document URLs using shared helper
    const rawUrls = (args.imageUrls as string[]) || [];
    imageUrls = rawUrls.filter((url) => !isDocumentUrl(url));
    logger.info("No agent phone - using AI-provided URLs", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      imageCount: imageUrls.length,
      source: "ai",
    });
  }

  // 7a.0 AI Vision classification — detect title deeds, floor plans, AND room types
  // ALWAYS runs to enable mandatory photo ordering by room type
  let titleDeedImageIndices = (args.titleDeedImageIndices as number[]) || [];
  let floorPlanImageIndicesFromArgs =
    (args.floorPlanImageIndices as number[]) || [];
  let visionRoomTypes: (RoomType | "title_deed" | "floor_plan")[] = [];

  if (imageUrls.length >= 2) {
    const visionResult = await classifyImagesWithVision(imageUrls);
    visionRoomTypes = visionResult.roomTypes;

    // Use vision-detected title deeds if agent didn't specify
    if (
      titleDeedImageIndices.length === 0 &&
      visionResult.titleDeedIndices.length > 0
    ) {
      titleDeedImageIndices = visionResult.titleDeedIndices.map((i) => i + 1);
      logger.info("Vision auto-detected title deed images", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        indices: titleDeedImageIndices,
      });
    }
    // Use vision-detected floor plans if agent didn't specify
    if (
      floorPlanImageIndicesFromArgs.length === 0 &&
      visionResult.floorPlanIndices.length > 0
    ) {
      floorPlanImageIndicesFromArgs = visionResult.floorPlanIndices.map(
        (i) => i + 1
      );
      logger.info("Vision auto-detected floor plan images", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        indices: floorPlanImageIndicesFromArgs,
      });
    }
  }

  // 7a. Split title deed images from gallery based on agent-identified or vision-detected indices
  let titleDeedImageUrls: string[] = [];
  if (titleDeedImageIndices.length > 0 && imageUrls.length > 0) {
    const validIndices = new Set(
      titleDeedImageIndices
        .map((i) => i - 1)
        .filter((i) => i >= 0 && i < imageUrls.length)
    );
    titleDeedImageUrls = imageUrls.filter((_, idx) => validIndices.has(idx));
    // Remove title deeds from imageUrls AND from visionRoomTypes (keep indices aligned)
    const keepMask = imageUrls.map((_, idx) => !validIndices.has(idx));
    imageUrls = imageUrls.filter((_, idx) => keepMask[idx]);
    visionRoomTypes = visionRoomTypes.filter((_, idx) => keepMask[idx]);
    logger.info("Split title deed images from gallery", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      titleDeedCount: titleDeedImageUrls.length,
      remainingGallery: imageUrls.length,
      indices: titleDeedImageIndices,
    });
  }

  // 7a.2 Floor plan images: move to END of gallery AND add to floorPlanUrls
  const floorPlanImageIndices = floorPlanImageIndicesFromArgs;
  let floorPlanImageUrls: string[] = [];
  if (floorPlanImageIndices.length > 0 && imageUrls.length > 0) {
    const validFloorPlanIndices = new Set(
      floorPlanImageIndices
        .map((i) => i - 1)
        .filter((i) => i >= 0 && i < imageUrls.length)
    );
    floorPlanImageUrls = imageUrls.filter((_, idx) =>
      validFloorPlanIndices.has(idx)
    );
    const nonFloorPlan = imageUrls.filter(
      (_, idx) => !validFloorPlanIndices.has(idx)
    );
    const nonFloorPlanRoomTypes = visionRoomTypes.filter(
      (_, idx) => !validFloorPlanIndices.has(idx)
    );
    // Floor plans go to end of gallery
    imageUrls = [...nonFloorPlan, ...floorPlanImageUrls];
    visionRoomTypes = [
      ...nonFloorPlanRoomTypes,
      ...floorPlanImageUrls.map(() => "floor_plan" as const),
    ];
    logger.info(
      "Floor plans moved to end of gallery and added to floor plan section",
      {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        floorPlanCount: floorPlanImageUrls.length,
        totalGallery: imageUrls.length,
        indices: floorPlanImageIndices,
      }
    );
  }

  // 7a.3 MANDATORY auto-sort by room type (vision classification)
  // This ensures the correct order on ALL uploads: exterior → pool → garden → living → kitchen → bedrooms → bathrooms → floor plans
  const imageOrder = (args.imageOrder as number[]) || [];
  const hasAgentOrdering = imageOrder.length > 0 || !!args.mainPhotoIndex;

  if (
    visionRoomTypes.length === imageUrls.length &&
    visionRoomTypes.length > 0 &&
    !hasAgentOrdering
  ) {
    // Build paired array of [url, roomType] for sorting
    const paired = imageUrls.map((url, i) => ({
      url,
      roomType: visionRoomTypes[i],
      originalIndex: i,
    }));

    // Separate floor plans (keep at end) from sortable photos
    const floorPlanPairs = paired.filter((p) => p.roomType === "floor_plan");
    const sortablePairs = paired.filter((p) => p.roomType !== "floor_plan");

    // Sort by room type priority
    sortablePairs.sort((a, b) => {
      const orderA = ROOM_TYPE_ORDER[a.roomType as RoomType] ?? 10;
      const orderB = ROOM_TYPE_ORDER[b.roomType as RoomType] ?? 10;
      if (orderA !== orderB) return orderA - orderB;
      // Stable sort: preserve original order within same category
      return a.originalIndex - b.originalIndex;
    });

    const sorted = [...sortablePairs, ...floorPlanPairs];
    imageUrls = sorted.map((p) => p.url);
    visionRoomTypes = sorted.map((p) => p.roomType);

    logger.info("Photos auto-sorted by AI vision room classification", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      order: sorted.map((p) => p.roomType),
      totalImages: imageUrls.length,
    });
  } else if (imageOrder.length > 0 && imageUrls.length > 0) {
    // Agent-specified full ordering overrides auto-sort
    const reordered: string[] = [];
    const usedIndices = new Set<number>();
    for (const idx of imageOrder) {
      const zeroIdx = idx - 1;
      if (
        zeroIdx >= 0 &&
        zeroIdx < imageUrls.length &&
        !usedIndices.has(zeroIdx)
      ) {
        reordered.push(imageUrls[zeroIdx]);
        usedIndices.add(zeroIdx);
      }
    }
    for (let i = 0; i < imageUrls.length; i++) {
      if (!usedIndices.has(i)) {
        reordered.push(imageUrls[i]);
      }
    }
    imageUrls = reordered;
    logger.info(
      "Photos reordered per agent-specified imageOrder (overrides auto-sort)",
      {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        orderProvided: imageOrder.length,
        totalImages: imageUrls.length,
      }
    );
  } else if (args.mainPhotoIndex && imageUrls.length > 0) {
    // mainPhotoIndex: move one photo to front, then auto-sort the rest
    const mainIdx = (args.mainPhotoIndex as number) - 1;
    if (mainIdx >= 0 && mainIdx < imageUrls.length) {
      const mainPhoto = imageUrls[mainIdx];
      const rest = imageUrls.filter((_, i) => i !== mainIdx);
      const restRoomTypes = visionRoomTypes.filter((_, i) => i !== mainIdx);

      // Auto-sort the remaining photos by room type if we have classifications
      if (restRoomTypes.length === rest.length && restRoomTypes.length > 0) {
        const paired = rest.map((url, i) => ({
          url,
          roomType: restRoomTypes[i],
          originalIndex: i,
        }));
        const floorPlanPairs = paired.filter(
          (p) => p.roomType === "floor_plan"
        );
        const sortablePairs = paired.filter((p) => p.roomType !== "floor_plan");
        sortablePairs.sort((a, b) => {
          const orderA = ROOM_TYPE_ORDER[a.roomType as RoomType] ?? 10;
          const orderB = ROOM_TYPE_ORDER[b.roomType as RoomType] ?? 10;
          if (orderA !== orderB) return orderA - orderB;
          return a.originalIndex - b.originalIndex;
        });
        const sorted = [...sortablePairs, ...floorPlanPairs];
        imageUrls = [mainPhoto, ...sorted.map((p) => p.url)];
      } else {
        imageUrls = [mainPhoto, ...rest];
      }

      logger.info(
        "Main photo moved to first + remaining auto-sorted by room type",
        {
          category: LogCategory.IMAGE,
          operation: "processListingImages",
          mainPhotoIndex: args.mainPhotoIndex,
          totalImages: imageUrls.length,
        }
      );
    }
  }

  // 7b. Retrieve pending documents (title deeds, PDFs sent via WhatsApp)
  let allDocumentUrls: string[] = [];
  if (agentPhone) {
    const pendingDocs = await getPendingDocuments(agentPhone);
    if (pendingDocs.length > 0) {
      // Deduplicate documents by normalized filename
      // WhatsApp sends docs with different timestamps: wa_doc_1774948888426_file.pdf vs wa_doc_1774948888383_file.pdf
      // Strip the wa_doc_{timestamp}_ prefix to compare base filenames
      const seen = new Map<string, string>(); // normalized filename → first URL
      for (const doc of pendingDocs) {
        const normalizedName = normalizeDocFilename(
          doc.filename || doc.document_url
        );
        if (seen.has(normalizedName)) {
          logger.info("Deduplicated document by filename", {
            category: LogCategory.GENERAL,
            operation: "processListingImages",
            duplicate: doc.filename,
            normalizedName,
          });
        } else {
          seen.set(normalizedName, doc.document_url);
        }
      }
      allDocumentUrls = [...seen.values()];
      logger.info("Retrieved pending documents for upload", {
        category: LogCategory.GENERAL,
        operation: "processListingImages",
        rawCount: pendingDocs.length,
        dedupedCount: allDocumentUrls.length,
        filenames: pendingDocs.map((d) => d.filename).filter(Boolean),
      });
    }
  }
  // Also include any document URLs the AI explicitly passed
  const aiTitleDeedUrls = (args.titleDeedFileUrls as string[]) || [];
  if (aiTitleDeedUrls.length > 0) {
    allDocumentUrls = [...allDocumentUrls, ...aiTitleDeedUrls];
  }

  // Classify documents: title deeds go to field_title_deed_file, others to field_other_document
  const titleDeedDocUrls: string[] = [...titleDeedImageUrls]; // vision-classified title deed images
  const otherDocUrls: string[] = [];
  for (const url of allDocumentUrls) {
    if (isTitleDeedDocument(url)) {
      titleDeedDocUrls.push(url);
    } else {
      otherDocUrls.push(url);
    }
  }
  if (titleDeedDocUrls.length > 0 || otherDocUrls.length > 0) {
    logger.info("Classified documents by type", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      titleDeedCount: titleDeedDocUrls.length,
      otherDocCount: otherDocUrls.length,
    });
  }

  logger.info("Image processing completed", {
    category: LogCategory.IMAGE,
    operation: "processListingImages",
    imageCount: imageUrls.length,
    titleDeedCount: titleDeedImageUrls.length,
    floorPlanCount: floorPlanImageUrls.length,
    titleDeedDocCount: titleDeedDocUrls.length,
    otherDocCount: otherDocUrls.length,
  });

  return {
    imageUrls,
    titleDeedImageUrls,
    floorPlanUrls: floorPlanImageUrls,
    documentUrls: titleDeedDocUrls,
    otherDocumentUrls: otherDocUrls,
  };
}

/**
 * Normalize a WhatsApp document filename for deduplication.
 * Strips the wa_doc_{timestamp}_ prefix so the same file sent twice is detected.
 * Example: "wa_doc_1774948888426_Pafos501_AX2081_23_Model.pdf" → "pafos501_ax2081_23_model.pdf"
 */
function normalizeDocFilename(filenameOrUrl: string): string {
  // Extract filename from URL if needed
  let name = filenameOrUrl.includes("/")
    ? filenameOrUrl.split("/").pop()?.split("?")[0] || filenameOrUrl
    : filenameOrUrl;

  // Strip wa_doc_{timestamp}_ prefix (13-digit WhatsApp message timestamp)
  name = name.replace(/^wa_doc_\d+_/, "");

  return name.toLowerCase().trim();
}

/**
 * Check if a document is likely a title deed based on filename patterns.
 * Title deeds → field_title_deed_file, everything else → field_other_document.
 */
function isTitleDeedDocument(url: string): boolean {
  const filename = (url.split("/").pop()?.split("?")[0] || "").toLowerCase();
  const titleDeedPatterns = [
    "title_deed",
    "title deed",
    "titledeed",
    "td_",
    "_td.",
    "_td_",
    "deed_",
    "_deed.",
  ];
  return titleDeedPatterns.some((p) => filename.includes(p));
}
