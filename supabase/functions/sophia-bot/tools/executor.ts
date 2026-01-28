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

// In-memory upload lock to prevent parallel uploads from same user
// Key: phone number, Value: timestamp of last upload attempt
const uploadLocks = new Map<string, number>();
const UPLOAD_LOCK_DURATION_MS = 30000; // 30 seconds

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
 * Execute a tool call
 */
export async function executeTool(
  tool: ToolCall,
  agent: Agent | null,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ToolResult> {
  console.log(`[ToolExecutor] Executing: ${tool.name}`);

  try {
    switch (tool.name) {
      case "createPropertyListing":
        return await handleCreatePropertyListing(tool.arguments, agent, supabaseUrl, supabaseKey);

      case "getZyprusData":
        return await handleGetZyprusData(tool.arguments);

      case "calculateVAT":
        return handleCalculateVAT(tool.arguments);

      case "calculateTransferFees":
        return handleCalculateTransferFees(tool.arguments);

      case "calculateCapitalGains":
        return handleCalculateCapitalGains(tool.arguments);

      case "sendEmail":
        return await handleSendEmail(tool.arguments, agent);

      default:
        return { error: `Unknown tool: ${tool.name}` };
    }
  } catch (error) {
    if (error instanceof RejectionError) {
      return { error: error.message };
    }
    // Enhanced error logging for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[ToolExecutor] Error in ${tool.name}:`, {
      message: errorMessage,
      stack: errorStack,
      error,
    });
    // Include more detail in the returned error for debugging
    return { error: `Tool execution failed: ${errorMessage}` };
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
  console.log("[ToolExecutor] handleCreatePropertyListing called with args:", JSON.stringify(args).substring(0, 500));

  // 1. Check if agent is identified
  if (!agent) {
    console.log("[ToolExecutor] No agent identified");
    return handleUnknownSender();
  }

  console.log("[ToolExecutor] Agent identified:", agent.fullName, agent.region);

  // 1.5 CRITICAL: Check upload lock to prevent parallel uploads (e.g., when user sends multiple photos)
  const lockCheck = checkUploadLock(agent.mobile || agent.fullName);
  if (lockCheck.locked) {
    console.log(`[ToolExecutor] Upload blocked by lock - another upload in progress for ${agent.fullName}`);
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

  // Default city coordinates for Cyprus locations (fallback if AI doesn't provide coordinates)
  // Note: These are approximate area centers, not exact addresses
  const DEFAULT_COORDINATES: Record<string, { lat: number; lon: number }> = {
    // Main cities
    "limassol": { lat: 34.6841, lon: 33.0413 },
    "paphos": { lat: 34.7720, lon: 32.4297 },
    "pafos": { lat: 34.7720, lon: 32.4297 },
    "nicosia": { lat: 35.1856, lon: 33.3823 },
    "larnaca": { lat: 34.9229, lon: 33.6233 },
    "famagusta": { lat: 35.1174, lon: 33.9417 },
    "ammochostos": { lat: 35.1174, lon: 33.9417 },
    // Paphos district
    "peyia": { lat: 34.8846, lon: 32.3859 },
    "pegeia": { lat: 34.8846, lon: 32.3859 },
    "tala": { lat: 34.8475, lon: 32.4297 },
    "chloraka": { lat: 34.7933, lon: 32.4083 },
    "kato paphos": { lat: 34.7542, lon: 32.4139 },
    "paphos city center": { lat: 34.7750, lon: 32.4220 },
    "paphos city centre": { lat: 34.7750, lon: 32.4220 },
    "paphos city": { lat: 34.7750, lon: 32.4220 },
    "paphos town": { lat: 34.7750, lon: 32.4220 },
    "coral bay": { lat: 34.8409, lon: 32.3547 },
    "polis": { lat: 35.0347, lon: 32.4275 },
    "kissonerga": { lat: 34.8178, lon: 32.3897 },
    "geroskipou": { lat: 34.7589, lon: 32.4542 },
    "emba": { lat: 34.8039, lon: 32.4339 },
    "kamares": { lat: 34.8550, lon: 32.4400 },  // Kamares in Paphos area
    "sea caves": { lat: 34.8975, lon: 32.3267 },
    "tomb of kings": { lat: 34.7697, lon: 32.4039 },
    "universal": { lat: 34.7750, lon: 32.4167 },
    // Limassol district
    "germasogeia": { lat: 34.6970, lon: 33.0870 },
    "potamos germasogeias": { lat: 34.6970, lon: 33.0870 },
    "mesa geitonia": { lat: 34.6850, lon: 33.0600 },
    "agios tychonas": { lat: 34.7150, lon: 33.1283 },
    "agios athanasios": { lat: 34.6917, lon: 33.0417 },
    "panthea": { lat: 34.6933, lon: 33.0383 },
    "tourist area": { lat: 34.6900, lon: 33.0700 },
    "columbia": { lat: 34.6880, lon: 33.0550 },
    "zakaki": { lat: 34.6650, lon: 33.0100 },
    "mouttagiaka": { lat: 34.7083, lon: 33.1017 },
    "pareklisia": { lat: 34.7253, lon: 33.1556 },
    "pissouri": { lat: 34.6667, lon: 32.6983 },
    "episkopi": { lat: 34.6667, lon: 32.8867 },
    "erimi": { lat: 34.6683, lon: 32.9150 },
    "pyrgos": { lat: 34.7083, lon: 33.1817 },
    "limassol marina": { lat: 34.6700, lon: 33.0433 },
    "old town limassol": { lat: 34.6750, lon: 33.0417 },
    // Larnaca district
    "oroklini": { lat: 34.9603, lon: 33.6353 },
    "pervolia": { lat: 34.8317, lon: 33.5767 },
    "livadia": { lat: 34.9500, lon: 33.6267 },
    "dekelia": { lat: 35.0000, lon: 33.7200 },
    "dhekelia": { lat: 35.0000, lon: 33.7200 },
    "aradippou": { lat: 34.9500, lon: 33.5833 },
    "meneou": { lat: 34.8517, lon: 33.5833 },
    "kiti": { lat: 34.8500, lon: 33.5667 },
    // Nicosia district
    "strovolos": { lat: 35.1367, lon: 33.3353 },
    "engomi": { lat: 35.1600, lon: 33.3517 },
    "lakatamia": { lat: 35.1167, lon: 33.3000 },
    "aglantzia": { lat: 35.1533, lon: 33.3767 },
    "latsia": { lat: 35.1017, lon: 33.3633 },
    "geri": { lat: 35.0833, lon: 33.4000 },
    "dali": { lat: 35.0217, lon: 33.4217 },
    "tseri": { lat: 35.0667, lon: 33.3233 },
    "acropolis": { lat: 35.1450, lon: 33.3400 },
    // Famagusta district
    "paralimni": { lat: 35.0385, lon: 33.9823 },
    "ayia napa": { lat: 34.9869, lon: 34.0028 },
    "agia napa": { lat: 34.9869, lon: 34.0028 },
    "protaras": { lat: 35.0112, lon: 34.0583 },
    "deryneia": { lat: 35.0633, lon: 33.9567 },
    "sotira": { lat: 35.0350, lon: 33.9283 },
    "frenaros": { lat: 35.0517, lon: 33.9017 },
    "kapparis": { lat: 35.0500, lon: 34.0167 },
    "cape greco": { lat: 34.9667, lon: 34.0833 },
  };

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

  // 5.1 SECURITY: Validate assignTo is a @zyprus.com email
  if (args.assignTo) {
    const assignToEmail = (args.assignTo as string).toLowerCase().trim();
    if (!assignToEmail.endsWith("@zyprus.com")) {
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
    if (pendingImages.length > 0) {
      console.log(`[ToolExecutor] Using ${pendingImages.length} images from pending_images table (ignoring AI-provided URLs)`);
      imageUrls = pendingImages;
    } else {
      // Fallback to AI-provided URLs only if no pending images found
      const aiProvidedUrls = (args.imageUrls as string[]) || [];
      // Filter out obviously fake URLs (hallucinated by AI)
      imageUrls = aiProvidedUrls.filter(url => {
        const isFake = url.includes("images.zyprus.com") ||
                       (url.includes("ibb.co") && !url.includes("i.ibb.co")) ||
                       url.includes("placeholder") ||
                       url.includes("example.com");
        if (isFake) {
          console.warn(`[ToolExecutor] Filtering out fake/hallucinated URL: ${url}`);
        }
        return !isFake;
      });
      console.log(`[ToolExecutor] No pending images found, using ${imageUrls.length} AI-provided URLs`);
    }
  } else {
    imageUrls = (args.imageUrls as string[]) || [];
    console.log(`[ToolExecutor] No agent phone, using ${imageUrls.length} AI-provided URLs`);
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
  console.log("[ToolExecutor] Getting Zyprus config and token...");
  let config;
  let token;
  try {
    config = getZyprusConfig();
    token = await getAccessToken(config);
    console.log("[ToolExecutor] Got access token successfully");
  } catch (tokenError) {
    console.error("[ToolExecutor] Failed to get Zyprus token:", tokenError);
    return { error: `Failed to authenticate with Zyprus API: ${String(tokenError)}` };
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
    console.log(`[ToolExecutor] ${invalidImages.length} images failed validation`);
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
        console.log(`[ToolExecutor] Using default coordinates for "${bestMatch.key}": ${bestMatch.coords.lat}, ${bestMatch.coords.lon}`);
        return bestMatch.coords;
      }
      return undefined;
    })();

  // 9b. CRITICAL: Check we have at least 1 valid image AFTER validation
  // Zyprus API requires field_gallery_ to have at least 1 image
  if (validImages.length === 0) {
    const invalidDetails = invalidImages.length > 0
      ? invalidImages.map((img) => `• ${img.url.substring(0, 50)}... - ${img.error}`).join('\n')
      : "• No images were provided";
    console.error("[ToolExecutor] No valid images after validation:", invalidImages);
    return {
      error: `None of the provided images could be uploaded. The Zyprus API requires at least 1 valid image.\n\n**Image issues:**\n${invalidDetails}\n\n**Tips:**\n• Send photos directly from your phone gallery\n• Use direct image URLs (ending in .jpg, .png, etc.)\n• Avoid webpage links like ibb.co sharing pages (use i.ibb.co direct links instead)`,
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

  // 11. Generate My Notes (with listing owner and reviewer - NOT "SOPHIA AI")
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
    }
  );

  // DEBUG: Log My Notes to verify no "SOPHIA AI"
  console.log("[ToolExecutor] === MY NOTES CONTENT ===");
  console.log(myNotes);
  console.log("[ToolExecutor] === END MY NOTES ===");
  console.log("[ToolExecutor] My Notes contains 'SOPHIA AI':", myNotes.toLowerCase().includes("sophia ai"));

  // 12. Generate AI Notes
  const aiNotes = generateAIAssistantNotes(
    `${listingType === "rent" ? "Rental" : "Sale"} listing from WhatsApp`,
    args.propertyType as string,
    (args.features as string[]) || [],
    args.specialNotes as string | undefined
  );

  // 13. Create the listing
  console.log("[ToolExecutor] Creating draft listing...");
  let result;
  try {
    // Build aiMessage: include duplicate warning OR user's special notes
    let aiMessageContent: string | null = null;
    if (duplicates.isDuplicate) {
      aiMessageContent = generateDuplicateWarning(duplicates.potentialMatches);
    } else if (args.specialNotes) {
      // Per Lauren feedback Jan 2026: Include user's notes in AI Message field
      aiMessageContent = `Agent notes: ${args.specialNotes}`;
    }

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
    // For Own Reference ID: Owner - {Agent} - {Seller} - {Phone} - {Email}
    agentName: agent.fullName,
    ownerName: args.ownerName as string,
    ownerPhone: args.ownerPhone as string,
    ownerEmail: args.ownerEmail as string | undefined,
    registrationNumber: args.registrationNumber as string | undefined,
    coordinates: resolvedCoordinates,
    });
    console.log("[ToolExecutor] Draft listing created successfully:", result.listingId);

    // CRITICAL: Clear pending images after successful upload
    // This prevents the same images from being used in the next listing
    await clearPendingImages(agent.mobile);
    console.log("[ToolExecutor] Cleared pending images for:", agent.mobile);
  } catch (createError) {
    console.error("[ToolExecutor] Failed to create draft listing:", createError);
    const errorMsg = createError instanceof Error ? createError.message : String(createError);
    return { error: `Failed to create listing on Zyprus: ${errorMsg}` };
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
        return { error: `Unknown data type: ${dataType}` };
    }
  } catch (error) {
    console.error("[ToolExecutor] getZyprusData error:", error);
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
 */
async function handleSendEmail(
  args: Record<string, unknown>,
  agent: Agent | null
): Promise<ToolResult> {
  // ALWAYS use agent's communicationEmail - ignore any 'to' parameter
  if (!agent?.communicationEmail) {
    console.error("[sendEmail] No agent communicationEmail available");
    return { error: "Unable to send email - agent email not found. Please contact support." };
  }

  const to = agent.communicationEmail;  // Force use of agent's registered email
  const subject = String(args.subject || "");
  const body = String(args.body || "");
  const attachmentUrl = args.attachmentUrl as string | undefined;
  const attachmentName = args.attachmentName as string | undefined;

  // Validate email (defensive check, should always be valid from DB)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    console.error(`[sendEmail] Invalid agent email: ${to}`);
    return { error: "Invalid agent email format. Please contact support." };
  }

  // Get Resend API key from environment
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[sendEmail] RESEND_API_KEY not set in environment");
    return { error: "Email service not configured. Please contact admin." };
  }

  console.log(`[sendEmail] Sending email with subject: ${subject}`);

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
      console.log(`[sendEmail] Fetching attachment from: ${attachmentUrl}`);
      const attachmentResponse = await fetch(attachmentUrl);
      if (!attachmentResponse.ok) {
        console.error(`[sendEmail] Failed to fetch attachment: ${attachmentResponse.status}`);
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
      console.log(`[sendEmail] Attachment prepared: ${attachmentName || "attachment.docx"}`);
    } catch (attachError) {
      console.error("[sendEmail] Error fetching attachment:", attachError);
      return { error: `Failed to process attachment: ${String(attachError)}` };
    }
  }

  // Send via Resend API
  try {
    console.log("[sendEmail] Calling Resend API...");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await response.text();
    console.log(`[sendEmail] Resend response status: ${response.status}`);
    console.log(`[sendEmail] Resend response body: ${responseText}`);

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.message || errorJson.error || responseText;
      } catch {
        // Use raw text
      }
      console.error(`[sendEmail] Resend API error: ${response.status} - ${errorDetail}`);
      return { error: `Failed to send email: ${errorDetail}` };
    }

    const result = JSON.parse(responseText);
    console.log(`[sendEmail] Email sent successfully to ${to}, ID: ${result.id}`);

    return {
      success: true,
      message: `✅ Sent to your email\n\nSubject: ${subject}` +
        (attachmentName ? `\nAttachment: ${attachmentName}` : ""),
      data: { emailId: result.id, subject },
    };
  } catch (error) {
    console.error("[sendEmail] Error sending email:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { error: `Failed to send email: ${errorMsg}` };
  }
}

