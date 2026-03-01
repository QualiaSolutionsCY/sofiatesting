/**
 * Email Handler
 * Handles sending emails via Resend API
 */

import { getLastDocument } from "../../../_shared/db.ts";
import type { Agent } from "../../agents/identifier.ts";
import { LogCategory, logger } from "../../utils/logger.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

/**
 * Send Email via Resend API
 * Automatically uses agent's communicationEmail - ignores any 'to' parameter from AI
 * If no attachmentUrl is provided, automatically attaches the most recent document
 */
export async function handleSendEmail(
  args: Record<string, unknown>,
  agent: Agent | null,
  phoneNumber?: string
): Promise<ToolResult> {
  // ALWAYS use agent's communicationEmail - ignore any 'to' parameter
  if (!agent?.communicationEmail) {
    logger.error("No agent communicationEmail available", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return {
      error:
        "Unable to send email - agent email not found. Please contact support.",
    };
  }

  const to = agent.communicationEmail; // Force use of agent's registered email
  const subject = String(args.subject || "");
  const body = String(args.body || "");
  let attachmentUrl = args.attachmentUrl as string | undefined;
  let attachmentName = args.attachmentName as string | undefined;
  let attachedFromLastDocument = false;
  let documentExpiredWarning = "";

  // AUTO-ATTACH: If no explicit attachment provided, check for recently generated document
  if (!attachmentUrl && phoneNumber) {
    try {
      // Documents are saved with user_id = bare digits (e.g., "35799111668")
      // but phoneNumber here is formatted with + prefix (e.g., "+35799111668").
      // Try formatted first, then bare digits to match how saveLastDocument stores them.
      let lastDoc = await getLastDocument(phoneNumber);
      if (!lastDoc) {
        const bareDigits = phoneNumber.replace(/^\+/, "");
        lastDoc = await getLastDocument(bareDigits);
      }
      if (lastDoc) {
        // Only auto-attach if document was created within last 30 minutes
        const docAge = Date.now() - new Date(lastDoc.created_at).getTime();
        const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

        if (docAge < MAX_AGE_MS) {
          logger.info("Auto-attaching recent document to email", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            documentName: lastDoc.document_name,
            documentType: lastDoc.document_type,
            ageMinutes: Math.round(docAge / 60_000),
          });
          attachmentUrl = lastDoc.document_url;
          attachmentName = lastDoc.document_name;
          attachedFromLastDocument = true;
        } else {
          const ageMinutes = Math.round(docAge / 60_000);
          logger.info("Last document too old, not auto-attaching", {
            category: LogCategory.TOOL,
            operation: "sendEmail",
            ageMinutes,
          });
          documentExpiredWarning =
            `\n\n⚠️ Document "${lastDoc.document_name}" was generated ${ageMinutes} minutes ago and could not be auto-attached (max 30 min). Please regenerate the document and try again.`;
        }
      }
    } catch (err) {
      logger.warn("Failed to fetch last document for auto-attach", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue without attachment - don't block email sending
    }
  }

  // Validate email (defensive check, should always be valid from DB)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    logger.error("Invalid agent email format", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Invalid agent email format. Please contact support." };
  }

  // Get Resend API key from environment
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    logger.error("RESEND_API_KEY not set in environment", undefined, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return { error: "Email service not configured. Please contact admin." };
  }

  logger.info("Sending email via Resend", {
    category: LogCategory.TOOL,
    operation: "sendEmail",
    subject,
    hasAttachment: !!attachmentUrl,
  });

  // Build email payload
  const emailPayload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    attachments?: { filename: string; content: string }[];
  } = {
    from: "SOPHIA <sophia@zyprus.com>",
    to: [to],
    subject,
    html: body
      .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>"),
    text: body.replace(/\*([^*]+)\*/g, "$1"),
  };

  // Handle attachment if provided
  if (attachmentUrl) {
    try {
      logger.info("Fetching email attachment", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        attachmentName: attachmentName || "attachment.docx",
      });
      const attachmentResponse = await fetch(attachmentUrl);
      if (!attachmentResponse.ok) {
        logger.error("Failed to fetch email attachment", undefined, {
          category: LogCategory.TOOL,
          operation: "sendEmail",
          status: attachmentResponse.status,
        });
        return {
          error: `Failed to fetch attachment from URL: ${attachmentResponse.status}`,
        };
      }
      const attachmentBuffer = await attachmentResponse.arrayBuffer();
      const attachmentBase64 = btoa(
        String.fromCharCode(...new Uint8Array(attachmentBuffer))
      );

      emailPayload.attachments = [
        {
          filename: attachmentName || "attachment.docx",
          content: attachmentBase64,
        },
      ];
      logger.info("Attachment prepared for email", {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        filename: attachmentName || "attachment.docx",
      });
    } catch (attachError) {
      const err =
        attachError instanceof Error
          ? attachError
          : new Error(String(attachError));
      logger.error("Error fetching email attachment", err, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
      });
      return { error: `Failed to process attachment: ${err.message}` };
    }
  }

  // Send via Resend API
  try {
    logger.info("Calling Resend API", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const responseText = await response.text();
    logger.info("Resend API response received", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      status: response.status,
    });

    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.message || errorJson.error || responseText;
      } catch {
        // Use raw text
      }
      logger.error("Resend API error", undefined, {
        category: LogCategory.TOOL,
        operation: "sendEmail",
        status: response.status,
        errorDetail: errorDetail.substring(0, 200),
      });
      return {
        error: attachmentUrl
          ? "Unable to send the email with attachment. Please try again."
          : "Unable to send the email. Please try again in a moment.",
      };
    }

    const result = JSON.parse(responseText);
    logger.info("Email sent successfully", {
      category: LogCategory.TOOL,
      operation: "sendEmail",
      emailId: result.id,
      hadAttachment: !!attachmentUrl,
      autoAttached: attachedFromLastDocument,
    });

    return {
      success: true,
      message:
        `✅ Sent to your email\n\nSubject: ${subject}` +
        (attachmentName ? `\nAttachment: ${attachmentName}` : "") +
        documentExpiredWarning,
      data: {
        emailId: result.id,
        subject,
        attachedDocument: attachedFromLastDocument ? attachmentName : undefined,
      },
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error sending email", err, {
      category: LogCategory.TOOL,
      operation: "sendEmail",
    });
    return {
      error: args.attachmentUrl
        ? "Unable to send the email with attachment. Please try again."
        : "Unable to send the email. Please try again in a moment.",
    };
  }
}
