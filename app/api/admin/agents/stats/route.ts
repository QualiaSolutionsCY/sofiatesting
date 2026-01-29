import { and, eq, gte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { agentChatSession, zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:agents:stats");

/**
 * GET /api/admin/agents/stats
 * Get aggregate statistics for all agents
 *
 * Query parameters:
 * - days: Number of days to include in stats (default: 30)
 * - region: Filter by region
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = Number.parseInt(searchParams.get("days") || "30", 10);
    const region = searchParams.get("region");

    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Get total agent counts
    const totalAgents = await db
      .select({ count: sql<number>`count(*)` })
      .from(zyprusAgent)
      .where(region ? eq(zyprusAgent.region, region) : undefined);

    const activeAgents = await db
      .select({ count: sql<number>`count(*)` })
      .from(zyprusAgent)
      .where(
        region
          ? and(eq(zyprusAgent.region, region), eq(zyprusAgent.isActive, true))
          : eq(zyprusAgent.isActive, true)
      );

    const registeredAgents = await db
      .select({ count: sql<number>`count(*)` })
      .from(zyprusAgent)
      .where(
        region
          ? and(
              eq(zyprusAgent.region, region),
              sql`${zyprusAgent.registeredAt} IS NOT NULL`
            )
          : sql`${zyprusAgent.registeredAt} IS NOT NULL`
      );

    // Regional breakdown
    const byRegion = await db
      .select({
        region: zyprusAgent.region,
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) FILTER (WHERE ${zyprusAgent.isActive} = true)`,
        registered: sql<number>`count(*) FILTER (WHERE ${zyprusAgent.registeredAt} IS NOT NULL)`,
      })
      .from(zyprusAgent)
      .groupBy(zyprusAgent.region)
      .orderBy(sql`count(*) DESC`);

    // Role breakdown
    const byRole = await db
      .select({
        role: zyprusAgent.role,
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) FILTER (WHERE ${zyprusAgent.isActive} = true)`,
      })
      .from(zyprusAgent)
      .where(region ? eq(zyprusAgent.region, region) : undefined)
      .groupBy(zyprusAgent.role)
      .orderBy(sql`count(*) DESC`);

    // Platform breakdown (from chat sessions)
    const byPlatform = await db
      .select({
        platform: agentChatSession.platform,
        sessions: sql<number>`count(*)`,
        messages: sql<number>`sum(${agentChatSession.messageCount})`,
        documents: sql<number>`sum(${agentChatSession.documentCount})`,
        calculations: sql<number>`sum(${agentChatSession.calculatorCount})`,
      })
      .from(agentChatSession)
      .where(gte(agentChatSession.startedAt, dateThreshold))
      .groupBy(agentChatSession.platform);

    // Top agents by activity (recent period)
    const topAgents = await db
      .select({
        agentId: agentChatSession.agentId,
        agentName: zyprusAgent.fullName,
        agentEmail: zyprusAgent.email,
        region: zyprusAgent.region,
        sessionCount: sql<number>`count(*)`,
        totalMessages: sql<number>`sum(${agentChatSession.messageCount})`,
        totalDocuments: sql<number>`sum(${agentChatSession.documentCount})`,
        totalCost: sql<string>`sum(${agentChatSession.totalCostUsd})`,
      })
      .from(agentChatSession)
      .innerJoin(zyprusAgent, eq(agentChatSession.agentId, zyprusAgent.id))
      .where(
        and(
          gte(agentChatSession.startedAt, dateThreshold),
          region ? eq(zyprusAgent.region, region) : undefined
        )
      )
      .groupBy(
        agentChatSession.agentId,
        zyprusAgent.fullName,
        zyprusAgent.email,
        zyprusAgent.region
      )
      .orderBy(sql`sum(${agentChatSession.messageCount}) DESC`)
      .limit(10);

    // Daily activity trend (last 30 days)
    const dailyTrend = await db
      .select({
        date: sql<string>`DATE(${agentChatSession.startedAt})`,
        sessions: sql<number>`count(*)`,
        messages: sql<number>`sum(${agentChatSession.messageCount})`,
        documents: sql<number>`sum(${agentChatSession.documentCount})`,
      })
      .from(agentChatSession)
      .where(gte(agentChatSession.startedAt, dateThreshold))
      .groupBy(sql`DATE(${agentChatSession.startedAt})`)
      .orderBy(sql`DATE(${agentChatSession.startedAt}) ASC`);

    return NextResponse.json({
      overview: {
        total: Number(totalAgents[0].count),
        active: Number(activeAgents[0].count),
        registered: Number(registeredAgents[0].count),
        pending:
          Number(totalAgents[0].count) - Number(registeredAgents[0].count),
      },
      byRegion,
      byRole,
      byPlatform,
      topAgents,
      dailyTrend,
      period: {
        days,
        from: dateThreshold.toISOString(),
        to: new Date().toISOString(),
      },
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
