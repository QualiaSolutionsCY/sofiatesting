import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Document, Packer } from "https://esm.sh/docx@8.5.0";
import { ZYPRUS_LOGO_BASE64 } from "../_shared/prompts.ts";
import { loadSystemPrompt, invalidateCache, getCacheStatus, rollbackPrompt, getPromptVersionHistory } from "./services/prompt-loader.ts";
import { getHistory, addMessage, claimMessageForProcessing, saveLastDocument, getLastDocument } from "../_shared/db.ts";
import { createDocxFile, isDocxTemplate, wasDocxTemplateRequested } from "./docx-generator.ts";
import { detectDocxTemplateType } from "./docx/detector.ts";
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
} from "./docx/templates/index.ts";
// Property listing upload modules
import { identifyAgentByPhone, type Agent } from "./agents/identifier.ts";
import { getToolDefinitions } from "./tools/definitions.ts";
import { executeTool } from "./tools/executor.ts";

// Security utilities
import { logger, LogCategory, ErrorCategory } from "./utils/logger.ts";
import { withContext, getContext, updateContext } from "./utils/context.ts";
import {
  verifyWebhookSignature,
  extractSignatureHeader,
} from "./utils/webhook-auth.ts";
import {
  validatePhoneNumber,
  sanitizeUserInput,
  validateWebhookPayload,
} from "./utils/validation.ts";
import { checkRateLimit } from "./utils/rate-limiter.ts";
import {
  hasAllRequiredFields,
  isCollectingInformation,
  isCompletedReservationAgreementDocument,
} from "./utils/field-validator.ts";
import {
  validateExternalUrl,
  safeFetch,
} from "./utils/url-validator.ts";
import {
  decryptWhatsAppImage,
  needsDecryption,
  isPublicUrl,
} from "./services/media-decryptor.ts";
import { persistImages } from "./services/image-persistence.ts";
import {
  addPendingImages,
  getPendingImages,
  getPendingImageCount,
  clearPendingImages,
} from "./services/pending-images.ts";
import { validateImagesAtIngress } from "./services/image-validator.ts";

// Memory and personalization (RAG)
import {
  buildUserContext,
  formatContextForPrompt,
  storeMemory,
  extractTopics,
  calculateImportance,
  type UserContext,
} from "./memory/sophia-memory.ts";

