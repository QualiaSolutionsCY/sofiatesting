import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:prompts:cache");

/**
 * POST /api/admin/prompts/cache/invalidate
 * Invalidate the prompt cache on the Edge Function
 *
 * Note: The SOPHIA Edge Function uses a 5-minute cache (CACHE_TTL_MS).
 * This endpoint can be used to signal that the cache should be invalidated,
 * though the actual implementation depends on how the Edge Function handles it.
 *
 * Options:
 * 1. Set CACHE_TTL_MS to 0 temporarily (requires redeploy)
 * 2. Add a cache version/timestamp that the Edge Function checks
 * 3. Use a shared cache invalidation flag in Supabase
 */
export async function POST(request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { invalidatedBy } = body;

    // Update a cache_invalidated_at timestamp in the database
    // The Edge Function can check this to determine if it should refresh
    const { error } = await getAdminSupabase()
      .from("sophia_prompts")
      .update({
        updated_at: new Date().toISOString(),
        updated_by: invalidatedBy || "cache-invalidation",
      })
      .eq("is_current", true);

    if (error) {
      logger.error("Error invalidating cache", error);
      return NextResponse.json(
        { error: "Failed to invalidate cache" },
        { status: 500 }
      );
    }

    logger.info("Cache invalidated", { by: invalidatedBy });

    return NextResponse.json({
      success: true,
      message: "Cache invalidation triggered. Changes will take effect within 5 minutes (or immediately if CACHE_TTL_MS=0).",
      invalidatedAt: new Date().toISOString(),
      invalidatedBy: invalidatedBy || "admin",
      note: "To see changes immediately, ensure CACHE_TTL_MS is set to 0 in the Edge Function and redeploy.",
    });
  } catch (error) {
    logger.error("Error in cache invalidation endpoint", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/prompts/cache/invalidate
 * Get current cache status
 */
export async function GET(_request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Get the most recent update time across all prompts
    const { data: latestUpdate, error } = await getAdminSupabase()
      .from("sophia_prompts")
      .select("updated_at")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      logger.error("Error fetching cache status", error);
      return NextResponse.json(
        { error: "Failed to fetch cache status" },
        { status: 500 }
      );
    }

    const lastUpdated = latestUpdate?.updated_at || null;
    const cacheAge = lastUpdated
      ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000)
      : null;

    return NextResponse.json({
      lastUpdated,
      cacheAgeSeconds: cacheAge,
      cacheTtlSeconds: 300, // 5 minutes
      cacheStatus: cacheAge !== null && cacheAge < 300 ? "fresh" : "stale",
      note: "Edge Function uses 5-minute cache. Changes made within this window may not be reflected immediately.",
    });
  } catch (error) {
    logger.error("Error fetching cache status", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
