import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

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
  lastActiveAt: a.last_active_at ? new Date(a.last_active_at as string) : null,
  registeredAt: a.telegram_user_id ? new Date(a.created_at as string) : null,
  inviteSentAt: a.invite_sent_at ? new Date(a.invite_sent_at as string) : null,
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
  // Check admin authentication
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }

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
const updateAgentSchema = z
  .object({
    fullName: z.string().min(1).max(255).optional(),
    email: z.string().email("Invalid email format").toLowerCase().optional(),
    phoneNumber: z.string().optional(),
    region: z
      .enum(["paphos", "limassol", "larnaca", "nicosia", "famagusta", "all"])
      .optional(),
    role: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    canReceiveLeads: z.boolean().optional(),
    canUpload: z.boolean().optional(),
    listingOwnerEmail: z.string().email().optional(),
    landline: z.string().optional(),
  })
  .strict();

export async function PUT(
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

  // Require admin role for updates
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await request.json();

    // Validate request body with Zod schema
    const parseResult = updateAgentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }
    const validatedData = parseResult.data;

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
    if (
      validatedData.email &&
      validatedData.email !== existing.communication_email
    ) {
      const { data: conflict } = await getAdminSupabase()
        .from("agents")
        .select("id")
        .eq("communication_email", validatedData.email)
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
    if (validatedData.fullName !== undefined)
      updateData.full_name = validatedData.fullName;
    if (validatedData.email !== undefined)
      updateData.communication_email = validatedData.email;
    if (validatedData.phoneNumber !== undefined)
      updateData.mobile = validatedData.phoneNumber;
    if (validatedData.region !== undefined)
      updateData.region = validatedData.region.toLowerCase();
    if (validatedData.role !== undefined) updateData.role = validatedData.role;
    if (validatedData.isActive !== undefined)
      updateData.is_active = validatedData.isActive;
    if (validatedData.canReceiveLeads !== undefined)
      updateData.can_receive_leads = validatedData.canReceiveLeads;
    if (validatedData.canUpload !== undefined)
      updateData.can_upload = validatedData.canUpload;
    if (validatedData.listingOwnerEmail !== undefined)
      updateData.listing_owner_email = validatedData.listingOwnerEmail;
    if (validatedData.landline !== undefined)
      updateData.landline = validatedData.landline;

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
 * Deactivate an agent (soft delete) or permanently delete (?permanent=true)
 */
export async function DELETE(
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

  // Require admin role for deletion
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  try {
    const { id } = await context.params;

    if (permanent) {
      return await handlePermanentDelete(id, adminCheck.userId ?? "unknown");
    }

    // Soft delete (existing behavior)
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

/**
 * Permanently delete an agent and all related data.
 * Cascade order:
 *   1. Nullify telegram_leads.forwarded_to_agent_id
 *   2. Nullify lead_forwarding_rotation.last_forwarded_to_agent_id
 *   3. Delete whatsapp_analytics rows (agent_id is TEXT, not FK-constrained)
 *   4. Delete chat_history rows (keyed by phone number stored in agents.mobile / whatsapp_phone_number)
 *   5. Delete listing_uploads rows (keyed by agent_phone)
 *   6. Delete the agent row itself
 */
async function handlePermanentDelete(agentId: string, actorUserId: string) {
  const supabase = getAdminSupabase();

  // Fetch agent first so we can log meaningful info and clean up by phone
  const { data: agent, error: fetchError } = await supabase
    .from("agents")
    .select("id, full_name, mobile, whatsapp_phone_number")
    .eq("id", agentId)
    .single();

  if (fetchError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    // 1. Nullify FK references in telegram_leads
    const { error: leadsError } = await supabase
      .from("telegram_leads")
      .update({ forwarded_to_agent_id: null })
      .eq("forwarded_to_agent_id", agentId);

    if (leadsError) {
      logger.error("Failed to nullify telegram_leads references", leadsError);
      return NextResponse.json(
        {
          error: "Failed to clean up telegram lead references",
          details: leadsError.message,
        },
        { status: 500 }
      );
    }

    // 2. Nullify FK references in lead_forwarding_rotation
    const { error: rotationError } = await supabase
      .from("lead_forwarding_rotation")
      .update({ last_forwarded_to_agent_id: null })
      .eq("last_forwarded_to_agent_id", agentId);

    if (rotationError) {
      logger.error(
        "Failed to nullify lead_forwarding_rotation references",
        rotationError
      );
      return NextResponse.json(
        {
          error: "Failed to clean up lead rotation references",
          details: rotationError.message,
        },
        { status: 500 }
      );
    }

    // 3. Delete whatsapp_analytics rows (agent_id is a text field, not a real FK)
    const { error: analyticsError } = await supabase
      .from("whatsapp_analytics")
      .delete()
      .eq("agent_id", agentId);

    if (analyticsError) {
      // Non-fatal: analytics is supplementary data
      logger.error(
        "Failed to delete whatsapp_analytics rows (non-fatal)",
        analyticsError
      );
    }

    // 4. Delete chat_history rows keyed by the agent's phone numbers
    const phoneNumbers = [agent.mobile, agent.whatsapp_phone_number].filter(
      Boolean
    ) as string[];

    for (const phone of phoneNumbers) {
      const { error: chatError } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", phone);

      if (chatError) {
        logger.error(
          `Failed to delete chat_history for phone ${phone} (non-fatal)`,
          chatError
        );
      }
    }

    // 5. Delete listing_uploads rows keyed by agent_phone
    for (const phone of phoneNumbers) {
      const { error: uploadsError } = await supabase
        .from("listing_uploads")
        .delete()
        .eq("agent_phone", phone);

      if (uploadsError) {
        logger.error(
          `Failed to delete listing_uploads for phone ${phone} (non-fatal)`,
          uploadsError
        );
      }
    }

    // 6. Delete the agent row
    const { error: deleteError } = await supabase
      .from("agents")
      .delete()
      .eq("id", agentId);

    if (deleteError) {
      logger.error("Failed to delete agent row", deleteError);
      return NextResponse.json(
        {
          error: "Failed to delete agent",
          details: deleteError.message,
        },
        { status: 500 }
      );
    }

    logger.info(
      `Agent permanently deleted: id=${agentId}, name="${agent.full_name}", by actor=${actorUserId}`
    );

    return NextResponse.json({
      deleted: true,
      agentId,
      message: "Agent permanently deleted",
    });
  } catch (error) {
    logger.error("Error during permanent agent deletion", error);
    return NextResponse.json(
      {
        error: "Failed to permanently delete agent",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