// Validate required environment variables
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const WASEND_API_KEY = Deno.env.get("WASEND_API_KEY");
const WASEND_WEBHOOK_SECRET = Deno.env.get("WASEND_WEBHOOK_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_SECRET = Deno.env.get("SOPHIA_ADMIN_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Check critical environment variables
if (!OPENROUTER_API_KEY) {
  logger.error("CRITICAL: OPENROUTER_API_KEY is not set", undefined, {
    category: LogCategory.GENERAL,
  });
}
if (!WASEND_API_KEY) {
  logger.error("CRITICAL: WASEND_API_KEY is not set", undefined, {
    category: LogCategory.GENERAL,
  });
}
if (!RESEND_API_KEY) {
  logger.warn("WARNING: RESEND_API_KEY is not set - email sending will be disabled", {
    category: LogCategory.GENERAL,
  });
}

// =====================================================
// HEALTH CHECK ENDPOINT
// =====================================================

/**
 * Health check endpoint - returns service status and dependency availability
 */
async function handleHealthCheck(): Promise<Response> {
  const startTime = Date.now();

  logger.info("Health check requested", {
    category: LogCategory.WEBHOOK,
    operation: "healthCheck",
  });

  const checks: Record<string, { status: "healthy" | "unhealthy" | "degraded"; latencyMs?: number; error?: string }> = {};

  // Check OpenRouter (AI provider)
  try {
    const orStart = Date.now();
    const orResponse = await fetch("https://openrouter.ai/api/v1/models", {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    checks.openrouter = {
      status: orResponse.ok ? "healthy" : "degraded",
      latencyMs: Date.now() - orStart,
    };
  } catch (err) {
    checks.openrouter = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }

  // Check Zyprus API
  const zyprusUrl = Deno.env.get("ZYPRUS_API_URL");
  if (zyprusUrl) {
    try {
      const zStart = Date.now();
      const zResponse = await fetch(`${zyprusUrl}/jsonapi`, {
        method: "HEAD",
        headers: { "User-Agent": "SophiaAI-HealthCheck" },
        signal: AbortSignal.timeout(5000),
      });
      checks.zyprus = {
        status: zResponse.ok || zResponse.status === 401 ? "healthy" : "degraded",
        latencyMs: Date.now() - zStart,
      };
    } catch (err) {
      checks.zyprus = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.zyprus = { status: "unhealthy", error: "ZYPRUS_API_URL not configured" };
  }

  // Check Supabase (database)
  try {
    const dbStart = Date.now();
    const { error } = await supabase.from("chat_history").select("id").limit(1);
    checks.supabase = {
      status: error ? "degraded" : "healthy",
      latencyMs: Date.now() - dbStart,
      error: error?.message,
    };
  } catch (err) {
    checks.supabase = {
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }

  // Check WaSender API
  const wasendKey = Deno.env.get("WASEND_API_KEY");
  if (wasendKey) {
    try {
      const wStart = Date.now();
      const wResponse = await fetch("https://app.wasenderapi.com/api/v1/health", {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      checks.wasender = {
        status: wResponse.ok || wResponse.status === 401 ? "healthy" : "degraded",
        latencyMs: Date.now() - wStart,
      };
    } catch (err) {
      checks.wasender = {
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  } else {
    checks.wasender = { status: "unhealthy", error: "WASEND_API_KEY not configured" };
  }

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  const overallStatus = statuses.every(s => s === "healthy")
    ? "healthy"
    : statuses.some(s => s === "unhealthy")
      ? "unhealthy"
      : "degraded";

  // Log warnings for unhealthy dependencies
  for (const [name, check] of Object.entries(checks)) {
    if (check.status === "unhealthy") {
      logger.warn(`Dependency unhealthy: ${name}`, {
        category: LogCategory.WEBHOOK,
        operation: "healthCheck",
        dependency: name,
        error: check.error,
      });
    }
  }

  logger.info("Health check completed", {
    category: LogCategory.WEBHOOK,
    operation: "healthCheck",
    status: overallStatus,
    totalLatencyMs: Date.now() - startTime,
    unhealthyDeps: Object.entries(checks)
      .filter(([_, v]) => v.status === "unhealthy")
      .map(([k, _]) => k),
  });

  const response = {
    service: "sophia-bot",
    version: "1.1.0",
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startTime,
    dependencies: checks,
    config: {
      openrouterConfigured: !!Deno.env.get("OPENROUTER_API_KEY"),
      wasenderConfigured: !!Deno.env.get("WASEND_API_KEY"),
      resendConfigured: !!Deno.env.get("RESEND_API_KEY"),
      adminSecretConfigured: !!Deno.env.get("SOPHIA_ADMIN_SECRET"),
    },
  };

  const httpStatus = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return new Response(JSON.stringify(response, null, 2), {
    status: httpStatus,
    headers: { "Content-Type": "application/json" },
  });
}

// =====================================================
// EMAIL SENDING FUNCTIONALITY
// =====================================================

interface EmailSendingIntent {
  recipientEmail: string;
  subject: string;
  body: string;
  documentUrl?: string;
}

/**
 * Detects if AI response indicates it "sent" an email (hallucination)
 * Returns the extracted email details if detected
 *
 * @param aiResponse - The AI's response text
 * @param conversationHistory - Previous messages for context
 * @param agentEmail - Optional agent email to use when AI says "to your email" without explicit address
 */
function detectEmailSendingIntent(
  aiResponse: string,
  conversationHistory: Array<{role: string, parts: Array<{text: string}>}>,
  agentEmail?: string
): EmailSendingIntent | null {
  logger.debug("Email detection: Starting email detection...", { category: LogCategory.WEBHOOK });
  logger.debug("Email detection: Response length:" + String(aiResponse.length), { category: LogCategory.WEBHOOK });
  logger.debug("Email detection: First 500 chars: " + aiResponse.substring(0, 500), { category: LogCategory.WEBHOOK });
  logger.debug("Email detection: Agent email available:" + String(agentEmail || "none"), { category: LogCategory.WEBHOOK });

  // FIRST: Check for patterns without explicit email ("to your email", "to my email")
  // These require agentEmail to be available
  if (agentEmail) {
    const genericEmailPatterns = [
      /i have sent (?:the )?(.+?) to (?:your|my) email/i,
      /i['']ve sent (?:the )?(.+?) to (?:your|my) email/i,
      /sent (?:the )?(.+?) to (?:your|my) email/i,
      /email(?:ed)? (?:the )?(.+?) to (?:your|my) email/i,
      /sending (?:the )?(.+?) to (?:your|my) email/i,
      /(?:the )?(.+?) (?:has been|was) sent to (?:your|my) email/i,
    ];

    for (let i = 0; i < genericEmailPatterns.length; i++) {
      const pattern = genericEmailPatterns[i];
      const match = aiResponse.match(pattern);
      if (match) {
        logger.debug(`Email detection: Generic pattern ${i + 1} matched! Using agent email: ${agentEmail}`, { category: LogCategory.WEBHOOK });
        const documentType = match[1]?.trim() || "Document";

        // Look for document content and URL
        let documentContent = "";
        let documentUrl = "";
        for (let j = conversationHistory.length - 1; j >= 0; j--) {
          const msg = conversationHistory[j];
          if (msg.role === "model") {
            const text = msg.parts.map(p => p.text).join("");
            const urlMatch = text.match(/https:\/\/[^\s]+\.docx/i);
            if (urlMatch) documentUrl = urlMatch[0];
            if (text.includes("Subject:") || text.includes("Dear ") || text.length > 500) {
              documentContent = text;
              break;
            }
          }
        }

        let subject = documentType;
        const subjectMatch = documentContent.match(/Subject:\s*(.+?)(?:\n|$)/i);
        if (subjectMatch) subject = subjectMatch[1].trim();

        return {
          recipientEmail: agentEmail,
          subject: subject,
          body: documentContent || `Please see the attached ${documentType}.`,
          documentUrl: documentUrl || undefined,
        };
      }
    }
  }

  // SECOND: Check for patterns WITH explicit email address
  const sentPatterns = [
    /i have sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /i['']ve sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /(?:^|\. )sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /email(?:ed)? (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /sending (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
  ];

  for (let i = 0; i < sentPatterns.length; i++) {
    const pattern = sentPatterns[i];
    logger.debug(`Email detection: Testing explicit pattern ${i + 1}...`, { category: LogCategory.WEBHOOK });
    const match = aiResponse.match(pattern);
    logger.debug(`Email detection: Pattern ${i + 1} match:` + String(match ? "YES" : "NO"), { category: LogCategory.WEBHOOK });
    if (match) {
      logger.debug(`Email detection: Match groups:` + String(match), { category: LogCategory.WEBHOOK });
      const documentType = match[1]?.trim() || "Document";
      const email = match[2];

      logger.debug(`Email detection: Detected email intent: ${documentType} to ${email}`, { category: LogCategory.WEBHOOK });

      // Look for the actual document content in previous messages
      let documentContent = "";
      let documentUrl = "";

      // Search conversation history for recent document/agreement content
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.role === "model") {
          const text = msg.parts.map(p => p.text).join("");

          // Check if this message contains a document URL
          const urlMatch = text.match(/https:\/\/[^\s]+\.docx/i);
          if (urlMatch) {
            documentUrl = urlMatch[0];
          }

          // Check if this looks like document content
          if (text.includes("Subject:") || text.includes("Dear ") || text.length > 500) {
            documentContent = text;
            break;
          }
        }
      }

      // Extract or generate subject
      let subject = `${documentType}`;
      const subjectMatch = documentContent.match(/Subject:\s*(.+?)(?:\n|$)/i);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
      }

      return {
        recipientEmail: email,
        subject: subject,
        body: documentContent || `Please see the attached ${documentType}.`,
        documentUrl: documentUrl || undefined,
      };
    }
  }

  return null;
}

/**
 * Sends an email via Resend API
 */
async function sendEmailViaResend(
  intent: EmailSendingIntent
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    logger.error("Email error: RESEND_API_KEY is not configured", undefined, { category: LogCategory.WEBHOOK });
    return { success: false, error: "Email service not configured" };
  }

  logger.info(`Email: Sending email to ${intent.recipientEmail}`, { category: LogCategory.WEBHOOK });
  logger.info(`Email: Subject: ${intent.subject}`, { category: LogCategory.WEBHOOK });
  logger.info(`Email: Document URL: ${intent.documentUrl || "none"}`, { category: LogCategory.WEBHOOK });

  try {
    // Prepare attachments if document URL provided
    const attachments: Array<{ filename: string; content: string }> = [];

    if (intent.documentUrl) {
      try {
        // P0 SECURITY: Validate URL before fetching (SSRF prevention)
        const urlValidation = validateExternalUrl(intent.documentUrl);
        if (!urlValidation.valid) {
          logger.error(`Email error: SSRF blocked: ${urlValidation.error}`, {
            url: intent.documentUrl.substring(0, 100),
          });
          // Don't fail the entire email - just skip the attachment
          logger.warn("Email warning: Skipping document attachment due to invalid URL", { category: LogCategory.WEBHOOK });
        } else {
          logger.info(`Email: Fetching document from: ${intent.documentUrl}`, { category: LogCategory.WEBHOOK });
          const docResponse = await safeFetch(intent.documentUrl);
          if (docResponse.ok) {
            const docBuffer = await docResponse.arrayBuffer();
            const base64Content = btoa(
              String.fromCharCode(...new Uint8Array(docBuffer))
            );
            attachments.push({
              filename: "document.docx",
              content: base64Content,
            });
            logger.info(`Email: Document attached, size: ${docBuffer.byteLength} bytes`, { category: LogCategory.WEBHOOK });
          } else {
            logger.warn(`Email warning: Failed to fetch document: ${docResponse.status}`, { category: LogCategory.WEBHOOK });
          }
        }
      } catch (fetchError) {
        logger.error("Email error: Error fetching document: " + String(fetchError), { category: LogCategory.WEBHOOK });
      }
    }

    // Format the email body as HTML
    const htmlBody = formatEmailBodyAsHtml(intent.body);

    const senderEmail = "SOPHIA <sofia@zyprus.com>";
    logger.info("Email: Using sender:" + String(senderEmail), { category: LogCategory.WEBHOOK });

    const emailPayload: Record<string, unknown> = {
      from: senderEmail,
      to: intent.recipientEmail,
      subject: intent.subject,
      html: htmlBody,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      logger.error("Email error: Resend API error: " + String(responseData), { category: LogCategory.WEBHOOK });
      return {
        success: false,
        error: responseData.message || `Failed to send email: ${response.status}`
      };
    }

    logger.info("Email: Email sent successfully:" + String(responseData), { category: LogCategory.WEBHOOK });
    return { success: true };

  } catch (error) {
    logger.error("Email error: Error sending email: " + String(error), { category: LogCategory.WEBHOOK });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Formats email body content as HTML
 */
function formatEmailBodyAsHtml(body: string): string {
  // Convert markdown-style formatting to HTML
  let html = body
    // Bold text: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    // Lists (simple conversion)
    .replace(/^- (.+)$/gm, "<li>$1</li>");

  // Wrap in paragraphs if not already
  if (!html.startsWith("<")) {
    html = `<p>${html}</p>`;
  }

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="color: #444; line-height: 1.6;">
        ${html}
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px 0;" />

      <p style="color: #666; font-size: 14px;">
        Best regards,<br/>
        <strong>SOFIA</strong><br/>
        AI Assistant - Zyprus Property Group
      </p>

      <p style="color: #999; font-size: 11px; margin-top: 20px;">
        This email was sent by SOFIA, the AI assistant for Zyprus Property Group.
        For inquiries, contact us at info@zyprus.com
      </p>
    </div>
  `;
}

/**
 * Checks if a response is a confirmation message (not actual document content)
 * These should ALWAYS be sent as text, never as DOCX
 */
function isConfirmationMessage(text: string): boolean {
  const lower = text.toLowerCase();

  // Quick check for listing upload confirmations (any length)
  // These should ALWAYS be sent as text, never as DOCX
  if (lower.includes("uploaded the property") ||
      lower.includes("uploaded as a draft") ||
      lower.includes("draft listing") ||
      (lower.includes("uploaded") && lower.includes("property"))) {
    logger.info("[Confirmation] Detected listing upload confirmation", { category: LogCategory.ZYPRUS });
    return true;
  }

  // Patterns that indicate this is a confirmation, not document content
  const confirmationPatterns = [
    // Email confirmations
    /i have sent/i,
    /i.ve sent/i,  // Match any character between i and ve
    /has been sent/i,
    /successfully sent/i,
    /email sent/i,
    /document sent/i,
    /sent to .+@.+\..+/i,
    /please check your inbox/i,
    /don.t forget to/i,  // Match any character for apostrophe
  ];

  // If the message is short and contains confirmation patterns
  if (text.length < 500) {
    for (const pattern of confirmationPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }

  return false;
}

// =====================================================
// END EMAIL FUNCTIONALITY
// =====================================================

/**
 * Formats text for WhatsApp - converts markdown bold to WhatsApp bold, preserves phone masking
 * Phone masking format: XX**YYYY (e.g., 99**1111)
 * Converts **text** to *text* for WhatsApp bold formatting
 */
function formatForWhatsApp(text: string): string {
  let formatted = text;

  // Step 0a: Strip code blocks (```...```) - show content as plain text
  // Handle multiline code blocks with optional language specifier
  formatted = formatted.replace(/```[\w]*\n?([\s\S]*?)```/g, '$1');
  // Handle inline code blocks (moved here for logical grouping)
  formatted = formatted.replace(/`([^`]+)`/g, '$1');

  // Step 0b: FIX single-asterisk phone masking (AI mistake) - convert 99*1111 to 99**1111
  // Pattern: 2 digits + single asterisk + 4 digits (but NOT already double asterisk)
  formatted = formatted.replace(/(\d{2})\*(\d{4})(?!\*)/g, '$1**$2');

  // Step 1: Protect phone masking patterns (XX**YYYY) with placeholder
  formatted = formatted.replace(/(\d{2})\*\*(\d{4})/g, '$1{{PHONE_MASK}}$2');

  // Step 2: Convert **text** markdown bold to *text* WhatsApp bold
  // This ensures field names requested by AI are properly bolded
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // Step 3: Restore phone masking pattern
  formatted = formatted.replace(/\{\{PHONE_MASK\}\}/g, '**');

  // Step 4: Add WhatsApp bold (*text*) to specific document labels
  // Match label at start of line or after newline, with or without leading spaces
  formatted = formatted.replace(/^(\s*)(My Mobile:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Registration Details:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Property:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Client Information:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Property Introduced:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Property Link:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Viewing Arranged for:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Fees:)/gm, '$1*$2*');
  formatted = formatted.replace(/^(\s*)(Marketing Price:)/gm, '$1*$2*');

  // Remove header markers # Header -> Header
  formatted = formatted.replace(/^#{1,6}\s+/gm, '');
  // Clean up excessive whitespace but preserve single newlines
  formatted = formatted.replace(/[ \t]+/g, ' ');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  return formatted.trim();
}

/**
 * Detects if an AI response is a clarification question rather than actual document content
 */
function isClarificationResponse(aiResponse: string): boolean {
  // FIRST: Check if this is a completed reservation agreement - these should NOT be classified as clarifications
  if (isCompletedReservationAgreementDocument(aiResponse)) {
    logger.info("[CLARIFICATION] Detected completed reservation agreement, not a clarification", { category: LogCategory.GENERAL });
    return false;
  }

  const response = aiResponse.toLowerCase();

  // Common clarification patterns - expanded list
  const clarificationPatterns = [
    "please specify",
    "please provide",
    "which type",
    "which template",
    "could you clarify",
    "could you provide",
    "can you specify",
    "can you provide",
    "do you need",
    "would you like",
    "what type of",
    "what kind of",
    "which one",
    "please let me know",
    "i need more information",
    "i need to know",
    "to generate this",
    "to create this",
    "please confirm",
    "please tell me",
    "i'll need the following",
    "please share the following",
    "to prepare",
    "following information",
    "following details",
  ];

  // Count matching patterns
  let patternMatches = 0;
  for (const pattern of clarificationPatterns) {
    if (response.includes(pattern)) {
      patternMatches++;
    }
  }

  // If multiple clarification patterns are found, it's likely a clarification
  if (patternMatches >= 2) {
    logger.info(`[CLARIFICATION] Multiple patterns detected: ${patternMatches} patterns`, { category: LogCategory.GENERAL });
    return true;
  }

  // Single pattern match with reasonable length (not a full document)
  if (patternMatches === 1 && aiResponse.length < 1000) {
    logger.info(`[CLARIFICATION] Single pattern in short response`, { category: LogCategory.GENERAL });
    return true;
  }

  // Check for bullet points requesting information
  const bulletPatterns = [
    /•\s*[\w\s]+:(?:\s*$|\s*\n)/gm,  // Bullet point ending with colon
    /[•\-\*]\s*[\w\s]+(name|number|date|address|price|location)(?:\s*$|\s*:)/gmi,
  ];

  for (const pattern of bulletPatterns) {
    const matches = aiResponse.match(pattern) || [];
    if (matches.length >= 2) {
      logger.info(`[CLARIFICATION] Multiple bullet points requesting info: ${matches.length}`, { category: LogCategory.GENERAL });
      return true;
    }
  }

  // Check if it's a question-heavy response (multiple question marks)
  const questionMarkCount = (aiResponse.match(/\?/g) || []).length;
  if (questionMarkCount >= 2) {
    logger.info(`[CLARIFICATION] Multiple questions detected: ${questionMarkCount} question marks`, { category: LogCategory.GENERAL });
    return true;
  }

  // Check for "Please provide:" followed by a list
  if (response.includes("please provide") && response.includes("•")) {
    logger.info(`[CLARIFICATION] 'Please provide' with bullet points detected`, { category: LogCategory.GENERAL });
    return true;
  }

  // Check for numbered lists requesting information
  const numberedListPattern = /\d+\.\s*([\w\s]+:|\?)/g;
  const numberedMatches = aiResponse.match(numberedListPattern) || [];
  if (numberedMatches.length >= 2) {
    logger.info(`[CLARIFICATION] Numbered list requesting information`, { category: LogCategory.GENERAL });
    return true;
  }

  return false;
}

/**
 * Detects if the AI response is informational (listing templates) rather than an actual document
 * This prevents DOCX generation for "what templates do you have" type queries
 */
function isInformationalResponse(aiResponse: string, userMessage: string): boolean {
  const lowerResponse = aiResponse.toLowerCase();
  const lowerMessage = userMessage.toLowerCase();

  // Check if user asked about capabilities (NOT "show me" which triggers generation)
  const capabilityQuestions = [
    'what templates do', 'which templates', 'list templates',
    'available templates', 'templates can you', 'your templates',
    'all templates', 'templates do you generate', 'what can you'
  ];

  // "show me" should generate DOCX, not list templates
  const isShowRequest = lowerMessage.includes('show me') || lowerMessage.includes('show the');

  // If user asked about templates (but not "show me") AND response is listing them
  if (!isShowRequest && capabilityQuestions.some(q => lowerMessage.includes(q))) {
    const listingIndicators = [
      'i can help with', 'i can generate', 'available templates',
      'here are the', 'categories i can', 'would you like me to list',
      'templates include', 'template categories', 'predefined templates',
      'across four main categories', '43 predefined templates'
    ];

    if (listingIndicators.some(ind => lowerResponse.includes(ind))) {
      logger.info(`[INFORMATIONAL] Detected template listing response for query: "${userMessage}"`, { category: LogCategory.ZYPRUS });
      return true;
    }
  }

  return false;
}

/**
 * CRITICAL FIX: Detects when user asked for marketing agreement DOCX but AI generated email
 * Returns true if we should force DOCX generation for marketing agreement
 */
function shouldForceMarketingDocx(userMessage: string, aiResponse: string): boolean {
  const lowerMessage = userMessage.toLowerCase();
  const lowerResponse = aiResponse.toLowerCase();

  // Check if user asked for marketing agreement
  const wantsMarketingAgreement =
    lowerMessage.includes("marketing agreement") ||
    lowerMessage.includes("non-exclusive") ||
    lowerMessage.includes("non exclusive");

  // Check if user specifically asked for email (should NOT force DOCX)
  const wantsEmail =
    lowerMessage.includes("email marketing") ||
    lowerMessage.includes("via email") ||
    lowerMessage.includes("by email") ||
    lowerMessage.includes("send marketing") && lowerMessage.includes("email");

  // Check if AI response is an email (has Subject:)
  const aiGeneratedEmail = aiResponse.includes("Subject:");

  // Check if AI response has marketing agreement content
  const hasMarketingContent =
    lowerResponse.includes("marketing agreement") ||
    lowerResponse.includes("non-exclusive") ||
    (lowerResponse.includes("seller") && lowerResponse.includes("agent"));

  // 🔍 DEBUG LOGGING
  logger.info("=== shouldForceMarketingDocx DEBUG ===", { category: LogCategory.GENERAL });
  logger.info(JSON.stringify({
    wantsMarketingAgreement,
    wantsEmail,
    aiGeneratedEmail,
    hasMarketingContent,
    messagePreview: lowerMessage.substring(0, 100),
    responseHasSubject: aiResponse.includes("Subject:"),
  }, null, 2));
  logger.info("=====================================", { category: LogCategory.GENERAL });

  if (wantsMarketingAgreement && !wantsEmail && aiGeneratedEmail && hasMarketingContent) {
    logger.info("[MARKETING OVERRIDE] User wants DOCX but AI generated email - FORCING DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  logger.info("[MARKETING OVERRIDE] Conditions not met - NOT forcing DOCX", { category: LogCategory.GENERAL });
  return false;
}

/**
 * Determines the template type from user message for retry prompt
 */
function detectTemplateType(userMessage: string): string | null {
  const message = userMessage.toLowerCase();

  if (message.includes("viewing form") || message.includes("standard viewing")) {
    return "Standard Viewing Form";
  }
  if (message.includes("advanced viewing") || message.includes("introduction form")) {
    return "Advanced Viewing/Introduction Form";
  }
  if (message.includes("reservation form") || message.includes("reservation agreement") || message.includes("property reservation")) {
    return "Property Reservation Agreement";
  }
  // Marketing Agreement - distinguish between email and DOCX versions
  // DOCX: "marketing agreement", "non-exclusive marketing", "signature marketing"
  // Email: "email marketing", "marketing via email", "send marketing by email"
  if (message.includes("marketing agreement") || message.includes("non-exclusive") || message.includes("non exclusive")) {
    // Check if user specifically wants EMAIL version
    if (message.includes("email marketing") ||
        message.includes("via email") ||
        message.includes("by email") ||
        message.includes("send marketing agreement to")) {
      return "Email Marketing Agreement";
    }
    // Default: DOCX version for signature
    return "Marketing Agreement DOCX";
  }

  return null;
}

/**
 * Parses a template response into separate parts: Subject, Body, and Notes (if any)
 * Returns an array of message parts to be sent separately
 *
 * RULES:
 * - Message 1: Subject line only
 * - Message 2: Full body INCLUDING "Please confirm...", "For the confirmation...", "Looking forward..."
 * - Message 3: ONLY if there's an actual "Note:", "Reminder:", "Important:", "N.B." section
 *
 * Example input:
 * "Subject: Registration – Name – Property
 *
 * Dear XXXXXXXX,
 * ...body content...
 * Please confirm Registration and Viewing.
 * For the confirmation, Could you please reply "Yes I confirm"
 * Looking forward to your prompt confirmation."
 *
 * Output: ["Subject: ...", "Dear XXXXXXXX, ... full body with confirmation text..."]
 */

/**
 * Parses CREA wording response into 3 separate messages
 * Message 1: Intro text
 * Message 2: The actual CREA wording (copy-pasteable)
 * Message 3: Important note about landline
 */
function parseCREAResponse(text: string): string[] {
  const messages: string[] = [];

  // The CREA wording block that should be standalone
  const creaBlock = `Licensed Real Estate Agency
CREA Reg. No. 742 & CREA Lic. No. 378/E
CSC Zyprus Property Group LTD
+357 (your land line) [optional]`;

  // Check if response contains the CREA block pattern
  const hasCreaCert = text.includes("Licensed Real Estate Agency") &&
                      text.includes("CREA Reg") &&
                      text.includes("CSC Zyprus");

  if (!hasCreaCert) {
    return [formatForWhatsApp(text)];
  }

  // Message 1: Intro
  const introText = "Of course. Here is the required CREA wording that should be added below each property post you make on social media or other online platforms:";
  messages.push(introText);

  // Message 2: The CREA wording block (standalone for copy-paste)
  messages.push(creaBlock);

  // Message 3: Important note
  const noteText = "Important Note: For professional compliance, it is recommended to use your Zyprus landline in online posts, which is already connected to your mobile phone, rather than your personal mobile number.";
  messages.push(noteText);

  logger.info("[CREA] Split into 3 messages for social media wording", { category: LogCategory.GENERAL });
  return messages;
}

function parseTemplateResponse(text: string): string[] {
  const messages: string[] = [];

  // Check for CREA wording response - split into 3 messages
  const lowerText = text.toLowerCase();
  if (
    (lowerText.includes("crea wording") || lowerText.includes("crea reg") || lowerText.includes("licensed real estate agency")) &&
    lowerText.includes("social media") || lowerText.includes("online") || lowerText.includes("property post")
  ) {
    // This is a CREA wording response - split into 3 messages
    const creaSplit = parseCREAResponse(text);
    if (creaSplit.length > 1) {
      return creaSplit;
    }
  }

  // Check if this is a template response with Subject line
  if (!text.includes("Subject:")) {
    // Not a template - return as single message
    return [formatForWhatsApp(text)];
  }

  // Split by lines for easier processing
  const lines = text.split('\n');

  let subjectLine = "";
  let bodyLines: string[] = [];
  let noteLines: string[] = [];
  let inNote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Extract Subject line (first line starting with "Subject:")
    if (trimmedLine.startsWith("Subject:") && !subjectLine) {
      subjectLine = trimmedLine;
      continue;
    }

    // ONLY these are separate notes - NOT "Looking forward", "For the confirmation", "Please confirm"
    // Only actual explicit notes/reminders get separated
    const lowerLine = trimmedLine.toLowerCase();
    if (
      lowerLine.startsWith("note:") ||
      lowerLine.startsWith("reminder:") ||
      lowerLine.startsWith("important:") ||
      lowerLine.startsWith("n.b.") ||
      lowerLine.startsWith("nb:") ||
      lowerLine.includes("⚠️") && lowerLine.includes("reminder") ||
      lowerLine.includes("⚠") && lowerLine.includes("reminder")
    ) {
      inNote = true;
    }

    if (inNote) {
      noteLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  // Add Subject as first message
  if (subjectLine) {
    messages.push(formatForWhatsApp(subjectLine));
  }

  // Add Body as second message (includes confirmation text, looking forward, etc.)
  const bodyText = bodyLines.join('\n').trim();
  if (bodyText) {
    messages.push(formatForWhatsApp(bodyText));
  }

  // Add Notes as third message ONLY if there's an actual Note/Reminder section
  const noteText = noteLines.join('\n').trim();
  if (noteText) {
    messages.push(formatForWhatsApp(noteText));
  }

  // If we somehow ended up with no messages, return original as single message
  if (messages.length === 0) {
    return [formatForWhatsApp(text)];
  }

  logger.info(`Parsed template into ${messages.length} parts: Subject="${subjectLine.substring(0, 50)}...", Body=${bodyText.length} chars, Notes=${noteText.length} chars`, { category: LogCategory.GENERAL });

  return messages;
}

/**
 * Generates a unique message key for deduplication
 */
function generateMessageKey(message: any): string | null {
  // Try to extract a unique identifier from the message
  // Priority: message ID > key ID > timestamp + content hash
  
  if (message.key?.id) {
    return `key:${message.key.id}`;
  }
  
  if (message.id) {
    return `id:${message.id}`;
  }
  
  if (message.messageId) {
    return `msgid:${message.messageId}`;
  }
  
  // Fallback: create a hash from timestamp + first 50 chars of content
  const content = message.message?.conversation || 
                  message.message?.extendedTextMessage?.text ||
                  message.text ||
                  message.body || '';
  const timestamp = message.messageTimestamp || Date.now();
  
  if (content) {
    const contentHash = content.substring(0, 50).replace(/\s+/g, '_');
    return `hash:${timestamp}_${contentHash}`;
  }
  
  return null;
}

/**
 * Uploads a DOCX file to Supabase Storage and returns the public URL
 */
async function uploadDocxToStorage(
  docxContent: Uint8Array,
  filename: string
): Promise<string | null> {
  try {
    // Upload to Supabase Storage in 'documents' bucket
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(`docx/${filename}`, docxContent, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true
      });

    if (error) {
      logger.error("Error uploading to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`docx/${filename}`);

    logger.info("Uploaded DOCX to Supabase Storage:" + String(urlData.publicUrl), { category: LogCategory.DATABASE });
    return urlData.publicUrl;
  } catch (error) {
    logger.error("Exception uploading to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
    return null;
  }
}

/**
 * Sends a DOCX file via WaSend API using documentUrl
 * WaSend requires a public URL to the document, not direct file upload
 * Also saves the document URL for later email attachment
 */
async function sendDocxFile(
  phoneNumber: string,
  docxContent: Uint8Array,
  filename: string,
  retries: number = 1,
  userId?: string
): Promise<Response> {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  // Step 1: Upload DOCX to Supabase Storage to get a public URL
  const documentUrl = await uploadDocxToStorage(docxContent, filename);

  if (!documentUrl) {
    logger.error("Failed to upload DOCX to storage, cannot send document", undefined, { category: LogCategory.ZYPRUS });
    // Return a fake error response
    return new Response(JSON.stringify({ error: "Failed to upload document" }), { status: 500 });
  }

  logger.info("Sending document via WaSend with URL:" + String(documentUrl), { category: LogCategory.GENERAL });

  // Step 1.5: Save document URL for later email attachment
  if (userId) {
    const docType = filename.toLowerCase().includes("viewing") ? "viewing_form" :
                    filename.toLowerCase().includes("marketing") ? "marketing_agreement" :
                    filename.toLowerCase().includes("reservation") ? "reservation_agreement" : "document";
    await saveLastDocument(userId, documentUrl, filename, docType);
  }

  try {
    let sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phoneNumber,
        text: "Document generated by Sophia",
        documentUrl: documentUrl,
        fileName: filename,
      }),
    });

    const responseText = await sendRes.text();
    logger.info("WaSend document send response status:" + String(sendRes.status), { category: LogCategory.GENERAL });
    logger.info("WaSend document send response body:" + String(responseText), { category: LogCategory.GENERAL });

    // Handle rate limiting (429 status)
    if (sendRes.status === 429 && retries > 0) {
      let retryAfter = 5000; // Default 5 seconds

      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.retry_after) {
          retryAfter = (errorJson.retry_after + 1) * 1000;
        }
      } catch (e) {
        // If parsing fails, use default
      }

      logger.info(
        `WaSendAPI Rate Limit hit. Retrying in ${retryAfter / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      return sendDocxFile(phoneNumber, docxContent, filename, retries - 1);
    }

    // Return a new Response since we already consumed the body
    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending DOCX file via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

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
 * Uploads logo to Supabase Storage and returns public URL
 * Uses a fixed filename so it's only uploaded once
 */
async function uploadLogoToStorage(): Promise<string | null> {
  try {
    // Convert base64 to Uint8Array
    const binaryString = atob(ZYPRUS_LOGO_BASE64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filename = "zyprus-logo.png";

    // Upload to Supabase Storage in 'documents' bucket under 'logos' folder
    const { error } = await supabase.storage
      .from('documents')
      .upload(`logos/${filename}`, bytes, {
        contentType: 'image/png',
        upsert: true  // Overwrite if exists
      });

    if (error && !error.message.includes('already exists')) {
      logger.error("Error uploading logo to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`logos/${filename}`);

    logger.info("Logo URL:" + String(urlData.publicUrl), { category: LogCategory.GENERAL });
    return urlData.publicUrl;
  } catch (error) {
    logger.error("Exception uploading logo to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
    return null;
  }
}

/**
 * Sends the Zyprus logo image via WaSend API
 */
async function sendLogoImage(phoneNumber: string): Promise<Response> {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  // Get or upload logo URL
  const logoUrl = await uploadLogoToStorage();

  if (!logoUrl) {
    logger.error("Failed to get logo URL", undefined, { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: "Failed to get logo" }), { status: 500 });
  }

  logger.info("Sending logo via WaSend with URL:" + String(logoUrl), { category: LogCategory.GENERAL });

  try {
    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phoneNumber,
        text: "Here's the Zyprus Property Group logo! 🏠",
        imageUrl: logoUrl,
      }),
    });

    const responseText = await sendRes.text();
    logger.info("WaSend image response:" + String(responseText), { category: LogCategory.GENERAL });

    if (!sendRes.ok) {
      logger.error("WaSend image send failed: " + String(responseText), { category: LogCategory.GENERAL });
    }

    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending logo via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

/**
 * Formats phone number for WaSend API
 * WaSend expects E.164 format: +1234567890
 * Input may be: cleanedSenderPn (already clean), remoteJid (with @suffix), or LID format
 */
function formatPhoneNumber(remoteJid: string | null): string | null {
  if (!remoteJid) return null;

  let number = remoteJid;

  // Remove WhatsApp/LID suffixes if present
  number = number.replace("@s.whatsapp.net", "")
                 .replace("@c.us", "")
                 .replace("@lid", "");

  // If it's a LID (starts with numbers but isn't a phone number format)
  // LIDs are internal WhatsApp identifiers, not usable for sending
  if (number.includes("@") || number.length < 8) {
    logger.info("Invalid phone format (possibly LID):" + String(number), { category: LogCategory.GENERAL });
    return null;
  }

  // Ensure E.164 format with + prefix
  if (!number.startsWith("+")) {
    // If it's all digits, add +
    if (/^\d+$/.test(number)) {
      number = "+" + number;
    } else {
      // Try to extract just digits
      const digits = number.replace(/\D/g, "");
      if (digits && digits.length >= 8) {
        number = "+" + digits;
      } else {
        logger.info("Could not extract valid phone number from:" + String(remoteJid), { category: LogCategory.GENERAL });
        return null;
      }
    }
  }

  logger.info("Formatted phone number:" + String(number), { category: LogCategory.GENERAL });
  return number;
}

/**
 * Extracts message content from WaSend webhook payload
 * WaSend Format: { event: "messages.received", data: { messages: { key: {...}, messageBody: "...", message: {...} } } }
 * IMPORTANT: data.messages is a SINGLE OBJECT, not an array
 * IMPORTANT: Use key.cleanedSenderPn for phone number (remoteJid can be LID format)
 * IMPORTANT: WhatsApp images are encrypted - we decrypt them via WaSend API
 */
async function extractMessage(payload: any): Promise<{
  message: any;
  remoteJid: string | null;
  userMessage: string;
  imageUrls: string[];
} | null> {
  logger.info("Extracting message from payload...", { category: LogCategory.GENERAL });
  // DEBUG: Log full payload structure to diagnose image handling
  logger.debug("Full payload keys: " + String(Object.keys(payload)), { category: LogCategory.GENERAL });
  logger.debug("Payload preview: " + JSON.stringify(payload).substring(0, 500), { category: LogCategory.GENERAL });

  let message = null;
  let remoteJid: string | null = null;
  let userMessage = "";
  const imageUrls: string[] = [];
  let imageDetectedButFailed = false; // Track if images were found but decryption failed

  // WaSend Format: { event: "messages.received", data: { messages: {...} } }
  if (payload.event && payload.data) {
    const event = payload.event;
    const data = payload.data;

    logger.info("Event type:" + String(event), { category: LogCategory.GENERAL });

    if (
      event === "messages.upsert" || event === "messages.received" ||
      event === "message" || event === "messages"
    ) {
      // WaSend sends data.messages as a SINGLE OBJECT (not array)
      if (data.messages) {
        message = Array.isArray(data.messages) ? data.messages[0] : data.messages;
      } else if (data.message) {
        message = data.message;
      } else {
        message = data;
      }
    } else {
      logger.info("Unhandled event type:" + String(event), { category: LogCategory.GENERAL });
      return null;
    }
  }
  // Fallback formats for other webhook providers
  else if (payload.from || payload.to) {
    message = payload;
  }
  else if (payload.data) {
    message = payload.data;
  }
  else {
    message = payload;
  }

  if (!message) {
    logger.info("No message object found", { category: LogCategory.GENERAL });
    return null;
  }

  // DEBUG: Comprehensive logging to diagnose image handling
  logger.debug(" === MESSAGE STRUCTURE ANALYSIS ===", { category: LogCategory.GENERAL });
  logger.debug("Message keys: " + String(Object.keys(message)), { category: LogCategory.GENERAL });
  logger.debug("Full message: " + JSON.stringify(message).substring(0, 2000), { category: LogCategory.GENERAL });

  if (message.message) {
    logger.debug("message.message keys: " + String(Object.keys(message.message)), { category: LogCategory.GENERAL });
    logger.debug("message.message: " + JSON.stringify(message.message).substring(0, 1000), { category: LogCategory.GENERAL });
  }

  // Check specific fields that indicate image presence
  const hasImageIndicators = {
    "message.imageMessage": !!message.imageMessage,
    "message.message?.imageMessage": !!message.message?.imageMessage,
    "message.mediaUrl": !!message.mediaUrl,
    "message.media": !!message.media,
    "message.hasMedia": message.hasMedia,
    "message.messageType": message.messageType,
    "message.type": message.type,
  };
  logger.debug("Image indicators: " + JSON.stringify(hasImageIndicators), { category: LogCategory.GENERAL });

  // Deep search for "imageMessage" keyword in the entire payload
  const payloadStr = JSON.stringify(message);
  if (payloadStr.includes("imageMessage")) {
    logger.debug(" *** Found 'imageMessage' somewhere in payload! ***", { category: LogCategory.GENERAL });
    const imgIdx = payloadStr.indexOf("imageMessage");
    logger.debug("Context around imageMessage: " + payloadStr.substring(Math.max(0, imgIdx - 50), imgIdx + 200), { category: LogCategory.GENERAL });
  }
  if (payloadStr.includes("mediaKey")) {
    logger.debug(" *** Found 'mediaKey' - this is likely an image message ***", { category: LogCategory.GENERAL });
  }
  if (payloadStr.includes("mmg.whatsapp.net")) {
    logger.debug(" *** Found encrypted WhatsApp media URL ***", { category: LogCategory.GENERAL });
  }

  // Check if message is from me (outgoing) - ignore it
  if (message.key?.fromMe || message.fromMe) {
    logger.info("Ignoring outgoing message (fromMe=true)", { category: LogCategory.GENERAL });
    return null;
  }

  // Extract phone number - PRIORITY ORDER per WaSend docs:
  // 1. key.cleanedSenderPn (recommended by WaSend for private chats)
  // 2. key.cleanedParticipantPn (for group chats)
  // 3. key.remoteJid (fallback, but check for LID format)
  // 4. Other fallbacks

  // First try the cleaned phone numbers (these are usually reliable)
  remoteJid = message.key?.cleanedSenderPn || message.key?.cleanedParticipantPn;

  // If not found, try remoteJid but validate it's not a LID
  if (!remoteJid && message.key?.remoteJid) {
    const jid = message.key.remoteJid;
    // LID format is like "520:123456@lid" - we can't use these
    if (!jid.includes(":") && !jid.includes("@lid")) {
      remoteJid = jid;
    } else {
      logger.info("Skipping LID format remoteJid:" + String(jid), { category: LogCategory.GENERAL });
    }
  }

  // Fall back to other fields if still not found
  if (!remoteJid) {
    remoteJid = message.remoteJid || message.from || message.to || message.phone;
  }

  logger.info("Extracted remoteJid:" + String(remoteJid), { category: LogCategory.GENERAL });

  // Extract text content - PRIORITY ORDER per WaSend docs:
  // 1. messageBody (WaSend unified field for all message types including captions)
  // 2. message.conversation (raw text messages)
  // 3. Other fallbacks
  userMessage = message.messageBody ||
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.text ||
    message.text ||
    message.body ||
    message.content ||
    "";

  logger.info("Extracted userMessage: " + userMessage.substring(0, 100), { category: LogCategory.GENERAL });

  // Get message ID for decryption
  const messageId = message.key?.id || message.id || `msg_${Date.now()}`;

  // Extract image URLs from WhatsApp media messages
  // WaSend provides encrypted URLs that need decryption via their API
  // Check MULTIPLE locations for imageMessage (WaSend payload variations)

  // Helper to process an imageMessage object
  const processImageMessage = async (imgMsg: any, source: string) => {
    const rawUrl = imgMsg.url;
    logger.info(`Image: Found in ${source}, URL: ${rawUrl?.substring(0, 80) || "none"}`, { category: LogCategory.IMAGE });
    logger.info(`Image: Has mediaKey: ${!!imgMsg.mediaKey}, mimetype: ${imgMsg.mimetype || "unknown"}`, { category: LogCategory.IMAGE });

    if (rawUrl) {
      // Check if this is an encrypted WhatsApp URL that needs decryption
      if (needsDecryption(rawUrl) && imgMsg.mediaKey) {
        logger.info(`Image: Decrypting via WaSend API...`, { category: LogCategory.IMAGE });
        const decryptedUrl = await decryptWhatsAppImage(messageId, {
          url: rawUrl,
          mimetype: imgMsg.mimetype || "image/jpeg",
          mediaKey: imgMsg.mediaKey,
          fileSha256: imgMsg.fileSha256,
          fileLength: imgMsg.fileLength?.toString(),
        });
        if (decryptedUrl) {
          logger.info(`Image: Decryption successful! Public URL: ${decryptedUrl.substring(0, 80)}`, { category: LogCategory.IMAGE });
          imageUrls.push(decryptedUrl);
        } else {
          logger.info(`Image: Decryption failed - marking imageDetectedButFailed`, { category: LogCategory.IMAGE });
          imageDetectedButFailed = true;
        }
      } else if (isPublicUrl(rawUrl)) {
        logger.info(`Image: Already public URL`, { category: LogCategory.IMAGE });
        imageUrls.push(rawUrl);
      } else {
        logger.info(`Image: Encrypted but missing mediaKey - marking imageDetectedButFailed`, { category: LogCategory.IMAGE });
        imageDetectedButFailed = true;
      }
    }
  };

  // Location 1: message.message.imageMessage (standard WaSend format)
  if (message.message?.imageMessage) {
    await processImageMessage(message.message.imageMessage, "message.message.imageMessage");
  }

  // Location 2: message.imageMessage directly (some WaSend variations)
  if (message.imageMessage && !message.message?.imageMessage) {
    await processImageMessage(message.imageMessage, "message.imageMessage");
  }

  // Location 3: data.imageMessage (if message IS the data object)
  if (message.data?.imageMessage && !message.message?.imageMessage) {
    await processImageMessage(message.data.imageMessage, "message.data.imageMessage");
  }

  // Location 4: Check if WaSend provides decryptedMediaUrl directly
  if (message.decryptedMediaUrl || message.message?.decryptedMediaUrl) {
    const url = message.decryptedMediaUrl || message.message?.decryptedMediaUrl;
    logger.info(`Image: Found decryptedMediaUrl: ${url?.substring(0, 80)}`, { category: LogCategory.IMAGE });
    if (url && isPublicUrl(url)) {
      imageUrls.push(url);
    }
  }

  // Location 5: Check mediaUrl field (some webhook formats)
  if (message.mediaUrl && !imageUrls.includes(message.mediaUrl)) {
    logger.info(`Image: Found mediaUrl: ${message.mediaUrl.substring(0, 80)}`, { category: LogCategory.IMAGE });
    if (isPublicUrl(message.mediaUrl)) {
      imageUrls.push(message.mediaUrl);
    }
  }

  // Also check for document messages with images
  if (message.message?.documentMessage?.url &&
      message.message?.documentMessage?.mimetype?.startsWith("image/")) {
    const docMsg = message.message.documentMessage;
    const rawUrl = docMsg.url;
    logger.info("Found image in documentMessage, URL: " + (rawUrl?.substring(0, 80)  || "none"), { category: LogCategory.GENERAL });

    if (rawUrl) {
      if (needsDecryption(rawUrl) && docMsg.mediaKey) {
        logger.info("Decrypting document image via WaSend API...", { category: LogCategory.GENERAL });
        const decryptedUrl = await decryptWhatsAppImage(messageId + "_doc", {
          url: rawUrl,
          mimetype: docMsg.mimetype,
          mediaKey: docMsg.mediaKey,
          fileSha256: docMsg.fileSha256,
          fileLength: docMsg.fileLength?.toString(),
          fileName: docMsg.fileName,
        });
        if (decryptedUrl) {
          logger.info("Document image decryption successful!", { category: LogCategory.GENERAL });
          imageUrls.push(decryptedUrl);
        }
      } else if (isPublicUrl(rawUrl)) {
        imageUrls.push(rawUrl);
      }
    }
  }

  // Support for test/simple webhook format with "media" array
  // Format: { from: "+123", body: "...", media: ["url1", "url2"] }
  // These are typically already public URLs from testing
  if (message.media && Array.isArray(message.media)) {
    for (const mediaUrl of message.media) {
      if (typeof mediaUrl === "string" && mediaUrl.startsWith("http")) {
        logger.info("Found image URL in media array: " + mediaUrl.substring(0, 100), { category: LogCategory.GENERAL });
        imageUrls.push(mediaUrl);
      }
    }
  }

  // Early image validation (before storage)
  let persistedImageUrls: string[] = [];
  if (imageUrls.length > 0) {
    logger.info("Validating images at ingress", {
      category: LogCategory.IMAGE,
      operation: "webhookImageValidation",
      imageCount: imageUrls.length,
    });

    const validation = await validateImagesAtIngress(imageUrls);

    // Log validation results
    if (validation.invalid.length > 0) {
      logger.warn("Some images failed validation at ingress", {
        category: LogCategory.IMAGE,
        operation: "webhookImageValidation",
        validCount: validation.valid.length,
        invalidCount: validation.invalid.length,
        invalidReasons: validation.invalid.map(i => i.error),
      });
    }

    // Only persist valid images
    if (validation.valid.length > 0) {
      const validUrls = validation.valid.map(i => i.url);
      logger.info(`Image: Persisting ${validUrls.length} valid image(s) to storage...`, { category: LogCategory.IMAGE });
      persistedImageUrls = await persistImages(validUrls);

      if (persistedImageUrls.length > 0) {
        logger.info(`Image: Persisted ${persistedImageUrls.length} images to Supabase Storage`, { category: LogCategory.IMAGE });

        // CRITICAL: Store images in pending_images table for accumulation
        // This allows SOPHIA to track images across multiple webhook calls
        const phoneNumber = remoteJid?.split("@")[0]?.replace(/\D/g, "") || "";
        if (phoneNumber) {
          logger.info("Storing images to pending queue", {
            category: LogCategory.IMAGE,
            count: persistedImageUrls.length,
          });
          await addPendingImages(phoneNumber, persistedImageUrls, getContext().correlationId);
          logger.info("Images queued for property upload", {
            category: LogCategory.IMAGE,
            count: persistedImageUrls.length,
          });
        }
      } else if (validUrls.length > 0) {
        logger.warn(`Image warning: Failed to persist any valid images`, { category: LogCategory.IMAGE });
      }
    }

    // If ALL images were invalid, send feedback to user
    if (validation.valid.length === 0 && validation.invalid.length > 0) {
      // Get the most helpful user message
      const userMessage = validation.invalid[0].userMessage ||
        "These images could not be used. Please send photos directly from your phone gallery.";

      // Send feedback (this happens before AI processing)
      const phoneNumber = remoteJid?.split("@")[0]?.replace(/\D/g, "") || "";
      if (phoneNumber) {
        logger.info("Sending image validation feedback to user", {
          category: LogCategory.IMAGE,
          operation: "webhookImageValidation",
        });
        await sendTextMessage(phoneNumber, userMessage);
      }
    }
  }

  if (!userMessage || userMessage.trim() === "") {
    // Allow messages with only images if they have a URL
    if (imageUrls.length > 0) {
      logger.info("No text content but found images, using placeholder message", { category: LogCategory.GENERAL });
      userMessage = "[User sent image(s)]";
    } else if (imageDetectedButFailed) {
      // Images were detected but decryption failed - don't drop the message!
      logger.info("No text content, images detected but decryption failed - using failure placeholder", { category: LogCategory.GENERAL });
      userMessage = "[User sent image(s) but decryption failed]";
    } else {
      logger.info("No text content found in message", { category: LogCategory.GENERAL });
      return null;
    }
  }

  return { message, remoteJid, userMessage, imageUrls: persistedImageUrls };
}

/**
 * Sends a text message via WaSend API with rate limit handling
 */
async function sendTextMessage(
  phoneNumber: string,
  text: string,
): Promise<Response> {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  logger.info(`=== WASEND API CALL ===`, { category: LogCategory.GENERAL });
  logger.info(`Sending text message to ${phoneNumber}, text length: ${text.length}`, { category: LogCategory.GENERAL });
  logger.info(`WASEND_API_KEY set: ${!!WASEND_API_KEY}, length: ${WASEND_API_KEY?.length || 0}`, { category: LogCategory.GENERAL });

  try {
    let sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phoneNumber,
        text: text,
      }),
    });

    const responseText = await sendRes.text();
    logger.info(`WaSend text send response status: ${sendRes.status}`, { category: LogCategory.GENERAL });
    logger.info(`WaSend text send response body: ${responseText}`, { category: LogCategory.GENERAL });
    logger.info(`=== WASEND API CALL COMPLETE ===`, { category: LogCategory.GENERAL });

    // Handle rate limiting (429 status)
    if (sendRes.status === 429) {
      let retryAfter = 5000; // Default 5 seconds

      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.retry_after) {
          retryAfter = (errorJson.retry_after + 1) * 1000;
        }
      } catch (e) {
        // If parsing fails, use default
      }

      logger.info(
        `WaSendAPI Rate Limit hit. Retrying in ${retryAfter / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WASEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phoneNumber,
          text: text,
        }),
      });

      const retryResponseText = await sendRes.text();
      logger.info(`WaSend retry response status: ${sendRes.status}`, { category: LogCategory.GENERAL });
      logger.info(`WaSend retry response body: ${retryResponseText}`, { category: LogCategory.GENERAL });

      // Return a new Response since we consumed the body
      return new Response(retryResponseText, {
        status: sendRes.status,
        headers: sendRes.headers
      });
    }

    // Return a new Response since we consumed the body
    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending text message via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

/**
 * Looks up agent info by phone number
 */
async function getAgentByPhone(phoneNumber: string): Promise<{ name: string; email?: string } | null> {
  try {
    const { data, error } = await supabase
      .from('agents')
      .select('name, email')
      .eq('phone', phoneNumber)
      .single();

    if (error || !data) {
      logger.info(`No agent found for phone: ${phoneNumber}`, { category: LogCategory.GENERAL });
      return null;
    }

    logger.info(`Found agent: ${data.name} for phone: ${phoneNumber}`, { category: LogCategory.GENERAL });
    return data;
  } catch (err) {
    logger.error("Error looking up agent: " + String(err), { category: LogCategory.GENERAL });
    return null;
  }
}

/**
 * Processes the AI request in the background
 */
async function processRequest(
  userId: string,
  userMessage: string,
  phoneNumber: string,
  imageUrls: string[] = [],
): Promise<void> {
  try {
    // Check if critical API keys are set
    if (!OPENROUTER_API_KEY || !WASEND_API_KEY) {
      logger.error("CRITICAL: Missing API keys - OPENROUTER_API_KEY or WASEND_API_KEY not set", undefined, { category: LogCategory.GENERAL });
      const errorMsg = "Service configuration error. Please contact support.";

      // Try to send error if WaSend key exists
      if (WASEND_API_KEY) {
        await sendTextMessage(phoneNumber, errorMsg);
      }
      return;
    }

    // Check for logo request first (handle before AI processing)
    if (isLogoRequest(userMessage)) {
      logger.info("[Logo] Logo request detected, sending logo image", { category: LogCategory.GENERAL });
      await sendLogoImage(phoneNumber);
      // Also add to history so we remember it
      await addMessage(userId, "user", userMessage);
      await addMessage(userId, "assistant", "Here's the Zyprus Property Group logo! 🏠");
      return;
    }

    // 1. Add user message to database (must happen first)
    await addMessage(userId, "user", userMessage);

    // 2. PERFORMANCE: Run independent queries in parallel
    // This reduces latency by ~200-300ms compared to sequential execution
    const parallelStartTime = Date.now();

    const [
      userContextResult,
      history,
      agentByPhoneResult,
      identifiedAgentResult,
      accumulatedImagesResult,
      lastDocumentResult,
    ] = await Promise.all([
      // User context with RAG memory (personalization)
      buildUserContext(phoneNumber, userMessage).catch(err => {
        logger.error("Memory error: Error building user context: " + String(err), undefined, { category: LogCategory.GENERAL });
        return null;
      }),
      // Conversation history
      getHistory(userId),
      // Agent lookup (old method - for document generation)
      getAgentByPhone(phoneNumber).catch(() => null),
      // Agent identification (new method - for property uploads)
      identifyAgentByPhone(phoneNumber, supabaseUrl, supabaseKey).catch(err => {
        logger.error("[Agent] Error identifying agent: " + String(err), undefined, { category: LogCategory.GENERAL });
        return null;
      }),
      // Accumulated images from pending_images table
      getPendingImages(phoneNumber).catch(() => []),
      // Recently generated documents
      getLastDocument(userId).catch(() => null),
    ]);

    logger.debug(`[Perf] Parallel queries completed in ${Date.now() - parallelStartTime}ms`, { category: LogCategory.GENERAL });

    // Process user context result
    let userContext: UserContext | null = userContextResult;
    let personalizationContext = "";
    if (userContext) {
      personalizationContext = formatContextForPrompt(userContext);
      logger.debug(`Memory: Built context for user: ${userContext.profile.name || phoneNumber}`, { category: LogCategory.GENERAL });
      logger.debug(`Memory: Found ${userContext.recentMemories.length} relevant memories, ${userContext.relevantKnowledge.length} knowledge entries`, { category: LogCategory.GENERAL });

      // Store user message to memory (fire-and-forget)
      const topics = extractTopics(userMessage);
      const importance = calculateImportance(userMessage, topics);
      storeMemory(userContext.profile.id, "user", userMessage, {
        importance,
        topics,
      }).catch(err => logger.error("Memory error: Async store failed for user message", err, { category: LogCategory.GENERAL }));
    }

    // Process agent results (extracted from parallel queries)
    const agentInfo = agentByPhoneResult;
    const identifiedAgent = identifiedAgentResult;
    if (identifiedAgent) {
      logger.info(`[Agent] Identified: ${identifiedAgent.fullName} (${identifiedAgent.region})`, { category: LogCategory.GENERAL });
    }

    // Process accumulated images (extracted from parallel queries)
    const accumulatedImages = accumulatedImagesResult;
    const lastDocument = lastDocumentResult;

    // 3. Call OpenRouter API (using google/gemini-3-flash-preview)
    const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

    // Get current date/time in Cyprus timezone (Europe/Nicosia)
    const cyprusDate = new Date().toLocaleString('en-GB', {
      timeZone: 'Europe/Nicosia',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const cyprusDateShort = new Date().toLocaleDateString('en-GB', {
      timeZone: 'Europe/Nicosia',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Calculate tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateShort = tomorrow.toLocaleDateString('en-GB', {
      timeZone: 'Europe/Nicosia',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    // Inject current date context into system prompt
    const dateContext = `

---
## 📅 CURRENT DATE/TIME AWARENESS

**IMPORTANT: You must be aware of the current date and time.**

**Current Date/Time in Cyprus (Nicosia):** ${cyprusDate}
**Today's Date (DD/MM/YYYY format):** ${cyprusDateShort}

**When users say relative dates like:**
- "today" → Use ${cyprusDateShort}
- "tomorrow" → Add 1 day to today
- "next week" → Add 7 days to today
- "yesterday" → Subtract 1 day from today

**ALWAYS calculate dates correctly based on today being ${cyprusDateShort}.**

---
`;

    // NOTE: agentInfo and identifiedAgent are fetched in the parallel batch above
    // Inject sender info with agent details if known
    let senderContext: string;
    if (identifiedAgent) {
      // Use the new agent identification for property uploads
      senderContext = `

---
## 📱 CURRENT SENDER - KNOWN AGENT

**IMPORTANT: You are talking to a KNOWN AGENT who can upload property listings.**

**Agent Name:** ${identifiedAgent.fullName}
**Phone Number:** ${phoneNumber}
**Email:** ${identifiedAgent.communicationEmail}
**Region:** ${identifiedAgent.region}
**Role:** ${identifiedAgent.role}
**Can Upload Listings:** ${identifiedAgent.canUpload ? 'Yes' : 'No'}

**When this agent wants to upload a property listing, use the createPropertyListing or createLandListing tools. DO NOT ask for their name - use their info directly.**

---
`;
    } else if (agentInfo) {
      senderContext = `

---
## 📱 CURRENT SENDER - KNOWN AGENT

**IMPORTANT: You are talking to a KNOWN AGENT. Use their info directly - DO NOT ask for their name or phone number.**

**Agent Name:** ${agentInfo.name}
**Phone Number:** ${phoneNumber}
${agentInfo.email ? `**Email:** ${agentInfo.email}
` : ''}
**When generating documents for this agent, automatically use their name and phone number. DO NOT ask them to provide this information.**

---
`;
    } else {
      senderContext = `

---
## 📱 CURRENT SENDER IDENTIFICATION

**Message sent from phone number:** ${phoneNumber}

**This is an unknown sender. You may need to ask for their name if generating documents. If they want to upload a property, ask them to confirm who they are first.**

---
`;
    }

    // Add image context - use accumulated images from parallel fetch above
    // NOTE: accumulatedImages was fetched in the parallel batch above
    let imageContext = "";
    const totalImageCount = accumulatedImages.length;

    if (totalImageCount > 0) {
      // Use accumulated images (includes current + previous photos)
      imageContext = `

---
## 📷 ACCUMULATED PROPERTY PHOTOS

**IMPORTANT: You have received a total of ${totalImageCount} photo(s) for the property listing.**

**All Image URLs (use ALL of these for property listings):**
${accumulatedImages.map((url, i) => `${i + 1}. ${url}`).join('\n')}

**When the user is ready to create a property listing, use ALL of these image URLs in the \`imageUrls\` parameter of the createPropertyListing or createLandListing tool. INCLUDE EVERY IMAGE - do not leave any out.**

**REMEMBER: Ask the user to confirm all photos have been sent before uploading!**

---
`;
      logger.info(`[Images] Added ${totalImageCount} ACCUMULATED image URL(s) to AI context`, { category: LogCategory.GENERAL });
    } else if (userMessage.includes("[User sent image(s) but decryption failed]")) {
      // Special context when images were detected but could not be decrypted
      imageContext = `

---
## ⚠️ IMAGE PROCESSING ISSUE

**The user sent image(s) but our system could not process them.**

Please respond with something like:
"I received your images, but I wasn't able to process them. This sometimes happens with WhatsApp's image encryption. Could you please try sending the photos again? If the problem persists, you can also try:
1. Sending the images one at a time
2. Taking fresh photos instead of selecting from gallery
3. Sending the images as documents instead of photos"

**DO NOT proceed with any property listing until you have successfully received the images.**

---
`;
      logger.info(`[Images] Added decryption failure context to AI`, { category: LogCategory.GENERAL });
    }

    // Check for recently generated documents that can be attached to emails
    // NOTE: lastDocument was fetched in the parallel batch above
    let documentContext = "";
    if (lastDocument) {
      const docTypeDisplay = lastDocument.document_type?.replace(/_/g, ' ') || 'document';
      documentContext = `

---
## 📎 AVAILABLE DOCUMENT FOR EMAIL ATTACHMENT

**You have a recently generated document available:**
- **Document:** ${lastDocument.document_name}
- **Type:** ${docTypeDisplay}
- **URL:** ${lastDocument.document_url}

**If the user asks to email this document (e.g., "send it to my email", "email me the document"):**
→ Use the sendEmail tool with the \`attachmentUrl\` parameter set to the URL above.
→ Keep the email subject and body simple (e.g., "Find attached the ${docTypeDisplay}")

---
`;
      logger.info(`[DocContext] Found available document for attachment: ${lastDocument.document_name}`, { category: LogCategory.GENERAL });
    }

    // Build agent context for dynamic prompt loading
    const agentContext = {
      agentName: identifiedAgent?.fullName || agentInfo?.name || "Agent",
      agentPhone: phoneNumber,
      currentDate: cyprusDateShort,
      tomorrowDate: tomorrowDateShort,
    };

    // Load system prompt from database (cached for 5 minutes, falls back to hardcoded)
    const baseSystemPrompt = await loadSystemPrompt(supabase, agentContext);
    logger.info(`[PromptLoader] Loaded system prompt (${baseSystemPrompt.length} chars)`, { category: LogCategory.GENERAL });

    const systemPromptWithDate = baseSystemPrompt + dateContext + senderContext + imageContext + documentContext + personalizationContext;

    // Convert Gemini history format to OpenRouter format
    const openrouterMessages: Array<{role: string, content: string}> = [
      { role: "system", content: systemPromptWithDate }
    ];
    
    // Convert history: {role, parts: [{text}]} -> {role, content}
    for (const msg of history) {
      const role = msg.role === "model" ? "assistant" : msg.role;
      const content = msg.parts.map((p: any) => p.text || "").join("");
      openrouterMessages.push({ role, content });
    }

    logger.info(`[OpenRouter] Calling with ${openrouterMessages.length} messages`, { category: LogCategory.GENERAL });

    // Get tool definitions for property listing uploads
    const tools = getToolDefinitions();
    logger.info(`[OpenRouter] Including ${tools.length} tools for function calling`, { category: LogCategory.GENERAL });

    // Detect if user wants to upload a property - force tool usage in this case
    const lowerMessage = userMessage.toLowerCase();
    const isPropertyUploadIntent =
      (lowerMessage.includes("upload") && lowerMessage.includes("property")) ||
      (lowerMessage.includes("create") && lowerMessage.includes("listing")) ||
      (lowerMessage.includes("add") && lowerMessage.includes("property")) ||
      (lowerMessage.includes("want to") && lowerMessage.includes("upload")) ||
      (lowerMessage.includes("i want to") && lowerMessage.includes("property")) ||
      (imageUrls.length > 0 && (lowerMessage.includes("property") || lowerMessage.includes("listing") || lowerMessage.includes("bedroom") || lowerMessage.includes("apartment") || lowerMessage.includes("villa") || lowerMessage.includes("house")));

    if (isPropertyUploadIntent) {
      logger.info(`[OpenRouter] Property upload intent detected - will force tool usage`, { category: LogCategory.ZYPRUS });
    }

    // Tool calling loop - handle multiple tool calls if needed
    let aiResponse = "";
    let maxToolCalls = 5; // Prevent infinite loops
    let toolCallCount = 0;
    let currentMessages = [...openrouterMessages];

    while (toolCallCount < maxToolCalls) {
      // Retry logic for rate limiting (429 errors)
      let aiRes: Response | undefined;
      let retries = 0;
      const maxRetries = 3;
      const baseDelay = 2000;

      while (retries <= maxRetries) {
        aiRes = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://sophia-ai.vercel.app",
            "X-Title": "SOPHIA WhatsApp Bot",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: currentMessages,
            temperature: 0.1,
            max_tokens: 8192,
            tools: tools,
            // Force tool usage on first call if upload intent detected, auto for follow-ups
            tool_choice: (isPropertyUploadIntent && toolCallCount === 0) ? "required" : "auto",
          }),
        });

        if (aiRes.ok) {
          break;
        }

        const errorData = await aiRes.json().catch(() => ({
          error: { status: aiRes?.status ?? 0 },
        }));

        if (aiRes.status === 429 && retries < maxRetries) {
          const delay = baseDelay * Math.pow(2, retries);
          logger.info(`OpenRouter rate limited (429). Retrying in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`, { category: LogCategory.GENERAL });
          await new Promise((resolve) => setTimeout(resolve, delay));
          retries++;
          continue;
        }

        logger.error("OpenRouter Error: " + JSON.stringify(errorData, null, 2), undefined, { category: LogCategory.GENERAL });
        logger.error("Status: " + String(aiRes.status), undefined, { category: LogCategory.GENERAL });

        const errorMessage = "I'm experiencing technical difficulties right now. Please try again in a few moments.";
        await sendTextMessage(phoneNumber, errorMessage);
        return;
      }

      if (!aiRes || !aiRes.ok) {
        logger.error("OpenRouter API call failed after retries", undefined, { category: LogCategory.GENERAL });
        const errorMessage = "I'm having trouble processing your request. Please try again shortly.";
        await sendTextMessage(phoneNumber, errorMessage);
        return;
      }

      const aiData = await aiRes.json();
      const message = aiData.choices?.[0]?.message;

      // Check for tool calls
      if (message?.tool_calls && message.tool_calls.length > 0) {
        toolCallCount++;
        logger.info(`[OpenRouter] Tool call ${toolCallCount}: ${message.tool_calls.length} tools requested`, { category: LogCategory.GENERAL });

        // Add assistant message with tool calls to history
        currentMessages.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: message.tool_calls,
        } as any);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown>;

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch (e) {
            logger.error(`Tool error: Failed to parse arguments for ${toolName}`, e as Error, { category: LogCategory.TOOL });
            toolArgs = {};
          }

          logger.info(`Tool: Executing: ${toolName}`, { category: LogCategory.TOOL });
          logger.info(`Tool: Arguments: ${JSON.stringify(toolArgs).substring(0, 200)}`, { category: LogCategory.TOOL });

          // Execute the tool
          const toolResult = await executeTool(
            { name: toolName, arguments: toolArgs },
            identifiedAgent,
            supabaseUrl,
            supabaseKey
          );

          logger.info(`Tool: Result: ${JSON.stringify(toolResult).substring(0, 200)}`, { category: LogCategory.TOOL });

          // Add tool result to history
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          } as any);

          // If tool needs user input, send the question and stop
          if (toolResult.needsInput && toolResult.question) {
            aiResponse = toolResult.question;
            await addMessage(userId, "model", aiResponse);
            // Don't continue the loop - we need to wait for user response
            break;
          }

          // If tool succeeded with a message, use it directly (don't ask AI to respond again)
          // This prevents the AI from generating DOCX when we just want a text confirmation
          if (toolResult.success && toolResult.message) {
            logger.info(`Tool: Success with message, using tool response directly`, { category: LogCategory.TOOL });
            aiResponse = toolResult.message;
            await addMessage(userId, "model", aiResponse);
            break;
          }

          // If tool returned an error, return it directly (for debugging)
          if (toolResult.error) {
            logger.info(`Tool: Error result: ${toolResult.error}`, { category: LogCategory.TOOL });
            // For createPropertyListing errors, show the actual error instead of generic message
            if (toolName === "createPropertyListing" || toolName === "createLandListing") {
              aiResponse = `I encountered an error while creating the listing: ${toolResult.error}`;
              await addMessage(userId, "model", aiResponse);
              break;
            }
          }
        }

        // If we broke out of the loop due to needing input or success, stop here
        if (aiResponse) {
          break;
        }

        // Continue loop to get AI's next response
        continue;
      }

      // No tool calls - get the text response
      aiResponse = message?.content || "";

      // ANTI-HALLUCINATION FIX: If upload intent detected but no tool called, force retry with tool_choice: "required"
      if (isPropertyUploadIntent && toolCallCount === 0 && imageUrls.length > 0) {
        logger.info("[FORCE TOOL] Upload intent with images but no tool call - forcing retry with required tool_choice", { category: LogCategory.GENERAL });

        // Retry the call with tool_choice: "required"
        const retryRes = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://sophia-ai.vercel.app",
            "X-Title": "SOPHIA WhatsApp Bot",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: currentMessages,
            temperature: 0.1,
            max_tokens: 8192,
            tools: tools,
            tool_choice: "required",
          }),
        });

        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryMessage = retryData.choices?.[0]?.message;

          if (retryMessage?.tool_calls && retryMessage.tool_calls.length > 0) {
            logger.info("[FORCE TOOL] Retry successful - got tool calls", { category: LogCategory.GENERAL });
            // Process the tool calls
            for (const toolCall of retryMessage.tool_calls) {
              const toolName = toolCall.function.name;
              let toolArgs: Record<string, unknown>;
              try {
                toolArgs = JSON.parse(toolCall.function.arguments || "{}");
              } catch (e) {
                toolArgs = {};
              }
              logger.info(`[FORCE TOOL] Executing: ${toolName}`, { category: LogCategory.GENERAL });
              const toolResult = await executeTool(
                { name: toolName, arguments: toolArgs },
                identifiedAgent,
                supabaseUrl,
                supabaseKey
              );
              if (toolResult.success && toolResult.message) {
                aiResponse = toolResult.message;
                break;
              } else if (toolResult.needsInput && toolResult.question) {
                aiResponse = toolResult.question;
                break;
              } else if (toolResult.error) {
                aiResponse = `I encountered an issue: ${toolResult.error}`;
                break;
              }
            }
          }
        }
      }

      break
    }

    if (!aiResponse) {
      logger.error("Empty response from OpenRouter", undefined, { category: LogCategory.GENERAL });

      // Send error message to user
      const errorMessage = "I couldn't generate a response. Please rephrase your request and try again.";
      await sendTextMessage(phoneNumber, errorMessage);
      return;
    }

    logger.info("AI Response received (first 500 chars): " + aiResponse.substring(0, 500), { category: LogCategory.GENERAL });
    logger.info("AI Response length:" + String(aiResponse.length), { category: LogCategory.GENERAL });

    // 4. Add AI response to database
    await addMessage(userId, "model", aiResponse);

    // 4.1 P1 FIX: Fire-and-forget AI response storage (truly non-blocking)
    if (userContext) {
      const responseTopics = extractTopics(aiResponse);
      storeMemory(userContext.profile.id, "assistant", aiResponse, {
        importance: 0.5, // AI responses have standard importance
        topics: responseTopics,
      })
        .then(() => logger.debug(`Memory: Stored AI response with ${responseTopics.length} topics`, { category: LogCategory.GENERAL }))
        .catch(err => logger.error("Memory error: Async store failed for AI response", err, { category: LogCategory.GENERAL }));
    }

    // 4.5 Check if AI claims to have sent an email - actually send it!
    logger.info("[Email Check] Checking AI response for email intent...", { category: LogCategory.GENERAL });
    logger.info("[Email Check] AI Response preview: " + aiResponse.substring(0, 300), { category: LogCategory.GENERAL });

    const updatedHistoryForEmail = await getHistory(userId);
    const emailIntent = detectEmailSendingIntent(
      aiResponse,
      updatedHistoryForEmail,
      identifiedAgent?.communicationEmail || undefined
    );

    logger.info("[Email Check] Email intent detected:" + String(emailIntent ? "YES" : "NO"), { category: LogCategory.GENERAL });
    if (emailIntent) {
      logger.info("Email: Recipient:" + String(emailIntent.recipientEmail), { category: LogCategory.WEBHOOK });
      logger.info("Email: Subject:" + String(emailIntent.subject), { category: LogCategory.WEBHOOK });
      logger.info("Email: Body length:" + String(emailIntent.body.length), { category: LogCategory.WEBHOOK });
      logger.info("Email: Document URL:" + String(emailIntent.documentUrl || "none"), { category: LogCategory.WEBHOOK });
      logger.info("Email: RESEND_API_KEY set:" + String(!!RESEND_API_KEY), { category: LogCategory.WEBHOOK });

      const emailResult = await sendEmailViaResend(emailIntent);

      if (emailResult.success) {
        logger.info("Email: Email actually sent successfully via Resend!", { category: LogCategory.WEBHOOK });
        // The AI's response already says "I have sent...", so just send it as text
      } else {
        logger.error("Email error: Failed to send email: " + String(emailResult.error), undefined, { category: LogCategory.WEBHOOK });
        // Modify the AI response to indicate failure
        const failureNote = `

(Note: There was an issue sending the email: ${emailResult.error}. Please try again or send it manually.)`;
        // We'll still send the AI response but add a note
        await sendTextMessage(phoneNumber, aiResponse + failureNote);
        return;
      }
    } else {
      logger.info("[Email Check] No email intent detected in AI response", { category: LogCategory.GENERAL });
    }

    // 4.6 Check if this is a confirmation message - always send as text
    if (isConfirmationMessage(aiResponse)) {
      logger.info("[Confirmation] Detected confirmation message → sending as TEXT", { category: LogCategory.GENERAL });
      await sendTextMessage(phoneNumber, aiResponse);
      return;
    }

    // 5. Determine routing: DOCX file or text message
    // FIRST: Check if this is an informational response about templates
    const isInformational = isInformationalResponse(aiResponse, userMessage);

    if (isInformational) {
      logger.info("[DOCX Router] Informational response detected → sending as TEXT", { category: LogCategory.GENERAL });

      // Parse and send as text message(s)
      const messages = parseTemplateResponse(aiResponse);
      for (const msg of messages) {
        await sendTextMessage(phoneNumber, msg);
      }
      return;
    }

    // Check if AI response contains "Subject:" AND "Dear" -> send as text
    // Check if it's a DOCX template -> send as DOCX file
    const hasEmailFormat = aiResponse.includes("Subject:") &&
      aiResponse.includes("Dear");

    // Get updated history for DOCX detection (skip if already identified as informational)
    const updatedHistory = await getHistory(userId);

    // Initial DOCX detection
    let shouldSendAsDocx = !isInformational && isDocxTemplate(aiResponse, updatedHistory);

    // 🚨 CRITICAL OVERRIDE: Force DOCX when user wants marketing agreement but AI generated email
    const forceMarketingDocx = shouldForceMarketingDocx(userMessage, aiResponse);
    if (forceMarketingDocx) {
      logger.info("=== MARKETING AGREEMENT OVERRIDE ===", { category: LogCategory.GENERAL });
      logger.info("User asked for marketing agreement DOCX but AI generated email", { category: LogCategory.GENERAL });
      logger.info("FORCING DOCX generation using specialized template", { category: LogCategory.GENERAL });

      // Get agent name for the marketing agreement
      const agentName = identifiedAgent?.fullName || "Agent";
      const marketingData = parseMarketingAgreementData(aiResponse, agentName);

      if (marketingData) {
        logger.info("Successfully parsed marketing data from email response:" + String(marketingData), { category: LogCategory.GENERAL });

        // Force DOCX generation
        shouldSendAsDocx = true;

        // Add flag to use specialized marketing template
        // We'll handle this in the DOCX generation section below
      } else {
        logger.info("Could not parse marketing data from email - will ask user for info", { category: LogCategory.GENERAL });
        // Don't force DOCX, let it send as text (which will ask for missing info)
      }
      logger.info("=== END MARKETING OVERRIDE ===", { category: LogCategory.GENERAL });
    }

    // For simple greetings, don't consider DOCX requested regardless of history
    const isSimpleUserGreeting = userMessage.toLowerCase().trim().match(/^(hi|hello|hey|good morning|good afternoon|good evening)$/);
    const wasDocxRequested = isSimpleUserGreeting ? false : wasDocxTemplateRequested(updatedHistory);
    const detectedTemplateType = detectTemplateType(userMessage);

    // Additional field validation check - if AI is collecting information, don't send as DOCX
    // SKIP this check if forceMarketingDocx is true (we already validated marketing data)
    if (shouldSendAsDocx && !forceMarketingDocx && isCollectingInformation(aiResponse)) {
      logger.info("[Field Validator] Response is collecting information, overriding DOCX → TEXT", { category: LogCategory.GENERAL });
      shouldSendAsDocx = false;
    }

    // Check if all required fields are present for DOCX generation
    // SKIP this check if forceMarketingDocx is true (marketing data was already parsed successfully)
    if (shouldSendAsDocx && !forceMarketingDocx && !hasAllRequiredFields(aiResponse, detectedTemplateType || undefined)) {
      logger.info("[Field Validator] Missing required fields, overriding DOCX → TEXT", { category: LogCategory.GENERAL });
      shouldSendAsDocx = false;
    }

    // Enhanced diagnostic logging
    logger.info("=== DOCX ROUTING DIAGNOSTICS ===", { category: LogCategory.GENERAL });
    logger.info(JSON.stringify({
      event: "docx_routing_check",
      shouldSendAsDocx,
      forceMarketingDocx,  // 🚨 NEW: Track forced marketing override
      wasDocxRequested,
      hasEmailFormat,
      detectedTemplateType: detectedTemplateType || "none",
      responseLength: aiResponse.length,
      responsePreview: aiResponse.substring(0, 200).replace(/\n/g, " "),
      hasSubjectLine: aiResponse.includes("Subject:"),
      containsPlaceholders: /XXXXXXXX|\[DATE\]|\[PROPERTY\]/i.test(aiResponse),
      isCollectingInfo: isCollectingInformation(aiResponse),
      hasRequiredFields: hasAllRequiredFields(aiResponse, detectedTemplateType || undefined),
    }, null, 2));
    logger.info("================================", { category: LogCategory.GENERAL });

    // Check if response is just a placeholder (should never be sent)
    // Only block actual placeholder text, NOT short legitimate responses
    const isPlaceholder = aiResponse.toLowerCase().includes("document generated by sophia") ||
                          aiResponse.toLowerCase().includes("i can only generate documents");

    if (isPlaceholder) {
      logger.error("ERROR: AI returned placeholder response, not sending.", undefined, { category: LogCategory.GENERAL });
      logger.error("AI Response: " + String(aiResponse), undefined, { category: LogCategory.GENERAL });
      return;
    }

    // If a DOCX template was requested but AI didn't generate proper content, try retry logic
    // BUT skip this for simple greetings or informational responses
    const isSimpleGreeting = userMessage.toLowerCase().trim().match(/^(hi|hello|hey|good morning|good afternoon|good evening|greetings|salutations)$/);
    const isShortInformationalResponse = aiResponse.length < 100 && !aiResponse.includes("Subject:");
    const currentMessageRequestedDocx = detectTemplateType(userMessage) !== null;

    if (wasDocxRequested && !shouldSendAsDocx && !isSimpleGreeting && !isShortInformationalResponse && currentMessageRequestedDocx) {
      logger.info("=== DOCX GENERATION FAILURE - ATTEMPTING RECOVERY ===", { category: LogCategory.GENERAL });
      logger.info(JSON.stringify({
        event: "docx_generation_failure",
        reason: "ai_response_not_recognized_as_docx",
        wasDocxRequested: true,
        shouldSendAsDocx: false,
        detectedTemplateType: detectedTemplateType || "unknown",
        responseLength: aiResponse.length,
        responsePreview: aiResponse.substring(0, 300).replace(/\n/g, " "),
      }, null, 2));

      // Check if this is a clarification response that we can retry
      if (isClarificationResponse(aiResponse)) {
        logger.info("Detected clarification response - attempting retry with explicit document generation instruction", { category: LogCategory.GENERAL });
        
        // Detect the template type from the user's original message
        const templateType = detectTemplateType(userMessage);
        logger.info("Detected template type:" + String(templateType || "unknown"), { category: LogCategory.GENERAL });
        
        // Create a retry prompt that explicitly instructs document generation
        const retryInstruction = templateType 
          ? `CRITICAL INSTRUCTION: The user requested a "${templateType}". You MUST generate the COMPLETE document NOW. Do NOT ask any questions. Use placeholder values (XXXXXXXX, [DATE], [PROPERTY], etc.) for any missing fields. Output the full document structure immediately.`
          : `CRITICAL INSTRUCTION: The user requested a DOCX template document. You MUST generate the COMPLETE document NOW. Do NOT ask any questions. Use placeholder values (XXXXXXXX, [DATE], [PROPERTY], etc.) for any missing fields. Output the full document structure immediately.`;
        
        // Create retry request with enhanced instruction
        // Convert to OpenRouter format for retry
        const retryMessages = [
          { role: "system", content: systemPromptWithDate },
          ...history.map((msg: any) => ({
            role: msg.role === "model" ? "assistant" : msg.role,
            content: msg.parts.map((p: any) => p.text || "").join("")
          })),
          { role: "user", content: retryInstruction }
        ];
        
        const retryBody = {
          model: "google/gemini-3-flash-preview",
          messages: retryMessages,
          temperature: 0.1,
          max_tokens: 8192,
        };
        
        try {
          logger.info("Making retry OpenRouter API call...", { category: LogCategory.GENERAL });
          const retryRes = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://sophia-ai.vercel.app",
                "X-Title": "SOPHIA WhatsApp Bot",
              },
              body: JSON.stringify(retryBody),
            }
          );
          
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryResponse = retryData.choices?.[0]?.message?.content;
            
            if (retryResponse && retryResponse.length > 500) {
              logger.info("Retry successful! Response length:" + String(retryResponse.length), { category: LogCategory.GENERAL });
              logger.info("Retry response preview: " + retryResponse.substring(0, 300), { category: LogCategory.GENERAL });
              
              // Check if retry response is proper document content
              const retryIsDocx = isDocxTemplate(retryResponse, history);
              logger.info("Retry response isDocxTemplate:" + String(retryIsDocx), { category: LogCategory.GENERAL });
              
              if (retryIsDocx) {
                // Add retry response to database  
                await addMessage(userId, "model", retryResponse);
                
                // Send as DOCX
                const filename = `document_${Date.now()}.docx`;
                logger.info("Creating DOCX file from retry response:" + String(filename), { category: LogCategory.GENERAL });
                
                const docxContent = await createDocxFile(retryResponse, filename);
                logger.info("DOCX content created, size: " + String(docxContent.length) + " bytes", { category: LogCategory.GENERAL });
                
                const sendResult = await sendDocxFile(phoneNumber, docxContent, filename, 1, userId);
                const sendResultText = await sendResult.text();
                logger.info("DOCX send result status:" + String(sendResult.status), { category: LogCategory.GENERAL });
                logger.info("DOCX send result body:" + String(sendResultText), { category: LogCategory.GENERAL });

                if (!sendResult.ok) {
                  logger.error("Failed to send DOCX file from retry! Falling back to text.", undefined, { category: LogCategory.GENERAL });
                  await sendTextMessage(phoneNumber, retryResponse);
                }
                return; // Successfully sent from retry
              }
            }
          }
          logger.error("Retry failed or didn't produce valid document content", undefined, { category: LogCategory.GENERAL });
        } catch (retryError) {
          logger.error("Error during retry OpenRouter call: " + String(retryError), undefined, { category: LogCategory.GENERAL });
        }
      }
      
      // If we get here, both original and retry failed
      // BUT if the original response was a clarification, send it as text
      if (isClarificationResponse(aiResponse) || isCollectingInformation(aiResponse)) {
        logger.info("=== SENDING CLARIFICATION AS TEXT AFTER DOCX GENERATION FAILURE ===", { category: LogCategory.GENERAL });
        logger.info("Original response was a clarification request, sending as text to user", { category: LogCategory.GENERAL });

        // Parse and send as text message(s)
        const messages = parseTemplateResponse(aiResponse);
        for (const msg of messages) {
          await sendTextMessage(phoneNumber, msg);
        }
        return;
      }

      logger.info("=== DOCX GENERATION FINAL FAILURE ===", { category: LogCategory.GENERAL });
      logger.info(JSON.stringify({
        event: "docx_generation_final_failure",
        outcome: "no_message_sent",
        reason: "could_not_generate_valid_docx_content",
        detectedTemplateType: detectedTemplateType || "unknown",
        originalResponseLength: aiResponse.length,
      }, null, 2));
      logger.error("ERROR: DOCX template was requested but couldn't generate proper content.", undefined, { category: LogCategory.GENERAL });
      logger.error("Not sending placeholder message to user.", undefined, { category: LogCategory.GENERAL });
      return;
    }

    if (shouldSendAsDocx) {
      // Send as DOCX file
      logger.info("Detected DOCX template - generating and sending as file attachment", { category: LogCategory.GENERAL });
      logger.info("AI Response length:" + String(aiResponse.length), { category: LogCategory.GENERAL });
      logger.info("AI Response preview: " + aiResponse.substring(0, 200), { category: LogCategory.GENERAL });

      let filename = `document_${Date.now()}.docx`;
      logger.info("Creating DOCX file:" + String(filename), { category: LogCategory.GENERAL });

      // 🚨 FORCED MARKETING AGREEMENT: Handle the case where user asked for marketing agreement
      // but AI generated email (with Subject: line). Use specialized generator directly.
      if (forceMarketingDocx) {
        logger.info("=== FORCED MARKETING AGREEMENT DOCX GENERATION ===", { category: LogCategory.GENERAL });
        const agentName = identifiedAgent?.fullName || "Agent";
        const marketingData = parseMarketingAgreementData(aiResponse, agentName);

        if (marketingData) {
          logger.info("Marketing data for DOCX:" + String(marketingData), { category: LogCategory.GENERAL });
          const docxDoc = createMarketingAgreement(marketingData);
          const buffer = await Packer.toBuffer(docxDoc);
          const docxContent = new Uint8Array(buffer);
          filename = "Non_Exclusive_Marketing_Agreement.docx";
          logger.info("Marketing Agreement DOCX created, size:" + String(docxContent.length, "bytes"), { category: LogCategory.GENERAL });

          const sendResult = await sendDocxFile(phoneNumber, docxContent, filename, 1, userId);
          const sendResultText = await sendResult.text();
          logger.info("Marketing DOCX send result status:" + String(sendResult.status), { category: LogCategory.GENERAL });
          logger.info("Marketing DOCX send result body:" + String(sendResultText), { category: LogCategory.GENERAL });

          if (!sendResult.ok) {
            logger.error("Failed to send Marketing DOCX! Falling back to text.", undefined, { category: LogCategory.GENERAL });
            await sendTextMessage(phoneNumber, aiResponse);
          }
          logger.info("=== MARKETING AGREEMENT SENT AS DOCX ===", { category: LogCategory.GENERAL });
          return; // Exit early - we've handled the forced marketing case
        } else {
          logger.error("Could not parse marketing data - falling back to normal flow", undefined, { category: LogCategory.GENERAL });
          // Fall through to normal processing
        }
      }

      // Check if this is a viewing form that should use specialized generators
      const templateType = detectDocxTemplateType(aiResponse);
      logger.info("Detected template type:" + String(templateType), { category: LogCategory.GENERAL });

      let docxContent: Uint8Array;

      if (templateType.startsWith('viewing-form-') || templateType === 'reservation-agreement' || templateType === 'marketing-non-exclusive') {
        // Use specialized DOCX generators
        logger.info("Using specialized DOCX generator for type:" + String(templateType), { category: LogCategory.GENERAL });

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
              logger.info("Logo decoded successfully for viewing form", { category: LogCategory.GENERAL });
            } catch (e) {
              logger.error("Failed to decode logo: " + String(e), undefined, { category: LogCategory.GENERAL });
              logoData = undefined;
            }
          }

          let docxDoc: Document | null = null;

          switch(templateType) {
            case 'viewing-form-single': {
              logger.info("Parsing single person viewing form data...", { category: LogCategory.GENERAL });
              const singleData = parseViewingFormSingleData(aiResponse);
              if (singleData) {
                logger.info("Creating single person viewing form document...", { category: LogCategory.GENERAL });
                docxDoc = createViewingFormSingle(singleData, logoData);
              } else {
                logger.info("Failed to parse single person data, falling back to generic", { category: LogCategory.GENERAL });
              }
              break;
            }
            case 'viewing-form-multiple': {
              logger.info("Parsing multiple person viewing form data...", { category: LogCategory.GENERAL });
              const multipleData = parseViewingFormMultipleData(aiResponse);
              if (multipleData) {
                logger.info("Creating multiple person viewing form document...", { category: LogCategory.GENERAL });
                docxDoc = createViewingFormMultiple(multipleData, logoData);
              } else {
                logger.info("Failed to parse multiple person data, falling back to generic", { category: LogCategory.GENERAL });
              }
              break;
            }
            case 'viewing-form-advanced': {
              logger.info("Parsing advanced viewing form data...", { category: LogCategory.GENERAL });
              const advancedData = parseViewingFormAdvancedData(aiResponse);
              if (advancedData) {
                logger.info("Creating advanced viewing form document...", { category: LogCategory.GENERAL });
                docxDoc = createViewingFormAdvanced(advancedData, logoData);
              } else {
                logger.info("Failed to parse advanced form data, falling back to generic", { category: LogCategory.GENERAL });
              }
              break;
            }
            case 'reservation-agreement': {
              logger.info("Parsing reservation agreement data...", { category: LogCategory.GENERAL });
              const reservationData = parseReservationAgreementData(aiResponse);
              if (reservationData) {
                logger.info("Creating reservation agreement document...", { category: LogCategory.GENERAL });
                docxDoc = createReservationAgreement(reservationData); // No logo for reservation
                filename = "Property_Reservation_Agreement.docx";
              } else {
                logger.info("Failed to parse reservation agreement data, falling back to generic", { category: LogCategory.GENERAL });
              }
              break;
            }
            case 'marketing-non-exclusive': {
              logger.info("Parsing non-exclusive marketing agreement data...", { category: LogCategory.GENERAL });
              // Get agent name from identified agent (SOPHIA knows who is messaging)
              const agentName = identifiedAgent?.fullName || "Agent";
              const marketingData = parseMarketingAgreementData(aiResponse, agentName);
              if (marketingData) {
                logger.info("Creating non-exclusive marketing agreement document...", { category: LogCategory.GENERAL });
                docxDoc = createMarketingAgreement(marketingData);
                filename = "Non_Exclusive_Marketing_Agreement.docx";
              } else {
                logger.info("Failed to parse marketing agreement data, falling back to generic", { category: LogCategory.GENERAL });
              }
              break;
            }
          }

          if (docxDoc) {
            // Successfully created structured document
            logger.info("Converting structured document to buffer...", { category: LogCategory.GENERAL });
            const buffer = await Packer.toBuffer(docxDoc);
            docxContent = new Uint8Array(buffer);
            logger.info("Structured DOCX created, size: " + String(docxContent.length) + " bytes", { category: LogCategory.GENERAL });
          } else {
            // Fallback to generic DOCX creation
            logger.info("Using generic DOCX creation as fallback", { category: LogCategory.GENERAL });
            docxContent = await createDocxFile(aiResponse, filename);
          }
        } catch (error) {
          logger.error("Error creating structured viewing form: " + String(error), undefined, { category: LogCategory.GENERAL });
          logger.info("Falling back to generic DOCX creation", { category: LogCategory.GENERAL });
          docxContent = await createDocxFile(aiResponse, filename);
        }
      } else {
        // Use generic DOCX creation for other templates
        logger.info("Using generic DOCX creation for non-viewing form template", { category: LogCategory.GENERAL });
        docxContent = await createDocxFile(aiResponse, filename);
      }

      logger.info("DOCX content created, size: " + String(docxContent.length) + " bytes", { category: LogCategory.GENERAL });

      const sendResult = await sendDocxFile(phoneNumber, docxContent, filename, 1, userId);
      const sendResultText = await sendResult.text();
      logger.info("DOCX send result status:" + String(sendResult.status), { category: LogCategory.GENERAL });
      logger.info("DOCX send result body:" + String(sendResultText), { category: LogCategory.GENERAL });

      if (!sendResult.ok) {
        logger.error("Failed to send DOCX file! Status: " + String(sendResult.status), undefined, { category: LogCategory.GENERAL });
        logger.error("Error response: " + String(sendResultText), undefined, { category: LogCategory.GENERAL });
        // Fallback: send as text message
        logger.info("Falling back to text message...", { category: LogCategory.GENERAL });
        await sendTextMessage(phoneNumber, aiResponse);
      }
    } else {
      // Send as text message(s)
      logger.info("=== SENDING TEXT MESSAGE (not DOCX) ===", { category: LogCategory.GENERAL });
      logger.info(`Phone number: ${phoneNumber}`, { category: LogCategory.GENERAL });
      logger.info(`AI Response length: ${aiResponse.length}`, { category: LogCategory.GENERAL });
      logger.info(`AI Response preview: ${aiResponse.substring(0, 200)}`, { category: LogCategory.GENERAL });

      // Parse response into separate parts (Subject, Body, Notes)
      const messageParts = parseTemplateResponse(aiResponse);

      logger.info(`Sending ${messageParts.length} message(s)`, { category: LogCategory.GENERAL });

      // Debug: Log each part
      messageParts.forEach((part, idx) => {
        logger.info(`Part ${idx + 1} preview (first 100 chars): ${part.substring(0, 100)}`, { category: LogCategory.GENERAL });
      });

      // Send each part as a separate message with a small delay between them
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        logger.info(`Sending message part ${i + 1}/${messageParts.length}`, { category: LogCategory.GENERAL });

        logger.debug(` About to call sendTextMessage for part ${i + 1}`, { category: LogCategory.GENERAL });
        const sendResult = await sendTextMessage(phoneNumber, part);
        const sendBody = await sendResult.clone().text();
        logger.info(`Send result for part ${i + 1}: status=${sendResult.status}, body=${sendBody}`, { category: LogCategory.GENERAL });

        // Add a small delay between messages to ensure order (except for the last one)
        if (i < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      logger.info("=== ALL TEXT MESSAGES SENT SUCCESSFULLY ===", { category: LogCategory.GENERAL });
    }
    logger.info("=== PROCESS REQUEST COMPLETED ===", { category: LogCategory.GENERAL });
  } catch (error) {
    logger.error("=== PROCESS REQUEST ERROR ===", undefined, { category: LogCategory.GENERAL });
    logger.error("Error details: " + String(error), undefined, { category: LogCategory.GENERAL });
    logger.error("Error in processRequest", error as Error, {
      operation: "process_request",
    });
    // Don't throw - we've already returned 200 OK
  }
}

