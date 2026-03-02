/**
 * Image Processor Module
 * Handles steps 7-7b: pending images retrieval, AI Vision classification,
 * title deed image splitting, floor plan processing, photo reordering, pending documents retrieval
 */

import { classifyImagesWithVision } from "../../services/image-classifier.ts";
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
  documentUrls: string[];
}

export async function processListingImages(
  args: Record<string, unknown>,
  agentPhone: string,
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

    if (pendingImages.length > 0) {
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

  // 7a.0 AI Vision classification — auto-detect title deeds and floor plans
  // Only runs if agent didn't already identify them explicitly
  let titleDeedImageIndices = (args.titleDeedImageIndices as number[]) || [];
  let floorPlanImageIndicesFromArgs =
    (args.floorPlanImageIndices as number[]) || [];
  if (
    titleDeedImageIndices.length === 0 &&
    floorPlanImageIndicesFromArgs.length === 0 &&
    imageUrls.length >= 2
  ) {
    const visionResult = await classifyImagesWithVision(imageUrls);
    if (visionResult.titleDeedIndices.length > 0) {
      // Convert 0-based to 1-based for existing split logic
      titleDeedImageIndices = visionResult.titleDeedIndices.map((i) => i + 1);
      logger.info("Vision auto-detected title deed images", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        indices: titleDeedImageIndices,
      });
    }
    if (visionResult.floorPlanIndices.length > 0) {
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
    imageUrls = imageUrls.filter((_, idx) => !validIndices.has(idx));
    logger.info("Split title deed images from gallery", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      titleDeedCount: titleDeedImageUrls.length,
      remainingGallery: imageUrls.length,
      indices: titleDeedImageIndices,
    });
  }

  // 7a.2 Floor plan images: move to END of gallery AND add to floorPlanUrls
  // Floor plans appear as last photos in the gallery AND in the dedicated floor plans section
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
    // Move floor plans to end of gallery (not removed - they stay in gallery as last photos)
    const nonFloorPlan = imageUrls.filter(
      (_, idx) => !validFloorPlanIndices.has(idx)
    );
    imageUrls = [...nonFloorPlan, ...floorPlanImageUrls];
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

  // 7a.3 Apply agent-specified photo ordering (if provided)
  const imageOrder = (args.imageOrder as number[]) || [];
  if (imageOrder.length > 0 && imageUrls.length > 0) {
    const reordered: string[] = [];
    const usedIndices = new Set<number>();
    for (const idx of imageOrder) {
      const zeroIdx = idx - 1; // Convert 1-based to 0-based
      if (
        zeroIdx >= 0 &&
        zeroIdx < imageUrls.length &&
        !usedIndices.has(zeroIdx)
      ) {
        reordered.push(imageUrls[zeroIdx]);
        usedIndices.add(zeroIdx);
      }
    }
    // Append any images not included in the ordering (don't lose photos)
    for (let i = 0; i < imageUrls.length; i++) {
      if (!usedIndices.has(i)) {
        reordered.push(imageUrls[i]);
      }
    }
    imageUrls = reordered;
    logger.info("Photos reordered per agent classification", {
      category: LogCategory.IMAGE,
      operation: "processListingImages",
      orderProvided: imageOrder.length,
      totalImages: imageUrls.length,
    });
  } else if (args.mainPhotoIndex && imageUrls.length > 0) {
    // Simpler alternative: just move one photo to the front
    const mainIdx = (args.mainPhotoIndex as number) - 1; // Convert 1-based to 0-based
    if (mainIdx >= 0 && mainIdx < imageUrls.length) {
      const mainPhoto = imageUrls[mainIdx];
      imageUrls = [mainPhoto, ...imageUrls.filter((_, i) => i !== mainIdx)];
      logger.info("Main photo moved to first position", {
        category: LogCategory.IMAGE,
        operation: "processListingImages",
        mainPhotoIndex: args.mainPhotoIndex,
        totalImages: imageUrls.length,
      });
    }
  }

  // 7b. Retrieve pending documents (title deeds, PDFs sent via WhatsApp)
  let titleDeedFileUrls: string[] = [...titleDeedImageUrls];
  if (agentPhone) {
    const pendingDocs = await getPendingDocuments(agentPhone);
    if (pendingDocs.length > 0) {
      titleDeedFileUrls = [
        ...titleDeedFileUrls,
        ...pendingDocs.map((d) => d.document_url),
      ];
      logger.info("Retrieved pending documents for upload", {
        category: LogCategory.GENERAL,
        operation: "processListingImages",
        documentCount: pendingDocs.length,
        filenames: pendingDocs.map((d) => d.filename).filter(Boolean),
      });
    }
  }
  // Also include any document URLs the AI explicitly passed
  const aiTitleDeedUrls = (args.titleDeedFileUrls as string[]) || [];
  if (aiTitleDeedUrls.length > 0) {
    titleDeedFileUrls = [...titleDeedFileUrls, ...aiTitleDeedUrls];
  }

  logger.info("Image processing completed", {
    category: LogCategory.IMAGE,
    operation: "processListingImages",
    imageCount: imageUrls.length,
    titleDeedCount: titleDeedImageUrls.length,
    floorPlanCount: floorPlanImageUrls.length,
    documentCount: titleDeedFileUrls.length,
  });

  return {
    imageUrls,
    titleDeedImageUrls,
    floorPlanUrls: floorPlanImageUrls,
    documentUrls: titleDeedFileUrls,
  };
}
