import { type NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/getAdminSupabase()/admin";

const logger = createLogger("api:admin:agents:link-whatsapp");

/**
 * POST /api/admin/agents/[id]/link-whatsapp
 * Link WhatsApp account to agent
 *
 * Body: { whatsappPhoneNumber: string }
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

    const normalizedPhone = body.whatsappPhoneNumber.trim();

    // Check if agent exists
    const { data: agent, error: findError } = await getAdminSupabase()
      .from("agents")
      .select("id")
      .eq("id", id)
      .single();

    if (findError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if WhatsApp number is already linked to another agent
    const { data: existing } = await getAdminSupabase()
      .from("agents")
      .select("id, full_name, communication_email")
      .eq("mobile", normalizedPhone)
      .neq("id", id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: "This WhatsApp number is already linked to another agent",
          linkedAgent: {
            id: existing[0].id,
            name: existing[0].full_name,
            email: existing[0].communication_email,
          },
        },
        { status: 409 }
      );
    }

    // Update mobile number
    const { data: updated, error } = await getAdminSupabase()
      .from("agents")
      .update({ mobile: normalizedPhone })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Error linking WhatsApp", error);
      return NextResponse.json(
        { error: "Failed to link WhatsApp account", details: error.message },
        { status: 500 }
      );
    }

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

    const { data: updated, error } = await getAdminSupabase()
      .from("agents")
      .update({ mobile: "" })
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) {
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
