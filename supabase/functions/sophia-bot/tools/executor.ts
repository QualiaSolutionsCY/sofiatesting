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
  const DEFAULT_COORDINATES: Record<string, { lat: number; lon: number }> = {
    "limassol": { lat: 34.6841, lon: 33.0413 },
    "paphos": { lat: 34.7720, lon: 32.4297 },
    "pafos": { lat: 34.7720, lon: 32.4297 },
    "nicosia": { lat: 35.1856, lon: 33.3823 },
    "larnaca": { lat: 34.9229, lon: 33.6233 },
    "famagusta": { lat: 35.1174, lon: 33.9417 },
    "ammochostos": { lat: 35.1174, lon: 33.9417 },
    "paralimni": { lat: 35.0385, lon: 33.9823 },
    "ayia napa": { lat: 34.9869, lon: 34.0028 },
    "protaras": { lat: 35.0112, lon: 34.0583 },
    "polis": { lat: 35.0347, lon: 32.4275 },
    "coral bay": { lat: 34.8409, lon: 32.3547 },
    "kato paphos": { lat: 34.7542, lon: 32.4139 },
    "tala": { lat: 34.8475, lon: 32.4297 },
    "chloraka": { lat: 34.7933, lon: 32.4083 },
    "potamos germasogeias": { lat: 34.6970, lon: 33.0870 },
    "germasogeia": { lat: 34.6970, lon: 33.0870 },
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
  const imageUrls = (args.imageUrls as string[]) || [];
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
    features: args.features as string[] | undefined,
    price: args.price as number,
    yearBuilt: args.yearBuilt as number | undefined,
    floor: args.floor as string | undefined,
  });

  // 11. Generate My Notes
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
    }
  );

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
    aiMessage: duplicates.isDuplicate ? generateDuplicateWarning(duplicates.potentialMatches) : null,
    coordinates: (args.coordinates as { lat: number; lon: number } | undefined) ||
      // Fallback: use default coordinates based on location name
      (() => {
        const locationLower = location.toLowerCase();
        for (const [key, coords] of Object.entries(DEFAULT_COORDINATES)) {
          if (locationLower.includes(key)) {
            console.log(`[ToolExecutor] Using default coordinates for "${key}": ${coords.lat}, ${coords.lon}`);
            return coords;
          }
        }
        return undefined;
      })(),
    });
    console.log("[ToolExecutor] Draft listing created successfully:", result.listingId);
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

