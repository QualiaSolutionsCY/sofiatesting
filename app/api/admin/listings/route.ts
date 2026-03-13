import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { listingUpload } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:listings");

/**
 * GET /api/admin/listings - Get all listing uploads for admin review
 * Queries listing_uploads table (populated by sophia-bot WhatsApp flow)
 * Requires admin role
 */
export async function GET(req: Request) {
  try {
    const adminCheck = await checkAdminAuth();

    if (!adminCheck.isAdmin) {
      return NextResponse.json(
        { error: adminCheck.error || "Admin access required" },
        { status: adminCheck.userId ? 403 : 401 }
      );
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(
      Number.parseInt(url.searchParams.get("limit") || "50", 10),
      200
    );

    let query = db
      .select()
      .from(listingUpload)
      .orderBy(desc(listingUpload.createdAt))
      .limit(limit);

    if (status) {
      query = query.where(eq(listingUpload.status, status)) as typeof query;
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
