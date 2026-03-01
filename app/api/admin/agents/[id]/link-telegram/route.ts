import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:agents:link-telegram");

/**
 * POST /api/admin/agents/[id]/link-telegram
 * Link Telegram account to agent
 *
 * Body: { telegramUserId: number }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Check admin authentication
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // Require admin role for linking accounts
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

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
    const { data: agent, error: findError } = await getAdminSupabase()
      .from("agents")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if Telegram ID is already linked to another agent
    const { data: existing } = await getAdminSupabase()
      .from("agents")
      .select("id, full_name, communication_email")
      .eq("telegram_user_id", body.telegramUserId)
      .neq("id", id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: "This Telegram account is already linked to another agent",
          linkedAgent: {
            id: existing[0].id,
            name: existing[0].full_name,
            email: existing[0].communication_email,
          },
        },
        { status: 409 }
      );
    }

    // Link Telegram
    const { data: updated, error } = await getAdminSupabase()
      .from("agents")
      .update({ telegram_user_id: body.telegramUserId })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Error linking Telegram", error);
      return NextResponse.json(
        { error: "Failed to link Telegram account", details: error.message },
        { status: 500 }
      );
    }

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
  // Check admin authentication
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

  // Require admin role for unlinking accounts
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;

    const { data: updated, error } = await getAdminSupabase()
      .from("agents")
      .update({ telegram_user_id: null })
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
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
