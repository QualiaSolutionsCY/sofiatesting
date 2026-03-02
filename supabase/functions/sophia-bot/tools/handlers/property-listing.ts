/**
 * Property Listing Handler
 * Handles the createPropertyListing tool
 */

import { trackListingUpload } from "../../../_shared/db.ts";
import { getSupabaseAdmin } from "../../../_shared/db.ts";
import { type Agent, getAgentByEmail } from "../../agents/identifier.ts";
import {
  DEFAULT_COORDINATES,
  REGIONAL_EMAILS,
} from "../../config/business-rules.ts";
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
import { generateDescription } from "../../services/description-generator.ts";
import {
  checkForDuplicates,
  createDuplicateNote,
  generateDuplicateWarning,
} from "../../services/duplicate-checker.ts";
import { classifyImagesWithVision } from "../../services/image-classifier.ts";
import {
  generateImageWarnings,
  hasEnoughImages,
  processImages,
  validateImages,
} from "../../services/image-handler.ts";
import {
  generateAIAssistantNotes,
  generateMyNotes,
} from "../../services/my-notes-generator.ts";
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
  createDraftListing,
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
} from "../validators/location.ts";
import { acquireUploadLock } from "../validators/upload-lock.ts";

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
 * Handle property listing creation
 */
export async function handleCreatePropertyListing(
  args: Record<string, unknown>,
  agent: Agent | null
): Promise<ToolResult> {
  logger.info("Create property listing started", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    argsPreview: JSON.stringify(args).substring(0, 500),
  });

  // 1. Check if agent is identified
  if (!agent) {
    logger.warn("Listing creation blocked - no agent identified", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
    });
    return handleUnknownSender();
  }

  logger.info("Agent identified for listing creation", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    agentName: agent.fullName,
    agentRegion: agent.region,
  });

  // 1.5 CRITICAL: Acquire DB-based upload lock to prevent duplicate uploads
  // Uses property fingerprint (agent+location+price+owner) so different properties can upload in parallel
  // DB lock is atomic — only ONE concurrent Edge Function invocation wins
  const agentPhone = agent.mobile?.replace(/\D/g, "") || "";
  // Per-property lock — agent+location+price+owner fingerprint so different properties can upload in parallel
  const propertyLockKey = `upload:${agentPhone}:${((args.location as string) || "").toLowerCase()}:${args.price}:${((args.ownerPhone as string) || "").slice(-6)}`;
  const lockResult = await acquireUploadLock(propertyLockKey, agentPhone);
  if (!lockResult.acquired) {
    logger.warn("Upload blocked by DB lock - duplicate upload in progress", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentName: agent.fullName,
      remainingSeconds: lockResult.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this property. Please wait ${lockResult.remainingSeconds} seconds before trying again.`,
    };
  }

  // 1.6 Check listing_uploads for recent duplicates — BLOCKS upload if match found within 24 hours
  let potentialDuplicateNote = "";

  const sb = getSupabaseAdmin();

  {
    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: recentUploads } = await sb
      .from("listing_uploads")
      .select("id, property_title, created_at, zyprus_listing_id")
      .eq("agent_phone", agentPhone)
      .gte("created_at", twentyFourHoursAgo)
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
        const minutesAgo = Math.round(
          (Date.now() - new Date(match.created_at as string).getTime()) / 60_000
        );
        potentialDuplicateNote = `POTENTIAL DUPLICATE - similar listing exists: ${match.property_title} (${match.zyprus_listing_id})`;
        logger.warn("Duplicate detected - blocking upload", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          existingId: match.zyprus_listing_id,
          existingTitle: match.property_title,
          minutesAgo,
          agentPhone,
        });
        return {
          needsInput: true,
          question: `This property was already uploaded ${minutesAgo < 60 ? `${minutesAgo} minutes` : `${Math.round(minutesAgo / 60)} hours`} ago: "${match.property_title}" (${match.zyprus_listing_id}). If you want to upload it again, please confirm by saying "upload anyway".`,
        };
      }
    }
  }

  // 2. Validate required fields
  const validation = validateRequiredFields(args);
  if (!validation.valid) {
    // Mark as retryable so ai-chat.ts feeds this back to the AI loop
    // instead of showing the generic "I still need..." message to the user.
    // The AI already has the data in conversation context — it just failed to extract it.
    logger.warn("Validation failed — missing fields in tool call args", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      missingFields: validation.missing,
      providedFields: Object.keys(args).filter(
        (k) => args[k] !== undefined && args[k] !== null
      ),
    });
    return {
      needsInput: true,
      retryable: true,
      question: getMissingFieldsMessage(validation.missing),
    };
  }

  let location = args.location as string;
  const listingType = args.listingType as "sale" | "rent";
  const locationUrl = args.locationUrl as string | undefined;

  // 2.5 CRITICAL: Correct street addresses to area names
  // AI sometimes passes street names (e.g., "Apostolou Pavlou Ave, Paphos" or "Michali Sougioul, Limassol")
  // instead of area names (e.g., "Kato Paphos, Paphos"). Detect this and fix using the Google Maps URL.
  const streetDetected =
    isStreetAddress(location) ||
    // Cross-reference with Google Maps URL: if the /place/ path contains the AI's location
    // name alongside a house number, it's a street name (e.g., "Michali Sougioul 21, Lemesos")
    (locationUrl ? isLocationAStreetInUrl(location, locationUrl) : false);

  if (streetDetected && locationUrl) {
    const areaFromUrl = extractAreaFromGoogleMapsUrl(locationUrl);
    if (areaFromUrl) {
      logger.warn(
        "Location corrected: AI passed street address, extracted area from Google Maps URL",
        {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          originalLocation: location,
          correctedLocation: areaFromUrl,
          googleMapsUrl: locationUrl.substring(0, 100),
        }
      );
      location = areaFromUrl;
    } else {
      // Could not extract a specific area — ask the agent
      logger.warn(
        "Location appears to be a street address, asking agent for area name",
        {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
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
    // Street name without a Google Maps URL — ask for proper area
    logger.warn(
      "Location appears to be a street address with no Google Maps URL to extract area from",
      {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        location,
      }
    );
    return {
      needsInput: true,
      question: `"${location}" appears to be a street address. I need the area/neighborhood name for the listing (e.g., Agios Athanasios, Kato Paphos, Germasogeia). What area is this property in?`,
    };
  }

  // 2.6 CRITICAL: Block city-only locations (e.g., "Limassol, Limassol" or "Paphos")
  // These are too vague — Sophia must ask for the specific area/neighborhood
  if (isCityOnlyLocation(location)) {
    logger.warn("Location rejected: city-only location without specific area", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      location,
    });
    return {
      needsInput: true,
      question: `"${location}" is too general — I need the specific area or neighborhood name (e.g., Agios Athanasios, Kato Paphos, Germasogeia, Mesa Geitonia). What is the exact area/neighborhood for this property?`,
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
        "To whom would you like me to assign this property as the listing owner?",
    };
  }

  // 5.1 SECURITY: Only management agents can use assignTo — strip it for regular agents
  // This prevents the AI from hallucinating assignments (e.g., "lysandros@zyprus.com" for a Paphos property)
  if (args.assignTo && agent.role !== "management") {
    logger.warn(
      "Stripped assignTo from non-management agent — only management can assign",
      {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        agentRole: agent.role,
        agentEmail: agent.communicationEmail,
        attemptedAssignTo: args.assignTo,
      }
    );
    args.assignTo = undefined;
  }

  // 5.2 SECURITY: Validate assignTo is a @zyprus.com email (exact domain match to prevent subdomain bypass)
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    const emailParts = assignToEmail.split("@");
    // Must have exactly one @ and domain must be exactly zyprus.com (not a subdomain)
    if (emailParts.length !== 2 || emailParts[1] !== "zyprus.com") {
      return {
        error: "Assignments must be to a @zyprus.com email address.",
      };
    }
    // Verify the email exists as an agent in the database OR is a known regional office email
    const isRegionalOffice =
      Object.values(REGIONAL_EMAILS).includes(assignToEmail);
    if (isRegionalOffice) {
      logger.info(
        "assignTo is a regional office email — skipping agent DB check",
        {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          assignToEmail,
        }
      );
    } else {
      const assigneeAgent = await getAgentByEmail(
        assignToEmail
      );
      if (!assigneeAgent) {
        logger.warn("assignTo email not found in agents database — stripping", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          assignToEmail,
        });
        args.assignTo = undefined;
      }
    }
  }

  // 6. Get reviewer assignments
  const reviewers = assignReviewers(
    agent,
    listingType,
    propertyRegion,
    args.assignTo as string | undefined
  );

  // 6b. Resolve listing owner name for Reference ID
  // When assignTo is provided (management assigns to specific agent), look up that agent's name
  let listingOwnerName = agent.fullName;
  if (args.assignTo && reviewers.listingOwner !== agent.communicationEmail) {
    try {
      const assignedAgent = await getAgentByEmail(
        reviewers.listingOwner
      );
      if (assignedAgent) {
        listingOwnerName = assignedAgent.fullName;
        logger.info("Resolved listing owner name from assignTo", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          listingOwnerName,
          listingOwnerEmail: reviewers.listingOwner,
        });
      }
    } catch {
      // Non-critical — fall back to requesting agent name
    }
  }

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
          operation: "createPropertyListing",
          urlPreview: url.substring(0, 100),
        });
        return false;
      }
      return true;
    });

    if (pendingImages.length > 0) {
      logger.info("Using images from pending_images table", {
        category: LogCategory.IMAGE,
        operation: "createPropertyListing",
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
            operation: "createPropertyListing",
            urlPreview: url.substring(0, 100),
          });
        }
        return !isFake;
      });
      logger.info("No pending images - using AI-provided URLs", {
        category: LogCategory.IMAGE,
        operation: "createPropertyListing",
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
      operation: "createPropertyListing",
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
        operation: "createPropertyListing",
        indices: titleDeedImageIndices,
      });
    }
    if (visionResult.floorPlanIndices.length > 0) {
      floorPlanImageIndicesFromArgs = visionResult.floorPlanIndices.map(
        (i) => i + 1
      );
      logger.info("Vision auto-detected floor plan images", {
        category: LogCategory.IMAGE,
        operation: "createPropertyListing",
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
      operation: "createPropertyListing",
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
        operation: "createPropertyListing",
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
      operation: "createPropertyListing",
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
        operation: "createPropertyListing",
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
        operation: "createPropertyListing",
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

  const processedImages = await processImages(imageUrls);

  // Check minimum images (sync)
  const imageCheck = hasEnoughImages(
    processedImages,
    args.propertyType as string
  );
  if (!imageCheck.enough) {
    return {
      needsInput: true,
      question: `I need at least ${imageCheck.required} ${imageCheck.required === 1 ? "image" : "images"} for a ${args.propertyType}. You've provided ${imageCheck.provided}. Please send more photos.`,
    };
  }

  // 8. Get token once, then run operations in PARALLEL for performance
  logger.info("Getting Zyprus config and token", {
    category: LogCategory.ZYPRUS,
    operation: "createPropertyListing",
  });
  let config;
  let token;
  try {
    config = getZyprusConfig();
    token = await getAccessToken(config);
    logger.info("Got Zyprus access token successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
    });
  } catch (tokenError) {
    const err =
      tokenError instanceof Error ? tokenError : new Error(String(tokenError));
    logger.error("Failed to get Zyprus token", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
    });
    return { error: `Failed to authenticate with Zyprus API: ${err.message}` };
  }

  const [imageValidation, duplicates, locationResult] = await Promise.all([
    // Validate images are accessible
    validateImages(processedImages),
    // Check for duplicates
    checkForDuplicates(
      args.ownerPhone as string,
      args.ownerName as string,
      location,
      config.apiUrl,
      token
    ),
    // Find taxonomy UUIDs — returns { uuid, matchedName, district }
    findLocationUuid(location),
  ]);

  const locationUuid = locationResult.uuid;

  // CRITICAL: ALWAYS use the agent's original location name for title/description.
  // The taxonomy UUID is ONLY for the Zyprus API dropdown field.
  // Never override the agent's location — "Mesa Chorio, Paphos" must stay "Mesa Chorio, Paphos"
  // even if the taxonomy resolver mapped it to "Kato Paphos" for the UUID.
  const descriptionLocation = location;

  // Log when taxonomy resolved to a different name (for debugging, NOT for overriding)
  if (
    locationResult.matchedName &&
    locationResult.matchedName.toLowerCase() !== location.toLowerCase()
  ) {
    logger.info(
      "Taxonomy resolved to different name (UUID only, location text unchanged)",
      {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        agentLocation: location,
        taxonomyMatch: locationResult.matchedName,
      }
    );
  }

  const { valid: validImages, invalid: invalidImages } = imageValidation;
  if (invalidImages.length > 0) {
    logger.warn("Images failed validation", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });
  }

  // 9a. locationUrl already captured in step 2.5 above

  // 9a.5 Build AI message content (for My Notes - includes how listing was created)
  const aiMessageParts: string[] = [];
  if (duplicates.isDuplicate) {
    aiMessageParts.push(generateDuplicateWarning(duplicates.potentialMatches));
  }
  if (args.specialNotes) {
    aiMessageParts.push(`Agent notes: ${args.specialNotes}`);
  }
  // Note taxonomy mismatch in AI notes for reviewer awareness (UUID only, text unchanged)
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

  // 9b. Resolve coordinates — from args, from Google Maps URL, or from defaults
  const resolvedCoordinates =
    (args.coordinates as { lat: number; lon: number } | undefined) ||
    // Try to parse coordinates from Google Maps URL (e.g., @34.828,32.401)
    (() => {
      if (locationUrl) {
        const atMatch = locationUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (atMatch) {
          return {
            lat: Number.parseFloat(atMatch[1]),
            lon: Number.parseFloat(atMatch[2]),
          };
        }
        // Also try "place/lat,lon" format
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
    // Fallback: use default coordinates based on location name
    (() => {
      const locationLower = location.toLowerCase();
      let bestMatch: {
        key: string;
        coords: { lat: number; lon: number };
      } | null = null;

      for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
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
          operation: "createPropertyListing",
          locationKey: bestMatch.key,
          lat: bestMatch.coords.lat,
          lon: bestMatch.coords.lon,
        });
        return bestMatch.coords;
      }
      return;
    })();

  // 9b. CRITICAL: Check we have at least 1 valid image AFTER validation
  // Zyprus API requires field_gallery_ to have at least 1 image
  if (validImages.length === 0) {
    const invalidDetails =
      invalidImages.length > 0
        ? invalidImages
            .slice(0, 3)
            .map((img) => `• ${img.error}`)
            .join("\n")
        : "";

    logger.error("No valid images after validation", undefined, {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });

    return {
      error:
        "None of the images could be uploaded.\n\n" +
        (invalidDetails ? `Issues:\n${invalidDetails}\n\n` : "") +
        "Please send photos directly from your phone gallery, or use direct image URLs.",
    };
  }

  // 9c. VAT SAFEGUARD: AI frequently hallucates plus_vat when agent never mentioned VAT.
  // Business rule: plus_vat ONLY applies to new builds where agent explicitly said +VAT.
  // If AI passed plus_vat but isNewBuild is not true, force to no_vat.
  let safePriceModifier = args.priceModifier as string | undefined;
  if (safePriceModifier === "plus_vat" && !args.isNewBuild) {
    logger.warn(
      "VAT safeguard: AI set plus_vat without isNewBuild=true — overriding to no_vat",
      {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
        originalModifier: safePriceModifier,
        isNewBuild: args.isNewBuild,
      }
    );
    safePriceModifier = "no_vat";
  }

  // 9d. Auto-inject "roof garden" for penthouses with uncovered veranda (Issue #5 fix)
  // Penthouses with uncoveredVeranda > 0 should always have "roof garden" in features
  const propertyTypeLower = ((args.propertyType as string) || "").toLowerCase();
  const effectiveFeatures = [...((args.features as string[]) || [])];
  if (
    propertyTypeLower.includes("penthouse") &&
    (args.uncoveredVeranda as number) > 0
  ) {
    const hasRoofGarden = effectiveFeatures.some(
      (f) =>
        f.toLowerCase().includes("roof garden") ||
        f.toLowerCase().includes("roof terrace")
    );
    if (!hasRoofGarden) {
      effectiveFeatures.push("roof garden");
      logger.info(
        "Auto-injected 'roof garden' into features for penthouse with uncoveredVeranda",
        {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          uncoveredVeranda: args.uncoveredVeranda,
        }
      );
    }
  }

  // 9e. Auto-inject correct pool feature based on poolType (don't rely on AI)
  // SAFEGUARD: If specialNotes mentions "provisions for pool" but AI set poolType to "private",
  // auto-correct to "provisions" — the agent explicitly said there's NO pool, just provisions
  let poolType = args.poolType as string | undefined;
  const specialNotesLower = ((args.specialNotes as string) || "").toLowerCase();
  if (
    poolType === "private" &&
    specialNotesLower.includes("provision") &&
    specialNotesLower.includes("pool")
  ) {
    logger.warn(
      "Pool safeguard: specialNotes mentions 'provisions for pool' but poolType=private — correcting to provisions",
      {
        category: LogCategory.TOOL,
        operation: "createPropertyListing",
      }
    );
    poolType = "provisions";
  }
  // Remove any generic "pool"/"swimming pool" from features, then inject the correct one
  if (poolType) {
    // Remove any pool-related features the AI might have added incorrectly
    const poolKeywords = [
      "pool",
      "swimming pool",
      "private pool",
      "communal pool",
      "provisions for pool",
      "provisions for swimming pool",
    ];
    const nonPoolFeatures = effectiveFeatures.filter(
      (f) =>
        !poolKeywords.some(
          (kw) => f.toLowerCase() === kw || f.toLowerCase().includes(kw)
        )
    );
    effectiveFeatures.length = 0;
    effectiveFeatures.push(...nonPoolFeatures);

    // Inject the correct pool feature
    switch (poolType) {
      case "private":
        effectiveFeatures.push("private pool");
        break;
      case "communal":
        effectiveFeatures.push("communal pool");
        break;
      case "provisions":
        effectiveFeatures.push("provisions for swimming pool");
        break;
    }
    logger.info("Auto-injected pool feature based on poolType", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      poolType,
    });
  }

  // 10. Generate description
  // For residential buildings, don't default bathrooms to 1 — leave as 0 if not provided
  const isBuilding = propertyTypeLower.includes("building");
  const bathrooms = isBuilding
    ? (args.bathrooms as number) || 0
    : (args.bathrooms as number) || 1;

  // descriptionLocation always equals agent's original location (never overridden by taxonomy)

  const description = generateDescription({
    type: args.propertyType as string,
    listingType,
    bedrooms: args.bedrooms as number,
    bathrooms,
    location: descriptionLocation,
    titleDeedStatus: args.titleDeedStatus as string,
    coveredArea: args.coveredArea as number,
    plotSize: args.plotSize as number | undefined,
    coveredVeranda: args.coveredVeranda as number | undefined,
    uncoveredVeranda: args.uncoveredVeranda as number | undefined,
    features: effectiveFeatures.length > 0 ? effectiveFeatures : undefined,
    price: args.price as number,
    yearBuilt: args.yearBuilt as number | undefined,
    yearRenovated: args.yearRenovated as number | undefined,
    floor: args.floor as string | undefined,
    areaDescription: args.areaDescription as string | undefined,
    condition: args.condition as string | undefined,
    orientation: args.orientation as string | undefined,
    basementRooms: args.basementRooms as number | undefined,
    roofRooms: args.roofRooms as number | undefined,
    parking: args.parkingType as string | undefined,
    poolType: poolType as "private" | "communal" | "provisions" | undefined,
    priceModifier: safePriceModifier,
    unitBreakdown: args.unitBreakdown as string | undefined,
    isNewBuild: args.isNewBuild as boolean | undefined,
    structureDescription: args.structureDescription as string | undefined,
  });

  // 11. Generate My Notes (with listing owner, reviewer, AI message - all in one place)
  const myNotes = generateMyNotes(
    {
      name: args.ownerName as string,
      phone: args.ownerPhone as string,
      email: args.ownerEmail as string | undefined,
      specialNotes: args.specialNotes as string | undefined,
    },
    agent,
    {
      duplicateWarning:
        potentialDuplicateNote ||
        (duplicates.isDuplicate
          ? createDuplicateNote(duplicates.potentialMatches)
          : undefined),
      locationUrl,
      coordinates: resolvedCoordinates,
      listingOwner: reviewers.listingOwner,
      listingOwnerName,
      reviewer1: reviewers.reviewer1,
      reviewer2: reviewers.reviewer2 || undefined,
      // NEW: Pass AI message, listing type, property type, and features to My Notes
      aiMessage: aiMessageContent || undefined,
      listingType,
      propertyType: args.propertyType as string,
      keyFeatures: args.features as string[] | undefined,
      registrationNumber: args.registrationNumber as string | undefined,
    }
  );

  // DEBUG: Log My Notes to verify no "SOPHIA AI"
  logger.debug("My Notes generated", {
    category: LogCategory.TOOL,
    operation: "createPropertyListing",
    notesPreview: myNotes.substring(0, 200),
    containsSophiaAI: myNotes.toLowerCase().includes("sophia ai"),
  });

  // 12. Generate AI Notes (separate field for AI understanding)
  const aiNotes = generateAIAssistantNotes(
    `${listingType === "rent" ? "Rental" : "Sale"} listing from WhatsApp`,
    args.propertyType as string,
    effectiveFeatures,
    args.specialNotes as string | undefined,
    locationUrl, // Google Maps link
    resolvedCoordinates // Fallback coordinates
  );

  // 13. Create the listing
  logger.info("Creating draft listing", {
    category: LogCategory.ZYPRUS,
    operation: "createPropertyListing",
    propertyType: args.propertyType as string,
    location,
    price: args.price as number,
    imageCount: validImages.length,
  });
  let result;
  try {
    result = await createDraftListing({
      listingType,
      propertyType: args.propertyType as string,
      price: args.price as number,
      location,
      locationUuid, // May be empty if no appropriate location found in Zyprus (e.g., non-Nicosia districts)
      bedrooms: args.bedrooms as number,
      bathrooms,
      coveredArea: args.coveredArea as number,
      plotSize: args.plotSize as number | undefined,
      coveredVeranda: args.coveredVeranda as number | undefined,
      uncoveredVeranda: args.uncoveredVeranda as number | undefined,
      description,
      myNotes,
      aiNotes,
      images: validImages.map((img) => img.url),
      reviewer1: reviewers.reviewer1,
      reviewer2: reviewers.reviewer2,
      listingOwner: reviewers.listingOwner,
      listingInstructor: reviewers.listingInstructor,
      features: effectiveFeatures.length > 0 ? effectiveFeatures : undefined,
      titleDeedStatus: args.titleDeedStatus as string,
      yearBuilt: args.yearBuilt as number | undefined,
      floor: args.floor as string | undefined,
      potentialDuplicate: duplicates.isDuplicate || !!potentialDuplicateNote,
      aiMessage: aiMessageContent,
      // New fields (Feb 2026)
      priceNegotiable: args.priceNegotiable as boolean | undefined,
      isNewBuild: args.isNewBuild as boolean | undefined,
      parkingType: args.parkingType as
        | "covered"
        | "open"
        | "garage"
        | "carport"
        | "none"
        | undefined,
      priceModifier: safePriceModifier as
        | "no_vat"
        | "plus_vat"
        | "vat_included"
        | undefined,
      floorPlanUrls:
        [
          ...(floorPlanImageUrls || []),
          ...((args.floorPlanUrls as string[]) || []),
        ].length > 0
          ? [
              ...(floorPlanImageUrls || []),
              ...((args.floorPlanUrls as string[]) || []),
            ]
          : undefined,
      titleDeedFileUrls:
        titleDeedFileUrls.length > 0 ? titleDeedFileUrls : undefined,
      // For Own Reference ID: Owner - {Listing Owner} - {Building} - {Seller} - {Phone} - {Email}
      agentName: listingOwnerName,
      ownerName: args.ownerName as string,
      ownerPhone: args.ownerPhone as string,
      ownerEmail: args.ownerEmail as string | undefined,
      registrationNumber: args.registrationNumber as string | undefined,
      buildingName: args.buildingName as string | undefined,
      energyClass: args.energyClass as string | undefined,
      coordinates: resolvedCoordinates,
    });
    logger.info("Draft listing created successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    });

    // CRITICAL: Clear pending images and documents after successful upload
    // This prevents the same files from being used in the next listing
    // Use agentPhone (cleaned format) to match how files were stored
    await clearPendingImages(agentPhone);
    await clearPendingDocuments(agentPhone);
    logger.info(
      "Cleared pending images and documents after successful upload",
      {
        category: LogCategory.IMAGE,
      }
    );

    // Track listing for publication notification (non-blocking, fire-and-forget)
    const propertyTitle = `${args.bedrooms} bed ${args.propertyType} in ${location}`;
    trackListingUpload(
      result.listingId,
      agentPhone,
      agent.fullName,
      propertyTitle,
      result.listingUrl
    ).catch((err) =>
      logger.warn("Failed to track listing upload (non-critical)", {
        category: LogCategory.TOOL,
        error: String(err),
      })
    );
  } catch (createError) {
    const err =
      createError instanceof Error
        ? createError
        : new Error(String(createError));
    const errorType = classifyError(err);

    logger.error("Failed to create draft listing", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      errorType,
      errorMessage: err.message,
    });

    // User-friendly message based on error type
    if (errorType === ErrorType.NETWORK || errorType === ErrorType.TIMEOUT) {
      return {
        error:
          "The property listing service is temporarily slow. Please try again in a moment.",
      };
    }
    if (errorType === ErrorType.AUTH) {
      return {
        error:
          "There's a configuration issue with the property system. Please contact support.",
      };
    }
    // Include truncated error detail for debugging (visible in edge function logs)
    const detail =
      err.message.length > 200
        ? err.message.substring(0, 200) + "..."
        : err.message;
    return { error: `Unable to create the listing: ${detail}` };
  }

  // 14. Build success message
  let message = `✅ I've uploaded the property as a draft listing.\n\n`;
  message += "**Summary:**\n";
  message += `• Property: ${args.bedrooms} bed ${args.propertyType} in ${location}\n`;
  message += `• Price: €${(args.price as number).toLocaleString()}\n`;
  message += `• Type: For ${listingType}\n`;
  message += `• Images: ${validImages.length} uploaded\n`;
  if (titleDeedFileUrls.length > 0) {
    message += `• Title deed documents: ${titleDeedFileUrls.length} attached\n`;
  }
  message += `• Assigned to: ${reviewers.listingOwner}\n`;
  message += `• Reviewer: ${reviewers.reviewer1}\n`;
  message += `\n🔗 **Draft URL:** ${result.listingUrl}\n`;

  // Add Google Maps link to response (copy of what's in My Notes)
  if (locationUrl) {
    message += `\n📍 **Google Maps:** ${locationUrl}\n`;
  } else if (resolvedCoordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${resolvedCoordinates.lat},${resolvedCoordinates.lon}`;
    message += `\n📍 **Google Maps:** ${mapsUrl}\n`;
  }

  // Add location mismatch warning if taxonomy resolved to a different name
  if (
    locationResult.matchedName &&
    locationResult.matchedName.toLowerCase() !== location.toLowerCase()
  ) {
    message += `\n⚠️ **Location dropdown:** I couldn't find "${location}" in the Zyprus locations dropdown, so I set it to "${locationResult.matchedName}". Please update the location dropdown on the listing if needed.\n`;
  }

  // Add warnings
  const imageWarnings = generateImageWarnings(validImages);
  if (imageWarnings) {
    message += `\n${imageWarnings}\n`;
  }

  if (duplicates.isDuplicate) {
    message +=
      "\n⚠️ This has been flagged as a potential duplicate. The reviewer will verify before publishing.\n";
  }

  message +=
    "\nThe property will appear in the system once reviewed. Is there anything else you need?";

  return {
    success: true,
    message,
    data: {
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    },
  };
}
