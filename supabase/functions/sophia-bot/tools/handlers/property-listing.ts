/**
 * Property Listing Handler
 * Orchestrates property listing creation by coordinating validation, image processing, and content generation
 */

import { trackListingUpload } from "../../../_shared/db.ts";
import { type Agent } from "../../agents/identifier.ts";
import { DEFAULT_COORDINATES } from "../../config/business-rules.ts";
import { classifyError, ErrorType } from "../../utils/error-mapper.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import {
  createDraftListing,
  getAccessToken,
  getZyprusConfig,
} from "../../zyprus/client.ts";
import { findLocationUuid } from "../../zyprus/taxonomy-cache.ts";
import {
  type ToolResult,
  type ValidatedFields,
  validateAndPrepareFields,
} from "./field-validation.ts";
import { processListingImages } from "./image-processor.ts";
import { generateListingContent } from "./notes-generator.ts";
import {
  generateImageWarnings,
  hasEnoughImages,
  processImages,
  validateImages,
} from "../../services/image-handler.ts";
import { checkForDuplicates } from "../../services/duplicate-checker.ts";
import {
  clearPendingImages,
} from "../../services/pending-images.ts";
import {
  clearPendingDocuments,
} from "../../services/pending-documents.ts";
import { releaseUploadLock } from "../validators/upload-lock.ts";

// Re-export ToolResult for external consumers
export type { ToolResult };

