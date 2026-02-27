import { type NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/getAdminSupabase()/admin";

const logger = createLogger("api:admin:agents:stats");

/**
 * GET /api/admin/agents/stats
 * Get aggregate statistics for all agents
 *
 * Query parameters:
 * - region: Filter by region
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get("region");

    // Total agents
    let totalQuery = getAdminSupabase()
      .from("agents")
      .select("*", { count: "exact", head: true });
    if (region) totalQuery = totalQuery.eq("region", region.toLowerCase());
    const { count: totalCount } = await totalQuery;

    // Active agents
    let activeQuery = getAdminSupabase()
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    if (region) activeQuery = activeQuery.eq("region", region.toLowerCase());
    const { count: activeCount } = await activeQuery;

    // Agents with telegram (as proxy for "registered")
    let registeredQuery = getAdminSupabase()
      .from("agents")
      .select("*", { count: "exact", head: true })
      .not("telegram_user_id", "is", null);
    if (region)
      registeredQuery = registeredQuery.eq("region", region.toLowerCase());
    const { count: registeredCount } = await registeredQuery;

    // Regional breakdown
    const { data: allAgents } = await getAdminSupabase()
      .from("agents")
      .select("region, is_active, telegram_user_id");

    const byRegion: Record<
      string,
      { region: string; total: number; active: number; registered: number }
    > = {};
    for (const a of allAgents || []) {
      const r = (a.region as string) || "unknown";
      if (!byRegion[r]) {
        byRegion[r] = { region: r, total: 0, active: 0, registered: 0 };
      }
      byRegion[r].total++;
      if (a.is_active) byRegion[r].active++;
      if (a.telegram_user_id) byRegion[r].registered++;
    }

    // Role breakdown
    const { data: roleAgents } = await getAdminSupabase()
      .from("agents")
      .select("role, is_active");

    const byRole: Record<
      string,
      { role: string; total: number; active: number }
    > = {};
    for (const a of roleAgents || []) {
      const r = (a.role as string) || "unknown";
      if (!byRole[r]) {
        byRole[r] = { role: r, total: 0, active: 0 };
      }
      byRole[r].total++;
      if (a.is_active) byRole[r].active++;
    }

    return NextResponse.json({
      overview: {
        total: totalCount || 0,
        active: activeCount || 0,
        registered: registeredCount || 0,
        pending: (totalCount || 0) - (registeredCount || 0),
      },
      byRegion: Object.values(byRegion).sort((a, b) => b.total - a.total),
      byRole: Object.values(byRole).sort((a, b) => b.total - a.total),
      byPlatform: [],
      topAgents: [],
      dailyTrend: [],
    });
  } catch (error) {
    logger.error("Error fetching statistics", error);
    return NextResponse.json(
      {
        error: "Failed to fetch statistics",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