// =====================================================
// ADMIN API ENDPOINTS
// =====================================================

/**
 * ADMIN API ENDPOINTS
 * ====================
 *
 * Authentication: All admin endpoints require the `x-admin-secret` header
 * matching the SOPHIA_ADMIN_SECRET environment variable.
 *
 * Endpoints:
 *
 * POST /admin/prompts/invalidate
 *   - Clears the prompt cache
 *   - Next request will reload prompts from database
 *   - Use after editing prompts in Supabase Dashboard
 *   - Response: { success: true, message: string, timestamp: string }
 *
 * POST /admin/prompts/rollback
 *   - Rollback a prompt to a previous version
 *   - Body: { "key": "identity", "version": 2, "reason": "bug in v3" }
 *   - Creates new version with target content (append-only)
 *   - Invalidates cache after rollback
 *   - Response: { success: true, message: string, newVersion: number }
 *
 * GET /admin/prompts/history?key=identity
 *   - Get version history for a prompt
 *   - Returns array of versions with timestamps
 *   - Response: { key: string, history: [{version, created_at, replaced_at, is_current}] }
 *
 * GET /admin/cache/status
 *   - Returns cache diagnostic information
 *   - Useful for debugging cache issues
 *   - Response: { cache: { isCached, ageMs, ttlMs, sectionCount, version }, timestamp }
 *
 * Setup:
 *   supabase secrets set SOPHIA_ADMIN_SECRET=your-secret-here --project-ref vceeheaxcrhmpqueudqx
 *
 * Usage:
 *   curl -X POST "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/prompts/invalidate" \
 *     -H "x-admin-secret: your-secret-here"
 *
 *   curl -X POST "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/prompts/rollback" \
 *     -H "x-admin-secret: your-secret-here" \
 *     -H "Content-Type: application/json" \
 *     -d '{"key": "identity", "version": 2, "reason": "bug in v3"}'
 *
 *   curl "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/prompts/history?key=identity" \
 *     -H "x-admin-secret: your-secret-here"
 *
 *   curl "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot/admin/cache/status" \
 *     -H "x-admin-secret: your-secret-here"
 */

