/**
 * Notes Generator Module
 * Handles steps 9a.5, 10-12: AI message content building, description generation,
 * My Notes generation, AI Notes generation
 */

import { type Agent } from "../../agents/identifier.ts";
import { generateDescription } from "../../services/description-generator.ts";
import {
  createDuplicateNote,
  generateDuplicateWarning,
  type DuplicateMatch,
} from "../../services/duplicate-checker.ts";
import {
  generateAIAssistantNotes,
  generateMyNotes,
} from "../../services/my-notes-generator.ts";
import { LogCategory, logger } from "../../utils/logger.ts";

export interface ListingContent {
  description: string;
  myNotes: string;
  aiAssistantNotes: string;
}

export async function generateListingContent(
  args: Record<string, unknown>,
  agent: Agent,
  listingType: "sale" | "rent",
  location: string,
  locationUrl: string,
  streetName: string,
  reviewerInfo: {
    reviewer1Uuid: string;
    reviewer2Uuid: string | null;
    listingOwner: string;
    listingInstructor: string;
  },
  listingOwnerName: string,
  potentialDuplicateNote: string,
  imageUrls: string[],
  titleDeedImageUrls: string[],
  floorPlanUrls: string[],
  documentUrls: string[],
  duplicates: { isDuplicate: boolean; potentialMatches: DuplicateMatch[] },
  locationResult: { matchedName?: string; uuid: string },
  resolvedCoordinates: { lat: number; lon: number } | undefined,
  effectiveFeatures: string[],
  poolType: string | undefined,
  safePriceModifier: string | undefined,
): Promise<ListingContent> {
  logger.info("Content generation started", {
    category: LogCategory.TOOL,
    operation: "generateListingContent",
    listingType,
    location,
  });

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

  // 10. Generate description
  // For residential buildings, don't default bathrooms to 1 — leave as 0 if not provided
  const propertyTypeLower = ((args.propertyType as string) || "").toLowerCase();
  const isBuilding = propertyTypeLower.includes("building");
  const bathrooms = isBuilding
    ? (args.bathrooms as number) || 0
    : (args.bathrooms as number) || 1;

  // descriptionLocation always equals agent's original location (never overridden by taxonomy)
  const descriptionLocation = location;

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
      listingOwner: reviewerInfo.listingOwner,
      listingOwnerName,
      reviewer1: reviewerInfo.reviewer1Uuid,
      reviewer2: reviewerInfo.reviewer2Uuid || undefined,
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
    operation: "generateListingContent",
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

  logger.info("Content generation completed", {
    category: LogCategory.TOOL,
    operation: "generateListingContent",
    descriptionLength: description.length,
    myNotesLength: myNotes.length,
    aiNotesLength: aiNotes.length,
  });

  return {
    description,
    myNotes,
    aiAssistantNotes: aiNotes,
  };
}
