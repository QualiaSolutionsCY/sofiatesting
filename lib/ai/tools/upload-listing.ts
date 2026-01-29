import { tool } from "ai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getUserContext } from "@/lib/ai/context";
import {
  getListingById,
  getListingsByUserId,
  logListingUploadAttempt,
  updateListingStatus,
} from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import {
  isPermanentError,
  uploadToZyprusAPI,
  ZyprusAPIError,
} from "@/lib/zyprus/client";

const log = logger.ai.child("upload-listing");

export const uploadListingTool = tool({
  description:
    "Upload a property listing to zyprus.com. Uploads the most recent draft if no ID specified.",
  inputSchema: z.object({
    listingId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional: Specific listing ID to upload"),
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
          error: "Authentication required to upload listing",
        };
      }

      // Get listing - either specified or most recent
      let listing: Awaited<ReturnType<typeof getListingById>> | undefined;
      if (listingId) {
        listing = await getListingById({ id: listingId });
        if (listing && listing.userId !== userId) {
          return {
            success: false,
            error: "You don't have permission to upload this listing",
          };
        }
      } else {
        const listings = await getListingsByUserId({
          userId,
          limit: 1,
        });
        listing = listings[0];
      }

      if (!listing) {
        return {
          success: false,
          error:
            "No listing found. Create a listing first by saying 'create a listing'.",
        };
      }

      // Check if already uploaded
      if (listing.status === "uploaded" || listing.status === "published") {
        return {
          success: true,
          message: `This listing is already ${listing.status}${
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
            "❌ Missing required field: locationId. Please use the getZyprusData tool to fetch available locations and update the listing with a valid location ID.",
        };
      }

      // Update to uploading status
      await updateListingStatus({ id: listing.id, status: "uploading" });

      // Upload to zyprus.com - convert nulls to undefined for optional fields
      try {
        const result = await uploadToZyprusAPI({
          ...listing,
          // Required location
          locationId: listing.locationId ?? undefined,
          // Property classification
          propertyTypeId: listing.propertyTypeId ?? undefined,
          listingTypeId: listing.listingTypeId ?? undefined,
          propertyStatusId: listing.propertyStatusId ?? undefined,
          // Features
          indoorFeatureIds: listing.indoorFeatureIds ?? undefined,
          outdoorFeatureIds: listing.outdoorFeatureIds ?? undefined,
          viewIds: listing.viewIds ?? undefined,
          // Price and title
          priceModifierId: listing.priceModifierId ?? undefined,
          titleDeedId: listing.titleDeedId ?? undefined,
          // Property details
          yearBuilt: listing.yearBuilt ?? undefined,
          energyClass: listing.energyClass ?? undefined,
          videoUrl: listing.videoUrl ?? undefined,
          referenceId: listing.referenceId ?? undefined,
          phoneNumber: listing.phoneNumber ?? undefined,
          propertyNotes: listing.propertyNotes ?? undefined,
          // AI tracking
          chatId: listing.chatId ?? undefined,
          duplicateDetected: listing.duplicateDetected ?? undefined,
          // Use coordinates from the listing if available, or extract from address
          ...(listing.coordinates && {
            address: {
              ...(listing.address as any),
              geo: {
                latitude: listing.coordinates.latitude,
                longitude: listing.coordinates.longitude,
              },
            },
          }),
        } as any);
        const durationMs = Date.now() - startTime;

        // Success - update status
        await updateListingStatus({
          id: listing.id,
          status: "uploaded",
          zyprusListingId: result.listingId,
          zyprusListingUrl: result.listingUrl,
          publishedAt: new Date(),
        });

        // Log successful attempt
        await logListingUploadAttempt({
          listingId: listing.id,
          attemptNumber: 1,
          status: "success",
          durationMs,
        });

        return {
          success: true,
          message: `🎉 **Listing Published Successfully!**

Property: ${listing.name}
Zyprus Listing ID: #${result.listingId}
View online: ${result.listingUrl}

Your property is now live on zyprus.com!`,
        };
      } catch (uploadError) {
        const durationMs = Date.now() - startTime;
        const errorMessage =
          uploadError instanceof Error ? uploadError.message : "Unknown error";
        const errorCode =
          uploadError instanceof ZyprusAPIError ? uploadError.code : "UNKNOWN";

        // Log failed attempt
        await logListingUploadAttempt({
          listingId: listing.id,
          attemptNumber: 1,
          status: "failed",
          errorMessage,
          errorCode,
          durationMs,
        });

        // Update status to failed or draft based on error type
        const newStatus =
          uploadError instanceof ZyprusAPIError && isPermanentError(uploadError)
            ? "failed"
            : "draft";

        await updateListingStatus({ id: listing.id, status: newStatus });

        return {
          success: false,
          error: `❌ Upload failed: ${errorMessage}\n\nThe listing has been saved. You can retry by saying "upload listing" again.`,
        };
      }
    } catch (error) {
      log.error("Error uploading listing", error);
      return {
        success: false,
        error: "Failed to process upload. Please try again.",
      };
    }
  },
});
