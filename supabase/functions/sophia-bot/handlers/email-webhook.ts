/**
 * Email Webhook Handler
 *
 * Accepts inbound email content from the email-router (Railway service)
 * and processes it through the same AI pipeline as WhatsApp messages.
 *
 * Endpoint: POST /sophia-bot/email
 * Auth: X-Admin-Secret header (same as admin endpoints)
 *
 * Flow:
 * 1. Authenticate via admin secret
 * 2. Identify agent by sender email
 * 3. Load chat history (keyed by sender email)
 * 4. Build system prompt with agent context
 * 5. Run AI chat with all tools enabled
 * 6. Store messages in chat_history
 * 7. Return { reply, success }
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { addMessage, getHistory } from "../../_shared/db.ts";
import { getAgentByEmail } from "../agents/identifier.ts";
import { buildSystemPrompt, chat } from "../services/ai-chat.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { constantTimeCompare } from "../utils/webhook-auth.ts";

const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");

export interface EmailWebhookPayload {
  from: string;        // Sender email address (used as userId)
  fromName: string;    // Sender display name
  subject: string;     // Email subject line
  textBody: string;    // Plain text content
  htmlBody?: string;   // HTML content (optional)
  imageUrls?: string[]; // Public image URLs from attachments
}

/**
 * Handle POST /sophia-bot/email
 * Called by the email-router Railway service when an email arrives at sophia@zyprus.com
 */
export async function handleEmailWebhook(
  req: Request,
  supabase: SupabaseClient
): Promise<Response> {
  // Authenticate via admin secret
  const providedSecret = req.headers.get("x-admin-secret");

  if (!ADMIN_SECRET) {
    logger.warn("Email webhook: SOPHIA_ADMIN_SECRET not configured", {
      category: LogCategory.GENERAL,
    });
    return jsonError("Email endpoint not configured", 503);
  }

  if (!constantTimeCompare(providedSecret || "", ADMIN_SECRET)) {
    logger.warn("Email webhook: Unauthorized access attempt", {
      category: LogCategory.GENERAL,
    });
    return jsonError("Unauthorized", 401);
  }

  // Parse request body
  let payload: EmailWebhookPayload;
  try {
    payload = await req.json();
  } catch (_e) {
    return jsonError("Invalid JSON body", 400);
  }

  // Validate required fields
  const { from, subject, textBody } = payload;
  if (!from || !subject || (!textBody && !payload.htmlBody)) {
    return jsonError("Missing required fields: from, subject, textBody", 400);
  }

  // Sanitize email
  const senderEmail = from.toLowerCase().trim();

  logger.info(`[Email] Processing email from ${senderEmail}: "${subject}"`, {
    category: LogCategory.GENERAL,
  });

  try {
    // Identify agent by email
    const identifiedAgent = await getAgentByEmail(senderEmail).catch((err) => {
      logger.warn("[Email] Failed to identify agent by email (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
      return null;
    });

    if (identifiedAgent) {
      logger.info(`[Email] Identified agent: ${identifiedAgent.fullName} (${identifiedAgent.region})`, {
        category: LogCategory.GENERAL,
      });
    } else {
      logger.info(`[Email] Unknown sender: ${senderEmail}`, {
        category: LogCategory.GENERAL,
      });
    }

    // Use sender email as userId for chat_history (keeps email threads separate from WhatsApp)
    const userId = senderEmail;

    // Build user message: combine subject + body
    // Include subject for context, especially useful on first email in a thread
    const userMessage = subject
      ? `[Subject: ${subject}]\n\n${textBody || ""}`
      : textBody || "";

    const imageUrls = payload.imageUrls || [];

    // Store user message in chat history
    await addMessage(userId, "user", userMessage).catch((err) => {
      logger.warn("[Email] Failed to store user message (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });

    // Load chat history (email conversations keyed by sender email)
    const history = await getHistory(userId).catch((err) => {
      logger.warn("[Email] Failed to get chat history (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
      return [];
    });

    // Build system prompt — pass sender email as phoneNumber (used as userId internally)
    const systemPrompt = await buildSystemPrompt(
      supabase,
      {
        userId,
        phoneNumber: senderEmail, // email used as identifier
        agentName: identifiedAgent?.fullName,
        agentEmail: identifiedAgent?.communicationEmail,
        agentRegion: identifiedAgent?.region,
        agentCanUpload: identifiedAgent?.canUpload,
        imageUrls,
        userMessage,
        lastDocument: null,
      },
      identifiedAgent
    );

    // Run AI chat — pass senderEmail as phoneNumber (used as userId for pending images)
    const aiResult = await chat(
      history,
      systemPrompt,
      userMessage,
      imageUrls,
      identifiedAgent,
      senderEmail
    );

    const reply = aiResult.response || "I couldn't process your request. Please try again.";

    // Store AI response in chat history
    await addMessage(userId, "model", reply).catch((err) => {
      logger.warn("[Email] Failed to store AI response (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });

    logger.info(`[Email] Processed successfully. Tools used: ${aiResult.toolsUsed?.join(", ") || "none"}`, {
      category: LogCategory.GENERAL,
    });

    return new Response(
      JSON.stringify({
        success: true,
        reply,
        toolsUsed: aiResult.toolsUsed || [],
        agentFound: identifiedAgent !== null,
        agentName: identifiedAgent?.fullName || null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    logger.error(
      "[Email] Unexpected error processing email",
      err instanceof Error ? err : undefined,
      {
        category: LogCategory.GENERAL,
        from: senderEmail,
        subject,
      }
    );

    return new Response(
      JSON.stringify({
        success: false,
        reply: "I encountered an unexpected error. Please try again.",
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
