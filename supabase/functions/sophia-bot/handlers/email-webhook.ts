/**
 * Email Webhook Handler
 *
 * Accepts inbound email content from the email-router (Railway service)
 * and processes it through the SAME AI pipeline as WhatsApp messages.
 *
 * Endpoint: POST /sophia-bot/email
 * Auth: X-Admin-Secret header (same as admin endpoints)
 *
 * Flow (mirrors WhatsApp exactly):
 * 1. Authenticate via admin secret
 * 2. Identify agent by sender email
 * 3. Store images/documents in pending_images/pending_documents
 * 4. Load chat history, personalization, last document (same as WhatsApp)
 * 5. Build system prompt with full agent context
 * 6. Run AI chat with all tools enabled (AI decides what to do)
 * 7. Store messages in chat_history
 * 8. Return { reply, success }
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { addMessage, getHistory, getLastDocument } from "../../_shared/db.ts";
import { getAgentByEmail } from "../agents/identifier.ts";
import {
  buildUserContext,
  formatContextForPrompt,
} from "../memory/sophia-memory.ts";
import { buildSystemPrompt, chat } from "../services/ai-chat.ts";
import { validateImagesAtIngress } from "../services/image-validator.ts";
import {
  addPendingDocument,
  clearPendingDocuments,
} from "../services/pending-documents.ts";
import {
  addPendingImages,
  clearPendingImages,
  getPendingImages,
} from "../services/pending-images.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { checkRateLimit } from "../utils/rate-limiter.ts";
import { sanitizeAiOutput, sanitizeUserInput } from "../utils/validation.ts";
import { constantTimeCompare } from "../utils/webhook-auth.ts";

const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");

export interface EmailWebhookPayload {
  from: string; // Sender email address (used as userId)
  fromName: string; // Sender display name
  subject: string; // Email subject line
  textBody: string; // Plain text content
  htmlBody?: string; // HTML content (optional)
  imageUrls?: string[]; // Public image URLs from attachments
  documentUrls?: string[]; // Public document URLs (PDFs, DOCX, KMZ)
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

  // Sanitize email input and cap body size (10K chars max)
  const MAX_EMAIL_BODY = 10_000;
  let sanitizedBody = textBody || payload.htmlBody || "";
  try {
    sanitizedBody = sanitizeUserInput(sanitizedBody, MAX_EMAIL_BODY);
  } catch (_e) {
    return jsonError("Email content contains prohibited content", 400);
  }

  // Strip quoted email content from replies — email clients quote the entire
  // previous conversation which bloats the message and can exceed token limits.
  const isReply = /^re:/i.test((subject || "").trim());
  if (isReply) {
    const quoteMarkers = [
      /^\s*-{3,}\s*On .+ wrote\s*-{3,}/im,
      /^On .+ wrote:\s*$/m,
      /^\s*-{3,}\s*Original Message\s*-{3,}/im,
      /^\s*_{3,}/m,
      /^From:\s+/m,
      /^Sent:\s+/m,
      /^\*From:\*/m,
      /^>{2,}/m,
      /^\s*-{4,}\s*$/m,
    ];
    for (const marker of quoteMarkers) {
      const match = sanitizedBody.match(marker);
      if (match?.index != null && match.index > 10) {
        sanitizedBody = sanitizedBody.substring(0, match.index).trim();
        logger.info(
          `[Email] Stripped quoted content at "${marker.source}" (${sanitizedBody.length} chars remaining)`,
          {
            category: LogCategory.GENERAL,
          }
        );
        break;
      }
    }
    // Hard cap replies at 2K chars — agent answers are short
    if (sanitizedBody.length > 2000) {
      sanitizedBody = sanitizedBody.substring(0, 2000);
    }
  }

  payload.textBody = sanitizedBody;
  const senderEmail = from.toLowerCase().trim();

  logger.info(`[Email] Processing from ${senderEmail}: "${subject}"`, {
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

    if (!identifiedAgent) {
      logger.warn(`[Email] Unknown sender rejected: ${senderEmail}`, {
        category: LogCategory.GENERAL,
      });
      return new Response(
        JSON.stringify({
          success: true,
          reply:
            "I don't recognise this email address. Please email from your registered Zyprus agent email, or contact support to register.",
          agentFound: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    logger.info(
      `[Email] Identified agent: ${identifiedAgent.fullName} (${identifiedAgent.region})`,
      {
        category: LogCategory.GENERAL,
      }
    );

    // Rate limiting (keyed by sender email)
    const withinRateLimit = await checkRateLimit(supabase, senderEmail).catch(
      () => true
    );
    if (!withinRateLimit) {
      logger.warn(`[Email] Rate limit exceeded for ${senderEmail}`, {
        category: LogCategory.GENERAL,
      });
      return new Response(
        JSON.stringify({
          success: true,
          reply:
            "You're sending emails too quickly. Please wait a moment and try again.",
          agentFound: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use sender email as userId for chat_history
    const userId = senderEmail;

    // Email message format: channel marker + body + reminder to extract fields.
    // The reminder at the END gets highest AI attention (recency bias).
    const channelNote =
      "[Channel: email — do NOT mention WhatsApp, do NOT use sendEmail tool]";
    const extractionReminder = `\n\n---\nIMPORTANT: Extract ALL fields from the email above. Pay special attention to the EXACT location/area name (e.g., pass "Tala, Paphos" not just "Paphos"). Pass the Google Maps URL as locationUrl. Do NOT ask for information already provided above.`;
    const userMessage = subject
      ? `${channelNote}\n\n${sanitizedBody}${extractionReminder}`
      : `${channelNote}\n\n${sanitizedBody}${extractionReminder}`;

    // Use agent's mobile number as pending_images key (same key WhatsApp uses)
    const agentPhone =
      identifiedAgent.mobile?.replace(/\D/g, "") || senderEmail;

    // Clear old pending images for new emails (prevent cross-email contamination)
    // Reply emails keep the original email's images
    if (!isReply) {
      try {
        await clearPendingImages(agentPhone);
        logger.info(`[Email] Cleared old pending images for ${agentPhone}`, {
          category: LogCategory.GENERAL,
        });
      } catch (err) {
        logger.error(
          "[Email] FAILED to clear old pending images — aborting",
          err instanceof Error ? err : undefined,
          {
            category: LogCategory.GENERAL,
          }
        );
        return new Response(
          JSON.stringify({
            success: false,
            reply:
              "I had a temporary issue processing your email. Please resend it.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Validate and store images (same as WhatsApp image ingress)
    const rawImageUrls = payload.imageUrls || [];
    if (rawImageUrls.length > 0) {
      const validation = await validateImagesAtIngress(rawImageUrls);
      const validUrls = validation.valid.map((i) => i.url);

      if (validation.invalid.length > 0) {
        logger.warn("[Email] Some images failed validation", {
          category: LogCategory.GENERAL,
          validCount: validation.valid.length,
          invalidCount: validation.invalid.length,
        });
      }

      if (validUrls.length > 0) {
        await addPendingImages(
          agentPhone,
          validUrls.map((url) => ({ url, contentHash: url }))
        ).catch((err) => {
          logger.warn("[Email] Failed to store pending images (non-critical)", {
            category: LogCategory.GENERAL,
            error: String(err),
          });
        });
        logger.info(
          `[Email] Stored ${validUrls.length} validated images for ${agentPhone}`,
          {
            category: LogCategory.GENERAL,
          }
        );
      }
    }

    // Store document attachments (PDFs, DOCX, KMZ)
    const rawDocumentUrls = payload.documentUrls || [];
    if (rawDocumentUrls.length > 0) {
      if (!isReply) {
        await clearPendingDocuments(agentPhone).catch(() => {});
      }
      for (const docUrl of rawDocumentUrls) {
        const filename = docUrl.split("/").pop()?.split("?")[0] || "document";
        await addPendingDocument(agentPhone, docUrl, filename).catch((err) => {
          logger.warn(
            "[Email] Failed to store pending document (non-critical)",
            {
              category: LogCategory.GENERAL,
              error: String(err),
            }
          );
        });
      }
      logger.info(
        `[Email] Stored ${rawDocumentUrls.length} documents for ${agentPhone}`,
        {
          category: LogCategory.GENERAL,
        }
      );
    }

    // Load chat history — same strategy as before:
    // New emails: empty (prevent cross-email contamination), unless Sophia was waiting for info
    // Reply emails: last 6 messages for context
    let history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (isReply) {
      try {
        const fullHistory = await getHistory(userId);
        history = fullHistory.slice(-6);
        logger.info(
          `[Email] Reply — loaded ${history.length} recent messages`,
          {
            category: LogCategory.GENERAL,
          }
        );
      } catch {
        history = [];
      }
    } else {
      try {
        const recentHistory = await getHistory(userId);
        if (recentHistory.length > 0) {
          const lastModel = recentHistory
            .filter((m: { role: string }) => m.role === "model")
            .pop();
          const lastText = lastModel?.parts?.[0]?.text || "";
          const isWaitingForInfo =
            lastText.includes("Google Maps") ||
            lastText.includes("pin location") ||
            lastText.includes("I need") ||
            lastText.includes("Could you") ||
            lastText.includes("please send") ||
            lastText.includes("please provide");
          if (isWaitingForInfo) {
            history = recentHistory.slice(-4);
            logger.info(
              `[Email] New email but Sophia was waiting for info — loaded ${history.length} messages`,
              {
                category: LogCategory.GENERAL,
              }
            );
          }
        }
      } catch {
        // Fresh start
      }
    }

    // Store user message
    await addMessage(userId, "user", userMessage).catch((err) => {
      logger.warn("[Email] Failed to store user message (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });

    // Fetch ALL pending images (same as WhatsApp — used for upload intent detection)
    const allPendingImages = await getPendingImages(agentPhone).catch(
      () => [] as string[]
    );
    if (allPendingImages.length > 0) {
      logger.info(
        `[Email] Found ${allPendingImages.length} pending images for ${agentPhone}`,
        {
          category: LogCategory.GENERAL,
        }
      );
    }

    // Load personalization context (same as WhatsApp)
    let personalizationContext = "";
    const userContext = await buildUserContext(agentPhone, userMessage).catch(
      (err) => {
        logger.warn("[Email] Failed to build user context (non-critical)", {
          category: LogCategory.GENERAL,
          error: String(err),
        });
        return null;
      }
    );
    if (userContext) {
      personalizationContext = formatContextForPrompt(userContext);
    }

    // Load last document (same as WhatsApp — enables "email me the document")
    const lastDocument = await getLastDocument(userId).catch(() => null);

    // Build system prompt — IDENTICAL to WhatsApp
    const systemPrompt = await buildSystemPrompt(
      supabase,
      {
        userId,
        phoneNumber: agentPhone,
        agentName: identifiedAgent.fullName,
        agentEmail: identifiedAgent.communicationEmail,
        agentRegion: identifiedAgent.region,
        agentCanUpload: identifiedAgent.canUpload,
        personalizationContext,
        imageUrls: allPendingImages,
        userMessage,
        lastDocument,
      },
      identifiedAgent
    );

    // Run AI chat — IDENTICAL to WhatsApp
    const aiResult = await chat(
      history,
      systemPrompt,
      userMessage,
      allPendingImages,
      identifiedAgent,
      agentPhone
    );

    const reply = sanitizeAiOutput(
      aiResult.response || "I couldn't process your request. Please try again."
    );

    // Store AI response in chat history
    await addMessage(userId, "model", reply).catch((err) => {
      logger.warn("[Email] Failed to store AI response (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });

    logger.info(
      `[Email] Processed successfully. Tools used: ${aiResult.toolsUsed?.join(", ") || "none"}`,
      {
        category: LogCategory.GENERAL,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        reply,
        toolsUsed: aiResult.toolsUsed || [],
        agentFound: true,
        agentName: identifiedAgent.fullName,
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
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
