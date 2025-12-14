import { NextResponse } from "next/server";
import { getWhatsAppClient } from "@/lib/whatsapp/client";

/**
 * WhatsApp Health Check Endpoint
 *
 * GET /api/whatsapp/test - Check configuration status
 * GET /api/whatsapp/test?phone=XXXXX - Send test message (optional)
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const testPhone = searchParams.get("phone");

  const client = getWhatsAppClient();

  // Basic configuration check
  const status = {
    service: "SOFIA WhatsApp Integration",
    timestamp: new Date().toISOString(),
    configuration: {
      wasenderApiKey: !!process.env.WASENDER_API_KEY,
      wasenderWebhookSecret: !!process.env.WASENDER_WEBHOOK_SECRET,
      geminiApiKey: !!(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ),
      redisUrl: !!process.env.REDIS_URL,
      clientConfigured: client.isConfigured(),
    },
    issues: [] as string[],
  };

  // Check for configuration issues
  if (!status.configuration.wasenderApiKey) {
    status.issues.push("WASENDER_API_KEY is not set");
  }
  if (!status.configuration.wasenderWebhookSecret) {
    status.issues.push("WASENDER_WEBHOOK_SECRET is not set");
  }
  if (!status.configuration.geminiApiKey) {
    status.issues.push(
      "GEMINI_API_KEY/GOOGLE_GENERATIVE_AI_API_KEY is not set"
    );
  }
  if (!status.configuration.redisUrl) {
    status.issues.push(
      "REDIS_URL is not set (using in-memory fallback for deduplication)"
    );
  }

  // If phone provided, send test message
  if (testPhone && client.isConfigured()) {
    try {
      const result = await client.sendMessage({
        to: testPhone,
        text: `SOFIA WhatsApp Test - ${new Date().toISOString()}\n\nIf you see this message, WhatsApp integration is working correctly.`,
      });

      return NextResponse.json({
        ...status,
        testResult: {
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        },
      });
    } catch (error) {
      return NextResponse.json({
        ...status,
        testResult: {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  return NextResponse.json(status);
}
