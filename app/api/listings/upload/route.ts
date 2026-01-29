import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { checkAdminAuth } from "@/lib/auth/admin";
import {
  getListingById,
  logListingUploadAttempt,
  updateListingStatus,
} from "@/lib/db/queries";
import { createLogger } from "@/lib/logger";
import {
  isPermanentError,
  uploadToZyprusAPI,
  ZyprusAPIError,
} from "@/lib/zyprus/client";

const logger = createLogger("api:listings:upload");

const uploadListingSchema = z.object({
  listingId: z.string().uuid(),
});

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { listingId } = uploadListingSchema.parse(body);

    // Get the listing
    const listing = await getListingById({ id: listingId });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    // Check ownership OR admin role
    const adminCheck = await checkAdminAuth();
    if (listing.userId !== session.user.id && !adminCheck.isAdmin) {
      return NextResponse.json(
        { error: "Not authorized to upload this listing" },
        { status: 403 }
      );
    }

    // Check if already uploaded
    if (listing.status === "uploaded" || listing.status === "published") {
      return NextResponse.json({
        success: true,
        message: "Listing already uploaded",
        listingId: listing.zyprusListingId,
        listingUrl: listing.zyprusListingUrl,
      });
    }

    // Update status to uploading
    await updateListingStatus({
      id: listingId,
      status: "uploading",
    });

    try {
      // Upload to Zyprus - convert nulls to undefined for optional fields
      const { listingId: zyprusId, listingUrl } = await uploadToZyprusAPI({
        ...listing,
        locationId: listing.locationId ?? undefined,
        propertyTypeId: listing.propertyTypeId ?? undefined,
        indoorFeatureIds: listing.indoorFeatureIds ?? undefined,
        outdoorFeatureIds: listing.outdoorFeatureIds ?? undefined,
        priceModifierId: listing.priceModifierId ?? undefined,
        titleDeedId: listing.titleDeedId ?? undefined,
      } as any);

      // Update status to uploaded
      await updateListingStatus({
        id: listingId,
        status: "uploaded",
        zyprusListingId: zyprusId,
        zyprusListingUrl: listingUrl,
        publishedAt: new Date(),
      });

      // Log successful attempt
      await logListingUploadAttempt({
        listingId,
        attemptNumber: 1,
        status: "success",
        durationMs: Date.now() - startTime,
      });

      return NextResponse.json({
        success: true,
        listingId: zyprusId,
        listingUrl,
        message: "Property uploaded successfully",
      });
    } catch (uploadError) {
      const errorMessage =
        uploadError instanceof Error ? uploadError.message : "Unknown error";
      const errorCode =
        uploadError instanceof ZyprusAPIError ? uploadError.code : "UNKNOWN";

      // Log failed attempt
      await logListingUploadAttempt({
        listingId,
        attemptNumber: 1,
        status: "failed",
        errorMessage,
        errorCode,
        durationMs: Date.now() - startTime,
      });

      // Update status based on error type
      const newStatus =
        uploadError instanceof ZyprusAPIError && isPermanentError(uploadError)
          ? "failed"
          : "draft";

      await updateListingStatus({
        id: listingId,
        status: newStatus,
      });

      throw uploadError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data format", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof ZyprusAPIError) {
      logger.error("Zyprus API Error", error, {
        code: error.code,
        statusCode: error.statusCode,
      });
      const statusCode = error.statusCode || 500;
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.message,
          statusCode,
        },
        { status: statusCode }
      );
    }

    logger.error("Failed to upload listing", error);
    return NextResponse.json(
      { error: "Failed to upload listing" },
      { status: 500 }
    );
  }
}