/**
 * Handle admin API requests
 * Requires SOPHIA_ADMIN_SECRET header for authentication
 */
async function handleAdminRequest(req: Request, url: URL): Promise<Response> {
  // Authenticate admin request
  const providedSecret = req.headers.get("x-admin-secret");

  if (!ADMIN_SECRET) {
    logger.warn("Admin endpoint accessed but SOPHIA_ADMIN_SECRET not configured", {
      category: LogCategory.GENERAL,
      endpoint: url.pathname,
    });
    return new Response(JSON.stringify({
      error: "Admin endpoints not configured"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (providedSecret !== ADMIN_SECRET) {
    logger.warn("Admin endpoint unauthorized access attempt", {
      category: LogCategory.GENERAL,
      endpoint: url.pathname,
    });
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Route to specific admin endpoint
  if (url.pathname === "/sophia-bot/admin/prompts/invalidate" && req.method === "POST") {
    return handleCacheInvalidate();
  }

  if (url.pathname === "/sophia-bot/admin/prompts/rollback" && req.method === "POST") {
    return handlePromptRollback(req);
  }

  if (url.pathname === "/sophia-bot/admin/prompts/history" && req.method === "GET") {
    return handlePromptHistory(url);
  }

  if (url.pathname === "/sophia-bot/admin/cache/status" && req.method === "GET") {
    return handleCacheStatus();
  }

  // Unknown admin endpoint
  return new Response(JSON.stringify({
    error: "Not Found",
    availableEndpoints: [
      "POST /sophia-bot/admin/prompts/invalidate",
      "POST /sophia-bot/admin/prompts/rollback",
      "GET /sophia-bot/admin/prompts/history?key=X",
      "GET /sophia-bot/admin/cache/status",
    ]
  }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/prompts/invalidate
 * Clears the prompt cache, forcing reload on next request
 */
function handleCacheInvalidate(): Response {
  invalidateCache();

  logger.info("Admin: Cache invalidated via API", {
    category: LogCategory.GENERAL,
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Prompt cache invalidated. Next request will reload from database.",
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /admin/cache/status
 * Returns cache diagnostic information
 */
function handleCacheStatus(): Response {
  const status = getCacheStatus();

  logger.debug("Admin: Cache status requested", {
    category: LogCategory.GENERAL,
    ...status,
  });

  return new Response(JSON.stringify({
    cache: {
      isCached: status.isCached,
      ageMs: status.age,
      ageFormatted: status.age > 0 ? `${Math.round(status.age / 1000)}s` : "N/A",
      ttlMs: status.ttl,
      ttlFormatted: status.ttl > 0 ? `${Math.round(status.ttl / 60000)}min` : "disabled",
      sectionCount: status.sectionCount,
      version: status.version,
      isExpired: status.ttl > 0 ? status.age > status.ttl : false,
    },
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/prompts/rollback
 * Rollback a prompt to a previous version
 *
 * Request body:
 * {
 *   "key": "identity",           // Required: prompt key
 *   "version": 2,                // Required: version to rollback to
 *   "reason": "bug in v3"        // Required: reason for rollback
 * }
 */
async function handlePromptRollback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { key, version, reason } = body;

    if (!key || typeof key !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'key'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!version || typeof version !== "number" || version < 1) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'version' (must be positive integer)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!reason || typeof reason !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid 'reason'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    logger.info("Admin: Rollback requested", {
      category: LogCategory.CACHE,
      promptKey: key,
      targetVersion: version,
      reason,
    });

    const result = await rollbackPrompt(supabase, key, version, reason);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("Admin: Rollback endpoint error", err as Error, {
      category: LogCategory.CACHE,
    });
    return new Response(
      JSON.stringify({ success: false, error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /admin/prompts/history?key=identity
 * Get version history for a prompt
 */
async function handlePromptHistory(url: URL): Promise<Response> {
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing 'key' query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const history = await getPromptVersionHistory(supabase, key);

  logger.debug("Admin: Version history requested", {
    category: LogCategory.CACHE,
    promptKey: key,
    versionCount: history.length,
  });

  return new Response(JSON.stringify({ key, history }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /admin/migrate-templates
 * One-time migration: Insert templates content into sophia_prompts table
 * This endpoint is for plan 08-02 and can be removed after successful migration
 */
async function handleTemplateMigration(): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Check if templates key already exists
    const { data: existing, error: checkError } = await supabase
      .from("sophia_prompts")
      .select("key, priority, is_active")
      .eq("key", "templates")
      .maybeSingle();

    if (checkError) {
      logger.error("Admin: Template migration check failed", undefined, {
        category: LogCategory.GENERAL,
        errorMessage: checkError.message,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Database check failed",
        details: checkError.message,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (existing) {
      logger.info("Admin: Templates already migrated", {
        category: LogCategory.GENERAL,
        existing,
      });

      return new Response(JSON.stringify({
        success: true,
        alreadyExists: true,
        message: "Templates key already exists in database",
        existing: {
          key: existing.key,
          priority: existing.priority,
          active: existing.is_active,
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Import templates content from prompts/templates/content.ts
    const { TEMPLATES } = await import("./prompts/templates/content.ts");

    logger.info("Admin: Inserting templates into database", {
      category: LogCategory.GENERAL,
      contentLength: TEMPLATES.length,
    });

    // Insert templates
    const { data, error: insertError } = await supabase
      .from("sophia_prompts")
      .insert({
        key: "templates",
        content: TEMPLATES,
        category: "templates",
        description: "All 43 document templates for Cyprus real estate communications",
        priority: 80,
        is_active: true,
        updated_by: "migration-08-02",
        version: 1,
        is_current: true,
      })
      .select("id, key, priority, is_active")
      .single();

    if (insertError) {
      logger.error("Admin: Template migration insert failed", undefined, {
        category: LogCategory.GENERAL,
        errorMessage: insertError.message,
      });

      return new Response(JSON.stringify({
        success: false,
        error: "Database insert failed",
        details: insertError.message,
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info("Admin: Templates migrated successfully", {
      category: LogCategory.GENERAL,
      id: data.id,
      key: data.key,
      priority: data.priority,
      contentLength: TEMPLATES.length,
    });

    // Invalidate cache to pick up new templates
    invalidateCache();

    return new Response(JSON.stringify({
      success: true,
      message: "Templates migrated successfully to database",
      data: {
        id: data.id,
        key: data.key,
        priority: data.priority,
        active: data.is_active,
        contentLength: TEMPLATES.length,
      },
      cacheInvalidated: true,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("Admin: Template migration unexpected error", err instanceof Error ? err : undefined, {
      category: LogCategory.GENERAL,
      errorDetails: err instanceof Error ? err.message : String(err),
    });

    return new Response(JSON.stringify({
      success: false,
      error: "Unexpected error during migration",
      details: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Signature, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // =====================================================
  // HEALTH CHECK ENDPOINT (unauthenticated)
  // =====================================================
  if (url.pathname.endsWith("/health") && req.method === "GET") {
    return await handleHealthCheck();
  }

  // =====================================================
  // ADMIN ENDPOINTS (before webhook processing)
  // =====================================================

  if (url.pathname.startsWith("/sophia-bot/admin/")) {
    return handleAdminRequest(req, url);
  }

  // Wrap entire request in context for correlation ID tracking
  return withContext(
    {
      correlationId: crypto.randomUUID(),
      startTime: Date.now(),
    },
    async () => {
      try {
        // Handle GET requests (webhook verification)
        if (req.method === "GET") {
          logger.info("Webhook verification request received", { category: LogCategory.WEBHOOK });
          return new Response("Webhook functional", { status: 200 });
        }

        // Handle POST requests
        if (req.method === "POST") {
      // SECURITY: Read raw body for signature verification before parsing
      const rawBody = await req.text();

      // DEBUG: Log all incoming headers to understand WaSend's format
      const headerEntries: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headerEntries[key] = key.toLowerCase().includes('auth') || key.toLowerCase().includes('key')
          ? '[REDACTED]'
          : value.substring(0, 100);
      });
      logger.info("Incoming webhook headers: " + JSON.stringify(headerEntries), { category: LogCategory.GENERAL });

      // SECURITY: Verify webhook signature (if secret is configured)
      // When WASEND_WEBHOOK_SECRET is set, signature verification is REQUIRED
      if (WASEND_WEBHOOK_SECRET) {
        const signature = extractSignatureHeader(req.headers);

        if (signature) {
          const isValid = await verifyWebhookSignature(
            signature,
            rawBody,
            WASEND_WEBHOOK_SECRET
          );

          if (!isValid) {
            logger.warn("Webhook signature verification failed", {
              operation: "webhook_auth",
              signatureReceived: signature.substring(0, 20) + "...",
            });
            return new Response("Unauthorized", { status: 401 });
          } else {
            logger.debug("Webhook signature verified successfully", { category: LogCategory.GENERAL });
          }
        } else {
          // SECURITY: If secret is configured, signature is required
          // To disable signature verification, unset WASEND_WEBHOOK_SECRET
          logger.warn("Webhook signature required but not provided - rejecting request", {
            operation: "webhook_auth",
            hint: "Unset WASEND_WEBHOOK_SECRET to disable signature verification",
          });
          return new Response("Unauthorized", { status: 401 });
        }
      } else {
        // No secret configured - signature verification disabled
        // This is acceptable for development but should be enabled in production
        logger.debug("WASEND_WEBHOOK_SECRET not configured - signature verification disabled", {
          operation: "webhook_auth",
        });
      }

      // Parse the payload after signature verification
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        logger.error("Invalid JSON payload", undefined, { category: LogCategory.GENERAL });
        return new Response("Bad Request", { status: 400 });
      }

      // DEBUG: Save raw payload to database for debugging image issues
      // This captures the exact structure WaSend sends before any processing
      const payloadStr = JSON.stringify(payload);
      const hasImageInPayload = payloadStr.includes("imageMessage") ||
                                payloadStr.includes("mediaKey") ||
                                payloadStr.includes("mmg.whatsapp.net");

      // Extract phone for debugging
      let debugPhone = "unknown";
      try {
        const data = payload.data || payload;
        const msgs = data.messages || data.message || data;
        const m = Array.isArray(msgs) ? msgs[0] : msgs;
        debugPhone = m?.key?.cleanedSenderPn || m?.key?.remoteJid || m?.from || "unknown";
      } catch { /* ignore */ }

      // Save to debug table (always for images, sample for others)
      if (hasImageInPayload || Math.random() < 0.1) {
        try {
          await supabase.from("webhook_debug_logs").insert({
            event_type: payload.event || "unknown",
            phone_number: debugPhone,
            raw_payload: payload,
            image_detected: hasImageInPayload,
          });
          logger.debug(` Saved payload to webhook_debug_logs (image: ${hasImageInPayload})`, { category: LogCategory.GENERAL });
        } catch (e) {
          logger.debug(` Failed to save debug log: ${e}`, { category: LogCategory.GENERAL });
        }
      }

      // SECURITY: Validate payload structure
      if (!validateWebhookPayload(payload)) {
        logger.warn("Invalid webhook payload structure", {
          operation: "validation",
        });
        return new Response("OK", { status: 200 });
      }

      logger.debug("Received webhook payload", { operation: "webhook_receive", category: LogCategory.GENERAL });

      // Extract message from payload (async due to image decryption)
      const extracted = await extractMessage(payload);

      // DEBUG: Update the debug log with extraction result
      if (hasImageInPayload) {
        try {
          const decryptionFailed = extracted?.userMessage?.includes("[User sent image(s) but decryption failed]") || false;
          const extractionResult = extracted ? {
            hasMessage: true,
            userMessage: extracted.userMessage?.substring(0, 100),
            imageCount: extracted.imageUrls?.length || 0,
            imageUrls: extracted.imageUrls?.map((u: string) => u.substring(0, 80)),
            decryptionFailed,
          } : { hasMessage: false, reason: "extractMessage returned null" };

          // Update the most recent debug log for this phone
          await supabase.from("webhook_debug_logs")
            .update({ extraction_result: extractionResult })
            .eq("phone_number", debugPhone)
            .order("created_at", { ascending: false })
            .limit(1);
          logger.debug(` Updated extraction result: ${JSON.stringify(extractionResult)}`, { category: LogCategory.GENERAL });
        } catch (e) {
          logger.debug(` Failed to update extraction result: ${e}`, { category: LogCategory.GENERAL });
        }
      }

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

      // SECURITY: Validate phone number format
      if (!validatePhoneNumber(phoneNumber)) {
        logger.warn("Invalid phone number format", { operation: "validation", category: LogCategory.GENERAL });
        return new Response("OK", { status: 200 });
      }

      // SECURITY: Check rate limit before processing
      const withinRateLimit = await checkRateLimit(supabase, remoteJid);
      if (!withinRateLimit) {
        logger.warn("Rate limit exceeded", {
          operation: "rate_limit",
        });
        // Return 200 OK but don't process - prevents webhook retries
        return new Response("OK", { status: 200 });
      }

      // SECURITY: Sanitize user input (checks for prompt injection)
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

      // Generate message key for deduplication
      const messageKey = generateMessageKey(message);
      if (messageKey) {
        // Atomically claim this message for processing
        // Uses database unique constraint to prevent race conditions
        const claimed = await claimMessageForProcessing(messageKey, remoteJid);
        if (!claimed) {
          // Another request already claimed this message - it's a duplicate
          logger.info("Duplicate webhook detected, skipping", {
            operation: "deduplication",
          });
          return new Response("OK", { status: 200 });
        }
      }

      logger.info("Processing incoming message", {
        operation: "process_start",
        messageLength: sanitizedMessage.length,
      });

      // Process the request and WAIT for completion
      // (Fire-and-forget caused Deno runtime to terminate before WaSend call)
      try {
        await processRequest(remoteJid, sanitizedMessage, phoneNumber, imageUrls);
        logger.info("processRequest completed successfully", { category: LogCategory.GENERAL });
      } catch (err) {
        logger.error("processRequest failed: " + String(err), undefined, { category: LogCategory.GENERAL });
        logger.error("Processing error", err as Error, {
          operation: "process_request",
        });
      }

      // Return 200 OK after processing completes
      return new Response("OK", { status: 200 });
        }

        return new Response("Method not allowed", { status: 405 });
      } catch (error) {
        logger.error("Worker error", error as Error, {
          category: LogCategory.WEBHOOK,
          errorCategory: ErrorCategory.UNKNOWN,
        });
        // Still return 200 to avoid webhook retries
        return new Response("OK", { status: 200 });
      }
    }
  );
});

/**
 * DOCX Templates Index
 * 
 * Exports all DOCX template creators and parsers.
 */

// Viewing Forms
export {
  createViewingFormSingle,
  parseViewingFormSingleData,
  type ViewingFormSingleData,
} from "./docx/templates/viewing-form-single.ts";

export {
  createViewingFormMultiple,
  parseViewingFormMultipleData,
  type ViewingFormMultipleData,
  type PersonData,
} from "./docx/templates/viewing-form-multiple.ts";

export {
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  type ViewingFormAdvancedData,
} from "./docx/templates/viewing-form-advanced.ts";

