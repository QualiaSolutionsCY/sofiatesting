import { and, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { landListing, propertyListing } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("cron:cleanup");

/**
 * POST /api/cron/cleanup - Clean up expired draft listings
 *
 * This endpoint is called by Vercel Cron (configured in vercel.json)
 * Schedule: Daily at 2 AM UTC
 *
 * Security: Validates CRON_SECRET from Authorization header
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // In production, require CRON_SECRET
    if (process.env.NODE_ENV === "production") {
      if (!cronSecret) {
        logger.error("CRON_SECRET not configured");
        return NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 }
        );
      }

      if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("Invalid cron authorization attempt");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = {
      propertyListingsDeleted: 0,
      landListingsDeleted: 0,
      retentionRowsDeleted: 0,
      errors: [] as string[],
    };

    // Clean up expired property listing drafts
    try {
      const expiredPropertyListings = await db
        .update(propertyListing)
        .set({
          deletedAt: now,
        })
        .where(
          and(
            isNull(propertyListing.deletedAt),
            lt(propertyListing.draftExpiresAt, now)
          )
        )
        .returning({ id: propertyListing.id });

      results.propertyListingsDeleted = expiredPropertyListings.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Property listings cleanup failed: ${message}`);
      logger.error("Property listings cleanup error", error);
    }

    // Clean up expired land listing drafts
    try {
      const expiredLandListings = await db
        .update(landListing)
        .set({
          deletedAt: now,
        })
        .where(
          and(
            isNull(landListing.deletedAt),
            lt(landListing.draftExpiresAt, now)
          )
        )
        .returning({ id: landListing.id });

      results.landListingsDeleted = expiredLandListings.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.errors.push(`Land listings cleanup failed: ${message}`);
      logger.error("Land listings cleanup error", error);
    }

    // Data retention: delete rows older than 30 days from unbounded tables
    const retentionTables = [
      { table: "chat_history", column: "created_at" },
      { table: "telegram_chat_history", column: "created_at" },
      { table: "webhook_debug_logs", column: "created_at" },
      { table: "webhook_health_logs", column: "created_at" },
      { table: "whatsapp_analytics", column: "created_at" },
      { table: "sophia_conversation_memory", column: "created_at" },
      { table: "cleanup_logs", column: "created_at" },
    ];

    for (const { table, column } of retentionTables) {
      try {
        const result = await db.execute(
          sql`DELETE FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} < ${thirtyDaysAgo}`
        );
        const count = typeof result === "object" && result !== null && "rowCount" in result
          ? (result as { rowCount: number }).rowCount
          : 0;
        results.retentionRowsDeleted += count;
      } catch (error) {
        // Table may not exist yet - non-critical
        const message = error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`Retention cleanup for ${table}: ${message}`);
      }
    }

    // Log cleanup summary
    logger.info("Cleanup completed", {
      propertyListingsDeleted: results.propertyListingsDeleted,
      landListingsDeleted: results.landListingsDeleted,
      retentionRowsDeleted: results.retentionRowsDeleted,
    });

    if (results.errors.length > 0) {
      logger.error("Cleanup had errors", undefined, { errors: results.errors });
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error("Fatal error", error);
    return NextResponse.json(
      {
        error: "Cleanup failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export const POST = GET;
