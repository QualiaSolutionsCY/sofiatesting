import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { generateDocx } from "@/lib/documents/docx-generator";
import { createLogger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const logger = createLogger("api:documents:generate");

const generateDocumentSchema = z.object({
  content: z.string().min(1, "Content is required"),
  filename: z.string().min(1, "Filename is required"),
  title: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed, remaining, resetAt } = rateLimit(session.user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": new Date(resetAt).toISOString(),
          },
        }
      );
    }

    const body = await request.json();
    const validated = generateDocumentSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.errors.map((e) => e.message).join(", ") },
        { status: 400 }
      );
    }

    const { content, filename, title } = validated.data;

    // Generate DOCX buffer using existing generator
    const docxBuffer = await generateDocx(content);

    // Ensure filename ends with .docx
    const finalFilename = filename.endsWith(".docx")
      ? filename
      : `${filename}.docx`;

    // Upload to Vercel Blob with a unique path
    const timestamp = Date.now();
    const userId = session.user.id;
    const blobPath = `documents/${userId}/${timestamp}-${finalFilename}`;

    const blob = await put(blobPath, docxBuffer, {
      access: "public",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      filename: finalFilename,
      title: title || filename,
      size: docxBuffer.length,
      contentType: blob.contentType,
    });
  } catch (error) {
    logger.error("Generate error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate document",
      },
      { status: 500 }
    );
  }
}
