import { type NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/getAdminSupabase()/admin";

const logger = createLogger("api:admin:agents:id");

const transformAgent = (a: Record<string, unknown>) => ({
  id: a.id,
  userId: a.user_id ?? null,
  fullName: a.full_name,
  email: (a.communication_email as string) || "",
  phoneNumber: a.mobile ?? null,
  region: a.region
    ? (a.region as string).charAt(0).toUpperCase() +
      (a.region as string).slice(1)
    : "Unknown",
  role: (a.role as string) || "agent",
  isActive: a.is_active ?? true,
  canReceiveLeads: a.can_receive_leads ?? true,
  canUpload: a.can_upload ?? true,
  telegramUserId: a.telegram_user_id?.toString() || null,
  whatsappPhoneNumber: a.whatsapp_phone_number ?? null,
  zyprusUserId: a.zyprus_user_id ?? null,
  landline: a.landline ?? null,
  listingOwnerEmail: a.listing_owner_email ?? null,
  lastActiveAt: a.last_active_at
    ? new Date(a.last_active_at as string)
    : null,
  registeredAt: a.telegram_user_id
    ? new Date(a.created_at as string)
    : null,
  inviteSentAt: a.invite_sent_at
    ? new Date(a.invite_sent_at as string)
    : null,
  inviteToken: a.invite_token ?? null,
  notes: a.notes ?? null,
  createdAt: new Date(a.created_at as string),
  updatedAt: a.updated_at
    ? new Date(a.updated_at as string)
    : new Date(a.created_at as string),
});

/**
 * GET /api/admin/agents/[id]
 * Get agent details
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { data: agent, error } = await getAdminSupabase()
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: transformAgent(agent),
      stats: {
        totalSessions: 0,
        totalMessages: 0,
        totalDocuments: 0,
        totalCalculations: 0,
        totalListings: 0,
        totalTokens: 0,
        totalCost: 0,
        platformBreakdown: { web: 0, telegram: 0, whatsapp: 0 },
      },
      recentSessions: [],
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
    const { data: existing, error: findError } = await getAdminSupabase()
      .from("agents")
      .select("id, communication_email")
      .eq("id", id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // If email is being changed, check for conflicts
    if (body.email && body.email !== existing.communication_email) {
      const { data: conflict } = await getAdminSupabase()
        .from("agents")
        .select("id")
        .eq("communication_email", body.email.toLowerCase())
        .neq("id", id)
        .limit(1);

      if (conflict && conflict.length > 0) {
        return NextResponse.json(
          { error: "Another agent already has this email" },
          { status: 409 }
        );
      }
    }

    // Map camelCase body fields to snake_case DB columns
    const updateData: Record<string, unknown> = {};
    if (body.fullName !== undefined) updateData.full_name = body.fullName;
    if (body.email !== undefined)
      updateData.communication_email = body.email.toLowerCase();
    if (body.phoneNumber !== undefined) updateData.mobile = body.phoneNumber;
    if (body.region !== undefined)
      updateData.region = body.region.toLowerCase();
    if (body.role !== undefined) updateData.role = body.role;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    if (body.canReceiveLeads !== undefined)
      updateData.can_receive_leads = body.canReceiveLeads;
    if (body.canUpload !== undefined) updateData.can_upload = body.canUpload;
    if (body.listingOwnerEmail !== undefined)
      updateData.listing_owner_email = body.listingOwnerEmail;
    if (body.landline !== undefined) updateData.landline = body.landline;

    const { data: updated, error } = await getAdminSupabase()
      .from("agents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Error updating agent", error);
      return NextResponse.json(
        { error: "Failed to update agent", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      agent: transformAgent(updated),
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

    const { data: deactivated, error } = await getAdminSupabase()
      .from("agents")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error || !deactivated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      agent: transformAgent(deactivated),
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
