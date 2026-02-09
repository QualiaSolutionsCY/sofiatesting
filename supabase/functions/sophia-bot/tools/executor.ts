/**
 * Tool Executor
 * Executes tool calls from OpenRouter and returns results
 */

import { Agent, getAgentsByRegion, getAgentByEmail } from "../agents/identifier.ts";
import { validateRegionalAccess, determineRegion } from "../rules/region-validator.ts";
import { assignReviewers, needsAssignmentInput, RejectionError } from "../rules/reviewer-assignment.ts";
import { handleSpecialCases, handleUnknownSender, validateRequiredFields, getMissingFieldsMessage } from "../rules/special-cases.ts";
import { checkForDuplicates, generateDuplicateWarning, createDuplicateNote } from "../services/duplicate-checker.ts";
import { generateDescription, generateTitle } from "../services/description-generator.ts";
import { generateMyNotes, generateAIAssistantNotes } from "../services/my-notes-generator.ts";
import { processImages, validateImages, generateImageWarnings, hasEnoughImages } from "../services/image-handler.ts";
import { createDraftListing, getZyprusConfig, getAccessToken } from "../zyprus/client.ts";
import { loadTaxonomy, findLocationUuid, findPropertyTypeUuid, getLocationsByRegion } from "../zyprus/taxonomy-cache.ts";
import { clearPendingImages, getPendingImages } from "../services/pending-images.ts";
import { extractFromBazaraki as extractBazarakiListing, isBazarakiUrl, formatBazarakiSummary } from "../services/bazaraki-scraper.ts";
import { logger, LogCategory } from "../utils/logger.ts";
import { classifyError, getUserFriendlyMessage, ErrorType } from "../utils/error-mapper.ts";
import { trackToolUsed, trackPropertyUploaded, trackDocumentGenerated, createTimer } from "../services/analytics.ts";
import { getLastDocument, trackListingUpload } from "../../_shared/db.ts";
import { DEFAULT_COORDINATES, UPLOAD_LOCK_DURATION_MS } from "../config/business-rules.ts";

// In-memory upload lock to prevent duplicate uploads of the same property
// Key: property fingerprint (agent+location+price+owner), Value: timestamp
const uploadLocks = new Map<string, number>();

/**
 * Check if a URL points to a document file (DOCX, PDF, etc.)
 * Used to filter out document URLs that AI might confuse as images
 */
function isDocumentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    const docExtensions = ['.docx', '.pdf', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];

    // Check pathname (ignoring query string)
    if (docExtensions.some(ext => pathname.endsWith(ext))) {
      return true;
    }

    // Check for document patterns in path
    if (pathname.includes('/documents/') || pathname.includes('wordprocessingml')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Build a property fingerprint for upload lock deduplication.
 * Combines agent identity with property-specific fields so the same agent
 * can upload different properties back-to-back, but duplicate submissions
 * of the same property are still blocked.
 */
function buildPropertyFingerprint(
  agentKey: string,
  args: Record<string, unknown>
): string {
  const location = ((args.location as string) || "").toLowerCase().trim();
  const price = String(args.price || "");
  const owner = ((args.ownerName as string) || "").toLowerCase().trim();
  return `${agentKey}:${location}:${price}:${owner}`;
}

/**
 * Check if an upload lock exists for this property (prevents duplicate uploads)
 */
function checkUploadLock(lockKey: string): { locked: boolean; remainingSeconds?: number } {
  const lastUpload = uploadLocks.get(lockKey);
  if (!lastUpload) {
    return { locked: false };
  }

  const elapsed = Date.now() - lastUpload;
  if (elapsed < UPLOAD_LOCK_DURATION_MS) {
    const remaining = Math.ceil((UPLOAD_LOCK_DURATION_MS - elapsed) / 1000);
    return { locked: true, remainingSeconds: remaining };
  }

  // Lock expired, remove it
  uploadLocks.delete(lockKey);
  return { locked: false };
}

/**
 * Set upload lock for this property
 */
function setUploadLock(lockKey: string): void {
  uploadLocks.set(lockKey, Date.now());
}

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Execute a tool call with analytics tracking
 */
export async function executeTool(
  tool: ToolCall,
  agent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string,
  phoneNumber?: string
): Promise<ToolResult> {
  const timer = createTimer();

  logger.info("Tool execution started", {
    category: LogCategory.TOOL,
    toolName: tool.name,
    agentName: agent?.fullName,
  });

  try {
    let result: ToolResult;

    switch (tool.name) {
      case "createPropertyListing":
        result = await handleCreatePropertyListing(tool.arguments, agent, supabaseUrl, supabaseKey);
        // Track successful property upload
        if (result.success && phoneNumber) {
          trackPropertyUploaded(phoneNumber, agent?.id, {
            propertyType: tool.arguments.propertyType,
            location: tool.arguments.location,
          });
        }
        break;

      case "getZyprusData":
        result = await handleGetZyprusData(tool.arguments);
        break;

      case "calculateVAT":
        result = handleCalculateVAT(tool.arguments);
        break;

      case "calculateTransferFees":
        result = handleCalculateTransferFees(tool.arguments);
        break;

      case "calculateCapitalGains":
        result = handleCalculateCapitalGains(tool.arguments);
        break;

      case "getRegionalAgents":
        result = await handleGetRegionalAgents(tool.arguments);
        break;

      case "extractFromBazaraki":
        result = await handleExtractFromBazaraki(tool.arguments);
        break;

      case "sendEmail":
        result = await handleSendEmail(tool.arguments, agent, phoneNumber);
        // Track document sent via email
        if (result.success && phoneNumber && (tool.arguments.attachmentUrl || result.data?.attachedDocument)) {
          trackDocumentGenerated(phoneNumber, "email_with_document", agent?.id);
        }
        break;

      default:
        logger.warn("Unknown tool requested", {
          category: LogCategory.TOOL,
          toolName: tool.name,
        });
        return { error: `Unknown tool: ${tool.name}` };
    }

    // Track tool usage (fire-and-forget)
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: result.success ?? !result.error,
      });
    }

    return result;
  } catch (error) {
    // Track tool error
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof RejectionError) {
      // RejectionError messages are already user-friendly
      return { error: error.message };
    }

    // Classify and log the error
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorType = classifyError(errorObj);

    logger.error("Tool execution failed", errorObj, {
      category: LogCategory.TOOL,
      toolName: tool.name,
      errorType,
    });

    // Return user-friendly message
    const userMessage = getUserFriendlyMessage(errorType, `while ${tool.name}`);
    return { error: userMessage };
  }
}

/**
 * Handle property listing creation
 */
