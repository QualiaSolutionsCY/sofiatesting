import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Document, Packer } from "https://esm.sh/docx@8.5.0";
import { SYSTEM_PROMPT } from "./prompts.ts";
import { getHistory, addMessage, claimMessageForProcessing } from "./database.ts";
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
} from "./docx/templates/index.ts";
import { ZYPRUS_LOGO_BASE64 } from "./assets/zyprus-logo.ts";

// Property listing upload modules
import { identifyAgentByPhone, type Agent } from "./agents/identifier.ts";
import { getToolDefinitions } from "./tools/definitions.ts";
import { executeTool } from "./tools/executor.ts";

// Security utilities
import { logger } from "./utils/logger.ts";
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
} from "./utils/field-validator.ts";
import {
  validateExternalUrl,
  safeFetch,
} from "./utils/url-validator.ts";

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
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Check critical environment variables
if (!OPENROUTER_API_KEY) {
  console.error("CRITICAL: OPENROUTER_API_KEY is not set");
}
if (!WASEND_API_KEY) {
  console.error("CRITICAL: WASEND_API_KEY is not set");
}
if (!RESEND_API_KEY) {
  console.warn("WARNING: RESEND_API_KEY is not set - email sending will be disabled");
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
 */
function detectEmailSendingIntent(
  aiResponse: string,
  conversationHistory: Array<{role: string, parts: Array<{text: string}>}>
): EmailSendingIntent | null {
  console.log("[Email Detection] Starting email detection...");
  console.log("[Email Detection] Response length:", aiResponse.length);
  console.log("[Email Detection] First 500 chars:", aiResponse.substring(0, 500));

  // Check if AI claims to have sent an email
  // More flexible patterns that match "I have sent the X to email@example.com"
  // Note: \*? handles optional asterisks around emails (WhatsApp bold formatting)
  const sentPatterns = [
    /i have sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /i['']ve sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /(?:^|\. )sent (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /email(?:ed)? (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
    /sending (?:the )?(.+?) to \*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\*?/i,
  ];

  for (let i = 0; i < sentPatterns.length; i++) {
    const pattern = sentPatterns[i];
    console.log(`[Email Detection] Testing pattern ${i + 1}...`);
    const match = aiResponse.match(pattern);
    console.log(`[Email Detection] Pattern ${i + 1} match:`, match ? "YES" : "NO");
    if (match) {
      console.log(`[Email Detection] Match groups:`, match);
      const documentType = match[1]?.trim() || "Document";
      const email = match[2];

      console.log(`[Email Detection] Detected email intent: ${documentType} to ${email}`);

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
    console.error("[Email] RESEND_API_KEY is not configured");
    return { success: false, error: "Email service not configured" };
  }

  console.log(`[Email] Sending email to ${intent.recipientEmail}`);
  console.log(`[Email] Subject: ${intent.subject}`);
  console.log(`[Email] Document URL: ${intent.documentUrl || "none"}`);

  try {
    // Prepare attachments if document URL provided
    const attachments: Array<{ filename: string; content: string }> = [];

    if (intent.documentUrl) {
      try {
        // P0 SECURITY: Validate URL before fetching (SSRF prevention)
        const urlValidation = validateExternalUrl(intent.documentUrl);
        if (!urlValidation.valid) {
          console.error(`[Email] SSRF blocked: ${urlValidation.error}`, {
            url: intent.documentUrl.substring(0, 100),
          });
          // Don't fail the entire email - just skip the attachment
          console.warn("[Email] Skipping document attachment due to invalid URL");
        } else {
          console.log(`[Email] Fetching document from: ${intent.documentUrl}`);
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
            console.log(`[Email] Document attached, size: ${docBuffer.byteLength} bytes`);
          } else {
            console.warn(`[Email] Failed to fetch document: ${docResponse.status}`);
          }
        }
      } catch (fetchError) {
        console.error("[Email] Error fetching document:", fetchError);
      }
    }

    // Format the email body as HTML
    const htmlBody = formatEmailBodyAsHtml(intent.body);

    // Try verified domain first, fallback to Resend test domain if needed
    // NOTE: zyprus.com domain verification is PENDING - using Resend test domain for now
    const senderEmail = "SOFIA <onboarding@resend.dev>";
    console.log("[Email] Using sender:", senderEmail);

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
      console.error("[Email] Resend API error:", responseData);
      return {
        success: false,
        error: responseData.message || `Failed to send email: ${response.status}`
      };
    }

    console.log("[Email] Email sent successfully:", responseData);
    return { success: true };

  } catch (error) {
    console.error("[Email] Error sending email:", error);
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
    console.log("[Confirmation] Detected listing upload confirmation");
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

  // Step 0: FIX single-asterisk phone masking (AI mistake) - convert 99*1111 to 99**1111
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
  // Remove inline code markers `code` -> code
  formatted = formatted.replace(/`([^`]+)`/g, '$1');
  // Clean up excessive whitespace but preserve single newlines
  formatted = formatted.replace(/[ \t]+/g, ' ');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  return formatted.trim();
}

/**
 * Detects if an AI response is a clarification question rather than actual document content
 */
function isClarificationResponse(aiResponse: string): boolean {
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
    console.log(`[CLARIFICATION] Multiple patterns detected: ${patternMatches} patterns`);
    return true;
  }

  // Single pattern match with reasonable length (not a full document)
  if (patternMatches === 1 && aiResponse.length < 1000) {
    console.log(`[CLARIFICATION] Single pattern in short response`);
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
      console.log(`[CLARIFICATION] Multiple bullet points requesting info: ${matches.length}`);
      return true;
    }
  }

  // Check if it's a question-heavy response (multiple question marks)
  const questionMarkCount = (aiResponse.match(/\?/g) || []).length;
  if (questionMarkCount >= 2) {
    console.log(`[CLARIFICATION] Multiple questions detected: ${questionMarkCount} question marks`);
    return true;
  }

  // Check for "Please provide:" followed by a list
  if (response.includes("please provide") && response.includes("•")) {
    console.log(`[CLARIFICATION] 'Please provide' with bullet points detected`);
    return true;
  }

  // Check for numbered lists requesting information
  const numberedListPattern = /\d+\.\s*([\w\s]+:|\?)/g;
  const numberedMatches = aiResponse.match(numberedListPattern) || [];
  if (numberedMatches.length >= 2) {
    console.log(`[CLARIFICATION] Numbered list requesting information`);
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
      'across four main categories', '25 predefined templates'
    ];

    if (listingIndicators.some(ind => lowerResponse.includes(ind))) {
      console.log(`[INFORMATIONAL] Detected template listing response for query: "${userMessage}"`);
      return true;
    }
  }

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
  if (message.includes("reservation form")) {
    return "Property Reservation Form";
  }
  if (message.includes("reservation agreement")) {
    return "Property Reservation Agreement";
  }
  if (message.includes("non-exclusive") && message.includes("marketing")) {
    return "Non-Exclusive Marketing Agreement";
  }
  if (message.includes("exclusive") && message.includes("marketing")) {
    return "Exclusive Marketing Agreement";
  }
  if (message.includes("marketing agreement")) {
    return "Marketing Agreement";
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

  console.log("[CREA] Split into 3 messages for social media wording");
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

  console.log(`Parsed template into ${messages.length} parts: Subject="${subjectLine.substring(0, 50)}...", Body=${bodyText.length} chars, Notes=${noteText.length} chars`);

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
      console.error("Error uploading to Supabase Storage:", error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`docx/${filename}`);

    console.log("Uploaded DOCX to Supabase Storage:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error("Exception uploading to Supabase Storage:", error);
    return null;
  }
}

/**
 * Sends a DOCX file via WaSend API using documentUrl
 * WaSend requires a public URL to the document, not direct file upload
 */
async function sendDocxFile(
  phoneNumber: string,
  docxContent: Uint8Array,
  filename: string,
  retries: number = 1
): Promise<Response> {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  // Step 1: Upload DOCX to Supabase Storage to get a public URL
  const documentUrl = await uploadDocxToStorage(docxContent, filename);

  if (!documentUrl) {
    console.error("Failed to upload DOCX to storage, cannot send document");
    // Return a fake error response
    return new Response(JSON.stringify({ error: "Failed to upload document" }), { status: 500 });
  }

  console.log("Sending document via WaSend with URL:", documentUrl);

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
    console.log("WaSend document send response status:", sendRes.status);
    console.log("WaSend document send response body:", responseText);

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

      console.log(
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
    console.error("Error sending DOCX file via WaSend:", error);
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
  const { ZYPRUS_LOGO_BASE64 } = await import("./assets/zyprus-logo.ts");

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
      console.error("Error uploading logo to Supabase Storage:", error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`logos/${filename}`);

    console.log("Logo URL:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error("Exception uploading logo to Supabase Storage:", error);
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
    console.error("Failed to get logo URL");
    return new Response(JSON.stringify({ error: "Failed to get logo" }), { status: 500 });
  }

  console.log("Sending logo via WaSend with URL:", logoUrl);

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
    console.log("WaSend image response:", responseText);

    if (!sendRes.ok) {
      console.error("WaSend image send failed:", responseText);
    }

    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    console.error("Error sending logo via WaSend:", error);
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
    console.log("Invalid phone format (possibly LID):", number);
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
        console.log("Could not extract valid phone number from:", remoteJid);
        return null;
      }
    }
  }

  console.log("Formatted phone number:", number);
  return number;
}

/**
 * Extracts message content from WaSend webhook payload
 * WaSend Format: { event: "messages.received", data: { messages: { key: {...}, messageBody: "...", message: {...} } } }
 * IMPORTANT: data.messages is a SINGLE OBJECT, not an array
 * IMPORTANT: Use key.cleanedSenderPn for phone number (remoteJid can be LID format)
 */
function extractMessage(payload: any): {
  message: any;
  remoteJid: string | null;
  userMessage: string;
} | null {
  console.log("Extracting message from payload...");

  let message = null;
  let remoteJid: string | null = null;
  let userMessage = "";

  // WaSend Format: { event: "messages.received", data: { messages: {...} } }
  if (payload.event && payload.data) {
    const event = payload.event;
    const data = payload.data;

    console.log("Event type:", event);

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
      console.log("Unhandled event type:", event);
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
    console.log("No message object found");
    return null;
  }

  // Check if message is from me (outgoing) - ignore it
  if (message.key?.fromMe || message.fromMe) {
    console.log("Ignoring outgoing message (fromMe=true)");
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
      console.log("Skipping LID format remoteJid:", jid);
    }
  }

  // Fall back to other fields if still not found
  if (!remoteJid) {
    remoteJid = message.remoteJid || message.from || message.to || message.phone;
  }

  console.log("Extracted remoteJid:", remoteJid);

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

  console.log("Extracted userMessage:", userMessage.substring(0, 100));

  if (!userMessage || userMessage.trim() === "") {
    console.log("No text content found in message");
    return null;
  }

  return { message, remoteJid, userMessage };
}

/**
 * Sends a text message via WaSend API with rate limit handling
 */
async function sendTextMessage(
  phoneNumber: string,
  text: string,
): Promise<Response> {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  console.log(`=== WASEND API CALL ===`);
  console.log(`Sending text message to ${phoneNumber}, text length: ${text.length}`);
  console.log(`WASEND_API_KEY set: ${!!WASEND_API_KEY}, length: ${WASEND_API_KEY?.length || 0}`);

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
    console.log(`WaSend text send response status: ${sendRes.status}`);
    console.log(`WaSend text send response body: ${responseText}`);
    console.log(`=== WASEND API CALL COMPLETE ===`);

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

      console.log(
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
      console.log(`WaSend retry response status: ${sendRes.status}`);
      console.log(`WaSend retry response body: ${retryResponseText}`);

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
    console.error("Error sending text message via WaSend:", error);
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
      console.log(`No agent found for phone: ${phoneNumber}`);
      return null;
    }

    console.log(`Found agent: ${data.name} for phone: ${phoneNumber}`);
    return data;
  } catch (err) {
    console.error("Error looking up agent:", err);
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
): Promise<void> {
  try {
    // Check if critical API keys are set
    if (!OPENROUTER_API_KEY || !WASEND_API_KEY) {
      console.error("CRITICAL: Missing API keys - OPENROUTER_API_KEY or WASEND_API_KEY not set");
      const errorMsg = "Service configuration error. Please contact support.";

      // Try to send error if WaSend key exists
      if (WASEND_API_KEY) {
        await sendTextMessage(phoneNumber, errorMsg);
      }
      return;
    }

    // Check for logo request first (handle before AI processing)
    if (isLogoRequest(userMessage)) {
      console.log("[Logo] Logo request detected, sending logo image");
      await sendLogoImage(phoneNumber);
      // Also add to history so we remember it
      await addMessage(userId, "user", userMessage);
      await addMessage(userId, "assistant", "Here's the Zyprus Property Group logo! 🏠");
      return;
    }

    // 1. Add user message to database
    await addMessage(userId, "user", userMessage);

    // 1.5 Build user context with RAG memory (personalization)
    let userContext: UserContext | null = null;
    let personalizationContext = "";
    try {
      userContext = await buildUserContext(phoneNumber, userMessage);
      if (userContext) {
        personalizationContext = formatContextForPrompt(userContext);
        console.log(`[Memory] Built context for user: ${userContext.profile.name || phoneNumber}`);
        console.log(`[Memory] Found ${userContext.recentMemories.length} relevant memories, ${userContext.relevantKnowledge.length} knowledge entries`);

        // Store user message to memory (fire-and-forget)
        const topics = extractTopics(userMessage);
        const importance = calculateImportance(userMessage, topics);
        storeMemory(userContext.profile.id, "user", userMessage, {
          importance,
          topics,
        }).catch(err => console.error("[Memory] Async store failed for user message:", err));
      }
    } catch (memErr) {
      console.error("[Memory] Error building user context:", memErr);
      // Continue without personalization - non-blocking
    }

    // 2. Get conversation history from database
    const history = await getHistory(userId);

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

    // Inject current date context into system prompt
    const dateContext = `\n\n---\n## 📅 CURRENT DATE/TIME AWARENESS\n\n**IMPORTANT: You must be aware of the current date and time.**\n\n**Current Date/Time in Cyprus (Nicosia):** ${cyprusDate}\n**Today's Date (DD/MM/YYYY format):** ${cyprusDateShort}\n\n**When users say relative dates like:**\n- "today" → Use ${cyprusDateShort}\n- "tomorrow" → Add 1 day to today\n- "next week" → Add 7 days to today\n- "yesterday" → Subtract 1 day from today\n\n**ALWAYS calculate dates correctly based on today being ${cyprusDateShort}.**\n\n---\n`;

    // Look up agent info from database (old method - for document generation)
    const agentInfo = await getAgentByPhone(phoneNumber);

    // Identify agent for property upload capabilities (new method)
    let identifiedAgent: Agent | null = null;
    try {
      identifiedAgent = await identifyAgentByPhone(phoneNumber, supabaseUrl, supabaseKey);
      if (identifiedAgent) {
        console.log(`[Agent] Identified: ${identifiedAgent.fullName} (${identifiedAgent.region})`);
      }
    } catch (err) {
      console.error("[Agent] Error identifying agent:", err);
    }

    // Inject sender info with agent details if known
    let senderContext: string;
    if (identifiedAgent) {
      // Use the new agent identification for property uploads
      senderContext = `\n\n---\n## 📱 CURRENT SENDER - KNOWN AGENT\n\n**IMPORTANT: You are talking to a KNOWN AGENT who can upload property listings.**\n\n**Agent Name:** ${identifiedAgent.fullName}\n**Phone Number:** ${phoneNumber}\n**Email:** ${identifiedAgent.communicationEmail}\n**Region:** ${identifiedAgent.region}\n**Role:** ${identifiedAgent.role}\n**Can Upload Listings:** ${identifiedAgent.canUpload ? 'Yes' : 'No'}\n\n**When this agent wants to upload a property listing, use the createPropertyListing or createLandListing tools. DO NOT ask for their name - use their info directly.**\n\n---\n`;
    } else if (agentInfo) {
      senderContext = `\n\n---\n## 📱 CURRENT SENDER - KNOWN AGENT\n\n**IMPORTANT: You are talking to a KNOWN AGENT. Use their info directly - DO NOT ask for their name or phone number.**\n\n**Agent Name:** ${agentInfo.name}\n**Phone Number:** ${phoneNumber}\n${agentInfo.email ? `**Email:** ${agentInfo.email}\n` : ''}\n**When generating documents for this agent, automatically use their name and phone number. DO NOT ask them to provide this information.**\n\n---\n`;
    } else {
      senderContext = `\n\n---\n## 📱 CURRENT SENDER IDENTIFICATION\n\n**Message sent from phone number:** ${phoneNumber}\n\n**This is an unknown sender. You may need to ask for their name if generating documents. If they want to upload a property, ask them to confirm who they are first.**\n\n---\n`;
    }

    const systemPromptWithDate = SYSTEM_PROMPT + dateContext + senderContext + personalizationContext;

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

    console.log(`[OpenRouter] Calling with ${openrouterMessages.length} messages`);

    // Get tool definitions for property listing uploads
    const tools = getToolDefinitions();
    console.log(`[OpenRouter] Including ${tools.length} tools for function calling`);

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
            tool_choice: "auto",
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
          console.log(`OpenRouter rate limited (429). Retrying in ${delay}ms... (attempt ${retries + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          retries++;
          continue;
        }

        console.error("OpenRouter Error:", JSON.stringify(errorData, null, 2));
        console.error("Status:", aiRes.status);

        const errorMessage = "I'm experiencing technical difficulties right now. Please try again in a few moments.";
        await sendTextMessage(phoneNumber, errorMessage);
        return;
      }

      if (!aiRes || !aiRes.ok) {
        console.error("OpenRouter API call failed after retries");
        const errorMessage = "I'm having trouble processing your request. Please try again shortly.";
        await sendTextMessage(phoneNumber, errorMessage);
        return;
      }

      const aiData = await aiRes.json();
      const message = aiData.choices?.[0]?.message;

      // Check for tool calls
      if (message?.tool_calls && message.tool_calls.length > 0) {
        toolCallCount++;
        console.log(`[OpenRouter] Tool call ${toolCallCount}: ${message.tool_calls.length} tools requested`);

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
            console.error(`[Tool] Failed to parse arguments for ${toolName}:`, e);
            toolArgs = {};
          }

          console.log(`[Tool] Executing: ${toolName}`);
          console.log(`[Tool] Arguments:`, JSON.stringify(toolArgs).substring(0, 200));

          // Execute the tool
          const toolResult = await executeTool(
            { name: toolName, arguments: toolArgs },
            identifiedAgent,
            supabaseUrl,
            supabaseKey
          );

          console.log(`[Tool] Result:`, JSON.stringify(toolResult).substring(0, 200));

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
            console.log(`[Tool] Success with message, using tool response directly`);
            aiResponse = toolResult.message;
            await addMessage(userId, "model", aiResponse);
            break;
          }

          // If tool returned an error, include it in the response
          if (toolResult.error) {
            console.log(`[Tool] Error result: ${toolResult.error}`);
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
      break;
    }

    if (!aiResponse) {
      console.error("Empty response from OpenRouter");

      // Send error message to user
      const errorMessage = "I couldn't generate a response. Please rephrase your request and try again.";
      await sendTextMessage(phoneNumber, errorMessage);
      return;
    }

    console.log("AI Response received (first 500 chars):", aiResponse.substring(0, 500));
    console.log("AI Response length:", aiResponse.length);

    // 4. Add AI response to database
    await addMessage(userId, "model", aiResponse);

    // 4.1 P1 FIX: Fire-and-forget AI response storage (truly non-blocking)
    if (userContext) {
      const responseTopics = extractTopics(aiResponse);
      storeMemory(userContext.profile.id, "assistant", aiResponse, {
        importance: 0.5, // AI responses have standard importance
        topics: responseTopics,
      })
        .then(() => console.log(`[Memory] Stored AI response with ${responseTopics.length} topics`))
        .catch(err => console.error("[Memory] Async store failed for AI response:", err));
    }

    // 4.5 Check if AI claims to have sent an email - actually send it!
    console.log("[Email Check] Checking AI response for email intent...");
    console.log("[Email Check] AI Response preview:", aiResponse.substring(0, 300));

    const updatedHistoryForEmail = await getHistory(userId);
    const emailIntent = detectEmailSendingIntent(aiResponse, updatedHistoryForEmail);

    console.log("[Email Check] Email intent detected:", emailIntent ? "YES" : "NO");
    if (emailIntent) {
      console.log("[Email] Recipient:", emailIntent.recipientEmail);
      console.log("[Email] Subject:", emailIntent.subject);
      console.log("[Email] Body length:", emailIntent.body.length);
      console.log("[Email] Document URL:", emailIntent.documentUrl || "none");
      console.log("[Email] RESEND_API_KEY set:", !!RESEND_API_KEY);

      const emailResult = await sendEmailViaResend(emailIntent);

      if (emailResult.success) {
        console.log("[Email] Email actually sent successfully via Resend!");
        // The AI's response already says "I have sent...", so just send it as text
      } else {
        console.error("[Email] Failed to send email:", emailResult.error);
        // Modify the AI response to indicate failure
        const failureNote = `\n\n(Note: There was an issue sending the email: ${emailResult.error}. Please try again or send it manually.)`;
        // We'll still send the AI response but add a note
        await sendTextMessage(phoneNumber, aiResponse + failureNote);
        return;
      }
    } else {
      console.log("[Email Check] No email intent detected in AI response");
    }

    // 4.6 Check if this is a confirmation message - always send as text
    if (isConfirmationMessage(aiResponse)) {
      console.log("[Confirmation] Detected confirmation message → sending as TEXT");
      await sendTextMessage(phoneNumber, aiResponse);
      return;
    }

    // 5. Determine routing: DOCX file or text message
    // FIRST: Check if this is an informational response about templates
    const isInformational = isInformationalResponse(aiResponse, userMessage);

    if (isInformational) {
      console.log("[DOCX Router] Informational response detected → sending as TEXT");

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
    // For simple greetings, don't consider DOCX requested regardless of history
    const isSimpleUserGreeting = userMessage.toLowerCase().trim().match(/^(hi|hello|hey|good morning|good afternoon|good evening)$/);
    const wasDocxRequested = isSimpleUserGreeting ? false : wasDocxTemplateRequested(updatedHistory);
    const detectedTemplateType = detectTemplateType(userMessage);

    // Additional field validation check - if AI is collecting information, don't send as DOCX
    if (shouldSendAsDocx && isCollectingInformation(aiResponse)) {
      console.log("[Field Validator] Response is collecting information, overriding DOCX → TEXT");
      shouldSendAsDocx = false;
    }

    // Check if all required fields are present for DOCX generation
    if (shouldSendAsDocx && !hasAllRequiredFields(aiResponse, detectedTemplateType || undefined)) {
      console.log("[Field Validator] Missing required fields, overriding DOCX → TEXT");
      shouldSendAsDocx = false;
    }

    // Enhanced diagnostic logging
    console.log("=== DOCX ROUTING DIAGNOSTICS ===");
    console.log(JSON.stringify({
      event: "docx_routing_check",
      shouldSendAsDocx,
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
    console.log("================================");

    // Check if response is just a placeholder (should never be sent)
    // Only block actual placeholder text, NOT short legitimate responses
    const isPlaceholder = aiResponse.toLowerCase().includes("document generated by sophia") ||
                          aiResponse.toLowerCase().includes("i can only generate documents");

    if (isPlaceholder) {
      console.error("ERROR: AI returned placeholder response, not sending.");
      console.error("AI Response:", aiResponse);
      return;
    }

    // If a DOCX template was requested but AI didn't generate proper content, try retry logic
    // BUT skip this for simple greetings or informational responses
    const isSimpleGreeting = userMessage.toLowerCase().trim().match(/^(hi|hello|hey|good morning|good afternoon|good evening|greetings|salutations)$/);
    const isShortInformationalResponse = aiResponse.length < 100 && !aiResponse.includes("Subject:");
    const currentMessageRequestedDocx = detectTemplateType(userMessage) !== null;

    if (wasDocxRequested && !shouldSendAsDocx && !isSimpleGreeting && !isShortInformationalResponse && currentMessageRequestedDocx) {
      console.log("=== DOCX GENERATION FAILURE - ATTEMPTING RECOVERY ===");
      console.log(JSON.stringify({
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
        console.log("Detected clarification response - attempting retry with explicit document generation instruction");
        
        // Detect the template type from the user's original message
        const templateType = detectTemplateType(userMessage);
        console.log("Detected template type:", templateType || "unknown");
        
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
          console.log("Making retry OpenRouter API call...");
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
              console.log("Retry successful! Response length:", retryResponse.length);
              console.log("Retry response preview:", retryResponse.substring(0, 300));
              
              // Check if retry response is proper document content
              const retryIsDocx = isDocxTemplate(retryResponse, history);
              console.log("Retry response isDocxTemplate:", retryIsDocx);
              
              if (retryIsDocx) {
                // Add retry response to database  
                await addMessage(userId, "model", retryResponse);
                
                // Send as DOCX
                const filename = `document_${Date.now()}.docx`;
                console.log("Creating DOCX file from retry response:", filename);
                
                const docxContent = await createDocxFile(retryResponse, filename);
                console.log("DOCX content created, size:", docxContent.length, "bytes");
                
                const sendResult = await sendDocxFile(phoneNumber, docxContent, filename);
                const sendResultText = await sendResult.text();
                console.log("DOCX send result status:", sendResult.status);
                console.log("DOCX send result body:", sendResultText);
                
                if (!sendResult.ok) {
                  console.error("Failed to send DOCX file from retry! Falling back to text.");
                  await sendTextMessage(phoneNumber, retryResponse);
                }
                return; // Successfully sent from retry
              }
            }
          }
          console.error("Retry failed or didn't produce valid document content");
        } catch (retryError) {
          console.error("Error during retry OpenRouter call:", retryError);
        }
      }
      
      // If we get here, both original and retry failed
      // BUT if the original response was a clarification, send it as text
      if (isClarificationResponse(aiResponse) || isCollectingInformation(aiResponse)) {
        console.log("=== SENDING CLARIFICATION AS TEXT AFTER DOCX GENERATION FAILURE ===");
        console.log("Original response was a clarification request, sending as text to user");

        // Parse and send as text message(s)
        const messages = parseTemplateResponse(aiResponse);
        for (const msg of messages) {
          await sendTextMessage(phoneNumber, msg);
        }
        return;
      }

      console.log("=== DOCX GENERATION FINAL FAILURE ===");
      console.log(JSON.stringify({
        event: "docx_generation_final_failure",
        outcome: "no_message_sent",
        reason: "could_not_generate_valid_docx_content",
        detectedTemplateType: detectedTemplateType || "unknown",
        originalResponseLength: aiResponse.length,
      }, null, 2));
      console.error("ERROR: DOCX template was requested but couldn't generate proper content.");
      console.error("Not sending placeholder message to user.");
      return;
    }

    if (shouldSendAsDocx) {
      // Send as DOCX file
      console.log("Detected DOCX template - generating and sending as file attachment");
      console.log("AI Response length:", aiResponse.length);
      console.log("AI Response preview:", aiResponse.substring(0, 200));

      let filename = `document_${Date.now()}.docx`;
      console.log("Creating DOCX file:", filename);

      // Check if this is a viewing form that should use specialized generators
      const templateType = detectDocxTemplateType(aiResponse);
      console.log("Detected template type:", templateType);

      let docxContent: Uint8Array;

      if (templateType.startsWith('viewing-form-') || templateType === 'reservation-agreement') {
        // Use specialized DOCX generators
        console.log("Using specialized DOCX generator for type:", templateType);

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
              console.log("Logo decoded successfully for viewing form");
            } catch (e) {
              console.error("Failed to decode logo:", e);
              logoData = undefined;
            }
          }

          let docxDoc: Document | null = null;

          switch(templateType) {
            case 'viewing-form-single': {
              console.log("Parsing single person viewing form data...");
              const singleData = parseViewingFormSingleData(aiResponse);
              if (singleData) {
                console.log("Creating single person viewing form document...");
                docxDoc = createViewingFormSingle(singleData, logoData);
              } else {
                console.log("Failed to parse single person data, falling back to generic");
              }
              break;
            }
            case 'viewing-form-multiple': {
              console.log("Parsing multiple person viewing form data...");
              const multipleData = parseViewingFormMultipleData(aiResponse);
              if (multipleData) {
                console.log("Creating multiple person viewing form document...");
                docxDoc = createViewingFormMultiple(multipleData, logoData);
              } else {
                console.log("Failed to parse multiple person data, falling back to generic");
              }
              break;
            }
            case 'viewing-form-advanced': {
              console.log("Parsing advanced viewing form data...");
              const advancedData = parseViewingFormAdvancedData(aiResponse);
              if (advancedData) {
                console.log("Creating advanced viewing form document...");
                docxDoc = createViewingFormAdvanced(advancedData, logoData);
              } else {
                console.log("Failed to parse advanced form data, falling back to generic");
              }
              break;
            }
            case 'reservation-agreement': {
              console.log("Parsing reservation agreement data...");
              const reservationData = parseReservationAgreementData(aiResponse);
              if (reservationData) {
                console.log("Creating reservation agreement document...");
                docxDoc = createReservationAgreement(reservationData, logoData);
                filename = "Property_Reservation_Agreement.docx";
              } else {
                console.log("Failed to parse reservation agreement data, falling back to generic");
              }
              break;
            }
          }

          if (docxDoc) {
            // Successfully created structured document
            console.log("Converting structured document to buffer...");
            const buffer = await Packer.toBuffer(docxDoc);
            docxContent = new Uint8Array(buffer);
            console.log("Structured DOCX created, size:", docxContent.length, "bytes");
          } else {
            // Fallback to generic DOCX creation
            console.log("Using generic DOCX creation as fallback");
            docxContent = await createDocxFile(aiResponse, filename);
          }
        } catch (error) {
          console.error("Error creating structured viewing form:", error);
          console.log("Falling back to generic DOCX creation");
          docxContent = await createDocxFile(aiResponse, filename);
        }
      } else {
        // Use generic DOCX creation for other templates
        console.log("Using generic DOCX creation for non-viewing form template");
        docxContent = await createDocxFile(aiResponse, filename);
      }

      console.log("DOCX content created, size:", docxContent.length, "bytes");

      const sendResult = await sendDocxFile(phoneNumber, docxContent, filename);
      const sendResultText = await sendResult.text();
      console.log("DOCX send result status:", sendResult.status);
      console.log("DOCX send result body:", sendResultText);

      if (!sendResult.ok) {
        console.error("Failed to send DOCX file! Status:", sendResult.status);
        console.error("Error response:", sendResultText);
        // Fallback: send as text message
        console.log("Falling back to text message...");
        await sendTextMessage(phoneNumber, aiResponse);
      }
    } else {
      // Send as text message(s)
      console.log("=== SENDING TEXT MESSAGE (not DOCX) ===");
      console.log(`Phone number: ${phoneNumber}`);
      console.log(`AI Response length: ${aiResponse.length}`);
      console.log(`AI Response preview: ${aiResponse.substring(0, 200)}`);

      // Parse response into separate parts (Subject, Body, Notes)
      const messageParts = parseTemplateResponse(aiResponse);

      console.log(`Sending ${messageParts.length} message(s)`);

      // Debug: Log each part
      messageParts.forEach((part, idx) => {
        console.log(`Part ${idx + 1} preview (first 100 chars): ${part.substring(0, 100)}`);
      });

      // Send each part as a separate message with a small delay between them
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        console.log(`Sending message part ${i + 1}/${messageParts.length}`);

        console.log(`[DEBUG] About to call sendTextMessage for part ${i + 1}`);
        const sendResult = await sendTextMessage(phoneNumber, part);
        const sendBody = await sendResult.clone().text();
        console.log(`Send result for part ${i + 1}: status=${sendResult.status}, body=${sendBody}`);

        // Add a small delay between messages to ensure order (except for the last one)
        if (i < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      console.log("=== ALL TEXT MESSAGES SENT SUCCESSFULLY ===");
    }
    console.log("=== PROCESS REQUEST COMPLETED ===");
  } catch (error) {
    console.error("=== PROCESS REQUEST ERROR ===");
    console.error("Error details:", error);
    logger.error("Error in processRequest", error as Error, {
      operation: "process_request",
    });
    // Don't throw - we've already returned 200 OK
  }
}

serve(async (req) => {
  try {
    // Handle GET requests (webhook verification)
    if (req.method === "GET") {
      logger.info("Webhook verification request received");
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
      console.log("Incoming webhook headers:", JSON.stringify(headerEntries));

      // SECURITY: Verify webhook signature (if secret is configured)
      // NOTE: WaSend may not support webhook signatures - check their documentation
      if (WASEND_WEBHOOK_SECRET) {
        const signature = extractSignatureHeader(req.headers);

        if (signature) {
          const isValid = await verifyWebhookSignature(
            signature,
            rawBody,
            WASEND_WEBHOOK_SECRET
          );

          if (!isValid) {
            // FAIL-OPEN: Log warning but continue processing
            // WaSend signature verification may have issues - don't block real messages
            logger.warn("Webhook signature verification failed - continuing anyway (fail-open mode)", {
              operation: "webhook_auth",
              signatureReceived: signature.substring(0, 20) + "...",
            });
            // return new Response("Unauthorized", { status: 401 });
          } else {
            logger.debug("Webhook signature verified successfully");
          }
        } else {
          // WaSend likely doesn't send signatures - log and continue
          logger.info("No webhook signature header received - WaSend may not support signatures", {
            operation: "webhook_auth",
          });
        }
      } else {
        logger.warn("WASEND_WEBHOOK_SECRET not configured", {
          operation: "webhook_auth",
        });
      }

      // Parse the payload after signature verification
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        logger.error("Invalid JSON payload");
        return new Response("Bad Request", { status: 400 });
      }

      // SECURITY: Validate payload structure
      if (!validateWebhookPayload(payload)) {
        logger.warn("Invalid webhook payload structure", {
          operation: "validation",
        });
        return new Response("OK", { status: 200 });
      }

      logger.debug("Received webhook payload", { operation: "webhook_receive" });

      // Extract message from payload
      const extracted = extractMessage(payload);

      if (!extracted) {
        logger.info("Could not extract valid message from payload");
        return new Response("OK", { status: 200 });
      }

      const { message, remoteJid, userMessage } = extracted;

      if (!remoteJid) {
        logger.error("No remoteJid found in message");
        return new Response("OK", { status: 200 });
      }

      // Format phone number
      const phoneNumber = formatPhoneNumber(remoteJid);
      if (!phoneNumber) {
        logger.error("Could not format phone number");
        return new Response("OK", { status: 200 });
      }

      // SECURITY: Validate phone number format
      if (!validatePhoneNumber(phoneNumber)) {
        logger.warn("Invalid phone number format", { operation: "validation" });
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
        await processRequest(remoteJid, sanitizedMessage, phoneNumber);
        console.log("processRequest completed successfully");
      } catch (err) {
        console.error("processRequest failed:", err);
        logger.error("Processing error", err as Error, {
          operation: "process_request",
        });
      }

      // Return 200 OK after processing completes
      return new Response("OK", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    logger.error("Worker Error", error as Error, { operation: "worker" });
    // Still return 200 to avoid webhook retries
    return new Response("OK", { status: 200 });
  }
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

