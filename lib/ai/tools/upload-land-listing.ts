import { tool } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserContext } from "@/lib/ai/context";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai:upload-land-listing");

import {
  getLandListingById,
  getLandListingsByUserId,
  updateLandListingStatus,
} from "@/lib/db/queries";
import {
  isPermanentError,
  uploadLandToZyprusAPI,
  ZyprusAPIError,
} from "@/lib/zyprus/client";

export const uploadLandListingTool = tool({
  description:
    "Upload a land listing to zyprus.com. Uploads the most recent land draft if no ID specified.",
  inputSchema: z.object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional: Specific land listing ID to upload"),
  }),
  execute: async ({ listingId }) => {
    const startTime = Date.now();

    try {
      // Get session for user authentication (web) or context (WhatsApp/Telegram)
      const session = await auth();
      const context = getUserContext();
      const userId = session?.user?.id ?? context?.user.id;

      if (!userId) {
        return {
          success: false,
          error: "Authentication required to upload land listing",
        };
      }

      // Get land listing - either specified or most recent
      let listing: Awaited<ReturnType<typeof getLandListingById>> | undefined;
      if (listingId) {
        listing = await getLandListingById({ id: listingId });
        if (listing && listing.userId !== userId) {
          return {
            success: false,
            error: "You don't have permission to upload this land listing",
          };
        }
      } else {
        const listings = await getLandListingsByUserId({
          userId,
          limit: 1,
        });
        listing = listings[0];
      }

      if (!listing) {
        return {
          success: false,
          error:
            "No land listing found. Create a land listing first by saying 'create a land listing'.",
        };
      }

      // Check if already uploaded
      if (listing.status === "uploaded" || listing.status === "published") {
        return {
          success: true,
          message: `This land listing is already ${listing.status}${
            listing.zyprusListingUrl
              ? `\nView online: ${listing.zyprusListingUrl}`
              : ""
          }`,
        };
      }

      // Validate required fields before upload
      if (!listing.locationId) {
        return {
          success: false,
          error:
            "Missing required field: locationId. Please use the getZyprusData tool to fetch available locations and update the listing.",
        };
      }

      if (!listing.landTypeId) {
        return {
          success: false,
          error:
            "Missing required field: landTypeId. Please use the getZyprusData tool with resourceType='all_land' to fetch available land types.",
        };
      }

      if (!listing.listingTypeId) {
        return {
          success: false,
          error:
            "Missing required field: listingTypeId. Please use the getZyprusData tool to fetch available listing types.",
        };
      }

      // Update to uploading status
      await updateLandListingStatus({ id: listing.id, status: "uploading" });

      // Upload to zyprus.com
      try {
        const result = await uploadLandToZyprusAPI({
          title: listing.name,
          description: listing.description,
          price: Number(listing.price),
          landSize: Number(listing.landSize),
          landTypeId: listing.landTypeId,
          locationId: listing.locationId,
          listingTypeId: listing.listingTypeId,
          // Building permissions
          buildingDensity: listing.buildingDensity
            ? Number(listing.buildingDensity)
            : undefined,
          siteCoverage: listing.siteCoverage
            ? Number(listing.siteCoverage)
            : undefined,
          maxFloors: listing.maxFloors ?? undefined,
          maxHeight: listing.maxHeight ? Number(listing.maxHeight) : undefined,
          // Features
          infrastructureIds: listing.infrastructureIds ?? undefined,
          viewIds: listing.viewIds ?? undefined,
          // Taxonomy
          priceModifierId: listing.priceModifierId ?? undefined,
          titleDeedId: listing.titleDeedId ?? undefined,
          // Location
          coordinates: listing.coordinates ?? undefined,
          // AI tracking
          chatId: listing.chatId ?? undefined,
          duplicateDetected: listing.duplicateDetected ?? undefined,
          // Metadata
          referenceId: listing.referenceId ?? undefined,
          phoneNumber: listing.phoneNumber ?? undefined,
          notes: listing.notes ?? undefined,
          // Images
          images: listing.image ?? [],
        });

        const durationMs = Date.now() - startTime;

        // Success - update status
        await updateLandListingStatus({
          id: listing.id,
          status: "uploaded",
          zyprusListingId: result.listingId,
          zyprusListingUrl: result.listingUrl,
          publishedAt: new Date(),
        });

        logger.info(`Successfully uploaded in ${durationMs}ms`, {
          listingId: listing.id,
          zyprusId: result.listingId,
        });

        return {
          success: true,
          message: `🎉 **Land Listing Published Successfully!**

Property: ${listing.name}
Zyprus Listing ID: #${result.listingId}
View online: ${result.listingUrl}

Your land listing is now live on zyprus.com!`,
        };
      } catch (uploadError) {
        const durationMs = Date.now() - startTime;
        const errorMessage =
          uploadError instanceof Error ? uploadError.message : "Unknown error";
        const errorCode =
          uploadError instanceof ZyprusAPIError ? uploadError.code : "UNKNOWN";

        logger.error(`Upload failed after ${durationMs}ms`, {
          listingId: listing.id,
          errorCode,
          errorMessage,
        });

        // Update status to failed or draft based on error type
        const newStatus =
          uploadError instanceof ZyprusAPIError && isPermanentError(uploadError)
            ? "failed"
            : "draft";

        await updateLandListingStatus({ id: listing.id, status: newStatus });

        return {
          success: false,
          error: `Upload failed: ${errorMessage}\n\nThe listing has been saved. You can retry by saying "upload land listing" again.`,
        };
      }
    } catch (error) {
      logger.error("Error uploading land listing", error);
      return {
        success: false,
        error: "Failed to process upload. Please try again.",
      };
    }
  },
});
