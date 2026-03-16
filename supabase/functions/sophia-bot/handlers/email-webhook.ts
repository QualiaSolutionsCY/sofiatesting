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
import { parsePropertyEmail, formatExtractedFields } from "../services/email-parser.ts";
import { validateImagesAtIngress } from "../services/image-validator.ts";
import { addPendingImages, clearPendingImages, getPendingImages } from "../services/pending-images.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { checkRateLimit } from "../utils/rate-limiter.ts";
import { constantTimeCompare } from "../utils/webhook-auth.ts";

const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");

// No alias mapping needed — agents table uses communication_email directly

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

  logger.info(`[Email] Processing from ${senderEmail}: "${subject}"`, {
    category: LogCategory.GENERAL,
  });

  try {
    // Identify agent by resolved email
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
      logger.warn(`[Email] Unknown sender rejected: ${senderEmail}`, {
        category: LogCategory.GENERAL,
      });
      return new Response(
        JSON.stringify({
          success: true,
          reply: "I don't recognise this email address. Please email from your registered Zyprus agent email, or contact support to register.",
          agentFound: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limiting (keyed by sender email)
    const withinRateLimit = await checkRateLimit(supabase, senderEmail).catch(() => true);
    if (!withinRateLimit) {
      logger.warn(`[Email] Rate limit exceeded for ${senderEmail}`, {
        category: LogCategory.GENERAL,
      });
      return new Response(
        JSON.stringify({
          success: true,
          reply: "You're sending emails too quickly. Please wait a moment and try again.",
          agentFound: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use sender email as userId for chat_history (keeps email threads separate from WhatsApp)
    const userId = senderEmail;

    // Build user message: subject + body + email channel context
    // CRITICAL: Tell AI this is EMAIL so it never mentions WhatsApp

    // Server-side assignment extraction — don't rely on the AI to parse "assign to X"
    const extractedAssignTo = extractAssignmentFromEmail(textBody || "");
    if (extractedAssignTo) {
      logger.info(`[Email] Server-side extracted assignTo: ${extractedAssignTo}`, {
        category: LogCategory.GENERAL,
      });
    }

    // SERVER-SIDE EMAIL PARSING — extract fields deterministically before AI sees them
    const parsed = parsePropertyEmail(textBody || "", subject || "");
    const extractedFieldsBlock = formatExtractedFields(parsed);

    logger.info(`[Email] Server-side parsed: ${JSON.stringify({
      isLand: parsed.isLand,
      propertyType: parsed.propertyType,
      price: parsed.price,
      location: parsed.location,
      bedrooms: parsed.bedrooms,
      ownerName: parsed.ownerName,
      featuresCount: parsed.features.length,
    })}`, { category: LogCategory.GENERAL });

    const assignmentDirective = extractedAssignTo
      ? `\n  assignTo: "${extractedAssignTo}"`
      : "";

    const emailPrefix = `[THIS MESSAGE IS VIA EMAIL — NOT WHATSAPP. Reply as email. Never mention WhatsApp or ask to send photos on WhatsApp.

CRITICAL INSTRUCTION: The fields below were extracted from the email by a server-side parser. You MUST use these EXACT values when calling the tool. Do NOT re-read the email to extract different values. Do NOT use your training data or imagination. Copy these values exactly as shown.

${extractedFieldsBlock}${assignmentDirective}

RULES:
1. Call ${parsed.isLand ? "createLandListing" : "createPropertyListing"} with the PRE-EXTRACTED values above. Copy each field EXACTLY.
2. Do NOT call extractFromBazaraki or getZyprusData.
3. For any field NOT listed above, check the email text below — but for fields that ARE listed above, use the pre-extracted value.
4. All attached images are already stored — they will be picked up automatically.]`;
    const userMessage = subject
      ? `${emailPrefix}\n\n[Subject: ${subject}]\n\n${textBody || ""}`
      : `${emailPrefix}\n\n${textBody || ""}`;

    const rawImageUrls = payload.imageUrls || [];

    // Store email images under agent's MOBILE number (the property listing tool reads by phone)
    const imageKey = identifiedAgent.mobile?.replace(/\D/g, "") || senderEmail;

    // CRITICAL: Clear old pending images BEFORE adding new ones
    // Each email is a standalone upload — old images from previous emails must not contaminate
    // Even for replies, we clear and re-add the current email's images to avoid stale data
    await clearPendingImages(imageKey).catch((err) => {
      logger.warn("[Email] Failed to clear old pending images (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });
    logger.info(`[Email] Cleared old pending images for ${imageKey} (email isolation)`, {
      category: LogCategory.GENERAL,
    });

    // Validate images before storing (parity with WhatsApp path)
    let imageUrls: string[] = [];
    if (rawImageUrls.length > 0) {
      const validation = await validateImagesAtIngress(rawImageUrls);
      imageUrls = validation.valid.map((i) => i.url);

      if (validation.invalid.length > 0) {
        logger.warn("[Email] Some images failed validation", {
          category: LogCategory.GENERAL,
          validCount: validation.valid.length,
          invalidCount: validation.invalid.length,
          invalidReasons: validation.invalid.map((i) => i.error),
        });
      }

      if (imageUrls.length > 0) {
        await addPendingImages(
          imageKey,
          imageUrls.map((url) => ({ url, contentHash: url }))
        ).catch((err) => {
          logger.warn("[Email] Failed to store pending images (non-critical)", {
            category: LogCategory.GENERAL,
            error: String(err),
          });
        });
        logger.info(`[Email] Stored ${imageUrls.length} validated images in pending_images for ${imageKey}`, {
          category: LogCategory.GENERAL,
        });
      }
    }

    // Email history strategy:
    // - NEW emails (no "Re:" prefix): Empty history to prevent cross-email contamination
    //   (see bug history: Drafts 40366-40369 where data leaked between property emails)
    // - REPLY emails ("Re:" prefix): Load last 2 messages so SOPHIA has context
    //   for follow-up answers (e.g., "I said to assign to Susan")
    const isReply = /^re:/i.test(subject.trim());
    let history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (isReply) {
      try {
        const fullHistory = await getHistory(userId);
        // Only take last 2 messages (1 user + 1 model) to minimize contamination risk
        history = fullHistory.slice(-2);
        logger.info(`[Email] Reply detected — loaded ${history.length} recent messages for context`, {
          category: LogCategory.GENERAL,
        });
      } catch (err) {
        logger.warn("[Email] Failed to load history for reply (falling back to empty)", {
          category: LogCategory.GENERAL,
          error: String(err),
        });
        history = [];
      }
    } else {
      logger.info("[Email] New email — using empty history (isolation mode)", {
        category: LogCategory.GENERAL,
      });
    }

    // Store user message AFTER loading history
    await addMessage(userId, "user", userMessage).catch((err) => {
      logger.warn("[Email] Failed to store user message (non-critical)", {
        category: LogCategory.GENERAL,
        error: String(err),
      });
    });

    // Use agent's mobile number for image lookups (pending_images is keyed by phone)
    const phoneForImages = identifiedAgent.mobile?.replace(/\D/g, "") || senderEmail;

    // Fetch ALL pending images for this agent (includes any previously stored from email)
    // This is critical: chat() uses imageUrls for upload intent detection
    const allPendingImages = await getPendingImages(phoneForImages).catch(() => [] as string[]);
    if (allPendingImages.length > 0) {
      logger.info(`[Email] Found ${allPendingImages.length} pending images for ${phoneForImages}`, {
        category: LogCategory.GENERAL,
      });
    }

    // Build system prompt — pass agent's mobile as phoneNumber so pending_images lookup works
    const systemPrompt = await buildSystemPrompt(
      supabase,
      {
        userId,
        phoneNumber: phoneForImages, // agent mobile for pending_images lookup
        agentName: identifiedAgent.fullName,
        agentEmail: identifiedAgent.communicationEmail,
        agentRegion: identifiedAgent.region,
        agentCanUpload: identifiedAgent.canUpload,
        imageUrls: allPendingImages, // pass ALL pending images so AI sees them
        userMessage,
        lastDocument: null,
      },
      identifiedAgent
    );

    // Run AI chat — pass agent's mobile + all pending images for intent detection & tool execution
    const aiResult = await chat(
      history,
      systemPrompt,
      userMessage,
      allPendingImages, // pass pending images so isPropertyUploadIntent triggers
      identifiedAgent,
      phoneForImages
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
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Server-side extraction of "assign to X" from email body.
 * Returns a @zyprus.com email or null if no assignment found.
 * This is deterministic — we don't rely on the AI to parse it.
 */
function extractAssignmentFromEmail(text: string): string | null {
  // Agent name → email mapping (must stay in sync with property-upload.ts)
  const NAME_TO_EMAIL: Record<string, string> = {
    evelina: "evelina@zyprus.com",
    diana: "diana@zyprus.com",
    michelle: "michelle@zyprus.com",
    demetra: "demetra@zyprus.com",
    lauren: "listings@zyprus.com",
    charalambos: "csc@zyprus.com",
    azinas: "azinas@zyprus.com",
    "marios azinas": "azinas@zyprus.com",
    "marios polyviou": "marios@zyprus.com",
    marios: "marios@zyprus.com",
    maria: "maria@zyprus.com",
    christos: "christos@zyprus.com",
    dimitris: "dimitris@zyprus.com",
    susan: "susan@zyprus.com",
    victoria: "victoria@zyprus.com",
    brendan: "brendan@zyprus.com",
    natalia: "natalia.larnaca@zyprus.com",
    lysandros: "larnaca@zyprus.com",
    ivan: "nicosia@zyprus.com",
    narine: "famagusta@zyprus.com",
    nick: "nick@zyprus.com",
    olga: "olga@zyprus.com",
    philippos: "philippos@zyprus.com",
    olha: "olha@zyprus.com",
    danae: "danae@zyprus.com",
    daga: "daga@zyprus.com",
    olesya: "oz@zyprus.com",
    eleni: "eleni@zyprus.com",
    niki: "niki@zyprus.com",
    mir: "niki@zyprus.com",
  };

  // Regional office mapping
  const OFFICE_TO_EMAIL: Record<string, string> = {
    "paphos office": "requestpaphos@zyprus.com",
    "limassol office": "requestlimassol@zyprus.com",
    "larnaca office": "requestlarnaca@zyprus.com",
    "nicosia office": "requestnicosia@zyprus.com",
    "famagusta office": "requestfamagusta@zyprus.com",
  };

  const lower = text.toLowerCase();

  // Pattern 1: "assign to email@zyprus.com" or "assign it to email@zyprus.com"
  const emailMatch = lower.match(/assign(?:\s+it)?\s+to\s+(\S+@\S+)/);
  if (emailMatch) {
    let email = emailMatch[1].replace(/[.,;:!?)]+$/, ""); // strip trailing punctuation
    if (!email.includes(".")) {
      // Handle "demetra@zyprus" → "demetra@zyprus.com"
      email = email + ".com";
    }
    return email;
  }

  // Pattern 2: "assign to [office name]"
  for (const [office, email] of Object.entries(OFFICE_TO_EMAIL)) {
    if (lower.includes(`assign to ${office}`) || lower.includes(`assign it to ${office}`)) {
      return email;
    }
  }

  // Pattern 3: "assign to [agent name]"
  const nameMatch = lower.match(/assign(?:\s+it)?\s+to\s+([a-z]+(?:\s+[a-z]+)?)/);
  if (nameMatch) {
    const name = nameMatch[1].trim();
    if (NAME_TO_EMAIL[name]) {
      return NAME_TO_EMAIL[name];
    }
    // Try first word only (e.g., "assign to susan note" → "susan")
    const firstName = name.split(/\s+/)[0];
    if (NAME_TO_EMAIL[firstName]) {
      return NAME_TO_EMAIL[firstName];
    }
  }

  return null;
}
