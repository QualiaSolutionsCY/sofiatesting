import { tool } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserContext } from "@/lib/ai/context";
import {
  createPropertyListing,
  logListingUploadAttempt,
  updateListingDuplicateStatus,
  updateListingStatus,
} from "@/lib/db/queries";
import {
  checkForDuplicates,
  generateReferenceId,
  isPermanentError,
  uploadToZyprusAPI,
  ZyprusAPIError,
} from "@/lib/zyprus/client";

// Cyprus cities for validation
const _CYPRUS_LOCATIONS = [
  "limassol",
  "nicosia",
  "paphos",
  "larnaca",
  "famagusta",
  "protaras",
  "ayia napa",
  "polis",
  "troodos",
  "kyrenia",
];

export const createListingTool = tool({
  description:
    "Create a property listing draft for zyprus.com with all required property details. Use getZyprusData tool first to get valid location UUIDs, property type UUIDs, and feature UUIDs from zyprus.com. Do not guess UUIDs - always fetch them from the API first.",
  inputSchema: z.object({
    name: z
      .string()
      .min(10)
      .max(200)
      .describe("Property title (e.g., 'Luxury Villa in Limassol')"),
    description: z
      .string()
      .min(20)
      .max(2000)
      .describe("Detailed property description"),
    locationId: z
      .string()
      .uuid()
      .describe(
        "Location UUID from zyprus.com (required). Use getZyprusData tool to fetch available locations first."
      ),
    propertyTypeId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Property type UUID from zyprus.com. Use getZyprusData tool to fetch available property types."
      ),
    price: z
      .number()
      .positive()
      .max(100_000_000)
      .describe("Price in Euros (e.g., 500000)"),
    bedrooms: z
      .number()
      .int()
      .positive()
      .min(1)
      .max(20)
      .describe("Number of bedrooms"),
    bathrooms: z
      .number()
      .positive()
      .min(0.5)
      .max(10)
      .describe("Number of bathrooms (can be decimal like 2.5)"),
    squareFootage: z
      .number()
      .positive()
      .min(10)
      .max(10_000)
      .describe("Property size in square meters"),
    indoorFeatureIds: z
      .array(z.string().uuid())
      .optional()
      .describe(
        "Indoor feature UUIDs from zyprus.com. Use getZyprusData tool to fetch available indoor features."
      ),
    outdoorFeatureIds: z
      .array(z.string().uuid())
      .optional()
      .describe(
        "Outdoor feature UUIDs from zyprus.com. Use getZyprusData tool to fetch available outdoor features."
      ),
    priceModifierId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Price modifier UUID from zyprus.com (e.g., 'Guide Price'). Use getZyprusData tool to fetch options."
      ),
    titleDeedId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Title deed UUID from zyprus.com. Use getZyprusData tool to fetch available title deed types."
      ),
    listingTypeId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Listing type UUID (For Sale, For Rent, Exchange). Use getZyprusData tool to fetch options."
      ),
    propertyStatusId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Property status UUID (Resale, New Build, Off Plan, Under Construction). Use getZyprusData tool."
      ),
    viewIds: z
      .array(z.string().uuid())
      .optional()
      .describe(
        "Property view UUIDs (Sea View, Mountain View, City View, etc.). Use getZyprusData tool."
      ),
    yearBuilt: z
      .number()
      .int()
      .min(1900)
      .max(2030)
      .optional()
      .describe("Year the property was built (e.g., 2020)"),
    energyClass: z
      .string()
      .max(5)
      .optional()
      .describe("Energy efficiency rating (A+, A, B, C, D, E, F, G)"),
    videoUrl: z
      .string()
      .url()
      .optional()
      .describe("Property video URL (YouTube, Vimeo, etc.)"),
    referenceId: z
      .string()
      .max(50)
      .optional()
      .describe("Your internal reference number for this property"),
    coordinates: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional()
      .describe("GPS coordinates of the property (latitude, longitude)"),
    features: z
      .array(z.string())
      .optional()
      .describe("[DEPRECATED] Use indoorFeatureIds/outdoorFeatureIds instead"),
    imageUrls: z
      .array(z.string().url())
      .min(1, "At least one property image is required for Zyprus listings")
      .describe(
        "Property image URLs (REQUIRED - at least 1 image). Use chat uploads or external URLs."
      ),
    // New REQUIRED fields for Zyprus workflow (Nov 2025 requirements)
    ownerName: z
      .string()
      .min(2)
      .max(256)
      .describe("Property owner or listing agent name (REQUIRED)"),
    ownerPhone: z
      .string()
      .min(8)
      .max(64)
      .describe(
        "Owner/agent phone number (REQUIRED) - for back office contact"
      ),
    ownerEmail: z
      .string()
      .email()
      .optional()
      .describe("Owner/agent email address for reference ID generation"),
    titleDeedNumber: z
      .string()
      .max(50)
      .optional()
      .describe(
        "Title deed registration number from property documents (for reference ID and duplicate detection)"
      ),
    swimmingPool: z
      .enum(["private", "communal", "none"])
      .describe(
        "Swimming pool status (REQUIRED) - private pool, communal pool, or no pool"
      ),
    hasParking: z.boolean().describe("Does property have parking? (REQUIRED)"),
    hasAirConditioning: z
      .boolean()
      .describe(
        "Does property have air conditioning or AC provisions? (REQUIRED)"
      ),
    // Optional additional fields
    backofficeNotes: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Notes for the review team - viewing schedule, tenant status, special instructions"
      ),
    googleMapsUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "Google Maps link with pin on the property for exact location verification"
      ),
    verandaArea: z
      .number()
      .positive()
      .max(500)
      .optional()
      .describe(
        "Veranda/outdoor covered area in square meters (deprecated - use coveredVeranda)"
      ),
    coveredVeranda: z
      .number()
      .positive()
      .max(500)
      .optional()
      .describe("Covered veranda area in square meters"),
    uncoveredVeranda: z
      .number()
      .positive()
      .max(500)
      .optional()
      .describe("Uncovered veranda area in square meters"),
    plotArea: z
      .number()
      .positive()
      .max(50_000)
      .optional()
      .describe("Total plot size in square meters (for houses/villas)"),
    storageRoom: z.boolean().optional().describe("Has storage/utility room"),
    floor: z
      .string()
      .max(50)
      .optional()
      .describe("Floor level (e.g., '1st Floor', 'Ground Floor')"),
    condition: z
      .enum(["excellent", "good", "needs_renovation"])
      .optional()
      .describe("Property condition"),
    hasElevator: z.boolean().optional().describe("Building has elevator"),
    hasTitleDeeds: z.boolean().optional().describe("Property has title deeds"),
    titleDeedDocumentUrl: z
      .string()
      .url()
      .optional()
      .describe("URL to uploaded title deed document"),
  }),
  execute: async ({
    name,
    description,
    locationId,
    propertyTypeId,
    price,
    bedrooms,
    bathrooms,
    squareFootage,
    indoorFeatureIds,
    outdoorFeatureIds,
    priceModifierId,
    titleDeedId,
    listingTypeId,
    propertyStatusId,
    viewIds,
    yearBuilt,
    energyClass,
    videoUrl,
    referenceId,
    coordinates,
    features,
    imageUrls,
    // New required fields (Nov 2025)
    ownerName,
    ownerPhone,
    ownerEmail,
    titleDeedNumber,
    swimmingPool,
    hasParking,
    hasAirConditioning,
    // New optional fields
    backofficeNotes,
    googleMapsUrl,
    verandaArea,
    coveredVeranda,
    uncoveredVeranda,
    plotArea,
    storageRoom,
    floor,
    condition,
    hasElevator,
    hasTitleDeeds,
    titleDeedDocumentUrl,
  }) => {
    try {
      // Get session for user authentication (web) or context (WhatsApp/Telegram)
      const session = await auth();
      const context = getUserContext();
      const userId = session?.user?.id ?? context?.user.id;

      if (!userId) {
        return {
          success: false,
          error: "Authentication required to create listing",
        };
      }

      // Validate required locationId
      if (!locationId) {
        return {
          success: false,
          error:
            "Location ID is required. Use the getZyprusData tool to fetch available locations first.",
        };
      }

      // Create listing directly in database with taxonomy data
      const listing = await createPropertyListing({
        userId,
        name,
        description,
        address: {
          streetAddress: "",
          addressLocality: "Cyprus", // Will be populated from locationId at upload time
          addressCountry: "CY",
          locationId, // Store location ID for upload
        },
        price: price.toString(),
        currency: "EUR",
        numberOfRooms: bedrooms,
        numberOfBathroomsTotal: bathrooms.toString(),
        floorSize: squareFootage.toString(),
        // Store taxonomy IDs for upload
        locationId,
        propertyTypeId,
        indoorFeatureIds,
        outdoorFeatureIds,
        priceModifierId,
        titleDeedId,
        // New fields for complete Zyprus API integration
        listingTypeId,
        propertyStatusId,
        viewIds,
        yearBuilt,
        energyClass,
        videoUrl,
        coordinates,
        // Deprecated: still support old text features for backward compatibility
        propertyType: "", // Deprecated field - using propertyTypeId instead
        amenityFeature: features || [],
        image: imageUrls || [], // Store image URLs
        // New REQUIRED fields for Zyprus workflow (Nov 2025)
        ownerName,
        ownerPhone,
        swimmingPool,
        hasParking,
        hasAirConditioning,
        // New optional fields (Dec 2025)
        titleDeedNumber,
        backofficeNotes,
        googleMapsUrl,
        verandaArea,
        coveredVeranda,
        uncoveredVeranda,
        plotArea,
        storageRoom,
        floor,
        condition,
        hasElevator,
        hasTitleDeeds,
        titleDeedDocumentUrl,
        // Auto-generate reference ID if not provided
        referenceId:
          referenceId ||
          generateReferenceId({
            ownerPhone,
            ownerEmail,
            titleDeedNumber,
          }),
        // Listing goes to draft for review - NOT auto-uploaded
        status: "draft",
        reviewStatus: "pending", // Requires reviewer approval
        draftExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // Check for duplicate listings in Zyprus API
      let duplicateWarning: string | null = null;
      try {
        const duplicateCheck = await checkForDuplicates("property", {
          referenceId: listing.referenceId || undefined,
          locationId,
          price,
          title: name,
        });

        if (duplicateCheck.exists && duplicateCheck.matches.length > 0) {
          // Flag the listing as potential duplicate
          const matchInfo = duplicateCheck.matches
            .slice(0, 3)
            .map((m) => `• "${m.title}" - ${m.url}`)
            .join("\n");

          await updateListingDuplicateStatus({
            id: listing.id,
            duplicateDetected: true,
            propertyNotes: `Potential duplicates detected:\n${matchInfo}`,
          });

          duplicateWarning = `⚠️ **POTENTIAL DUPLICATE DETECTED**\n\nThis listing may already exist:\n${matchInfo}\n\nYour listing has been flagged for review. The listings team will verify this is not a duplicate.`;
        }
      } catch (err) {
        // Don't fail if duplicate check errors - just log and continue
        console.warn("Duplicate check failed:", err);
      }

      // Now automatically upload to Zyprus as DRAFT (status: false = unpublished)
      const startTime = Date.now();
      let zyprusResult: { listingId: string; listingUrl: string } | null = null;
      let uploadError: string | null = null;

      try {
        // Update to uploading status
        await updateListingStatus({ id: listing.id, status: "uploading" });

        // Upload to Zyprus API - it creates as unpublished draft (status: false)
        zyprusResult = await uploadToZyprusAPI({
          ...listing,
          name,
          description,
          price: price.toString(),
          currency: "EUR",
          numberOfRooms: bedrooms,
          numberOfBathroomsTotal: bathrooms.toString(),
          floorSize: squareFootage.toString(),
          locationId,
          propertyTypeId,
          indoorFeatureIds,
          outdoorFeatureIds,
          priceModifierId,
          titleDeedId,
          listingTypeId,
          propertyStatusId,
          viewIds,
          yearBuilt,
          energyClass,
          videoUrl,
          referenceId,
          image: imageUrls || [],
          ...(coordinates && {
            address: {
              streetAddress: "",
              addressLocality: "Cyprus",
              addressCountry: "CY",
              geo: {
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
              },
            },
          }),
        } as any);

        const durationMs = Date.now() - startTime;

        // Success - update local listing with Zyprus IDs
        await updateListingStatus({
          id: listing.id,
          status: "uploaded",
          zyprusListingId: zyprusResult.listingId,
          zyprusListingUrl: zyprusResult.listingUrl,
          publishedAt: new Date(),
        });

        // Log successful attempt
        await logListingUploadAttempt({
          listingId: listing.id,
          attemptNumber: 1,
          status: "success",
          durationMs,
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        uploadError = err instanceof Error ? err.message : "Unknown error";
        const errorCode = err instanceof ZyprusAPIError ? err.code : "UNKNOWN";

        // Log failed attempt
        await logListingUploadAttempt({
          listingId: listing.id,
          attemptNumber: 1,
          status: "failed",
          errorMessage: uploadError,
          errorCode,
          durationMs,
        });

        // Update status based on error type
        const newStatus =
          err instanceof ZyprusAPIError && isPermanentError(err)
            ? "failed"
            : "draft";
        await updateListingStatus({ id: listing.id, status: newStatus });

        console.error("Error uploading to Zyprus:", err);
      }

      // Build response message
      if (zyprusResult) {
        return {
          success: true,
          listingId: listing.id,
          zyprusListingId: zyprusResult.listingId,
          zyprusListingUrl: zyprusResult.listingUrl,
          duplicateDetected: !!duplicateWarning,
          message: `🎉 **Listing Created on Zyprus!**

📋 **Property Summary**
${name}
💰 €${price.toLocaleString()}
🛏️ ${bedrooms} bedroom${bedrooms > 1 ? "s" : ""} | 🚿 ${bathrooms} bath${bathrooms > 1 ? "s" : ""}
📐 ${squareFootage}m²
🔑 Reference: ${listing.referenceId || "Auto-generated"}

**Owner/Agent Details**
👤 ${ownerName}
📞 ${ownerPhone}

**Property Features**
🏊 Swimming Pool: ${swimmingPool === "private" ? "Private Pool" : swimmingPool === "communal" ? "Communal Pool" : "No Pool"}
🚗 Parking: ${hasParking ? "Yes" : "No"}
❄️ Air Conditioning: ${hasAirConditioning ? "Yes" : "No"}

${duplicateWarning ? `${duplicateWarning}\n\n` : ""}✅ **Uploaded to Zyprus as DRAFT**
🔗 Zyprus ID: ${zyprusResult.listingId}
🌐 View: ${zyprusResult.listingUrl}

The listing is now on zyprus.com as an **unpublished draft** waiting for admin review and publishing.`,
        };
      }
      return {
        success: false,
        listingId: listing.id,
        duplicateDetected: !!duplicateWarning,
        error: `⚠️ **Listing Saved Locally** (Upload to Zyprus failed)

📋 **Property Summary**
${name}
💰 €${price.toLocaleString()}
🛏️ ${bedrooms} bedroom${bedrooms > 1 ? "s" : ""} | 🚿 ${bathrooms} bath${bathrooms > 1 ? "s" : ""}
🔑 Reference: ${listing.referenceId || "Auto-generated"}

${duplicateWarning ? `${duplicateWarning}\n\n` : ""}❌ **Upload Error**: ${uploadError}

The listing has been saved locally and can be uploaded manually later.`,
      };
    } catch (error) {
      console.error("Error creating listing:", error);
      return {
        success: false,
        error: "Failed to create listing. Please try again.",
      };
    }
  },
});
