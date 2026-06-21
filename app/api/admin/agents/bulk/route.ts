import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:agents:bulk");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  "https://sofiatesting.vercel.app";

const INVITE_FROM =
  process.env.INVITE_FROM_EMAIL || "SOPHIA <sophia@zyprus.com>";

const bulkSchema = z.object({
  action: z.enum(["deactivate", "activate", "send-invite", "permanent-delete"]),
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.userId ? 403 : 401 }
    );
  }
  if (!hasMinimumRole(adminCheck.role, "admin")) {
    return NextResponse.json(
      { error: "Insufficient permissions. Admin role required." },
      { status: 403 }
    );
  }

  let payload: z.infer<typeof bulkSchema>;
  try {
    payload = bulkSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }

  const supabase = getAdminSupabase();

  try {
    if (payload.action === "deactivate" || payload.action === "activate") {
      const isActive = payload.action === "activate";
      const { data, error } = await supabase
        .from("agents")
        .update({ is_active: isActive })
        .in("id", payload.ids)
        .select("id");

      if (error) {
        logger.error("Bulk set is_active failed", error);
        return NextResponse.json(
          { error: "Bulk update failed", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: payload.action,
        affected: data?.length ?? 0,
      });
    }

    if (payload.action === "permanent-delete") {
      return await handleBulkPermanentDelete(
        supabase,
        payload.ids,
        adminCheck.userId ?? "unknown"
      );
    }

    // send-invite
    const { data: agents, error: fetchError } = await supabase
      .from("agents")
      .select("id, full_name, communication_email, user_id")
      .in("id", payload.ids);

    if (fetchError) {
      logger.error("Bulk invite fetch failed", fetchError);
      return NextResponse.json(
        { error: "Failed to load agents", details: fetchError.message },
        { status: 500 }
      );
    }

    const results: Array<{
      id: string;
      status: "sent" | "skipped" | "failed";
      reason?: string;
    }> = [];

    for (const agent of agents ?? []) {
      if (!agent.communication_email) {
        results.push({ id: agent.id, status: "skipped", reason: "no email" });
        continue;
      }
      if (agent.user_id) {
        results.push({
          id: agent.id,
          status: "skipped",
          reason: "already registered",
        });
        continue;
      }

      const inviteToken = randomBytes(32).toString("hex");
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("agents")
        .update({ invite_token: inviteToken, invite_sent_at: now })
        .eq("id", agent.id);

      if (updateError) {
        logger.error("Failed to persist invite token", updateError);
        results.push({
          id: agent.id,
          status: "failed",
          reason: "db write failed",
        });
        continue;
      }

      const signupUrl = `${APP_URL}/register?invite=${inviteToken}&email=${encodeURIComponent(agent.communication_email)}`;

      if (!resend) {
        results.push({
          id: agent.id,
          status: "skipped",
          reason: "email service not configured",
        });
        continue;
      }

      const { error: sendError } = await resend.emails.send({
        from: INVITE_FROM,
        to: agent.communication_email,
        subject: "You've been invited to SOPHIA",
        html: renderInviteEmail({ fullName: agent.full_name, signupUrl }),
      });

      if (sendError) {
        logger.error("Bulk invite send failed", sendError);
        results.push({
          id: agent.id,
          status: "failed",
          reason: sendError.message,
        });
        continue;
      }

      results.push({ id: agent.id, status: "sent" });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      success: true,
      action: payload.action,
      requested: payload.ids.length,
      sent,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    logger.error("Bulk action error", error);
    return NextResponse.json(
      {
        error: "Bulk action failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function handleBulkPermanentDelete(
  supabase: ReturnType<typeof getAdminSupabase>,
  ids: string[],
  actorUserId: string
) {
  // Fetch all agents to get phone numbers for cascading cleanup
  const { data: agents, error: fetchError } = await supabase
    .from("agents")
    .select("id, full_name, mobile, whatsapp_phone_number")
    .in("id", ids);

  if (fetchError) {
    logger.error("Bulk permanent delete: failed to fetch agents", fetchError);
    return NextResponse.json(
      { error: "Failed to load agents", details: fetchError.message },
      { status: 500 }
    );
  }

  const agentIds = (agents ?? []).map((a: { id: string }) => a.id);

  if (agentIds.length === 0) {
    return NextResponse.json(
      { error: "No matching agents found" },
      { status: 404 }
    );
  }

  // Collect all phone numbers for non-FK cleanup
  const phoneNumbers = (agents ?? [])
    .flatMap(
      (a: {
        mobile?: string | null;
        whatsapp_phone_number?: string | null;
      }) => [a.mobile, a.whatsapp_phone_number]
    )
    .filter(Boolean) as string[];

  try {
    // 1. Nullify telegram_leads FK references
    const { error: leadsError } = await supabase
      .from("telegram_leads")
      .update({ forwarded_to_agent_id: null })
      .in("forwarded_to_agent_id", agentIds);

    if (leadsError) {
      logger.error(
        "Bulk permanent delete: telegram_leads cleanup failed",
        leadsError
      );
      return NextResponse.json(
        {
          error: "Failed to clean up telegram lead references",
          details: leadsError.message,
        },
        { status: 500 }
      );
    }

    // 2. Nullify lead_forwarding_rotation FK references
    const { error: rotationError } = await supabase
      .from("lead_forwarding_rotation")
      .update({ last_forwarded_to_agent_id: null })
      .in("last_forwarded_to_agent_id", agentIds);

    if (rotationError) {
      logger.error(
        "Bulk permanent delete: lead_forwarding_rotation cleanup failed",
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

    // 3. Delete whatsapp_analytics rows (non-fatal)
    for (const agentId of agentIds) {
      const { error: analyticsError } = await supabase
        .from("whatsapp_analytics")
        .delete()
        .eq("agent_id", agentId);
      if (analyticsError) {
        logger.error(
          `Bulk permanent delete: whatsapp_analytics cleanup failed for ${agentId} (non-fatal)`,
          analyticsError
        );
      }
    }

    // 4. Delete chat_history by phone (non-fatal)
    for (const phone of phoneNumbers) {
      const { error: chatError } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", phone);
      if (chatError) {
        logger.error(
          `Bulk permanent delete: chat_history cleanup failed for ${phone} (non-fatal)`,
          chatError
        );
      }
    }

    // 5. Delete listing_uploads by phone (non-fatal)
    for (const phone of phoneNumbers) {
      const { error: uploadsError } = await supabase
        .from("listing_uploads")
        .delete()
        .eq("agent_phone", phone);
      if (uploadsError) {
        logger.error(
          `Bulk permanent delete: listing_uploads cleanup failed for ${phone} (non-fatal)`,
          uploadsError
        );
      }
    }

    // 6. Delete the agent rows
    const { error: deleteError } = await supabase
      .from("agents")
      .delete()
      .in("id", agentIds);

    if (deleteError) {
      logger.error(
        "Bulk permanent delete: agent row deletion failed",
        deleteError
      );
      return NextResponse.json(
        { error: "Failed to delete agents", details: deleteError.message },
        { status: 500 }
      );
    }

    const agentNames = (agents ?? [])
      .map((a: { full_name: string }) => a.full_name)
      .join(", ");
    logger.info(
      `Bulk permanent delete: ${agentIds.length} agents deleted (${agentNames}) by actor=${actorUserId}`
    );

    return NextResponse.json({
      success: true,
      action: "permanent-delete",
      affected: agentIds.length,
    });
  } catch (error) {
    logger.error("Bulk permanent delete error", error);
    return NextResponse.json(
      {
        error: "Bulk permanent delete failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function renderInviteEmail({
  fullName,
  signupUrl,
}: {
  fullName: string;
  signupUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #111;">
      <div style="text-align: left; margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 600; margin: 0;">Welcome to SOPHIA</h1>
        <p style="color: #555; margin: 8px 0 0; font-size: 15px;">Zyprus Property Group</p>
      </div>
      <p style="font-size: 16px; line-height: 1.55; margin: 0 0 16px;">Hi ${escapeHtml(fullName)},</p>
      <p style="font-size: 16px; line-height: 1.55; margin: 0 0 24px;">
        You have been invited to join SOPHIA, the AI assistant for Zyprus listings, leads, and documents.
        Click the button below to finish setting up your account.
      </p>
      <p style="margin: 0 0 32px;">
        <a href="${signupUrl}"
           style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
          Complete sign-up
        </a>
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #666; margin: 0 0 8px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="font-size: 13px; line-height: 1.5; color: #444; margin: 0 0 32px; word-break: break-all;">
        ${signupUrl}
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
      <p style="font-size: 12px; color: #888; margin: 0;">
        If you weren't expecting this invite, you can ignore this email.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