/**
 * Handle property listing creation
 * Orchestrates field validation, image processing, content generation, and Zyprus API calls
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

  // Step 1-6b: Validate and prepare fields
  const validationResult = await validateAndPrepareFields(args, agent);

  // Early exit if validation failed
  if ("needsInput" in validationResult || "error" in validationResult) {
    return validationResult as ToolResult;
  }

  const validated = validationResult as ValidatedFields;
  const { location, listingType, locationUrl, reviewers, listingOwnerName, potentialDuplicateNote, uploadLockKey } =
    validated;

  const agentPhone = agent!.mobile?.replace(/\D/g, "") || "";

  // Step 7-7b: Process images
  const { imageUrls, titleDeedImageUrls, floorPlanUrls, documentUrls, otherDocumentUrls } =
    await processListingImages(args, agentPhone);

  const processedImages = await processImages(imageUrls);

  // Check minimum images (sync)
  const imageCheck = hasEnoughImages(
    processedImages,
    args.propertyType as string
  );
  if (!imageCheck.enough) {
    // Release the upload lock since we're not proceeding with upload
    if (uploadLockKey) {
      await releaseUploadLock(uploadLockKey).catch(() => {});
    }
    return {
      needsInput: true,
      question: `I need at least ${imageCheck.required} ${imageCheck.required === 1 ? "image" : "images"} for a ${args.propertyType}. You've provided ${imageCheck.provided}. Please send more photos.`,
    };
  }

  // Step 8: Get Zyprus config and access token
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

  // Step 9a-9b: Parallel operations
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

  // Step 9b: Resolve coordinates
  const resolvedCoordinates =
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

  // Check we have at least 1 valid image
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

    // Release the upload lock since we're not proceeding
    if (uploadLockKey) {
      await releaseUploadLock(uploadLockKey).catch(() => {});
    }

    return {
      error:
        "None of the images could be uploaded.\n\n" +
        (invalidDetails ? `Issues:\n${invalidDetails}\n\n` : "") +
        "Please send photos directly from your phone gallery, or use direct image URLs.",
    };
  }

  // Step 9c: VAT safeguard
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

  // Step 9d: Auto-inject roof garden for penthouses
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

  // Step 9e: Auto-inject pool feature
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
  if (poolType) {
    // Always strip any existing pool-related features first
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

    // Only add pool feature for actual pool types (NOT "none")
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
      case "none":
        // Explicitly no pool — don't add anything
        break;
    }
    logger.info("Auto-injected pool feature based on poolType", {
      category: LogCategory.TOOL,
      operation: "createPropertyListing",
      poolType,
    });
  }

  // Step 9f: Auto-inject parking feature based on parkingType
  // BUG FIX: parkingType was going to description text but NOT to Zyprus feature checkboxes
  const parkingTypeArg = args.parkingType as string | undefined;
  if (parkingTypeArg && parkingTypeArg !== "none") {
    const parkingFeatureMap: Record<string, string> = {
      garage: "single garage",
      covered: "covered parking",
      open: "uncovered parking",
      carport: "carport",
    };
    const parkingFeature = parkingFeatureMap[parkingTypeArg];
    if (parkingFeature) {
      const hasParkingFeature = effectiveFeatures.some((f) => {
        const lower = f.toLowerCase();
        return (
          lower.includes("parking") ||
          lower.includes("garage") ||
          lower.includes("carport")
        );
      });
      if (!hasParkingFeature) {
        effectiveFeatures.push(parkingFeature);
        logger.info("Auto-injected parking feature based on parkingType", {
          category: LogCategory.TOOL,
          operation: "createPropertyListing",
          parkingType: parkingTypeArg,
          feature: parkingFeature,
        });
      }
    }
  }

  // Step 9g: Auto-inject implied features for 4+ bedroom houses
  // BUG FIX: description-generator adds "Office/Playroom" text for large properties
  // but it wasn't being added to the Zyprus feature checkboxes
  const totalBeds =
    (args.bedrooms as number) +
    ((args.basementRooms as number) || 0) +
    ((args.roofRooms as number) || 0);
  if (totalBeds >= 4) {
    const typeLower = propertyTypeLower;
    const isHouseType =
      typeLower.includes("house") ||
      typeLower.includes("villa") ||
      typeLower.includes("bungalow") ||
      typeLower.includes("detached") ||
      typeLower.includes("townhouse");
    if (isHouseType) {
      const allFeaturesLower = effectiveFeatures
        .map((f) => f.toLowerCase())
        .join(" ");
      if (
        !allFeaturesLower.includes("office") &&
        !allFeaturesLower.includes("playroom")
      ) {
        effectiveFeatures.push("playroom");
        logger.info(
          "Auto-injected 'playroom' for 4+ bedroom house (implied feature)",
          {
            category: LogCategory.TOOL,
            operation: "createPropertyListing",
            totalBedrooms: totalBeds,
          }
        );
      }
    }
  }

  // Step 10-12: Generate content
  const { description, myNotes, aiAssistantNotes } =
    await generateListingContent(
      args,
      agent!,
      listingType,
      location,
      locationUrl,
      location,
      {
        reviewer1Uuid: reviewers.reviewer1Uuid,
        reviewer2Uuid: reviewers.reviewer2Uuid,
        listingOwner: reviewers.listingOwner,
        listingInstructor: reviewers.listingInstructor,
      },
      listingOwnerName,
      potentialDuplicateNote,
      validImages.map((img) => img.url),
      titleDeedImageUrls,
      floorPlanUrls,
      documentUrls,
      duplicates,
      locationResult,
      resolvedCoordinates,
      effectiveFeatures,
      poolType,
      safePriceModifier
    );

  const commercialPropertyTypes = ["building", "office", "shop", "warehouse", "hotel"];
  const isCommercialType = commercialPropertyTypes.some((t) => propertyTypeLower.includes(t));
  const bathrooms = isCommercialType
    ? (args.bathrooms as number) || 0
    : (args.bathrooms as number) || 1;

  // Step 13: Create the listing
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
      locationUuid,
      bedrooms: args.bedrooms as number,
      bathrooms,
      coveredArea: args.coveredArea as number,
      plotSize: args.plotSize as number | undefined,
      coveredVeranda: args.coveredVeranda as number | undefined,
      uncoveredVeranda: args.uncoveredVeranda as number | undefined,
      description,
      myNotes,
      aiNotes: aiAssistantNotes,
      images: validImages.map((img) => img.url),
      reviewer1: reviewers.reviewer1Uuid,
      reviewer2: reviewers.reviewer2Uuid || undefined,
      listingOwner: reviewers.listingOwner,
      listingInstructor: reviewers.listingInstructor,
      features: effectiveFeatures.length > 0 ? effectiveFeatures : undefined,
      titleDeedStatus: args.titleDeedStatus as string,
      yearBuilt: args.yearBuilt as number | undefined,
      floor: args.floor as string | undefined,
      potentialDuplicate: duplicates.isDuplicate || !!potentialDuplicateNote,
      aiMessage: null,
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
          ...(floorPlanUrls || []),
          ...((args.floorPlanUrls as string[]) || []),
        ].length > 0
          ? [
              ...(floorPlanUrls || []),
              ...((args.floorPlanUrls as string[]) || []),
            ]
          : undefined,
      titleDeedFileUrls:
        documentUrls.length > 0 ? documentUrls : undefined,
      otherDocumentUrls:
        otherDocumentUrls.length > 0 ? otherDocumentUrls : undefined,
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

    await clearPendingImages(agentPhone);
    await clearPendingDocuments(agentPhone);
    await releaseUploadLock(uploadLockKey);
    logger.info(
      "Cleared pending images/documents and released upload lock after successful upload",
      {
        category: LogCategory.IMAGE,
      }
    );

    const bedrooms = args.bedrooms as number;
    const propertyTitle = bedrooms > 0
      ? `${bedrooms} bed ${args.propertyType} in ${location}`
      : `${args.propertyType} in ${location}`;
    trackListingUpload(
      result.listingId,
      agentPhone,
      agent!.fullName,
      propertyTitle,
      result.listingUrl,
      Number(args.price) || undefined,
      Number(args.bedrooms) || undefined
    ).catch((err) =>
      logger.warn("Failed to track listing upload (non-critical)", {
        category: LogCategory.TOOL,
        error: String(err),
      })
    );
  } catch (createError) {
    await releaseUploadLock(uploadLockKey);
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

    if (errorType === ErrorType.NETWORK || errorType === ErrorType.TIMEOUT) {
      return {
        error:
          "The property listing service is temporarily slow. Please try again in a moment.",
      };
    }
    if (errorType === ErrorType.AUTH) {
      return {
        error:
          "The property upload system is temporarily unable to authenticate. This usually resolves on its own — please try again in a minute. If it persists, contact support.",
      };
    }
    const detail =
      err.message.length > 200
        ? err.message.substring(0, 200) + "..."
        : err.message;
    return { error: `Unable to create the listing: ${detail}` };
  }

  // Step 14: Build success message
  let message = `✅ I've uploaded the property as a draft listing.\n\n`;
  message += "**Summary:**\n";
  const bedroomsDisplay = (args.bedrooms as number) > 0
    ? `${args.bedrooms} bed ${args.propertyType}`
    : `${args.propertyType}`;
  message += `• Property: ${bedroomsDisplay} in ${location}\n`;
  message += `• Price: €${(args.price as number).toLocaleString()}\n`;
  message += `• Type: For ${listingType}\n`;
  message += `• Images: ${validImages.length} uploaded\n`;
  if (documentUrls.length > 0) {
    if (result.titleDeedAttached === false) {
      message += `• Title deed docs: ${documentUrls.length} uploaded but ⚠️ FAILED to attach — please add manually\n`;
    } else {
      message += `• Title deed docs: ${documentUrls.length} attached\n`;
    }
  }
  if (otherDocumentUrls.length > 0) {
    message += `• Other documents: ${otherDocumentUrls.length} attached\n`;
  }
  message += `• Listing Owner: ${listingOwnerName}\n`;
  message += `• Reviewer: ${reviewers.reviewer1Uuid}\n`;
  message += `\n🔗 **Draft URL:** ${result.listingUrl}\n`;

  if (locationUrl) {
    message += `\n📍 **Google Maps:** ${locationUrl}\n`;
  } else if (resolvedCoordinates) {
    const mapsUrl = `https://www.google.com/maps/place/${resolvedCoordinates.lat},${resolvedCoordinates.lon}`;
    message += `\n📍 **Google Maps:** ${mapsUrl}\n`;
  }

  if (
    locationResult.matchedName &&
    locationResult.matchedName.toLowerCase() !== location.toLowerCase()
  ) {
    message += `\n⚠️ **Location dropdown:** I couldn't find "${location}" in the Zyprus locations dropdown, so I set it to "${locationResult.matchedName}". Please update the location dropdown on the listing if needed.\n`;
  }

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
