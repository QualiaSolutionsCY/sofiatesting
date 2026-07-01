/**
 * Webhook Handler
 *
 * Handles WhatsApp webhook requests from WaSenderAPI.
 * - Signature verification
 * - Rate limiting
 * - Message deduplication
 * - Request processing orchestration
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { type Document, Packer } from "https://esm.sh/docx@8.5.0";
import {
  addMessage,
  claimMessageForProcessing,
  getHistory,
  getLastDocument,
  saveLastDocument,
} from "../../_shared/db.ts";
import { addBreadcrumb, captureError } from "../../_shared/sentry.ts";
import { identifyAgentByPhone } from "../agents/identifier.ts";
import { SOPHIA_LOGO_BASE64 } from "../assets/sophia-logo.ts";
import { VIEWING_FORM_LOGO_BASE64 } from "../assets/viewing-form-logo.ts";
import { detectDocxTemplateType } from "../docx/detector.ts";
import {
  createMarketingAgreement,
  createReservationAgreement,
  createViewingFormAdvanced,
  createViewingFormMultiple,
  createViewingFormSingle,
  parseMarketingAgreementData,
  parseReservationAgreementData,
  parseViewingFormAdvancedData,
  parseViewingFormMultipleData,
  parseViewingFormSingleData,
} from "../docx/templates/index.ts";
import {
  createDocxFile,
  isDocxTemplate,
  wasDocxTemplateRequested,
} from "../docx-generator.ts";
import {
  buildUserContext,
  calculateImportance,
  extractTopics,
  formatContextForPrompt,
  storeMemory,
} from "../memory/sophia-memory.ts";
import { buildSystemPrompt, chat } from "../services/ai-chat.ts";
import {
  createTimer,
  getActiveExperiment,
  trackDocumentGenerated,
  trackError,
  trackEvent,
} from "../services/analytics.ts";
import {
  detectEmailSendingIntent,
  sendEmail,
} from "../services/email-service.ts";
import {
  extractMessage,
  generateMessageKey,
  parseTemplateResponse,
} from "../services/message-processor.ts";
// Import centralized detection functions
import {
  isConfirmationMessage as centralizedIsConfirmation,
  detectTemplateTypeFromMessage,
} from "../templates/detection.ts";
import { getContext } from "../utils/context.ts";
import {
  hasAllRequiredFields,
  isCollectingInformation,
} from "../utils/field-validator.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { checkRateLimit } from "../utils/rate-limiter.ts";
import {
  sanitizeAiOutput,
  sanitizeUserInput,
  validatePhoneNumber,
  validateWebhookPayload,
} from "../utils/validation.ts";
import {
  formatPhoneNumber,
  sendDocxFile,
  sendLogoImage,
  sendTextMessage,
} from "../utils/wasend.ts";
import {
  extractSignatureHeader,
  verifyWebhookSignature,
} from "../utils/webhook-auth.ts";

const WASEND_WEBHOOK_SECRET = Deno.env.get("WASEND_WEBHOOK_SECRET");

// In-memory dedup: prevents duplicate processing when DB constraint race occurs
// Belt-and-suspenders alongside the DB unique constraint in processed_webhooks
const processingKeys = new Map<string, number>();
const DEDUP_TTL_MS = 60_000; // 1 minute
const DEDUP_CLEANUP_INTERVAL = 30_000;
let lastDedupCleanup = Date.now();

function isAlreadyProcessing(key: string): boolean {
  const now = Date.now();
  // Periodic cleanup of stale entries
  if (now - lastDedupCleanup > DEDUP_CLEANUP_INTERVAL) {
    for (const [k, ts] of processingKeys) {
      if (now - ts > DEDUP_TTL_MS) processingKeys.delete(k);
    }
    lastDedupCleanup = now;
  }
  if (processingKeys.has(key)) return true;
  processingKeys.set(key, now);
  return false;
}

// Use centralized function for confirmation messages
const isConfirmationMessage = centralizedIsConfirmation;

/**
 * Detects if the AI response is informational (listing templates) rather than an actual document
 */
