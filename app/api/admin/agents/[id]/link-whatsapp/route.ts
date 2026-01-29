import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:agents:link-whatsapp");

/**
 * POST /api/admin/agents/[id]/link-whatsapp
 * Link WhatsApp account to agent
 *
 * Body:
 * {
 *   whatsappPhoneNumber: string (E.164 format: +357XXXXXXXX)
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (!body.whatsappPhoneNumber) {
      return NextResponse.json(
        { error: "whatsappPhoneNumber is required" },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = body.whatsappPhoneNumber.trim();

    // Check if agent exists
    const [agent] = await db
      .select()
      .from(zyprusAgent)
      .where(eq(zyprusAgent.id, id))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if this WhatsApp number is already linked to another agent
    const [existingLink] = await db
      .select()
      .from(zyprusAgent)
      .where(
        and(
          eq(zyprusAgent.whatsappPhoneNumber, normalizedPhone),
          sql`${zyprusAgent.id} != ${id}`
        )
      )
      .limit(1);

    if (existingLink) {
      return NextResponse.json(
        {
          error: "This WhatsApp number is already linked to another agent",
          linkedAgent: {
            id: existingLink.id,
            name: existingLink.fullName,
            email: existingLink.email,
          },
        },
        { status: 409 }
      );
    }

    // Link WhatsApp account
    const [updated] = await db
      .update(zyprusAgent)
      .set({
        whatsappPhoneNumber: normalizedPhone,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    return NextResponse.json({
      agent: updated,
      message: "WhatsApp account linked successfully",
    });
  } catch (error) {
    logger.error("Error linking WhatsApp", error);
    return NextResponse.json(
      {
        error: "Failed to link WhatsApp account",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/agents/[id]/link-whatsapp
 * Unlink WhatsApp account from agent
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
        whatsappPhoneNumber: null,
        updatedAt: new Date(),
      })
      .where(eq(zyprusAgent.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: updated,
      message: "WhatsApp account unlinked successfully",
    });
  } catch (error) {
    logger.error("Error unlinking WhatsApp", error);
    return NextResponse.json(
      {
        error: "Failed to unlink WhatsApp account",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
