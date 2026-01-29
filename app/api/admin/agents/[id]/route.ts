import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { agentChatSession, zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:agents:id");

/**
 * GET /api/admin/agents/[id]
 * Get agent details including activity statistics
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Get agent
    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Get recent chat sessions
    const sessions = await db
      .select()
      .from(agentChatSession)
      .where(eq(agentChatSession.agentId, id))
      .orderBy(desc(agentChatSession.startedAt))
      .limit(10);

    // Calculate aggregate statistics
    const stats = {
      totalSessions: sessions.length,
      totalMessages: sessions.reduce(
        (sum, s) => sum + (s.messageCount || 0),
        0
      ),
      totalDocuments: sessions.reduce(
        (sum, s) => sum + (s.documentCount || 0),
        0
      ),
      totalCalculations: sessions.reduce(
        (sum, s) => sum + (s.calculatorCount || 0),
        0
      ),
      totalListings: sessions.reduce(
        (sum, s) => sum + (s.listingCount || 0),
        0
      ),
      totalTokens: sessions.reduce(
        (sum, s) => sum + (s.totalTokensUsed || 0),
        0
      ),
      totalCost: sessions.reduce(
        (sum, s) => sum + Number(s.totalCostUsd || 0),
        0
      ),
      platformBreakdown: {
        web: sessions.filter((s) => s.platform === "web").length,
        telegram: sessions.filter((s) => s.platform === "telegram").length,
        whatsapp: sessions.filter((s) => s.platform === "whatsapp").length,
      },
    };

    return NextResponse.json({
      agent,
      stats,
      recentSessions: sessions,
    });
  } catch (error) {
    logger.error("Error fetching agent", error);
    return NextResponse.json(
      {
        error: "Failed to fetch agent",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/agents/[id]
 * Update agent details
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    // Check if agent exists
    const [existing] = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // If email is being changed, check for conflicts
    if (body.email && body.email !== existing.email) {
      const [emailConflict] = await db
        .select()
        .from(zyprusAgent)
        .where(eq(zyprusAgent.email, body.email.toLowerCase()))
        .limit(1);

      if (emailConflict) {
        return NextResponse.json(
          { error: "Another agent already has this email" },
          { status: 409 }
        );
      }
    }

    // Update agent
    const [updated] = await db
      .update(zyprusAgent)
      .set({
        ...body,
        email: body.email ? body.email.toLowerCase() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    return NextResponse.json({
      agent: updated,
      message: "Agent updated successfully",
    });
  } catch (error) {
    logger.error("Error updating agent", error);
    return NextResponse.json(
      {
        error: "Failed to update agent",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/agents/[id]
 * Deactivate an agent (soft delete)
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Check if agent exists
    const [existing] = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Soft delete by setting isActive to false
    const [deactivated] = await db
      .update(zyprusAgent)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    return NextResponse.json({
      agent: deactivated,
      message: "Agent deactivated successfully",
    });
  } catch (error) {
    logger.error("Error deactivating agent", error);
    return NextResponse.json(
      {
        error: "Failed to deactivate agent",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
