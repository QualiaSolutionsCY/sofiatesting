import { tool } from "ai";
import { Resend } from "resend";
import { z } from "zod";

import { validateExternalUrl } from "@/lib/ai/security/url-validator";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * sendEmail Tool
 *
 * Directly sends an email to a recipient. Use this for WhatsApp/Telegram
 * where UI forms are not available. The email is sent immediately.
 *
 * For web chat with UI forms, use sendDocument instead.
 */
export const sendEmailTool = tool({
  description: `Send an email directly to a recipient, optionally with a document attachment. Use this when:
- User explicitly asks to send an email to someone
- User provides an email address and wants to send information
- User says "email this to..." or "send this via email to..."
- User wants to share property details, calculations, or other info via email
- User asks to email a document that was previously created (use documentUrl from the sendDocument result)

IMPORTANT:
- Use this tool when the user explicitly mentions email/emailing
- If the user previously created a document and now wants to email it, include the documentUrl from that document
- The tool can send plain text emails OR emails with DOCX document attachments

Required information:
- Recipient email address (must be a valid email)
- What to send (the content/message)
- Optional: documentUrl if attaching a previously created document

The tool will format the content professionally and send it immediately.`,
  inputSchema: z.object({
    recipientEmail: z
      .string()
      .email("Must be a valid email address")
      .describe("The recipient's email address"),
    recipientName: z
      .string()
      .optional()
      .describe("The recipient's name (for personalization)"),
    subject: z
      .string()
      .describe("Email subject line (clear and descriptive)"),
    content: z
      .string()
      .describe(
        "The main content of the email. Include all relevant information the user wants to send."
      ),
    contentType: z
      .enum(["property_info", "calculation", "general", "document"])
      .optional()
      .describe("Type of content being sent, for formatting purposes"),
    documentUrl: z
      .string()
      .url()
      .optional()
      .describe(
        "URL of a document to attach (e.g., from a previous sendDocument call). If the user asked to send a document that was just created, include its URL here."
      ),
    documentTitle: z
      .string()
      .optional()
      .describe("Title/filename for the attached document"),
  }),
  execute: async ({
    recipientEmail,
    recipientName,
    subject,
    content,
    contentType,
    documentUrl,
    documentTitle,
  }: {
    recipientEmail: string;
    recipientName?: string;
    subject: string;
    content: string;
    contentType?: "property_info" | "calculation" | "general" | "document";
    documentUrl?: string;
    documentTitle?: string;
  }) => {
    if (!resend) {
      return {
        success: false,
        error:
          "Email service is not configured. Please contact support to enable email sending.",
      };
    }

    try {
      // Format content based on type
      const formattedContent = formatEmailContent(
        content,
        contentType || "general"
      );

      // Prepare attachments if document URL provided
      const attachments: Array<{ filename: string; content: Buffer }> = [];

      if (documentUrl) {
        // SECURITY: Validate URL to prevent SSRF attacks
        const urlValidation = validateExternalUrl(documentUrl);
        if (!urlValidation.valid) {
          console.warn(
            "[sendEmail] Document URL validation failed:",
            urlValidation.error
          );
          return {
            success: false,
            error: `Cannot fetch document: ${urlValidation.error}. Please use a document from Supabase storage.`,
          };
        }

        try {
          const docResponse = await fetch(documentUrl);
          if (docResponse.ok) {
            const docBuffer = Buffer.from(await docResponse.arrayBuffer());
            const filename = documentTitle
              ? documentTitle.endsWith(".docx")
                ? documentTitle
                : `${documentTitle}.docx`
              : "document.docx";
            attachments.push({ filename, content: docBuffer });
          } else {
            console.warn("[sendEmail] Failed to fetch document:", documentUrl);
          }
        } catch (fetchError) {
          console.error("[sendEmail] Error fetching document:", fetchError);
        }
      }

      const { error } = await resend.emails.send({
        from: "SOFIA <sofia@zyprus.com>",
        to: recipientEmail,
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            ${recipientName ? `<p style="color: #333;">Hello ${recipientName},</p>` : "<p style=\"color: #333;\">Hello,</p>"}

            <div style="color: #444; line-height: 1.6;">
              ${formattedContent}
            </div>

            ${attachments.length > 0 ? `<p style="color: #555; margin-top: 20px;"><strong>Attached:</strong> ${attachments.map((a) => a.filename).join(", ")}</p>` : ""}

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px 0;" />

            <p style="color: #666; font-size: 14px;">
              If you have any questions, please don't hesitate to reach out.
            </p>

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
        `,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (error) {
        console.error("[sendEmail] Resend error:", error);
        return {
          success: false,
          error: `Failed to send email: ${error.message}`,
        };
      }

      return {
        success: true,
        message: attachments.length > 0
          ? `Email with document "${attachments[0].filename}" sent successfully to ${recipientEmail}`
          : `Email sent successfully to ${recipientEmail}`,
        details: {
          to: recipientEmail,
          subject: subject,
          hasAttachment: attachments.length > 0,
        },
      };
    } catch (error) {
      console.error("[sendEmail] Error:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? `Email sending failed: ${error.message}`
            : "An unexpected error occurred while sending the email",
      };
    }
  },
});

/**
 * Format email content based on content type
 */
const formatEmailContent = (
  content: string,
  contentType: string
): string => {
  // Convert markdown-style formatting to HTML
  let html = content
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

  // Add type-specific styling
  switch (contentType) {
    case "property_info":
      return `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #2c5282; margin-top: 0;">Property Information</h3>
          ${html}
        </div>
      `;
    case "calculation":
      return `
        <div style="background: #f0fff4; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #48bb78;">
          <h3 style="color: #276749; margin-top: 0;">Calculation Results</h3>
          ${html}
        </div>
      `;
    case "document":
      return `
        <div style="background: #ebf8ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          ${html}
        </div>
      `;
    default:
      return html;
  }
};

// Export for consistency with other tools
export const sendEmail = sendEmailTool;
