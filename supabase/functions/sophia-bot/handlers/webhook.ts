/**
 * Webhook Handler
 *
 * Handles WhatsApp webhook requests from WaSenderAPI.
 * - Signature verification
 * - Rate limiting
 * - Message deduplication
 * - Request processing orchestration
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Document, Packer } from "https://esm.sh/docx@8.5.0";
import { ZYPRUS_LOGO_BASE64 } from "../../_shared/prompts.ts";
import { logger, LogCategory } from "../utils/logger.ts";
import {
  verifyWebhookSignature,
  extractSignatureHeader,
} from "../utils/webhook-auth.ts";
import {
  validatePhoneNumber,
  sanitizeUserInput,
  validateWebhookPayload,
} from "../utils/validation.ts";
import { checkRateLimit } from "../utils/rate-limiter.ts";
import { getHistory, addMessage, claimMessageForProcessing, saveLastDocument, getLastDocument } from "../../_shared/db.ts";
import { identifyAgentByPhone } from "../agents/identifier.ts";
import {
  extractMessage,
  generateMessageKey,
  parseTemplateResponse,
} from "../services/message-processor.ts";
import { buildSystemPrompt, chat } from "../services/ai-chat.ts";
import {
  sendTextMessage,
  sendDocxFile,
  sendLogoImage,
  formatPhoneNumber,
} from "../utils/wasend.ts";
import {
  buildUserContext,
  formatContextForPrompt,
  storeMemory,
  extractTopics,
  calculateImportance,
} from "../memory/sophia-memory.ts";
import { createDocxFile, isDocxTemplate, wasDocxTemplateRequested } from "../docx-generator.ts";
import { detectDocxTemplateType } from "../docx/detector.ts";
import {
  createViewingFormSingle,
  createViewingFormMultiple,
  createViewingFormAdvanced,
  parseViewingFormSingleData,
  parseViewingFormMultipleData,
  parseViewingFormAdvancedData,
  createReservationAgreement,
  parseReservationAgreementData,
  createMarketingAgreement,
  parseMarketingAgreementData,
} from "../docx/templates/index.ts";
import {
  hasAllRequiredFields,
  isCollectingInformation,
} from "../utils/field-validator.ts";
// Import centralized detection functions
import {
  isConfirmationMessage as centralizedIsConfirmation,
  detectTemplateTypeFromMessage,
} from "../templates/detection.ts";
import {
  trackMessageReceived,
  trackMessageSent,
  trackDocumentGenerated,
  trackError,
  createTimer,
} from "../services/analytics.ts";
import {
  detectEmailSendingIntent,
  sendEmail,
} from "../services/email-service.ts";

const WASEND_WEBHOOK_SECRET = Deno.env.get("WASEND_WEBHOOK_SECRET");

// Use centralized function for confirmation messages
const isConfirmationMessage = centralizedIsConfirmation;

/**
 * Detects if the AI response is informational (listing templates) rather than an actual document
 */
