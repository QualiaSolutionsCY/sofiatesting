import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { createLogger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const logger = createLogger("ai:send-document");

type SendDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * sendDocument Tool
 *
 * This tool allows the AI to generate a document and present a form
 * for the user to send it via email, WhatsApp, or download.
 *
 * The tool generates a DOCX document from the provided content,
 * uploads it to Vercel Blob, and returns a form component for the user.
 */
export const sendDocument = ({ session, dataStream }: SendDocumentProps) =>
  tool({
    description: `Generate a document and present a form to send it to a recipient via email or WhatsApp, or download it directly. Use this when:
- User wants to send a generated document to someone
- User wants to email or WhatsApp a contract, form, or other document
- User asks to "send", "email", "share" a document they've discussed
- User wants to download a document as a file

The tool will generate a DOCX document and show a form where the user can enter recipient details.`,
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "Title/filename for the document (e.g., 'Property Agreement')"
        ),
      content: z
        .string()
        .describe("The full text content of the document to generate"),
      suggestedRecipientName: z
        .string()
        .optional()
        .describe("Pre-fill recipient name if known from conversation"),
      suggestedRecipientEmail: z
        .string()
        .optional()
        .describe("Pre-fill recipient email if known from conversation"),
      suggestedRecipientPhone: z
        .string()
        .optional()
        .describe("Pre-fill recipient phone if known from conversation"),
      suggestedMethod: z
        .enum(["email", "whatsapp", "download"])
        .optional()
        .describe("Suggested delivery method based on context"),
    }),
    execute: async ({
      title,
      content,
      suggestedRecipientName,
      suggestedRecipientEmail,
      suggestedRecipientPhone,
      suggestedMethod,
    }) => {
      const documentId = generateUUID();

      // Generate the document via API
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/documents/generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Pass session info for auth
              Cookie: `next-auth.session-token=${session.user?.id || ""}`,
            },
            body: JSON.stringify({
              content,
              filename: title,
              title,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to generate document");
        }

        const docData = await response.json();

        // Emit data to show the send form in the UI
        dataStream.write({
          type: "data-send-document",
          data: {
            id: documentId,
            title,
            url: docData.url,
            content,
            size: docData.size,
            suggestedRecipientName,
            suggestedRecipientEmail,
            suggestedRecipientPhone,
            suggestedMethod: suggestedMethod || "email",
          },
          transient: false,
        });

        return {
          id: documentId,
          title,
          url: docData.url,
          message: `Document "${title}" has been generated. A form is now available for you to send it via email, WhatsApp, or download it directly.`,
        };
      } catch (error) {
        logger.error("Document generation failed", error);
        return {
          id: documentId,
          title,
          error:
            error instanceof Error
              ? error.message
              : "Failed to generate document",
        };
      }
    },
  });

// Export as both named and tool-suffixed for consistency with other tools
export const sendDocumentTool = sendDocument;