function isInformationalResponse(
  aiResponse: string,
  userMessage: string
): boolean {
  const lowerResponse = aiResponse.toLowerCase();
  const lowerMessage = userMessage.toLowerCase();

  const capabilityQuestions = [
    "what templates do",
    "which templates",
    "list templates",
    "available templates",
    "templates can you",
    "your templates",
    "all templates",
    "templates do you generate",
    "what can you",
  ];

  const isShowRequest =
    lowerMessage.includes("show me") || lowerMessage.includes("show the");

  if (
    !isShowRequest &&
    capabilityQuestions.some((q) => lowerMessage.includes(q))
  ) {
    const listingIndicators = [
      "i can help with",
      "i can generate",
      "available templates",
      "here are the",
      "categories i can",
      "would you like me to list",
      "templates include",
      "template categories",
      "predefined templates",
      "across four main categories",
      "43 predefined templates",
    ];

    if (listingIndicators.some((ind) => lowerResponse.includes(ind))) {
      return true;
    }
  }

  return false;
}

// Use centralized template type detection
const detectTemplateType = detectTemplateTypeFromMessage;

/**
 * Detects if user is asking for the Zyprus logo
 */
function isLogoRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const logoPatterns = [
    /\blogo\b/,
    /\bzyprus logo\b/,
    /\bcompany logo\b/,
    /\bbrand logo\b/,
    /\bsend.*logo\b/,
    /\bgive.*logo\b/,
    /\bget.*logo\b/,
    /\bneed.*logo\b/,
    /\bwant.*logo\b/,
    /\bshare.*logo\b/,
  ];

  return logoPatterns.some((pattern) => pattern.test(lowerMessage));
}

/**
 * Main request processor
 * @returns tokenCount from AI response (undefined if not available)
 */