function isInformationalResponse(aiResponse: string, userMessage: string): boolean {
  const lowerResponse = aiResponse.toLowerCase();
  const lowerMessage = userMessage.toLowerCase();

  const capabilityQuestions = [
    'what templates do', 'which templates', 'list templates',
    'available templates', 'templates can you', 'your templates',
    'all templates', 'templates do you generate', 'what can you'
  ];

  const isShowRequest = lowerMessage.includes('show me') || lowerMessage.includes('show the');

  if (!isShowRequest && capabilityQuestions.some(q => lowerMessage.includes(q))) {
    const listingIndicators = [
      'i can help with', 'i can generate', 'available templates',
      'here are the', 'categories i can', 'would you like me to list',
      'templates include', 'template categories', 'predefined templates',
      'across four main categories', '43 predefined templates'
    ];

    if (listingIndicators.some(ind => lowerResponse.includes(ind))) {
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

  return logoPatterns.some(pattern => pattern.test(lowerMessage));
}

/**
 * Main request processor
 */
async function processRequest(
  supabase: SupabaseClient,
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  userMessage: string,
  phoneNumber: string,
  imageUrls: string[] = [],
): Promise<void> {
  try {
    // Check for logo request first
    if (isLogoRequest(userMessage)) {
      logger.info("[Logo] Logo request detected, sending logo image", { category: LogCategory.GENERAL });
      await sendLogoImage(supabase, phoneNumber, ZYPRUS_LOGO_BASE64);
      await addMessage(userId, "user", userMessage);
      await addMessage(userId, "assistant", "Here's the Zyprus Property Group logo!");
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
      buildUserContext(phoneNumber, userMessage).catch(() => null),
      getHistory(userId),
      identifyAgentByPhone(phoneNumber, supabaseUrl, supabaseKey).catch(() => null),
      getLastDocument(userId).catch(() => null),
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
      }).catch(() => {});
    }

    const identifiedAgent = identifiedAgentResult;

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(supabase, {
      userId,
      phoneNumber,
      agentName: identifiedAgent?.fullName,
      agentEmail: identifiedAgent?.communicationEmail,
      agentRegion: identifiedAgent?.region,
      agentCanUpload: identifiedAgent?.canUpload,
      personalizationContext,
      imageUrls,
      userMessage,  // P1 PERFORMANCE: Used for conditional image fetching
      lastDocument: lastDocumentResult,
    }, identifiedAgent);

    // Call AI
    const aiResult = await chat(
      history,
      systemPrompt,
      userMessage,
      imageUrls,
      identifiedAgent,
      supabaseUrl,
      supabaseKey,
      phoneNumber
    );

    if (!aiResult.success || !aiResult.response) {
      await sendTextMessage(phoneNumber, aiResult.response || "I couldn't process your request. Please try again.");
      return;
    }

    const aiResponse = aiResult.response;

    // Add AI response to database
    await addMessage(userId, "model", aiResponse);

    // Store AI response in memory
    if (userContext) {
      const responseTopics = extractTopics(aiResponse);
      storeMemory(userContext.profile.id, "assistant", aiResponse, {
        importance: 0.5,
        topics: responseTopics,
      }).catch(() => {});
    }

    // Check for email sending intent
    // Build updated history by appending new messages to existing history (avoids redundant DB call)
    const updatedHistoryForEmail = [
      ...history,
      { role: "user", parts: [{ text: userMessage }] },
      { role: "model", parts: [{ text: aiResponse }] },
    ];
    const emailIntent = await detectEmailSendingIntent(
      aiResponse,
      updatedHistoryForEmail,
      identifiedAgent?.communicationEmail,
      userId
    );

    if (emailIntent) {
      const emailResult = await sendEmail(emailIntent);
      if (!emailResult.success) {
        const failureNote = `\n\n(Note: There was an issue sending the email: ${emailResult.error}. Please try again or send it manually.)`;
        await sendTextMessage(phoneNumber, aiResponse + failureNote);
        return;
      }
    }

    // Check if confirmation message - always send as text
    if (isConfirmationMessage(aiResponse)) {
      logger.info("[Confirmation] Detected confirmation message -> sending as TEXT", { category: LogCategory.GENERAL });
      await sendTextMessage(phoneNumber, aiResponse);
      return;
    }

    // Determine DOCX vs text routing
    const isInformational = isInformationalResponse(aiResponse, userMessage);

    if (isInformational) {
      const messages = parseTemplateResponse(aiResponse, identifiedAgent?.landline);
      for (const msg of messages) {
        await sendTextMessage(phoneNumber, msg);
      }
      return;
    }

    // Reuse the already-constructed history (avoids redundant DB call)
    let shouldSendAsDocx = !isInformational && isDocxTemplate(aiResponse, updatedHistoryForEmail);
    const detectedTemplateType = detectTemplateType(userMessage);

    // SAFETY: Registration templates (containing "Dear XXXXXXXX" or "Subject:") are ALWAYS TEXT
    // This prevents misrouting Advanced Seller Registration as Marketing Agreement DOCX
    if (shouldSendAsDocx && (/Dear\s+X{6,}/i.test(aiResponse) || aiResponse.includes("Subject:"))) {
      logger.info("[Webhook] Registration template detected in DOCX response - forcing TEXT", { category: LogCategory.GENERAL });
      shouldSendAsDocx = false;
    }

    // Field validation checks
    if (shouldSendAsDocx && isCollectingInformation(aiResponse)) {
      shouldSendAsDocx = false;
    }

    if (shouldSendAsDocx && !hasAllRequiredFields(aiResponse, detectedTemplateType || undefined)) {
      shouldSendAsDocx = false;
    }

    if (shouldSendAsDocx) {
      // Send as DOCX file
      logger.info("Detected DOCX template - generating and sending as file attachment", { category: LogCategory.GENERAL });
      trackDocumentGenerated(phoneNumber, detectedTemplateType || "unknown", identifiedAgent?.id);

      let filename = `document_${Date.now()}.docx`;
      const templateType = detectDocxTemplateType(aiResponse);
      let docxContent: Uint8Array;

      if (templateType.startsWith('viewing-form-') || templateType === 'reservation-agreement' || templateType === 'marketing-non-exclusive') {
        try {
          // Convert base64 logo to Uint8Array for viewing forms
          let logoData: Uint8Array | undefined;
          if (ZYPRUS_LOGO_BASE64) {
            try {
              const binaryString = atob(ZYPRUS_LOGO_BASE64);
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

          switch(templateType) {
            case 'viewing-form-single': {
              const singleData = parseViewingFormSingleData(aiResponse);
              if (singleData) {
                docxDoc = createViewingFormSingle(singleData, logoData);
              }
              break;
            }
            case 'viewing-form-multiple': {
              const multipleData = parseViewingFormMultipleData(aiResponse);
              if (multipleData) {
                docxDoc = createViewingFormMultiple(multipleData, logoData);
              }
              break;
            }
            case 'viewing-form-advanced': {
              const advancedData = parseViewingFormAdvancedData(aiResponse);
              if (advancedData) {
                docxDoc = createViewingFormAdvanced(advancedData, logoData);
              } else {
                // Fallback: try multiple parser and still use advanced template
                const multipleAsAdvanced = parseViewingFormMultipleData(aiResponse);
                if (multipleAsAdvanced) {
                  docxDoc = createViewingFormAdvanced({
                    date: multipleAsAdvanced.date,
                    persons: multipleAsAdvanced.persons,
                    property: multipleAsAdvanced.property,
                  }, logoData);
                }
              }
              break;
            }
            case 'reservation-agreement': {
              const reservationData = parseReservationAgreementData(aiResponse);
              if (reservationData) {
                docxDoc = createReservationAgreement(reservationData);
                filename = "Property_Reservation_Agreement.docx";
              }
              break;
            }
            case 'marketing-non-exclusive': {
              const agentName = identifiedAgent?.fullName || "Agent";
              const marketingData = parseMarketingAgreementData(aiResponse, agentName);
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
      const messageParts = parseTemplateResponse(aiResponse, identifiedAgent?.landline);

      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        await sendTextMessage(phoneNumber, part);

        if (i < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  } catch (error) {
    logger.error("Error in processRequest: " + String(error), undefined, { category: LogCategory.GENERAL });
    trackError(phoneNumber, "PROCESS_REQUEST_ERROR", String(error));
  }
}

/**
 * Main webhook handler
 */
export async function handleWebhook(
  req: Request,
  supabase: SupabaseClient,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Response> {
  // Handle GET requests (webhook verification)
  if (req.method === "GET") {
    logger.info("Webhook verification request received", { category: LogCategory.WEBHOOK });
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
    logger.error("SECURITY: WASEND_WEBHOOK_SECRET not configured - rejecting webhook", undefined, {
      category: LogCategory.WEBHOOK,
      operation: "webhook_auth",
    });
    return new Response("Service Unavailable - webhook authentication not configured", { status: 503 });
  }

  const signature = extractSignatureHeader(req.headers);

  const isValidSignature = await verifyWebhookSignature(signature, rawBody, WASEND_WEBHOOK_SECRET);
  if (!isValidSignature) {
    logger.error("SECURITY: Invalid webhook signature - rejecting request", undefined, {
      category: LogCategory.WEBHOOK,
      operation: "webhook_auth",
      hasSignature: !!signature,
    });
    return new Response("Unauthorized", { status: 401 });
  }

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.error("Invalid JSON payload", undefined, { category: LogCategory.GENERAL });
    return new Response("Bad Request", { status: 400 });
  }

  // Validate payload structure
  if (!validateWebhookPayload(payload)) {
    logger.warn("Invalid webhook payload structure", { operation: "validation" });
    return new Response("OK", { status: 200 });
  }

  // Extract message from payload
  const extracted = await extractMessage(payload);

  if (!extracted) {
    logger.info("Could not extract valid message from payload", { category: LogCategory.GENERAL });
    return new Response("OK", { status: 200 });
  }

  const { message, remoteJid, userMessage, imageUrls } = extracted;

  if (!remoteJid) {
    logger.error("No remoteJid found in message", undefined, { category: LogCategory.GENERAL });
    return new Response("OK", { status: 200 });
  }

  // Format phone number
  const phoneNumber = formatPhoneNumber(remoteJid);
  if (!phoneNumber) {
    logger.error("Could not format phone number", undefined, { category: LogCategory.GENERAL });
    return new Response("OK", { status: 200 });
  }

  // Validate phone number format
  if (!validatePhoneNumber(phoneNumber)) {
    logger.warn("Invalid phone number format", { operation: "validation" });
    return new Response("OK", { status: 200 });
  }

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

  // Deduplication
  const messageKey = generateMessageKey(message);
  if (messageKey) {
    const claimed = await claimMessageForProcessing(messageKey, remoteJid);
    if (!claimed) {
      logger.info("Duplicate webhook detected, skipping", { operation: "deduplication" });
      return new Response("OK", { status: 200 });
    }
  }

  // Track inbound message (fire-and-forget)
  trackMessageReceived(phoneNumber, undefined, {
    hasImages: imageUrls.length > 0,
    imageCount: imageUrls.length,
    messageLength: sanitizedMessage.length,
  });

  // Start response timer
  const requestTimer = createTimer();

  // Process the request
  try {
    await processRequest(
      supabase,
      supabaseUrl,
      supabaseKey,
      remoteJid,
      sanitizedMessage,
      phoneNumber,
      imageUrls
    );
    // Track successful response
    trackMessageSent(phoneNumber, requestTimer.end());
  } catch (err) {
    logger.error("processRequest failed: " + String(err), undefined, { category: LogCategory.GENERAL });
    trackError(phoneNumber, "PROCESS_REQUEST_FAILED", String(err));
  }

  return new Response("OK", { status: 200 });
}
