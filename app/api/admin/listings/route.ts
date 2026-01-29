import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { propertyListing, user } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:listings");

/**
 * GET /api/admin/listings - Get all property listings for admin review
 * Returns all listings, with optional status filter
 * Requires admin role
 */
export async function GET(req: Request) {
  try {
    // Check admin authentication
    const adminCheck = await checkAdminAuth();

    if (!adminCheck.isAdmin) {
      return NextResponse.json(
        { error: adminCheck.error || "Admin access required" },
        { status: adminCheck.userId ? 403 : 401 }
      );
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // draft, uploaded, failed
    const limit = Math.min(
      Number.parseInt(url.searchParams.get("limit") || "50", 10),
      200
    );

    // Build query
    let query = db
      .select({
        id: propertyListing.id,
        name: propertyListing.name,
        description: propertyListing.description,
        price: propertyListing.price,
        currency: propertyListing.currency,
        propertyType: propertyListing.propertyType,
        status: propertyListing.status,
        reviewStatus: propertyListing.reviewStatus,
        zyprusListingId: propertyListing.zyprusListingId,
        zyprusListingUrl: propertyListing.zyprusListingUrl,
        createdAt: propertyListing.createdAt,
        updatedAt: propertyListing.updatedAt,
        address: propertyListing.address,
        numberOfRooms: propertyListing.numberOfRooms,
        numberOfBathroomsTotal: propertyListing.numberOfBathroomsTotal,
        floorSize: propertyListing.floorSize,
        ownerName: propertyListing.ownerName,
        ownerPhone: propertyListing.ownerPhone,
        swimmingPool: propertyListing.swimmingPool,
        hasParking: propertyListing.hasParking,
        hasAirConditioning: propertyListing.hasAirConditioning,
        backofficeNotes: propertyListing.backofficeNotes,
        googleMapsUrl: propertyListing.googleMapsUrl,
        reviewNotes: propertyListing.reviewNotes,
        userId: propertyListing.userId,
        userEmail: user.email,
        // Additional fields for reference ID, AI notes, and duplicate detection
        referenceId: propertyListing.referenceId,
        propertyNotes: propertyListing.propertyNotes,
        duplicateDetected: propertyListing.duplicateDetected,
      })
      .from(propertyListing)
      .leftJoin(user, eq(propertyListing.userId, user.id))
      .orderBy(desc(propertyListing.createdAt))
      .limit(limit);

    // Apply status filter if provided
    if (status) {
      query = query.where(eq(propertyListing.status, status)) as typeof query;
    }

    const listings = await query;

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length,
    });
  } catch (error) {
    logger.error("Failed to get admin listings", error);
    return NextResponse.json(
      { error: "Failed to get listings" },
      { status: 500 }
    );
  }
}
