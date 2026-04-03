import { count, desc, eq, sql } from "drizzle-orm";
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
      Number.parseInt(url.searchParams.get("limit") || "200", 10),
      500
    );

    // Get real counts from DB (not capped by limit)
    const [statsResult] = await db
      .select({
        total: count(),
        draft: count(sql`CASE WHEN ${listingUpload.status} = 'draft' THEN 1 END`),
        published: count(sql`CASE WHEN ${listingUpload.status} = 'published' THEN 1 END`),
        expired: count(sql`CASE WHEN ${listingUpload.status} = 'expired' THEN 1 END`),
      })
      .from(listingUpload);

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
      stats: {
        total: statsResult.total,
        draft: statsResult.draft,
        published: statsResult.published,
        expired: statsResult.expired,
      },
    });
  } catch (error) {
    logger.error("Failed to get admin listings", error);
    return NextResponse.json(
      { error: "Failed to get listings" },
      { status: 500 }
    );
  }
}
