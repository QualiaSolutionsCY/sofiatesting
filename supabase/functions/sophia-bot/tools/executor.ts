/**
 * Tool Executor
 * Executes tool calls from OpenRouter and returns results
 */

import { Agent } from "../agents/identifier.ts";
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
import { logger, LogCategory } from "../utils/logger.ts";
import { classifyError, getUserFriendlyMessage, ErrorType } from "../utils/error-mapper.ts";
import { trackToolUsed, trackPropertyUploaded, trackDocumentGenerated, createTimer } from "../services/analytics.ts";
import { getLastDocument } from "../../_shared/db.ts";
import { DEFAULT_COORDINATES, UPLOAD_LOCK_DURATION_MS } from "../config/business-rules.ts";

// In-memory upload lock to prevent parallel uploads from same user
// Key: phone number, Value: timestamp of last upload attempt
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
 * Check if an upload lock exists for this agent (prevents parallel uploads)
 */
function checkUploadLock(agentPhone: string): { locked: boolean; remainingSeconds?: number } {
  const lastUpload = uploadLocks.get(agentPhone);
  if (!lastUpload) {
    return { locked: false };
  }

  const elapsed = Date.now() - lastUpload;
  if (elapsed < UPLOAD_LOCK_DURATION_MS) {
    const remaining = Math.ceil((UPLOAD_LOCK_DURATION_MS - elapsed) / 1000);
    return { locked: true, remainingSeconds: remaining };
  }

  // Lock expired, remove it
  uploadLocks.delete(agentPhone);
  return { locked: false };
}

/**
 * Set upload lock for this agent
 */
function setUploadLock(agentPhone: string): void {
  uploadLocks.set(agentPhone, Date.now());
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

  // 1.5 CRITICAL: Check upload lock to prevent parallel uploads (e.g., when user sends multiple photos)
  const lockCheck = checkUploadLock(agent.mobile || agent.fullName);
  if (lockCheck.locked) {
    logger.warn("Upload blocked by lock - parallel upload in progress", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      agentName: agent.fullName,
      remainingSeconds: lockCheck.remainingSeconds,
    });
    return {
      needsInput: true,
      question: `I'm already processing an upload for this property. Please wait ${lockCheck.remainingSeconds} seconds before trying again, or if you'd like to upload a different property, please let me know.`,
    };
  }

  // Set lock immediately to prevent parallel webhook calls
  setUploadLock(agent.mobile || agent.fullName);

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
      question: `I need at least ${imageCheck.required} images for a ${args.propertyType}. You've provided ${imageCheck.provided}. Please send more photos.`,
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

  // 9a. Resolve coordinates for Google Maps link in My Notes
  const resolvedCoordinates = (args.coordinates as { lat: number; lon: number } | undefined) ||
    // Fallback: use default coordinates based on location name
    // IMPORTANT: Find the MOST SPECIFIC match (longest matching key)
    (() => {
      const locationLower = location.toLowerCase();
      let bestMatch: { key: string; coords: { lat: number; lon: number } } | null = null;

      for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
        if (locationLower.includes(key)) {
          // Keep the longest matching key (most specific)
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
  });

  // 11. Build AI message content (for My Notes - includes how listing was created)
  let aiMessageContent: string | null = null;
  if (duplicates.isDuplicate) {
    aiMessageContent = generateDuplicateWarning(duplicates.potentialMatches);
  } else if (args.specialNotes) {
    aiMessageContent = `Agent notes: ${args.specialNotes}`;
  }

  // 12. Generate My Notes (with listing owner, reviewer, AI message - all in one place)
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
  const aiNotes = generateAIAssistantNotes(
    `${listingType === "rent" ? "Rental" : "Sale"} listing from WhatsApp`,
    args.propertyType as string,
    (args.features as string[]) || [],
    args.specialNotes as string | undefined
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
    kitchens: args.kitchens as number | undefined,
    livingRooms: args.livingRooms as number | undefined,
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
    // For Own Reference ID: Owner - {Agent} - {Seller} - {Phone} - {Email}
    agentName: agent.fullName,
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
      const lastDoc = await getLastDocument(phoneNumber);
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

