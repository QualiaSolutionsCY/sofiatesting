import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { db } from "@/lib/db/client";
import { documentSend } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { getWhatsAppClient } from "@/lib/whatsapp/client";

const logger = createLogger("api:documents:send");

/**
 * Escape HTML entities to prevent XSS when interpolating user-supplied
 * values into an HTML email template.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const sendDocumentSchema = z.object({
  documentUrl: z.string().url("Invalid document URL"),
  documentTitle: z.string().min(1, "Document title is required"),
  documentContent: z.string().optional(),
  recipientName: z.string().min(1, "Recipient name is required"),
  recipientEmail: z.string().email("Invalid email").optional(),
  recipientPhone: z.string().optional(),
  method: z.enum(["email", "whatsapp", "download"]),
  message: z.string().optional(),
  chatId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = sendDocumentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const {
      documentUrl,
      documentTitle,
      documentContent,
      recipientName,
      recipientEmail,
      recipientPhone,
      method,
      message,
      chatId,
    } = validated.data;

    // Validate method-specific requirements
    if (method === "email" && !recipientEmail) {
      return NextResponse.json(
        { error: "Email is required for email delivery" },
        { status: 400 }
      );
    }

    if (method === "whatsapp" && !recipientPhone) {
      return NextResponse.json(
        { error: "Phone number is required for WhatsApp delivery" },
        { status: 400 }
      );
    }

    // Create tracking record
    const [sendRecord] = await db
      .insert(documentSend)
      .values({
        userId: session.user.id,
        chatId: chatId || null,
        documentTitle,
        documentUrl,
        documentContent: documentContent || null,
        recipientName,
        recipientEmail: recipientEmail || null,
        recipientPhone: recipientPhone || null,
        method,
        message: message || null,
        status: "pending",
      })
      .returning();

    let result: { success: boolean; error?: string };

    try {
      if (method === "email") {
        result = await sendViaEmail({
          documentUrl,
          documentTitle,
          recipientName,
          recipientEmail: recipientEmail!,
          message,
        });
      } else if (method === "whatsapp") {
        result = await sendViaWhatsApp({
          documentUrl,
          documentTitle,
          recipientName,
          recipientPhone: recipientPhone!,
          message,
        });
      } else {
        // download - just mark as downloaded
        result = { success: true };
      }

      // Update tracking record
      await db
        .update(documentSend)
        .set({
          status: result.success ? "sent" : "failed",
          sentAt: result.success ? new Date() : null,
          errorMessage: result.error || null,
        })
        .where(eq(documentSend.id, sendRecord.id));
    } catch (sendError) {
      // Update tracking record with error
      logger.error("Send error", sendError);
      result = {
        success: false,
        error:
          sendError instanceof Error ? sendError.message : "Failed to send",
      };
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        message:
          method === "download"
            ? "Document ready for download"
            : `Document sent to ${recipientName} via ${method}`,
        sendId: sendRecord.id,
      });
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  } catch (error) {
    logger.error("Send endpoint error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  }
}

async function sendViaEmail({
  documentUrl,
  documentTitle,
  recipientName,
  recipientEmail,
  message,
}: {
  documentUrl: string;
  documentTitle: string;
  recipientName: string;
  recipientEmail: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return { success: false, error: "Email service not configured" };
  }

  try {
    // Fetch document from URL
    const docResponse = await fetch(documentUrl);
    if (!docResponse.ok) {
      return { success: false, error: "Failed to fetch document" };
    }

    const docBuffer = await docResponse.arrayBuffer();
    const filename = documentTitle.endsWith(".docx")
      ? documentTitle
      : `${documentTitle}.docx`;

    const { error } = await resend.emails.send({
      from: "SOPHIA <sophia@zyprus.com>",
      to: recipientEmail,
      subject: `Document: ${documentTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${escapeHtml(recipientName)},</h2>
          ${message ? `<p style="color: #555;">${escapeHtml(message)}</p>` : ""}
          <p style="color: #555;">
            Please find attached the document: <strong>${escapeHtml(documentTitle)}</strong>
          </p>
          <p style="color: #555;">
            If you have any questions, please don't hesitate to reach out.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #888; font-size: 12px;">
            This email was sent by SOPHIA, the AI assistant for Zyprus Property Group.
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: Buffer.from(docBuffer),
        },
      ],
    });

    if (error) {
      logger.error("Resend error", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    logger.error("Email send error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Email sending failed",
    };
  }
}

async function sendViaWhatsApp({
  documentUrl,
  documentTitle,
  recipientName: _recipientName,
  recipientPhone,
  message,
}: {
  documentUrl: string;
  documentTitle: string;
  recipientName: string;
  recipientPhone: string;
  message?: string;
}): Promise<{ success: boolean; error?: string }> {
  const whatsappClient = getWhatsAppClient();

  if (!whatsappClient.isConfigured()) {
    return { success: false, error: "WhatsApp service not configured" };
  }

  try {
    // Fetch document from URL
    const docResponse = await fetch(documentUrl);
    if (!docResponse.ok) {
      return { success: false, error: "Failed to fetch document" };
    }

    const docBuffer = Buffer.from(await docResponse.arrayBuffer());
    const filename = documentTitle.endsWith(".docx")
      ? documentTitle
      : `${documentTitle}.docx`;

    // Send document via WhatsApp
    const result = await whatsappClient.sendDocument({
      to: recipientPhone,
      document: docBuffer,
      filename,
      caption: message || `Document: ${documentTitle}`,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (error) {
    logger.error("WhatsApp send error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "WhatsApp sending failed",
    };
  }
}