async function handleCreatePropertyListing(
  args: Record<string, unknown>,
  agent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string
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

  // 1.5 CRITICAL: Check upload lock to prevent duplicate uploads of the same property
  // Uses property fingerprint (agent+location+price+owner) so different properties can upload in parallel
  const agentKey = agent.mobile || agent.fullName;
  const propertyLockKey = buildPropertyFingerprint(agentKey, args);
  const lockCheck = checkUploadLock(propertyLockKey);
  if (lockCheck.locked) {
    logger.warn("Upload blocked by lock - duplicate upload in progress", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentName: agent.fullName,
      remainingSeconds: lockCheck.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this property. Please wait ${lockCheck.remainingSeconds} seconds before trying again.`,
    };
  }

  // Set lock immediately to prevent duplicate webhook calls for same property
  setUploadLock(propertyLockKey);

  // 2. Validate required fields
  const validation = validateRequiredFields(args);
  if (!validation.valid) {
    return {
      needsInput: true,
      question: getMissingFieldsMessage(validation.missing),
    };
  }

  const location = args.location as string;
  const listingType = args.listingType as "sale" | "rent";

  // 3. Validate regional access
  const regionResult = validateRegionalAccess(agent, location);
  if (!regionResult.allowed) {
    return { error: regionResult.message };
  }

  const propertyRegion = regionResult.propertyRegion || determineRegion(location) || agent.region;

  // 4. Handle special cases
  const specialCase = await handleSpecialCases(
    agent,
    {
      listingType,
      location,
      assignTo: args.assignTo as string | undefined,
    },
    propertyRegion,
    supabaseUrl,
    supabaseKey
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
      question: "To whom would you like me to assign this property as the listing owner?",
    };
  }

  // 5.1 SECURITY: Validate assignTo is a @zyprus.com email (exact domain match to prevent subdomain bypass)
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    const emailParts = assignToEmail.split("@");
    // Must have exactly one @ and domain must be exactly zyprus.com (not a subdomain)
    if (emailParts.length !== 2 || emailParts[1] !== "zyprus.com") {
      return {
        error: "Assignments must be to a @zyprus.com email address.",
      };
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
        reviewers.listingOwner,
        supabaseUrl,
        supabaseKey
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
  const agentPhone = agent.mobile?.replace(/\D/g, "") || "";
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
    const directUrls = rawDirectUrls.filter(url => {
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
      imageUrls = directUrls.filter(url => {
        const isFake = url.includes("images.zyprus.com") ||
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
    imageUrls = rawUrls.filter(url => !isDocumentUrl(url));
    logger.info("No agent phone - using AI-provided URLs", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      imageCount: imageUrls.length,
      source: "ai",
    });
  }

  const processedImages = await processImages(imageUrls);

  // Check minimum images (sync)
  const imageCheck = hasEnoughImages(processedImages, args.propertyType as string);
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
    const err = tokenError instanceof Error ? tokenError : new Error(String(tokenError));
    logger.error("Failed to get Zyprus token", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
    });
    return { error: `Failed to authenticate with Zyprus API: ${err.message}` };
  }

  const [
    imageValidation,
    duplicates,
    locationUuid,
  ] = await Promise.all([
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
    // Find taxonomy UUIDs
    findLocationUuid(location),
  ]);

  const { valid: validImages, invalid: invalidImages } = imageValidation;
  if (invalidImages.length > 0) {
    logger.warn("Images failed validation", {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });
  }

  // 9a. Capture the raw Google Maps URL (passed directly by the agent)
  const locationUrl = args.locationUrl as string | undefined;

  // 9a.5 CRITICAL: Include Google Maps URL in AI message for Zyprus website display
  // The locationUrl is also in myNotes, but agents need it in field_ai_message for visibility
  let aiMessageContent: string | null = null;
  if (duplicates.isDuplicate) {
    aiMessageContent = generateDuplicateWarning(duplicates.potentialMatches);
  } else if (args.specialNotes) {
    aiMessageContent = `Agent notes: ${args.specialNotes}`;
  }

  // Add Google Maps URL to AI message (appears in AI Notes field on Zyprus website)
  if (locationUrl) {
    if (aiMessageContent) {
      aiMessageContent += `\n\nLocation: ${locationUrl}`;
    } else {
      aiMessageContent = `Location: ${locationUrl}`;
    }
  }

  // 9b. Resolve coordinates — from args, from Google Maps URL, or from defaults
  const resolvedCoordinates = (args.coordinates as { lat: number; lon: number } | undefined) ||
    // Try to parse coordinates from Google Maps URL (e.g., @34.828,32.401)
    (() => {
      if (locationUrl) {
        const atMatch = locationUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (atMatch) {
          return { lat: parseFloat(atMatch[1]), lon: parseFloat(atMatch[2]) };
        }
        // Also try "place/lat,lon" format
        const placeMatch = locationUrl.match(/place\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
        if (placeMatch) {
          return { lat: parseFloat(placeMatch[1]), lon: parseFloat(placeMatch[2]) };
        }
      }
      return undefined;
    })() ||
    // Fallback: use default coordinates based on location name
    (() => {
      const locationLower = location.toLowerCase();
      let bestMatch: { key: string; coords: { lat: number; lon: number } } | null = null;

      for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
        if (locationLower.includes(key)) {
          if (!bestMatch || key.length > bestMatch.key.length) {
            bestMatch = { key, coords };
          }
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
      return undefined;
    })();

  // 9b. CRITICAL: Check we have at least 1 valid image AFTER validation
  // Zyprus API requires field_gallery_ to have at least 1 image
  if (validImages.length === 0) {
    const invalidDetails = invalidImages.length > 0
      ? invalidImages.slice(0, 3).map((img) => `• ${img.error}`).join('\n')
      : "";

    logger.error("No valid images after validation", undefined, {
      category: LogCategory.IMAGE,
      operation: "createPropertyListing",
      invalidCount: invalidImages.length,
    });

    return {
      error: `None of the images could be uploaded.\n\n` +
        (invalidDetails ? `Issues:\n${invalidDetails}\n\n` : "") +
        `Please send photos directly from your phone gallery, or use direct image URLs.`,
    };
  }

  // 10. Generate description
  const description = generateDescription({
    type: args.propertyType as string,
    listingType,
    bedrooms: args.bedrooms as number,
    bathrooms: args.bathrooms as number,
    location,
    titleDeedStatus: args.titleDeedStatus as string,
    coveredArea: args.coveredArea as number,
    plotSize: args.plotSize as number | undefined,
    coveredVeranda: args.coveredVeranda as number | undefined,
    uncoveredVeranda: args.uncoveredVeranda as number | undefined,
    features: args.features as string[] | undefined,
    price: args.price as number,
    yearBuilt: args.yearBuilt as number | undefined,
    floor: args.floor as string | undefined,
    areaDescription: args.areaDescription as string | undefined,
    condition: args.condition as string | undefined,
    orientation: args.orientation as string | undefined,
  });

  // 11. Generate My Notes (with listing owner, reviewer, AI message - all in one place)
  // Note: aiMessageContent was already built earlier (step 9a.5) including Google Maps URL
  const myNotes = generateMyNotes(
    {
      name: args.ownerName as string,
      phone: args.ownerPhone as string,
      email: args.ownerEmail as string | undefined,
      specialNotes: args.specialNotes as string | undefined,
    },
    agent,
    {
      duplicateWarning: duplicates.isDuplicate ? createDuplicateNote(duplicates.potentialMatches) : undefined,
      locationUrl,
      coordinates: resolvedCoordinates,
      listingOwner: reviewers.listingOwner,
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

  // 13. Generate AI Notes (separate field for AI understanding)
  // NOTE: Don't pass specialNotes here — already included in aiMessageContent (step 11)
  const aiNotes = generateAIAssistantNotes(
    `${listingType === "rent" ? "Rental" : "Sale"} listing from WhatsApp`,
    args.propertyType as string,
    (args.features as string[]) || [],
  );

  // 14. Create the listing
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
    // NOTE: aiMessageContent already built above (step 11) and passed to My Notes
    result = await createDraftListing({
    listingType,
    propertyType: args.propertyType as string,
    price: args.price as number,
    location,
    locationUuid, // Always valid - findLocationUuid now always returns a UUID
    bedrooms: args.bedrooms as number,
    bathrooms: args.bathrooms as number,
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
    features: args.features as string[] | undefined,
    titleDeedStatus: args.titleDeedStatus as string,
    yearBuilt: args.yearBuilt as number | undefined,
    floor: args.floor as string | undefined,
    potentialDuplicate: duplicates.isDuplicate,
    aiMessage: aiMessageContent,
    // New fields (Feb 2026)
    priceNegotiable: args.priceNegotiable as boolean | undefined,
    isNewBuild: args.isNewBuild as boolean | undefined,
    parkingType: args.parkingType as "covered" | "open" | "garage" | "carport" | "none" | undefined,
    priceModifier: args.priceModifier as "no_vat" | "plus_vat" | "vat_included" | undefined,
    floorPlanUrls: args.floorPlanUrls as string[] | undefined,
    // For Own Reference ID: Owner - {Listing Owner} - {Seller} - {Phone} - {Email}
    agentName: listingOwnerName,
    ownerName: args.ownerName as string,
    ownerPhone: args.ownerPhone as string,
    ownerEmail: args.ownerEmail as string | undefined,
    registrationNumber: args.registrationNumber as string | undefined,
    coordinates: resolvedCoordinates,
    });
    logger.info("Draft listing created successfully", {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    });

    // CRITICAL: Clear pending images after successful upload
    // This prevents the same images from being used in the next listing
    // Use agentPhone (cleaned format) to match how images were stored
    await clearPendingImages(agentPhone);
    logger.info("Cleared pending images after successful upload", {
      category: LogCategory.IMAGE,
    });

    // Track listing for publication notification (non-blocking, fire-and-forget)
    const propertyTitle = `${args.bedrooms} bed ${args.propertyType} in ${location}`;
    trackListingUpload(
      result.listingId,
      agentPhone,
      agent.fullName,
      propertyTitle,
      result.listingUrl,
    ).catch(() => {}); // Swallow errors — tracking is non-critical
  } catch (createError) {
    const err = createError instanceof Error ? createError : new Error(String(createError));
    const errorType = classifyError(err);

    logger.error("Failed to create draft listing", err, {
      category: LogCategory.ZYPRUS,
      operation: "createPropertyListing",
      errorType,
    });

    // User-friendly message based on error type
    if (errorType === ErrorType.NETWORK || errorType === ErrorType.TIMEOUT) {
      return { error: "The property listing service is temporarily slow. Please try again in a moment." };
    } else if (errorType === ErrorType.AUTH) {
      return { error: "There's a configuration issue with the property system. Please contact support." };
    } else {
      return { error: "Unable to create the listing right now. Please try again shortly." };
    }
  }

  // 14. Build success message
  let message = `✅ I've uploaded the property as a draft listing.\n\n`;
  message += `**Summary:**\n`;
  message += `• Property: ${args.bedrooms} bed ${args.propertyType} in ${location}\n`;
  message += `• Price: €${(args.price as number).toLocaleString()}\n`;
  message += `• Type: For ${listingType}\n`;
  message += `• Images: ${validImages.length} uploaded\n`;
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

  // Add warnings
  const imageWarnings = generateImageWarnings(validImages);
  if (imageWarnings) {
    message += `\n${imageWarnings}\n`;
  }

  if (duplicates.isDuplicate) {
    message += `\n⚠️ This has been flagged as a potential duplicate. The reviewer will verify before publishing.\n`;
  }

  message += `\nThe property will appear in the system once reviewed. Is there anything else you need?`;

  return {
    success: true,
    message,
    data: {
      listingId: result.listingId,
      listingUrl: result.listingUrl,
    },
  };
}

/**
 * Handle listing available agents in a region (for management assignment)
 */
async function handleGetRegionalAgents(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const region = args.region as string;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const agents = await getAgentsByRegion(region, supabaseUrl, supabaseKey);

    if (agents.length === 0) {
      return {
        success: true,
        data: { message: `No agents found in ${region} region.`, agents: [] },
      };
    }

    const agentList = agents.map((a) => ({
      name: a.fullName,
      email: a.listingOwnerEmail || a.communicationEmail,
      role: a.role,
    }));

    return {
      success: true,
      data: {
        message: `Found ${agentList.length} agent(s) in ${region}:`,
        agents: agentList,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to get regional agents", err, { category: LogCategory.TOOL });
    return { error: `Failed to retrieve agents for ${region}` };
  }
}

/**
 * Handle Bazaraki link extraction
 */
async function handleExtractFromBazaraki(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const url = args.url as string;

  if (!url || !isBazarakiUrl(url)) {
    return { error: "Please provide a valid Bazaraki URL (bazaraki.com or bazaraki.cy)" };
  }

  try {
    const listing = await extractBazarakiListing(url);
    const summary = formatBazarakiSummary(listing);

    return {
      success: true,
      message: summary,
      data: {
        ...listing,
        // Pass extracted data so AI can pre-fill createPropertyListing
        extractedFields: {
          listingType: listing.listingType,
          propertyType: listing.propertyType,
          price: listing.price,
          location: listing.location,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          coveredArea: listing.coveredArea,
          plotSize: listing.plotSize,
          imageUrls: listing.imageUrls,
        },
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Bazaraki extraction failed", err, { category: LogCategory.TOOL });
    return {
      error: "I couldn't extract details from that Bazaraki link. Could you please provide the property details directly?",
    };
  }
}

/**
 * Handle Zyprus data retrieval
 */
async function handleGetZyprusData(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const dataType = args.dataType as string;
  const region = args.region as string | undefined;

  try {
    const taxonomy = await loadTaxonomy();

    switch (dataType) {
      case "locations":
        if (region) {
          const locations = await getLocationsByRegion(region);
          return {
            success: true,
            data: locations.map((l) => l.name),
          };
        }
        return {
          success: true,
          data: taxonomy.locations.slice(0, 50).map((l) => l.name),
        };

      case "property_types":
        return {
          success: true,
          data: taxonomy.propertyTypes.map((p) => p.name),
        };

      case "features":
        const allFeatures = [
          ...taxonomy.features,
          ...taxonomy.indoorFeatures,
          ...taxonomy.outdoorFeatures,
        ];
        return {
          success: true,
          data: allFeatures.map((f) => f.name),
        };

      case "listing_types":
        return {
          success: true,
          data: taxonomy.listingTypes.map((l) => l.name),
        };

      default:
        logger.warn("Unknown data type requested", {
          category: LogCategory.ZYPRUS,
          operation: "getZyprusData",
          dataType,
        });
        return { error: `Unknown data type: ${dataType}` };
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Failed to retrieve Zyprus data", err, {
      category: LogCategory.ZYPRUS,
      operation: "getZyprusData",
      dataType,
    });
    return { error: "Failed to retrieve Zyprus data" };
  }
}

/**
 * Calculate VAT - NEW POLICY (From 31 October 2023)
 *
 * For primary residence (EU buyers):
 * - Max floor area for reduced rate: 130 m²
 * - Max value for reduced rate: €350,000
 * - Total price cannot exceed €475,000
 * - Total area cannot exceed 190 m²
 *
 * Formula:
 * areaRatio = min(130, totalArea) / totalArea
 * reducedValueBase = areaRatio * min(price, €350,000)
 * VAT at 5% = reducedValueBase * 0.05
 * VAT at 19% = (price - reducedValueBase) * 0.19
 */
function handleCalculateVAT(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const area = (args.area as number) || 0;
  // Default to primary residence (true) - most VAT calculations are for primary residence
  const isPrimaryResidence = args.isPrimaryResidence !== false;

  // Check if eligible for reduced rate
  const isEligible = isPrimaryResidence &&
    price <= 475000 &&
    area > 0 &&
    area <= 190;

  if (!isEligible) {
    // Standard 19% VAT on full price
    const vat = price * 0.19;

    let reason = "";
    if (!isPrimaryResidence) {
      reason = "Not primary residence - standard rate applies";
    } else if (price > 475000) {
      reason = "Price exceeds €475,000 limit - standard rate applies";
    } else if (area > 190) {
      reason = "Area exceeds 190m² limit - standard rate applies";
    } else if (area === 0) {
      reason = "Area not provided - standard rate applies";
    }

    const formatCurrency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return {
      success: true,
      message: `VAT Calculation:\n\n` +
        `Property Price: €${price.toLocaleString()}\n` +
        `VAT Rate: 19%\n` +
        `*VAT Amount: €${formatCurrency(vat)}*\n\n` +
        `${reason}\n\n` +
        `_This calculation is indicative only. Please consult a tax advisor for exact figures._`,
      data: { vat, rate: "19%", eligible: false },
    };
  }

  // Calculate with area ratio (NEW POLICY)
  const areaRatio = Math.min(130, area) / area;
  const reducedValueBase = areaRatio * Math.min(price, 350000);
  const vatAt5 = reducedValueBase * 0.05;
  const vatAt19 = (price - reducedValueBase) * 0.19;
  const totalVat = vatAt5 + vatAt19;

  // Format numbers with 2 decimal places
  const formatCurrency = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return {
    success: true,
    message: `VAT Calculation (Primary Residence):\n\n` +
      `Property Price: €${price.toLocaleString()}\n` +
      `Property Area: ${area}m²\n\n` +
      `Area Ratio: ${(areaRatio * 100).toFixed(2)}% (130m² ÷ ${area}m²)\n` +
      `Reduced Value Base: €${formatCurrency(reducedValueBase)}\n\n` +
      `VAT at 5%: €${formatCurrency(vatAt5)}\n` +
      `VAT at 19%: €${formatCurrency(vatAt19)}\n` +
      `*Total VAT: €${formatCurrency(totalVat)}*\n\n` +
      `_This calculation is indicative only. Please consult a tax advisor for exact figures._`,
    data: {
      vat: totalVat,
      vatAt5,
      vatAt19,
      areaRatio,
      reducedValueBase,
      eligible: true,
    },
  };
}

/**
 * Calculate Transfer Fees
 */
function handleCalculateTransferFees(args: Record<string, unknown>): ToolResult {
  const price = args.price as number;
  const isFirstProperty = args.isFirstProperty as boolean;
  const hasVAT = args.hasVAT as boolean;

  // No transfer fees if VAT applies
  if (hasVAT) {
    return {
      success: true,
      message: "No transfer fees apply when VAT is paid on the property.",
      data: { fee: 0, note: "VAT property - no transfer fees" },
    };
  }

  // Cyprus transfer fee bands
  let fee = 0;
  if (price <= 85000) {
    fee = price * 0.03;
  } else if (price <= 170000) {
    fee = 85000 * 0.03 + (price - 85000) * 0.05;
  } else {
    fee = 85000 * 0.03 + 85000 * 0.05 + (price - 170000) * 0.08;
  }

  // 50% discount for first property
  if (isFirstProperty) {
    fee = fee * 0.5;
  }

  return {
    success: true,
    message: `Transfer fees for €${price.toLocaleString()}:\n` +
      `• Base fee: €${(fee * (isFirstProperty ? 2 : 1)).toLocaleString()}\n` +
      (isFirstProperty ? `• First property discount (50%): -€${fee.toLocaleString()}\n` : "") +
      `• **Total: €${fee.toLocaleString()}**`,
    data: { fee, isFirstProperty },
  };
}

/**
 * Calculate Capital Gains Tax
 */
function handleCalculateCapitalGains(args: Record<string, unknown>): ToolResult {
  const purchasePrice = args.purchasePrice as number;
  const salePrice = args.salePrice as number;
  const purchaseYear = args.purchaseYear as number;
  const improvements = (args.improvements as number) || 0;
  const isMainResidence = args.isMainResidence as boolean;

  // Inflation adjustment (simplified)
  const currentYear = new Date().getFullYear();
  const yearsHeld = currentYear - purchaseYear;
  const inflationRate = 0.03; // Approximate
  const adjustedPurchase = purchasePrice * Math.pow(1 + inflationRate, yearsHeld);

  // Calculate gain
  const totalCosts = adjustedPurchase + improvements;
  const gain = salePrice - totalCosts;

  if (gain <= 0) {
    return {
      success: true,
      message: "No capital gains tax applies - no profit on sale.",
      data: { tax: 0, gain: 0 },
    };
  }

  // Exemptions
  let exemption = 0;
  if (isMainResidence) {
    exemption = Math.min(gain, 85430); // Main residence exemption
  }

  const taxableGain = Math.max(0, gain - exemption);
  const tax = taxableGain * 0.20; // 20% CGT rate

  return {
    success: true,
    message: `Capital Gains Tax calculation:\n` +
      `• Sale price: €${salePrice.toLocaleString()}\n` +
      `• Adjusted purchase: €${adjustedPurchase.toLocaleString()}\n` +
      `• Improvements: €${improvements.toLocaleString()}\n` +
      `• Gross gain: €${gain.toLocaleString()}\n` +
      (exemption > 0 ? `• Main residence exemption: -€${exemption.toLocaleString()}\n` : "") +
      `• Taxable gain: €${taxableGain.toLocaleString()}\n` +
      `• **CGT (20%): €${tax.toLocaleString()}**`,
    data: { tax, gain, taxableGain, exemption },
  };
}

/**
 * Send Email via Resend API
 * Automatically uses agent's communicationEmail - ignores any 'to' parameter from AI
 * If no attachmentUrl is provided, automatically attaches the most recent document
 */
async function handleSendEmail(
  args: Record<string, unknown>,
  agent: Agent | null,
  phoneNumber?: string
): Promise<ToolResult> {
  // ALWAYS use agent's communicationEmail - ignore any 'to' parameter
  if (!agent?.communicationEmail) {
    logger.error("No agent communicationEmail available", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Unable to send email - agent email not found. Please contact support." };
  }

  const to = agent.communicationEmail;  // Force use of agent's registered email
  const subject = String(args.subject || "");
  const body = String(args.body || "");
  let attachmentUrl = args.attachmentUrl as string | undefined;
  let attachmentName = args.attachmentName as string | undefined;
  let attachedFromLastDocument = false;

  // AUTO-ATTACH: If no explicit attachment provided, check for recently generated document
  if (!attachmentUrl && phoneNumber) {
    try {
      // Documents are saved with user_id = bare digits (e.g., "35799111668")
      // but phoneNumber here is formatted with + prefix (e.g., "+35799111668").
      // Try formatted first, then bare digits to match how saveLastDocument stores them.
      let lastDoc = await getLastDocument(phoneNumber);
      if (!lastDoc) {
        const bareDigits = phoneNumber.replace(/^\+/, "");
        lastDoc = await getLastDocument(bareDigits);
      }
      if (lastDoc) {
        // Only auto-attach if document was created within last 30 minutes
        const docAge = Date.now() - new Date(lastDoc.created_at).getTime();
        const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

        if (docAge < MAX_AGE_MS) {
          logger.info("Auto-attaching recent document to email", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            documentName: lastDoc.document_name,
            documentType: lastDoc.document_type,
            ageMinutes: Math.round(docAge / 60000),
          });
          attachmentUrl = lastDoc.document_url;
          attachmentName = lastDoc.document_name;
          attachedFromLastDocument = true;
        } else {
          logger.info("Last document too old, not auto-attaching", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            ageMinutes: Math.round(docAge / 60000),
          });
        }
      }
    } catch (err) {
      logger.warn("Failed to fetch last document for auto-attach", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue without attachment - don't block email sending
    }
  }

  // Validate email (defensive check, should always be valid from DB)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    logger.error("Invalid agent email format", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Invalid agent email format. Please contact support." };
  }

  // Get Resend API key from environment
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    logger.error("RESEND_API_KEY not set in environment", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Email service not configured. Please contact admin." };
  }

  logger.info("Sending email via Resend", {
    category: LogCategory.TOOL,
    operation: "sendEmail",
    subject,
    hasAttachment: !!attachmentUrl,
  });

  // Build email payload
  const emailPayload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    attachments?: { filename: string; content: string }[];
  } = {
    from: "SOPHIA <sofia@zyprus.com>",
    to: [to],
    subject,
    html: body.replace(/\*([^*]+)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"),
    text: body.replace(/\*([^*]+)\*/g, "$1"),
  };

  // Handle attachment if provided
  if (attachmentUrl) {
    try {
      logger.info("Fetching email attachment", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        attachmentName: attachmentName || "attachment.docx",
      });
      const attachmentResponse = await fetch(attachmentUrl);
      if (!attachmentResponse.ok) {
        logger.error("Failed to fetch email attachment", undefined, {
          category: LogCategory.TOOL,
          operation: "sendEmail",
          status: attachmentResponse.status,
        });
        return { error: `Failed to fetch attachment from URL: ${attachmentResponse.status}` };
      }
      const attachmentBuffer = await attachmentResponse.arrayBuffer();
      const attachmentBase64 = btoa(
        String.fromCharCode(...new Uint8Array(attachmentBuffer))
      );

      emailPayload.attachments = [{
        filename: attachmentName || "attachment.docx",
        content: attachmentBase64,
      }];
      logger.info("Attachment prepared for email", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        filename: attachmentName || "attachment.docx",
      });
    } catch (attachError) {
      const err = attachError instanceof Error ? attachError : new Error(String(attachError));
      logger.error("Error fetching email attachment", err, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
      });
      return { error: `Failed to process attachment: ${err.message}` };
    }
  }

  // Send via Resend API
  try {
    logger.info("Calling Resend API", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await response.text();
    logger.info("Resend API response received", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      status: response.status,
    });

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.message || errorJson.error || responseText;
      } catch {
        // Use raw text
      }
      logger.error("Resend API error", undefined, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        status: response.status,
        errorDetail: errorDetail.substring(0, 200),
      });
      return {
        error: attachmentUrl
          ? "Unable to send the email with attachment. Please try again."
          : "Unable to send the email. Please try again in a moment.",
      };
    }

    const result = JSON.parse(responseText);
    logger.info("Email sent successfully", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      emailId: result.id,
      hadAttachment: !!attachmentUrl,
      autoAttached: attachedFromLastDocument,
    });

    return {
      success: true,
      message: `✅ Sent to your email\n\nSubject: ${subject}` +
        (attachmentName ? `\nAttachment: ${attachmentName}` : ""),
      data: { emailId: result.id, subject, attachedDocument: attachedFromLastDocument ? attachmentName : undefined },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error sending email", err, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return {
      error: args.attachmentUrl
        ? "Unable to send the email with attachment. Please try again."
        : "Unable to send the email. Please try again in a moment.",
    };
  }
}

