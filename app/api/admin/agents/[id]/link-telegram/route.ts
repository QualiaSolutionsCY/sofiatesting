import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:agents:link-telegram");

/**
 * POST /api/admin/agents/[id]/link-telegram
 * Link Telegram account to agent
 *
 * Body:
 * {
 *   telegramUserId: number (Telegram user ID)
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!body.telegramUserId) {
      return NextResponse.json(
        { error: "telegramUserId is required" },
        { status: 400 }
      );
    }

    // Check if agent exists
    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if this Telegram ID is already linked to another agent
    const [existingLink] = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.telegramUserId, body.telegramUserId),
          sql`${zyprusAgent.id} != ${id}`
        )
      )
      .limit(1);

    if (existingLink) {
      return NextResponse.json(
        {
          error: "This Telegram account is already linked to another agent",
          linkedAgent: {
            id: existingLink.id,
            name: existingLink.fullName,
            email: existingLink.email,
          },
        },
        { status: 409 }
      );
    }

    // Link Telegram account
    const [updated] = await db
      .update(zyprusAgent)
      .set({
        telegramUserId: body.telegramUserId,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    return NextResponse.json({
      agent: updated,
      message: "Telegram account linked successfully",
    });
  } catch (error) {
    logger.error("Error linking Telegram", error);
    return NextResponse.json(
      {
        error: "Failed to link Telegram account",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/agents/[id]/link-telegram
 * Unlink Telegram account from agent
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const [updated] = await db
      .update(zyprusAgent)
      .set({
        telegramUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: updated,
      message: "Telegram account unlinked successfully",
    });
  } catch (error) {
    logger.error("Error unlinking Telegram", error);
    return NextResponse.json(
      {
        error: "Failed to unlink Telegram account",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