async function processRequest(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  phoneNumber: string,
  imageUrls: string[] = []
): Promise<number | undefined> {
  try {
    // Check for logo request first
    if (isLogoRequest(userMessage)) {
      logger.info("[Logo] Logo request detected, sending logo image", {
        category: LogCategory.GENERAL,
      });
      await sendLogoImage(supabase, phoneNumber, SOPHIA_LOGO_BASE64);
      await addMessage(userId, "user", userMessage);
      await addMessage(
        userId,
        "assistant",
        "Here's the Zyprus Property Group logo!"
      );
      return;
    }

    // Add user message to database
    await addMessage(userId, "user", userMessage);

    // Run independent queries in parallel
    const [
      userContextResult,
      history,
      identifiedAgentResult,
      lastDocumentResult,
    ] = await Promise.all([
      buildUserContext(phoneNumber, userMessage).catch((error) => {
        logger.warn("Failed to build user context (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "buildUserContext",
          phoneNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }),
      getHistory(userId).catch((error) => {
        logger.warn("Failed to get chat history (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "getHistory",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }),
      identifyAgentByPhone(phoneNumber).catch((error) => {
        logger.warn("Failed to identify agent by phone (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "identifyAgentByPhone",
          phoneNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }),
      getLastDocument(userId).catch((error) => {
        logger.warn("Failed to get last document (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "getLastDocument",
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }),
    ]);

    const userContext = userContextResult;
    let personalizationContext = "";
    if (userContext) {
      personalizationContext = formatContextForPrompt(userContext);
      const topics = extractTopics(userMessage);
      const importance = calculateImportance(userMessage, topics);
      storeMemory(userContext.profile.id, "user", userMessage, {
        importance,
        topics,
      }).catch((error) => {
        logger.warn("Failed to store user message memory (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "storeMemory-user",
          userId: userContext.profile.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const identifiedAgent = identifiedAgentResult;

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(
      supabase,
      {
        userId,
        phoneNumber,
        agentName: identifiedAgent?.fullName,
        agentEmail: identifiedAgent?.communicationEmail,
        agentRegion: identifiedAgent?.region,
        agentCanUpload: identifiedAgent?.canUpload,
        personalizationContext,
        imageUrls,
        userMessage, // P1 PERFORMANCE: Used for conditional image fetching
        lastDocument: lastDocumentResult,
      },
      identifiedAgent
    );

    // Add breadcrumb before AI call
    addBreadcrumb("Calling OpenRouter", "ai", {
      model: "anthropic/claude-sonnet-5",
    });

    // Call AI
    const aiResult = await chat(
      history,
      systemPrompt,
      userMessage,
      imageUrls,
      identifiedAgent,
      phoneNumber
    );

    // Add breadcrumb for tool execution if tools were used
    if (aiResult.toolsUsed && aiResult.toolsUsed.length > 0) {
      addBreadcrumb("Tools executed", "tool", {
        toolNames: aiResult.toolsUsed.join(", "),
        toolCount: aiResult.toolsUsed.length,
      });
    }

    if (!aiResult.success || !aiResult.response) {
      const errorResponse =
        aiResult.response ||
        "I couldn't process your request. Please try again.";
      await sendTextMessage(phoneNumber, errorResponse);
      // CRITICAL: Save error responses to chat_history to prevent conversation corruption.
      // Without this, subsequent messages have orphan user messages with no model response,
      // causing the AI model to fail on all following messages.
      await addMessage(userId, "model", errorResponse).catch((err) =>
        logger.warn("Failed to save error response to chat_history", {
          category: LogCategory.GENERAL,
          error: String(err),
        })
      );
      return;
    }

    // Sanitize AI output before sending to WhatsApp (strip untrusted URLs, injection markers)
    const aiResponse = sanitizeAiOutput(aiResult.response);
    const tokenCount = aiResult.tokenCount;

    // Add AI response to database
    await addMessage(userId, "model", aiResponse);

    // Store AI response in memory
    if (userContext) {
      const responseTopics = extractTopics(aiResponse);
      storeMemory(userContext.profile.id, "assistant", aiResponse, {
        importance: 0.5,
        topics: responseTopics,
      }).catch((error) => {
        logger.warn("Failed to store AI response memory (non-critical)", {
          category: LogCategory.GENERAL,
          operation: "storeMemory-assistant",
          userId: userContext.profile.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    // A tool already delivered a document to the user with `aiResponse` as its
    // caption (e.g. an invoice/credit-note PDF). Don't also send the same text as
    // a separate chat message — the document + caption IS the reply. (History was
    // already saved above, so context is preserved.)
    if (aiResult.documentSent) {
      return tokenCount;
    }

    // Build updated history once (reused for both email detection and DOCX routing)
    const updatedHistory = [
      ...history,
      { role: "user", parts: [{ text: userMessage }] },
      { role: "model", parts: [{ text: aiResponse }] },
    ];

    // Check for email sending intent
    // IMPORTANT: Skip email detection if sendEmail tool was already called (prevents double emails)
    const sendEmailAlreadyCalled = aiResult.toolsUsed?.includes("sendEmail");
    if (!sendEmailAlreadyCalled) {
      const emailIntent = await detectEmailSendingIntent(
        aiResponse,
        updatedHistory,
        identifiedAgent?.communicationEmail,
        userId
      );

      if (emailIntent) {
        const emailResult = await sendEmail(emailIntent);
        if (!emailResult.success) {
          const failureNote = `\n\n(Note: There was an issue sending the email: ${emailResult.error}. Please try again or send it manually.)`;
          await sendTextMessage(phoneNumber, aiResponse + failureNote);
          return tokenCount;
        }
      }
    }

    // Check if confirmation message - always send as text
    if (isConfirmationMessage(aiResponse)) {
      logger.info(
        "[Confirmation] Detected confirmation message -> sending as TEXT",
        { category: LogCategory.GENERAL }
      );
      await sendTextMessage(phoneNumber, aiResponse);
      return tokenCount;
    }

    // Determine DOCX vs text routing
    const isInformational = isInformationalResponse(aiResponse, userMessage);

    if (isInformational) {
      const messages = parseTemplateResponse(
        aiResponse,
        identifiedAgent?.landline
      );
      for (const msg of messages) {
        await sendTextMessage(phoneNumber, msg);
      }
      return tokenCount;
    }

    // Reuse the already-constructed history (avoids redundant DB call)
    let shouldSendAsDocx =
      !isInformational && isDocxTemplate(aiResponse, updatedHistory);
    const detectedTemplateType = detectTemplateType(userMessage);

    // DEBUG: Log initial DOCX detection result
    logger.info(
      `[DOCX DEBUG] Initial check - isDocxTemplate: ${shouldSendAsDocx}, isInformational: ${isInformational}, responseLength: ${aiResponse.length}`,
      { category: LogCategory.GENERAL }
    );

    // SAFETY: Registration templates (containing "Dear XXXXXXXX" or "Subject:") are ALWAYS TEXT
    // This prevents misrouting Advanced Seller Registration as Marketing Agreement DOCX
    if (
      shouldSendAsDocx &&
      (/Dear\s+X{6,}/i.test(aiResponse) || aiResponse.includes("Subject:"))
    ) {
      logger.info(
        "[Webhook] Registration template detected in DOCX response - forcing TEXT",
        { category: LogCategory.GENERAL }
      );
      shouldSendAsDocx = false;
    }

    // Field validation checks
    const isCollecting = isCollectingInformation(aiResponse);
    if (shouldSendAsDocx && isCollecting) {
      logger.info(
        "[DOCX DEBUG] Blocked - isCollectingInformation returned true",
        { category: LogCategory.GENERAL }
      );
      shouldSendAsDocx = false;
    }

    const hasAllFields = hasAllRequiredFields(
      aiResponse,
      detectedTemplateType || undefined
    );
    if (shouldSendAsDocx && !hasAllFields) {
      logger.info(
        `[DOCX DEBUG] Blocked - hasAllRequiredFields returned false, templateType: ${detectedTemplateType}`,
        { category: LogCategory.GENERAL }
      );
      shouldSendAsDocx = false;
    }

    // Final decision log
    logger.info(
      `[DOCX DEBUG] Final decision - shouldSendAsDocx: ${shouldSendAsDocx}`,
      { category: LogCategory.GENERAL }
    );

    if (shouldSendAsDocx) {
      // Send as DOCX file
      logger.info(
        "Detected DOCX template - generating and sending as file attachment",
        { category: LogCategory.GENERAL }
      );
      trackDocumentGenerated(
        phoneNumber,
        detectedTemplateType || "unknown",
        identifiedAgent?.id
      );

      let filename = `document_${Date.now()}.docx`;
      const templateType = detectDocxTemplateType(aiResponse);
      let docxContent: Uint8Array;

      if (
        templateType.startsWith("viewing-form-") ||
        templateType === "reservation-agreement" ||
        templateType === "marketing-non-exclusive"
      ) {
        try {
          // Convert base64 viewing form logo to Uint8Array for viewing forms
          let logoData: Uint8Array | undefined;
          const isViewingForm = templateType.startsWith("viewing-form-");
          const logoBase64 = isViewingForm
            ? VIEWING_FORM_LOGO_BASE64
            : SOPHIA_LOGO_BASE64;
          if (logoBase64) {
            try {
              const binaryString = atob(logoBase64);
              const array = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                array[i] = binaryString.charCodeAt(i);
              }
              logoData = array;
            } catch (_e) {
              logoData = undefined;
            }
          }

          let docxDoc: Document | null = null;

          switch (templateType) {
            case "viewing-form-single": {
              const singleData = parseViewingFormSingleData(aiResponse);
              if (singleData) {
                docxDoc = createViewingFormSingle(singleData, logoData, "jpg");
              }
              break;
            }
            case "viewing-form-multiple": {
              const multipleData = parseViewingFormMultipleData(aiResponse);
              if (multipleData) {
                docxDoc = createViewingFormMultiple(
                  multipleData,
                  logoData,
                  "jpg"
                );
              }
              break;
            }
            case "viewing-form-advanced": {
              const advancedData = parseViewingFormAdvancedData(aiResponse);
              if (advancedData) {
                docxDoc = createViewingFormAdvanced(
                  advancedData,
                  logoData,
                  "jpg"
                );
              } else {
                // Fallback: try multiple parser and still use advanced template
                const multipleAsAdvanced =
                  parseViewingFormMultipleData(aiResponse);
                if (multipleAsAdvanced) {
                  docxDoc = createViewingFormAdvanced(
                    {
                      date: multipleAsAdvanced.date,
                      persons: multipleAsAdvanced.persons,
                      property: multipleAsAdvanced.property,
                    },
                    logoData,
                    "jpg"
                  );
                }
              }
              break;
            }
            case "reservation-agreement": {
              const reservationData = parseReservationAgreementData(aiResponse);
              if (reservationData) {
                docxDoc = createReservationAgreement(reservationData);
                filename = "Property_Reservation_Agreement.docx";
              }
              break;
            }
            case "marketing-non-exclusive": {
              const agentName = identifiedAgent?.fullName || "Agent";
              const marketingData = parseMarketingAgreementData(
                aiResponse,
                agentName
              );
              if (marketingData) {
                docxDoc = createMarketingAgreement(marketingData);
                filename = "Non_Exclusive_Marketing_Agreement.docx";
              }
              break;
            }
          }

          if (docxDoc) {
            const buffer = await Packer.toBuffer(docxDoc);
            docxContent = new Uint8Array(buffer);
          } else {
            docxContent = await createDocxFile(aiResponse, filename);
          }
        } catch (_error) {
          docxContent = await createDocxFile(aiResponse, filename);
        }
      } else {
        docxContent = await createDocxFile(aiResponse, filename);
      }

      const sendResult = await sendDocxFile(
        supabase,
        phoneNumber,
        docxContent,
        filename,
        1,
        userId,
        saveLastDocument
      );

      if (!sendResult.ok) {
        await sendTextMessage(phoneNumber, aiResponse);
      }
    } else {
      // Send as text message(s)
      const messageParts = parseTemplateResponse(
        aiResponse,
        identifiedAgent?.landline
      );

      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        await sendTextMessage(phoneNumber, part);

        if (i < messageParts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    return tokenCount;
  } catch (error) {
    const { correlationId } = getContext();
    captureError(error as Error, {
      phoneNumber,
      correlationId,
      channel: "whatsapp",
    });
    logger.error("Error in processRequest: " + String(error), undefined, {
      category: LogCategory.GENERAL,
    });
    trackError(phoneNumber, "PROCESS_REQUEST_ERROR", String(error));
    return;
  }
}

/**
 * Main webhook handler
 */
export async function handleWebhook(
  req: Request,
  supabase: SupabaseClient
): Promise<Response> {
  // Handle GET requests (webhook verification)
  if (req.method === "GET") {
    logger.info("Webhook verification request received", {
      category: LogCategory.WEBHOOK,
    });
    return new Response("Webhook functional", { status: 200 });
  }

  // Handle POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Verify webhook signature - FAIL-CLOSED if secret not configured
  if (!WASEND_WEBHOOK_SECRET) {
    logger.error(
      "SECURITY: WASEND_WEBHOOK_SECRET not configured - rejecting webhook",
      undefined,
      {
        category: LogCategory.WEBHOOK,
        operation: "webhook_auth",
      }
    );
    return new Response(
      "Service Unavailable - webhook authentication not configured",
      { status: 503 }
    );
  }

  const signature = extractSignatureHeader(req.headers);

  const isValidSignature = await verifyWebhookSignature(
    signature,
    rawBody,
    WASEND_WEBHOOK_SECRET
  );
  if (!isValidSignature) {
    logger.error(
      "SECURITY: Invalid webhook signature - rejecting request",
      undefined,
      {
        category: LogCategory.WEBHOOK,
        operation: "webhook_auth",
        hasSignature: !!signature,
      }
    );
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error("Invalid JSON payload", undefined, {
      category: LogCategory.GENERAL,
    });
    return new Response("Bad Request", { status: 400 });
  }

  // Validate payload structure
  if (!validateWebhookPayload(payload)) {
    logger.warn("Invalid webhook payload structure", {
      operation: "validation",
    });
    return new Response("OK", { status: 200 });
  }

  // Extract message from payload
  const extracted = await extractMessage(payload);

  if (!extracted) {
    logger.info("Could not extract valid message from payload", {
      category: LogCategory.GENERAL,
    });
    return new Response("OK", { status: 200 });
  }

  const { message, remoteJid, userMessage, imageUrls } = extracted;

  if (!remoteJid) {
    logger.error("No remoteJid found in message", undefined, {
      category: LogCategory.GENERAL,
    });
    return new Response("OK", { status: 200 });
  }

  // Format phone number
  const phoneNumber = formatPhoneNumber(remoteJid);
  if (!phoneNumber) {
    logger.error("Could not format phone number", undefined, {
      category: LogCategory.GENERAL,
    });
    return new Response("OK", { status: 200 });
  }

  // Validate phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    logger.warn("Invalid phone number format", { operation: "validation" });
    return new Response("OK", { status: 200 });
  }

  // Add Sentry breadcrumb for request tracking
  const { correlationId } = getContext();
  addBreadcrumb("WhatsApp webhook received", "http", { correlationId });

  // Check rate limit
  const withinRateLimit = await checkRateLimit(supabase, remoteJid);
  if (!withinRateLimit) {
    logger.warn("Rate limit exceeded", { operation: "rate_limit" });
    return new Response("OK", { status: 200 });
  }

  // Sanitize user input
  let sanitizedMessage: string;
  try {
    sanitizedMessage = sanitizeUserInput(userMessage);
  } catch (error) {
    logger.warn("User input failed validation", {
      operation: "validation",
      errorMessage: (error as Error).message,
    });
    return new Response("OK", { status: 200 });
  }

  // Deduplication (two layers: in-memory + database)
  const messageKey = generateMessageKey(message);
  if (messageKey) {
    // Layer 1: In-memory check (catches rapid duplicates before DB round-trip)
    if (isAlreadyProcessing(messageKey)) {
      logger.info("Duplicate webhook caught by in-memory dedup", {
        operation: "deduplication",
        messageKey,
      });
      return new Response("OK", { status: 200 });
    }
    // Layer 2: Database unique constraint (catches duplicates across Edge Function instances)
    const claimed = await claimMessageForProcessing(messageKey, remoteJid);
    if (!claimed) {
      logger.info("Duplicate webhook caught by database dedup", {
        operation: "deduplication",
        messageKey,
      });
      return new Response("OK", { status: 200 });
    }
  }

  // Image-only messages: images are already stored in pending_images by extractMessage().
  // Skip AI processing - the AI will see accumulated images when the next TEXT message arrives.
  // BUT still save to chat_history so the AI has conversation continuity.
  const isImageOnlyMessage =
    sanitizedMessage === "[User sent image(s)]" ||
    sanitizedMessage === "[User sent image(s) but decryption failed]";
  if (isImageOnlyMessage) {
    logger.info("Image-only message - stored to pending, skipping AI", {
      category: LogCategory.IMAGE,
      phoneNumber,
    });
    // DO NOT save each "[User sent image(s)]" to chat_history!
    // With 6+ photos, these entries push real messages out of the 10-message history window,
    // causing the AI to lose context (property details, user instructions) and loop.
    // The AI gets the image count from the ACCUMULATED PROPERTY PHOTOS context injection instead.

    // Send ONE acknowledgment for the first image only.
    if (imageUrls.length > 0) {
      const { getPendingImageCount } = await import(
        "../services/pending-images.ts"
      );
      const digitsPhone = phoneNumber.replace(/\D/g, "");
      const totalImages = await getPendingImageCount(digitsPhone);
      if (totalImages === 1) {
        const ack = `Got it — photo received. Send more or say "done" when you're ready.`;
        await sendTextMessage(phoneNumber, ack);
        // Save ONLY the first ack to chat_history (1 entry, not 6+)
        await addMessage(remoteJid, "model", ack).catch(() => {});
      }
    }
    return new Response("OK", { status: 200 });
  }

  // Check for active autoresearch experiment (cached, non-blocking)
  const activeExperiment = await getActiveExperiment().catch(() => null);
  const experimentId = activeExperiment?.id;
  // All messages during an active experiment are tagged as "challenger"
  // (the challenger prompt is live; baseline metrics come from before the experiment)
  const experimentVariant = activeExperiment ? "challenger" : undefined;

  // Track inbound message (fire-and-forget)
  trackEvent({
    phoneNumber,
    eventType: "message_received",
    metadata: {
      hasImages: imageUrls.length > 0,
      imageCount: imageUrls.length,
      messageLength: sanitizedMessage.length,
    },
    experimentId,
    experimentVariant,
  });

  // Start response timer
  const requestTimer = createTimer();

  // Process the request
  try {
    const tokenCount = await processRequest(
      supabase,
      remoteJid,
      sanitizedMessage,
      phoneNumber,
      imageUrls
    );
    // Track successful response with token usage
    trackEvent({
      phoneNumber,
      eventType: "message_sent",
      responseTimeMs: requestTimer.end(),
      tokenCount,
      experimentId,
      experimentVariant,
    });
  } catch (err) {
    captureError(err as Error, {
      phoneNumber,
      correlationId,
      channel: "whatsapp",
    });
    logger.error("processRequest failed: " + String(err), undefined, {
      category: LogCategory.GENERAL,
    });
    trackEvent({
      phoneNumber,
      eventType: "error",
      errorCode: "PROCESS_REQUEST_FAILED",
      errorMessage: String(err),
      experimentId,
      experimentVariant,
    });
  }

  return new Response("OK", { status: 200 });
}
