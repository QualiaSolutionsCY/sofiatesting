import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkAdminAuth, hasMinimumRole } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:agents:invite");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  "https://sofiatesting.vercel.app";

const INVITE_FROM =
  process.env.INVITE_FROM_EMAIL || "SOPHIA <sophia@zyprus.com>";

/**
 * POST /api/admin/agents/[id]/invite
 * Generate an invite token, persist it, and email the agent a signup link.
 *
 * Idempotent: regenerates the token on each call so previous unused links
 * stop working (anti phishing of stale tokens).
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  try {
    const { id } = await context.params;

    const { data: agent, error: findError } = await getAdminSupabase()
      .from("agents")
      .select("id, full_name, communication_email, invite_sent_at, user_id")
      .eq("id", id)
      .single();

    if (findError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (!agent.communication_email) {
      return NextResponse.json(
        { error: "Agent has no email address" },
        { status: 400 }
      );
    }

    if (agent.user_id) {
      return NextResponse.json(
        { error: "Agent already has a registered account" },
        { status: 409 }
      );
    }

    const inviteToken = randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    const { error: updateError } = await getAdminSupabase()
      .from("agents")
      .update({
        invite_token: inviteToken,
        invite_sent_at: now,
      })
      .eq("id", id);

    if (updateError) {
      logger.error("Failed to persist invite token", updateError);
      return NextResponse.json(
        { error: "Failed to record invite" },
        { status: 500 }
      );
    }

    const signupUrl = `${APP_URL}/register?invite=${inviteToken}&email=${encodeURIComponent(agent.communication_email)}`;

    if (!resend) {
      logger.warn(
        "RESEND_API_KEY not configured — returning link without sending email"
      );
      return NextResponse.json({
        success: true,
        emailed: false,
        message:
          "Email service not configured. Share this link with the agent manually.",
        signupUrl,
      });
    }

    const { error: sendError } = await resend.emails.send({
      from: INVITE_FROM,
      to: agent.communication_email,
      subject: "You've been invited to SOPHIA",
      html: renderInviteEmail({
        fullName: agent.full_name,
        signupUrl,
      }),
    });

    if (sendError) {
      logger.error("Resend send failed for invite", sendError);
      return NextResponse.json(
        {
          error: "Email send failed",
          details: sendError.message,
          signupUrl,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      emailed: true,
      message: "Invite sent",
      inviteSentAt: now,
    });
  } catch (error) {
    logger.error("Error sending invite", error);
    return NextResponse.json(
      {
        error: "Failed to send invite",
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
