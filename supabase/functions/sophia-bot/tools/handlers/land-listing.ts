/**
 * Land Listing Handler
 * Handles the createLandListing tool
 */

import { getSupabaseAdmin, trackListingUpload } from "../../../_shared/db.ts";
import {
  type Agent,
  getAgentByEmail,
  getOfficeManagers,
} from "../../agents/identifier.ts";
import {
  DEFAULT_COORDINATES,
  REGIONAL_EMAILS,
} from "../../config/business-rules.ts";
// Use portal-scraper detection (recognises all real bank-portal domains incl.
// Altia/Altamira) instead of the narrower rules/bank-detection.ts list.
import { isBankPortalUrl } from "../../services/portal-scraper.ts";
import {
  determineRegion,
  validateRegionalAccess,
} from "../../rules/region-validator.ts";
import {
  assignReviewers,
  needsAssignmentInput,
} from "../../rules/reviewer-assignment.ts";
import {
  getMissingFieldsMessage,
  handleSpecialCases,
  handleUnknownSender,
  validateRequiredFields,
} from "../../rules/special-cases.ts";
import { generateLandDescription } from "../../services/description-generator.ts";
import {
  checkForDuplicates,
  generateDuplicateWarning,
} from "../../services/duplicate-checker.ts";
import { classifyImagesWithVision } from "../../services/image-classifier.ts";
import {
  hasEnoughImages,
  processImages,
  validateImages,
} from "../../services/image-handler.ts";
import { generateMyNotes } from "../../services/my-notes-generator.ts";
import {
  clearPendingDocuments,
  getPendingDocuments,
} from "../../services/pending-documents.ts";
import {
  clearPendingImages,
  getPendingImages,
} from "../../services/pending-images.ts";
import { classifyError, ErrorType } from "../../utils/error-mapper.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import {
  createDraftLandListing,
  getAccessToken,
  getZyprusConfig,
} from "../../zyprus/client.ts";
import { findLocationUuid } from "../../zyprus/taxonomy-cache.ts";
import {
  extractAreaFromGoogleMapsUrl,
  isCityOnlyLocation,
  isDocumentUrl,
  isLocationAStreetInUrl,
  isStreetAddress,
  isValidCyprusCoord,
  DISTRICT_CENTROID_KEYS,
} from "../validators/location.ts";
import {
  acquireUploadLock,
  releaseUploadLock,
} from "../validators/upload-lock.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
  retryable?: boolean;
}

/**
 * Handle land listing creation
 */
