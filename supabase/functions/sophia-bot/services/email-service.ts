/**
 * Email Service
 *
 * Handles email detection from AI responses and sending via Resend API.
 * Extracted from webhook.ts to reduce god object complexity.
 *
 * SINGLE RESPONSIBILITY: Detect email intent from AI + send emails
 */

import { logger, LogCategory } from "../utils/logger.ts";
import { validateExternalUrl, safeFetch } from "../utils/url-validator.ts";
import { maskEmailForLogging } from "../rules/index.ts";
import { getLastDocument } from "../../_shared/db.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

/**
 * Email intent detected from AI response
 */
export interface EmailSendingIntent {
  recipientEmail: string;
  subject: string;
  body: string;
  documentUrl?: string;
}

/**
 * Email sending result
 */
export interface EmailResult {
  success: boolean;
  error?: string;
}

/**
 * Conversation message format (matches chat history)
 */
interface ChatMessage {
  role: string;
  parts: Array<{ text: string }>;
}

/**
 * Sanitize email subject to prevent header injection attacks.
 * Removes newlines (which could inject headers), header-like patterns,
 * and limits length.
 */
export function sanitizeEmailSubject(subject: string): string {
  return subject
    .replace(/[\r\n]/g, " ") // Remove newlines (header injection vector)
    .replace(/^(to|cc|bcc|from|subject|reply-to|content-type):/gi, "") // Remove header-like patterns
    .replace(/\s+/g, " ") // Normalize whitespace
    .slice(0, 200) // Reasonable length limit
    .trim();
}

/**
 * Formats email body content as HTML with consistent styling
 */
export function formatEmailBodyAsHtml(body: string): string {
  let html = body
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^- (.+)$/gm, "<li>$1</li>");

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
 * Find document content from conversation history (for email body)
 */
function findDocumentContent(conversationHistory: ChatMessage[]): { documentContent: string; subject: string } {
  let documentContent = "";
  for (let j = conversationHistory.length - 1; j >= 0; j--) {
    const msg = conversationHistory[j];
    if (msg.role === "model") {
      const text = msg.parts.map(p => p.text).join("");
      if (text.includes("Subject:") || text.includes("Dear ") || text.length > 500) {
        documentContent = text;
        break;
      }
    }
  }
  let subject = "Document";
  const subjectMatch = documentContent.match(/Subject:\s*(.+?)(?:\n|$)/i);
  if (subjectMatch) subject = subjectMatch[1].trim();
  return { documentContent, subject };
}

/**
 * Find most recent document URL from database
 */
async function findDocumentUrl(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const lastDoc = await getLastDocument(userId);
    if (lastDoc) {
      const docAge = Date.now() - new Date(lastDoc.created_at).getTime();
      const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
      if (docAge < MAX_AGE_MS) {
        logger.debug("Email detection: Found recent document in DB", {
          category: LogCategory.WEBHOOK,
          url: lastDoc.document_url?.substring(0, 80),
          age: Math.round(docAge / 1000) + "s",
        });
        return lastDoc.document_url;
      }
      logger.debug("Email detection: Document too old, skipping", {
        category: LogCategory.WEBHOOK,
        age: Math.round(docAge / 1000) + "s",
      });
    }
  } catch (err) {
    logger.error("Email detection: Failed to fetch last document from DB", { error: err });
  }
  return undefined;
}

/**
 * Detects if AI response indicates it "sent" an email (hallucination)
 * Returns the extracted email details if detected
 */
export async function detectEmailSendingIntent(
  aiResponse: string,
  conversationHistory: ChatMessage[],
  agentEmail?: string,
  userId?: string
): Promise<EmailSendingIntent | null> {
  logger.debug("Email detection: Starting email detection...", { category: LogCategory.WEBHOOK });

  // FIRST: Check for patterns without explicit email ("to your email", "to my email")
  if (agentEmail) {
    const genericEmailPatterns = [
      /i have sent (?:the )?(.+?) to (?:your|my) email/i,
      /i['']ve sent (?:the )?(.+?) to (?:your|my) email/i,
      /sent (?:the )?(.+?) to (?:your|my) email/i,
      /email(?:ed)? (?:the )?(.+?) to (?:your|my) email/i,
      /sending (?:the )?(.+?) to (?:your|my) email/i,
      /(?:the )?(.+?) (?:has been|was) sent to (?:your|my) email/i,
    ];

    for (const pattern of genericEmailPatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        const documentType = match[1]?.trim() || "Document";
        const { documentContent, subject: extractedSubject } = findDocumentContent(conversationHistory);
        const documentUrl = await findDocumentUrl(userId);

        return {
          recipientEmail: agentEmail,
          subject: extractedSubject !== "Document" ? extractedSubject : documentType,
          body: documentContent || `Please see the attached ${documentType}.`,
          documentUrl,
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

  for (const pattern of sentPatterns) {
    const match = aiResponse.match(pattern);
    if (match) {
      const documentType = match[1]?.trim() || "Document";
      const email = match[2];
      const { documentContent, subject: extractedSubject } = findDocumentContent(conversationHistory);
      const documentUrl = await findDocumentUrl(userId);

      return {
        recipientEmail: email,
        subject: extractedSubject !== "Document" ? extractedSubject : documentType,
        body: documentContent || `Please see the attached ${documentType}.`,
        documentUrl,
      };
    }
  }

  return null;
}

/**
 * Sends an email via Resend API
 */
export async function sendEmail(
  intent: EmailSendingIntent
): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    logger.error("Email error: RESEND_API_KEY is not configured", undefined, { category: LogCategory.WEBHOOK });
    return { success: false, error: "Email service not configured" };
  }

  // P1 SECURITY: Mask email address in logs to prevent PII exposure
  logger.info(`Email: Sending email to ${maskEmailForLogging(intent.recipientEmail)}`, { category: LogCategory.WEBHOOK });

  try {
    const attachments: Array<{ filename: string; content: string }> = [];

    if (intent.documentUrl) {
      const urlValidation = validateExternalUrl(intent.documentUrl);
      if (urlValidation.valid) {
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
        }
      }
    }

    const htmlBody = formatEmailBodyAsHtml(intent.body);

    const emailPayload: Record<string, unknown> = {
      from: "SOPHIA <sofia@zyprus.com>",
      to: intent.recipientEmail,
      subject: sanitizeEmailSubject(intent.subject),
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

    logger.info("Email: Email sent successfully", { category: LogCategory.WEBHOOK });
    return { success: true };

  } catch (error) {
    logger.error("Email error: Error sending email: " + String(error), { category: LogCategory.WEBHOOK });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
