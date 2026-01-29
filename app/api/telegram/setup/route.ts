import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getTelegramClient } from "@/lib/telegram/client";

const logger = createLogger("api:telegram:setup");

/**
 * Telegram Bot Setup Endpoint
 * Use this to set up the webhook and check bot status
 *
 * Requires ADMIN_API_KEY header for authentication
 *
 * GET /api/telegram/setup - Get bot info and webhook status
 * POST /api/telegram/setup - Set up webhook
 * DELETE /api/telegram/setup - Delete webhook
 */

/**
 * Validates admin API key from request headers
 */
function validateAdminAuth(request: Request): boolean {
  const adminKey = request.headers.get("x-admin-api-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    logger.error("ADMIN_API_KEY not configured - setup endpoint is disabled");
    return false;
  }

  return adminKey === expectedKey;
}

export async function GET(request: Request) {
  // Require admin authentication
  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - Admin API key required" },
      { status: 401 }
    );
  }
  try {
    const client = getTelegramClient();

    // Get bot info
    const botInfo = await client.getMe();

    // Get webhook info
    const webhookInfo = await client.getWebhookInfo();

    return NextResponse.json({
      bot: botInfo,
      webhook: webhookInfo,
      status: "ok",
    });
  } catch (error) {
    logger.error("Error getting bot info", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Make sure TELEGRAM_BOT_TOKEN is set in environment variables",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Require admin authentication
  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - Admin API key required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { webhookUrl } = body;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "webhookUrl is required in request body" },
        { status: 400 }
      );
    }

    const client = getTelegramClient();

    // Set webhook with secret token for security
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const success = await client.setWebhook(webhookUrl, secretToken);

    if (success) {
      const webhookInfo = await client.getWebhookInfo();
      return NextResponse.json({
        success: true,
        message: "Webhook set successfully",
        webhook: webhookInfo,
      });
    }

    return NextResponse.json(
      { success: false, message: "Failed to set webhook" },
      { status: 500 }
    );
  } catch (error) {
    logger.error("Error setting webhook", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  // Require admin authentication
  if (!validateAdminAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized - Admin API key required" },
      { status: 401 }
    );
  }

  try {
    const client = getTelegramClient();

    // Delete webhook (useful for local testing)
    const success = await client.deleteWebhook();

    return NextResponse.json({
      success,
      message: success
        ? "Webhook deleted successfully"
        : "Failed to delete webhook",
    });
  } catch (error) {
    logger.error("Error deleting webhook", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