export async function handleCreateLandListing(
  args: Record<string, unknown>,
  agent: Agent | null
): Promise<ToolResult> {
  logger.info("Create land listing started", {
    category: LogCategory.TOOL,
    operation: "createLandListing",
    argsPreview: JSON.stringify(args).substring(0, 500),
  });

  // 1. Check if agent is identified
  if (!agent) {
    logger.warn("Land listing creation blocked - no agent identified", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
    });
    return handleUnknownSender();
  }

  logger.info("Agent identified for land listing creation", {
    category: LogCategory.TOOL,
    operation: "createLandListing",
    agentName: agent.fullName,
    agentRegion: agent.region,
  });

  // 1.5 CRITICAL: Acquire DB-based upload lock to prevent duplicate uploads
  // C5 FIX: Use per-property fingerprint (not per-agent) so different plots can upload in parallel
  const agentPhone = agent.mobile?.replace(/\D/g, "") || "";
  const locationStr = ((args.location as string) || "").toLowerCase().trim();
  const priceStr = String(args.price || "");
  const ownerPhoneStr = ((args.ownerPhone as string) || "").replace(/\D/g, "");
  const propertyLockKey = `upload:${agentPhone}:${locationStr}:${priceStr}:${ownerPhoneStr}`;
  const lockResult = await acquireUploadLock(propertyLockKey, agentPhone);
  if (!lockResult.acquired) {
    logger.warn("Upload blocked by DB lock - duplicate upload in progress", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      agentName: agent.fullName,
      remainingSeconds: lockResult.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this land. Please wait ${lockResult.remainingSeconds} seconds before trying again.`,
    };
  }

  // 1.6 Check listing_uploads for recent duplicates (informational only - never blocks)
  let potentialDuplicateNote = "";

  const sb = getSupabaseAdmin();

  {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentUploads } = await sb
      .from("listing_uploads")
      .select("id, property_title, created_at, zyprus_listing_id")
      .eq("agent_phone", agentPhone)
      .gte("created_at", twoHoursAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentUploads && recentUploads.length > 0) {
      const locationLower = ((args.location as string) || "").toLowerCase();
      const match = recentUploads.find(
        (p: Record<string, unknown>) =>
          locationLower &&
          ((p.property_title as string) || "")
            .toLowerCase()
            .includes(locationLower)
      );
      if (match) {
        potentialDuplicateNote = `POTENTIAL DUPLICATE - similar listing exists: ${match.property_title} (${match.zyprus_listing_id})`;
        logger.warn(
          "Potential duplicate detected - proceeding with upload anyway",
          {
            category: LogCategory.TOOL,
            operation: "createLandListing",
            existingId: match.zyprus_listing_id,
            existingTitle: match.property_title,
            agentPhone,
          }
        );
      }
    }
  }

  // 2. Validate required fields (land-specific)
  // NOTE: imageUrls excluded from required check — email uploads store images in pending_images,
  // so imageUrls may be empty at this point. The image-processor fetches from pending_images later.
  const requiredLandFields = [
    "listingType",
    "landType",
    "price",
    "location",
    "landSize",
    "ownerName",
    "ownerPhone",
  ];
  const missing: string[] = [];
  for (const field of requiredLandFields) {
    if (
      !args[field] ||
      (Array.isArray(args[field]) && (args[field] as unknown[]).length === 0)
    ) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    logger.warn("Validation failed — missing fields in tool call args", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      missingFields: missing,
      providedFields: Object.keys(args).filter(
        (k) => args[k] !== undefined && args[k] !== null
      ),
    });
    return {
      needsInput: true,
      retryable: true,
      question: getMissingFieldsMessage(missing),
    };
  }

  let location = args.location as string;
  const listingType = args.listingType as "sale" | "rent";
  const locationUrl = args.locationUrl as string | undefined;

  // 2.5 CRITICAL: Correct street addresses to area names
  const streetDetected =
    isStreetAddress(location) ||
    (locationUrl ? isLocationAStreetInUrl(location, locationUrl) : false);

  if (streetDetected && locationUrl) {
    const areaFromUrl = extractAreaFromGoogleMapsUrl(locationUrl);
    if (areaFromUrl) {
      logger.warn(
        "Location corrected: AI passed street address, extracted area from Google Maps URL",
        {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          originalLocation: location,
          correctedLocation: areaFromUrl,
          googleMapsUrl: locationUrl.substring(0, 100),
        }
      );
      location = areaFromUrl;
    } else {
      logger.warn(
        "Location appears to be a street address, asking agent for area name",
        {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          location,
          googleMapsUrl: locationUrl.substring(0, 100),
        }
      );
      return {
        needsInput: true,
        question: `I've captured the pin location from the Google Maps link, but "${location}" appears to be a street name. What is the area/neighborhood? (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia)`,
      };
    }
  } else if (streetDetected && !locationUrl) {
    logger.warn(
      "Location appears to be a street address with no Google Maps URL to extract area from",
      {
        category: LogCategory.TOOL,
        operation: "createLandListing",
        location,
      }
    );
    return {
      needsInput: true,
      question: `"${location}" appears to be a street address. I need the area/neighborhood name for the listing (e.g., Agios Athanasios, Kato Paphos, Germasogeia). What area is this land in?`,
    };
  }

  // 2.6 CRITICAL: Block city-only locations
  if (isCityOnlyLocation(location)) {
    logger.warn("Location rejected: city-only location without specific area", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      location,
    });
    return {
      needsInput: true,
      question: `"${location}" is too general — I need the specific area or neighborhood name (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia). What is the exact area/neighborhood for this land?`,
    };
  }

  // 3. Validate regional access
  const regionResult = validateRegionalAccess(agent, location);
  if (!regionResult.allowed) {
    return { error: regionResult.message };
  }

  const propertyRegion =
    regionResult.propertyRegion || determineRegion(location) || agent.region;

  // 4. Handle special cases
  const specialCase = await handleSpecialCases(
    agent,
    {
      listingType,
      location,
      assignTo: args.assignTo as string | undefined,
    },
    propertyRegion
  );

  if (specialCase.rejected) {
    return { error: specialCase.message };
  }

  if (specialCase.needsInput) {
    return { needsInput: true, question: specialCase.question };
  }

  // 5. Check if management needs to specify assignment
  if (needsAssignmentInput(agent, listingType) && !args.assignTo) {
    return {
      needsInput: true,
      question:
        "To whom would you like me to assign this land listing as the listing owner?",
    };
  }

  // 5.1 SECURITY: Only management agents can use assignTo
  if (args.assignTo && agent.role !== "management") {
    logger.warn(
      "Stripped assignTo from non-management agent — only management can assign",
      {
        category: LogCategory.TOOL,
        operation: "createLandListing",
        agentRole: agent.role,
        agentEmail: agent.communicationEmail,
        attemptedAssignTo: args.assignTo,
      }
    );
    args.assignTo = undefined;
  }

  // 5.2 SECURITY: Validate assignTo is a @zyprus.com email
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    const emailParts = assignToEmail.split("@");
    if (emailParts.length !== 2 || emailParts[1] !== "zyprus.com") {
      return {
        error: "Assignments must be to a @zyprus.com email address.",
      };
    }
    const isRegionalOffice =
      Object.values(REGIONAL_EMAILS).includes(assignToEmail);
    if (isRegionalOffice) {
      logger.info(
        "assignTo is a regional office email — skipping agent DB check",
        {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          assignToEmail,
        }
      );
    } else {
      const assigneeAgent = await getAgentByEmail(assignToEmail);
      if (!assigneeAgent) {
        logger.warn("assignTo email not found in agents database — stripping", {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          assignToEmail,
        });
        args.assignTo = undefined;
      }
    }
  }

  // 6. Get reviewer assignments
  // Bank-owned listings (scraped from a bank portal) route ownership to the
  // regional office. bankUrl is the signal; validated by detectBankFromUrl.
  const bankUrl = args.bankUrl as string | undefined;
  const isBankListing = !!bankUrl && isBankPortalUrl(bankUrl);
  const reviewers = assignReviewers(
    agent,
    listingType,
    propertyRegion,
    args.assignTo as string | undefined,
    isBankListing
  );

  // 6b. Resolve listing owner name for Reference ID
  let listingOwnerName = agent.fullName;
  if (args.assignTo && reviewers.listingOwner !== agent.communicationEmail) {
    try {
      const assignedAgent = await getAgentByEmail(reviewers.listingOwner);
      if (assignedAgent) {
        listingOwnerName = assignedAgent.fullName;
        logger.info("Resolved listing owner name from assignTo", {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          listingOwnerName,
          listingOwnerEmail: reviewers.listingOwner,
        });
      }
    } catch {
      // Non-critical — fall back to requesting agent name
    }
  }

  // 7. Process images
  let imageUrls: string[] = [];

  if (agentPhone) {
    const pendingImages = await getPendingImages(agentPhone);
    logger.info("Retrieved pending images", {
      category: LogCategory.IMAGE,
      count: pendingImages.length,
    });

    const rawDirectUrls = (args.imageUrls as string[]) || [];
    const directUrls = rawDirectUrls.filter((url) => {
      if (isDocumentUrl(url)) {
        logger.warn("Filtered out document URL from imageUrls", {
          category: LogCategory.IMAGE,
          operation: "createLandListing",
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
      imageUrls = directUrls.filter((url) => {
        const isFake =
          url.includes("images.zyprus.com") ||
          (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
          url.includes("placeholder") ||
          url.includes("example.com");
        if (isFake) {
          logger.warn("Filtered out fake/hallucinated URL", {
            category: LogCategory.IMAGE,
            operation: "createLandListing",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
      logger.info(
        "Using direct imageUrls from tool args (ignoring pending_images to avoid stale photos)",
        {
          category: LogCategory.IMAGE,
          operation: "createLandListing",
          directCount: directUrls.length,
          pendingCount: pendingImages.length,
          imageCount: imageUrls.length,
          source: "args.imageUrls",
        }
      );
    } else if (pendingImages.length > 0) {
      logger.info("Using images from pending_images table", {
        category: LogCategory.IMAGE,
        operation: "createLandListing",
        imageCount: pendingImages.length,
        source: "pending_images",
      });
      imageUrls = pendingImages;
    } else {
      imageUrls = directUrls.filter((url) => {
        const isFake =
          url.includes("images.zyprus.com") ||
          (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
          url.includes("placeholder") ||
          url.includes("example.com");
        if (isFake) {
          logger.warn("Filtered out fake/hallucinated URL", {
            category: LogCategory.IMAGE,
            operation: "createLandListing",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
      logger.info("No pending images - using AI-provided URLs", {
        category: LogCategory.IMAGE,
        operation: "createLandListing",
        imageCount: imageUrls.length,
        source: "ai",
      });
    }

    logger.info("Total images for upload", {
      category: LogCategory.IMAGE,
      pending: pendingImages.length,
      direct: directUrls.length,
      total: imageUrls.length,
    });
  } else {
    const rawUrls = (args.imageUrls as string[]) || [];
    imageUrls = rawUrls.filter((url) => !isDocumentUrl(url));
    logger.info("No agent phone - using AI-provided URLs", {
      category: LogCategory.IMAGE,
      operation: "createLandListing",
      imageCount: imageUrls.length,
      source: "ai",
    });
  }

  // 7a. AI Vision classification — auto-detect title deeds
  let titleDeedImageIndices = (args.titleDeedImageIndices as number[]) || [];
  if (titleDeedImageIndices.length === 0 && imageUrls.length >= 2) {
    const visionResult = await classifyImagesWithVision(imageUrls);
    if (visionResult.titleDeedIndices.length > 0) {
      titleDeedImageIndices = visionResult.titleDeedIndices.map((i) => i + 1);
      logger.info("Vision auto-detected title deed images", {
        category: LogCategory.IMAGE,
        operation: "createLandListing",
        indices: titleDeedImageIndices,
      });
    }
  }

  // 7a.2 Split title deed images from gallery
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
      operation: "createLandListing",
      titleDeedCount: titleDeedImageUrls.length,
      remainingGallery: imageUrls.length,
      indices: titleDeedImageIndices,
    });
  }

  // 7b. Retrieve pending documents (with filename-based dedup + classification)
  let titleDeedFileUrls: string[] = [...titleDeedImageUrls];
  const otherDocumentUrls: string[] = [];
  if (agentPhone) {
    const pendingDocs = await getPendingDocuments(agentPhone);
    if (pendingDocs.length > 0) {
      // Deduplicate by normalized filename (strip wa_doc_{timestamp}_ prefix)
      const seen = new Map<string, { url: string; filename: string }>();
      for (const doc of pendingDocs) {
        const name =
          (doc.filename || doc.document_url).split("/").pop()?.split("?")[0] ||
          doc.document_url;
        const normalized = name
          .replace(/^wa_doc_\d+_/, "")
          .toLowerCase()
          .trim();
        if (seen.has(normalized)) {
          logger.info("Deduplicated document by filename", {
            category: LogCategory.GENERAL,
            operation: "createLandListing",
            duplicate: doc.filename,
          });
        } else {
          seen.set(normalized, { url: doc.document_url, filename: normalized });
        }
      }

      // Classify: title deeds vs other documents (KMZ, general PDFs, etc.)
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
      for (const { url, filename } of seen.values()) {
        const isTitleDeed = titleDeedPatterns.some((p) => filename.includes(p));
        if (isTitleDeed) {
          titleDeedFileUrls.push(url);
        } else {
          otherDocumentUrls.push(url);
        }
      }

      logger.info(
        "Retrieved and classified pending documents for land upload",
        {
          category: LogCategory.GENERAL,
          operation: "createLandListing",
          rawCount: pendingDocs.length,
          dedupedCount: seen.size,
          titleDeedCount: titleDeedFileUrls.length,
          otherDocCount: otherDocumentUrls.length,
          filenames: pendingDocs.map((d) => d.filename).filter(Boolean),
        }
      );
    }
  }
  const aiTitleDeedUrls = (args.titleDeedFileUrls as string[]) || [];
  if (aiTitleDeedUrls.length > 0) {
    titleDeedFileUrls = [...titleDeedFileUrls, ...aiTitleDeedUrls];
  }

  const processedImages = await processImages(imageUrls);

  // Check minimum images
  const imageCheck = hasEnoughImages(processedImages, "land");
  if (!imageCheck.enough) {
    // C6 FIX: Release upload lock before returning — otherwise agent is locked out for 30s
    await releaseUploadLock(propertyLockKey);
    return {
      needsInput: true,
      question: `I need at least ${imageCheck.required} ${imageCheck.required === 1 ? "image" : "images"} for land. You've provided ${imageCheck.provided}. Please send more photos.`,
    };
  }

  // 8. Get token and run operations in parallel
  logger.info("Getting Zyprus config and token", {
    category: LogCategory.ZYPRUS,
    operation: "createLandListing",
  });
  let config;
  let token;
  try {
    config = getZyprusConfig();
    token = await getAccessToken(config);
    logger.info("Got Zyprus access token successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createLandListing",
    });
  } catch (tokenError) {
    const err =
      tokenError instanceof Error ? tokenError : new Error(String(tokenError));
    logger.error("Failed to get Zyprus token", err, {
      category: LogCategory.ZYPRUS,
      operation: "createLandListing",
    });
    return { error: `Failed to authenticate with Zyprus API: ${err.message}` };
  }

  const [imageValidation, duplicates, locationResult] = await Promise.all([
    validateImages(processedImages),
    checkForDuplicates(
      args.ownerPhone as string,
      args.ownerName as string,
      location,
      config.apiUrl,
      token
    ),
    findLocationUuid(location),
  ]);

  const locationUuid = locationResult.uuid;
  const descriptionLocation = location;

  if (
    locationResult.matchedName &&
    locationResult.matchedName.toLowerCase() !== location.toLowerCase()
  ) {
    logger.info(
      "Taxonomy resolved to different name (UUID only, location text unchanged)",
      {
        category: LogCategory.TOOL,
        operation: "createLandListing",
        agentLocation: location,
        taxonomyMatch: locationResult.matchedName,
      }
    );
  }

  const { valid: validImages, invalid: invalidImages } = imageValidation;
  if (invalidImages.length > 0) {
    logger.warn("Images failed validation", {
      category: LogCategory.IMAGE,
      operation: "createLandListing",
      invalidCount: invalidImages.length,
    });
  }

  // 9a. Build AI message content
  const aiMessageParts: string[] = [];
  if (duplicates.isDuplicate) {
    aiMessageParts.push(generateDuplicateWarning(duplicates.potentialMatches));
  }
  if (args.specialNotes) {
    aiMessageParts.push(`Agent notes: ${args.specialNotes}`);
  }
  if (
    locationResult.matchedName &&
    locationResult.matchedName.toLowerCase() !== location.toLowerCase()
  ) {
    aiMessageParts.push(
      `Zyprus location dropdown: "${locationResult.matchedName}" (closest match for "${location}")`
    );
  }
  const aiMessageContent: string | null =
    aiMessageParts.length > 0 ? aiMessageParts.join("\n") : null;

  // 9b. Resolve coordinates
  const rawResolvedCoordinates =
    (args.coordinates as { lat: number; lon: number } | undefined) ||
    (() => {
      if (locationUrl) {
        const atMatch = locationUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (atMatch) {
          return {
            lat: Number.parseFloat(atMatch[1]),
            lon: Number.parseFloat(atMatch[2]),
          };
        }
        const placeMatch = locationUrl.match(
          /place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/
        );
        if (placeMatch) {
          return {
            lat: Number.parseFloat(placeMatch[1]),
            lon: Number.parseFloat(placeMatch[2]),
          };
        }
      }
      return;
    })() ||
    (() => {
      // P3: never pin a bank listing to the area centroid. If no real
      // coordinates were scraped from the bank page, leave the map unset.
      if (isBankListing) {
        logger.warn(
          "Bank land listing has no scraped coordinates — leaving map PIN unset (no centroid fallback)",
          {
            category: LogCategory.TOOL,
            operation: "createLandListing",
            location,
          }
        );
        return;
      }

      const locationLower = location.toLowerCase();
      let bestMatch: {
        key: string;
        coords: { lat: number; lon: number };
      } | null = null;

      for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
        // Never pin a bare district centroid — a village without a known
        // sub-area would otherwise land on the district town centre.
        if (DISTRICT_CENTROID_KEYS.has(key)) continue;
        if (
          locationLower.includes(key) &&
          (!bestMatch || key.length > bestMatch.key.length)
        ) {
          bestMatch = { key, coords };
        }
      }

      if (bestMatch) {
        logger.info("Using default coordinates for location", {
          category: LogCategory.TOOL,
          operation: "createLandListing",
          locationKey: bestMatch.key,
          lat: bestMatch.coords.lat,
          lon: bestMatch.coords.lon,
        });
        return bestMatch.coords;
      }
      return;
    })();

  // Reject coordinates outside Cyprus (sea pins from LLM-fabricated values or
  // comma-decimal truncation like 34,32). REMU/Altia QA 2026-06-30.
  const resolvedCoordinates =
    rawResolvedCoordinates &&
    isValidCyprusCoord(rawResolvedCoordinates.lat, rawResolvedCoordinates.lon)
      ? rawResolvedCoordinates
      : undefined;
  if (rawResolvedCoordinates && !resolvedCoordinates) {
    logger.warn("Dropped out-of-Cyprus coordinates — leaving map PIN unset", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      lat: rawResolvedCoordinates.lat,
      lon: rawResolvedCoordinates.lon,
    });
  }

  // 9c. Check we have at least 1 valid image
  if (validImages.length === 0) {
    // C6 FIX: Release upload lock on image validation failure
    await releaseUploadLock(propertyLockKey);

    const invalidDetails =
      invalidImages.length > 0
        ? invalidImages
            .slice(0, 3)
            .map((img) => `• ${img.error}`)
            .join("\n")
        : "";

    logger.error("No valid images after validation", undefined, {
      category: LogCategory.IMAGE,
      operation: "createLandListing",
      invalidCount: invalidImages.length,
    });

    return {
      error:
        "None of the images could be uploaded.\n\n" +
        (invalidDetails ? `Issues:\n${invalidDetails}\n\n` : "") +
        "Please send photos directly from your phone gallery, or use direct image URLs.",
    };
  }

  // 9d. Default infrastructure: always include all 4 unless agent says otherwise
  const DEFAULT_INFRASTRUCTURE = [
    "electricity",
    "road_access",
    "telecommunications",
    "water",
  ];
  const agentInfra = (args.infrastructure as string[]) || [];
  const mergedInfrastructure =
    agentInfra.length > 0
      ? [
          ...new Set([
            ...agentInfra.map((i) => i.toLowerCase().trim()),
            ...DEFAULT_INFRASTRUCTURE,
          ]),
        ]
      : DEFAULT_INFRASTRUCTURE;

  // 10. Generate description
  const description = generateLandDescription({
    landType: args.landType as string,
    listingType,
    landSize: args.landSize as number,
    location: descriptionLocation,
    titleDeedStatus: args.titleDeedStatus as string | undefined,
    buildingDensity: args.buildingDensity as number | undefined,
    siteCoverage: args.siteCoverage as number | undefined,
    maxFloors: args.maxFloors as number | undefined,
    maxHeight: args.maxHeight as number | undefined,
    roadFrontage: args.roadFrontage as number | undefined,
    infrastructure: mergedInfrastructure,
    views: args.features as string[] | undefined,
    price: args.price as number,
    areaDescription: args.areaDescription as string | undefined,
    priceModifier: args.priceModifier as string | undefined,
  });

  // 11. Generate My Notes (location URL + reviewer assignments + duplicates)
  const myNotesLines: string[] = [];

  // Google Maps URL — user-provided link, or one built from the resolved
  // coordinates. Bank land listings carry portal coordinates but no user link,
  // so without this fallback the reviewer got no map pin (Lauren, 2026-06-11).
  if (locationUrl) {
    myNotesLines.push(`Google Maps: ${locationUrl}`);
  } else if (resolvedCoordinates) {
    myNotesLines.push(
      `Google Maps: https://www.google.com/maps/place/${resolvedCoordinates.lat},${resolvedCoordinates.lon}`
    );
  }

  // Owner contact info
  myNotesLines.push(`\nOwner: ${args.ownerName}`);
  myNotesLines.push(`Phone: ${args.ownerPhone}`);
  if (args.ownerEmail) {
    myNotesLines.push(`Email: ${args.ownerEmail}`);
  }
  if (args.registrationNumber) {
    myNotesLines.push(`Registration Number: ${args.registrationNumber}`);
  }

  // Reviewer assignments
  myNotesLines.push(`\nReviewer 1: ${reviewers.reviewer1}`);
  if (reviewers.reviewer2) {
    myNotesLines.push(`Reviewer 2: ${reviewers.reviewer2}`);
  }

  // P3: warn the reviewer when a bank listing has no usable coordinates so a
  // human sets the correct PIN rather than trusting a missing/centroid one.
  if (isBankListing && !resolvedCoordinates) {
    myNotesLines.push(
      "\nMAP PIN MISSING — bank listing had no usable coordinates; please set the map location manually from the bank page."
    );
  }

  // Duplicate warnings
  if (potentialDuplicateNote) {
    myNotesLines.push(`\n${potentialDuplicateNote}`);
  }
  if (duplicates.isDuplicate) {
    myNotesLines.push(
      `\nWARNING: ${generateDuplicateWarning(duplicates.potentialMatches)}`
    );
  }

  const myNotes = myNotesLines.join("\n");

  // 12. Create listing
  try {
    const result = await createDraftLandListing({
      listingType,
      landType: args.landType as string,
      price: args.price as number,
      location: descriptionLocation,
      locationUuid,
      landSize: args.landSize as number,
      description,
      myNotes,
      images: validImages.map((img) => img.url),
      reviewer1: reviewers.reviewer1,
      reviewer2: reviewers.reviewer2 || null,
      listingOwner: reviewers.listingOwner,
      listingInstructor: reviewers.listingInstructor,
      titleDeedStatus: args.titleDeedStatus as string | undefined,
      coordinates: resolvedCoordinates,
      priceModifier: args.priceModifier as
        | "no_vat"
        | "plus_vat"
        | "vat_included"
        | undefined,
      titleDeedFileUrls:
        titleDeedFileUrls.length > 0 ? titleDeedFileUrls : undefined,
      otherDocumentUrls:
        otherDocumentUrls.length > 0 ? otherDocumentUrls : undefined,
      buildingDensity: args.buildingDensity as number | undefined,
      siteCoverage: args.siteCoverage as number | undefined,
      maxFloors: args.maxFloors as number | undefined,
      maxHeight: args.maxHeight as number | undefined,
      infrastructure: mergedInfrastructure,
      views: args.features as string[] | undefined,
      agentName: listingOwnerName,
      ownerName: args.ownerName as string,
      ownerPhone: args.ownerPhone as string,
      ownerEmail: args.ownerEmail as string | undefined,
      registrationNumber: args.registrationNumber as string | undefined,
      // Bank portal URL → used as the Own Reference ID (P6) when this is a
      // bank-owned listing. Undefined for normal listings (existing behavior).
      bankUrl: bankUrl,
    });

    // Track listing for publication notification (non-blocking, fire-and-forget)
    // Notify the listing OWNER (assignee), not the uploader, when assignTo is used.
    // Bank listings are owned by the regional office account (placeholder mobile),
    // so route their confirmation to the region's real managers (Lauren, 2026-06-11).
    let notifyPhone = agentPhone;
    let notifyName = agent.fullName;
    if (isBankListing) {
      try {
        const managers = (
          await getOfficeManagers(reviewers.listingOwner)
        ).filter((m) => m.mobile);
        if (managers.length > 0) {
          notifyPhone = managers
            .map((m) => m.mobile.replace(/\D/g, ""))
            .join(",");
          notifyName = managers.map((m) => m.fullName).join(" & ");
        }
      } catch {
        /* fall back to uploader */
      }
    } else if (
      args.assignTo &&
      reviewers.listingOwner !== agent.communicationEmail
    ) {
      try {
        const assignedAgent = await getAgentByEmail(reviewers.listingOwner);
        if (assignedAgent?.mobile) {
          notifyPhone = assignedAgent.mobile.replace(/\D/g, "");
          notifyName = assignedAgent.fullName;
        }
      } catch {
        /* fall back to uploader */
      }
    }
    const listingTitle = `Plot (${args.landSize}m²) For ${listingType === "rent" ? "Rent" : "Sale"} in ${descriptionLocation}`;
    trackListingUpload(
      result.listingId,
      notifyPhone,
      notifyName,
      listingTitle,
      result.listingUrl,
      Number(args.price) || undefined
    ).catch((err) =>
      logger.warn("Failed to track listing upload (non-critical)", {
        category: LogCategory.TOOL,
        error: String(err),
      })
    );

    // Clear pending images and documents and release upload lock
    if (agentPhone) {
      await clearPendingImages(agentPhone);
      await clearPendingDocuments(agentPhone);
    }
    await releaseUploadLock(propertyLockKey);

    logger.info("Land listing created successfully", {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    });

    // Show the Google Maps link in the confirmation, matching property uploads:
    // the user's link if given, else one built from the resolved coordinates
    // (so bank land listings surface their portal pin too).
    const mapsLink = locationUrl
      ? locationUrl
      : resolvedCoordinates
        ? `https://www.google.com/maps/place/${resolvedCoordinates.lat},${resolvedCoordinates.lon}`
        : null;

    return {
      success: true,
      message:
        "✅ Land listing created successfully!\n\n" +
        `📍 Location: ${descriptionLocation}\n` +
        `📏 Land Size: ${args.landSize}m²\n` +
        `💰 Price: €${(args.price as number).toLocaleString()}\n\n` +
        (mapsLink ? `📍 Google Maps: ${mapsLink}\n\n` : "") +
        `🔗 View on Zyprus: ${result.listingUrl}\n\n` +
        "The listing is currently UNPUBLISHED and assigned to:\n" +
        `• Reviewer 1: ${reviewers.reviewer1}\n` +
        (reviewers.reviewer2 ? `• Reviewer 2: ${reviewers.reviewer2}\n` : "") +
        "\nThey will review and publish it shortly.",
    };
  } catch (error) {
    await releaseUploadLock(propertyLockKey);
    const err = error instanceof Error ? error : new Error(String(error));
    const errorType = classifyError(err);
    logger.error("Land listing creation failed", err, {
      category: LogCategory.TOOL,
      operation: "createLandListing",
      errorType,
      errorMessage: err.message,
      errorName: err.name,
      stack: err.stack?.split("\n").slice(0, 5).join(" | "),
    });

    return {
      error: `Failed to create land listing: ${err.message}`,
    };
  }
}
