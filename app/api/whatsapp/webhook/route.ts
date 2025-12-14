import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { handleWhatsAppMessage } from "@/lib/whatsapp/message-handler";
import type {
  WaSenderMessageData,
  WaSenderSessionData,
  WaSenderStatusData,
} from "@/lib/whatsapp/types";
import { verifyWebhookSignature } from "@/lib/whatsapp/webhook-utils";

// Deduplication configuration
const DEDUP_PREFIX = "whatsapp:dedup:";
const DEDUP_TTL_SECONDS = 60; // 60 seconds

// In-memory fallback cache (used if Redis unavailable)
const memoryDedup = new Map<string, number>();
let lastMemoryCleanup = Date.now();
const MEMORY_CLEANUP_INTERVAL = 10_000; // Clean every 10 seconds

// Redis client (lazy initialization)
let redisClient: Redis | null = null;

/**
 * Get Redis client with lazy initialization
 */
const getRedis = (): Redis | null => {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    const parsedRedisUrl = new URL(redisUrl);
    const redisToken = parsedRedisUrl.password;

    if (!redisToken) {
      return null;
    }

    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });

    return redisClient;
  } catch {
    return null;
  }
};

/**
 * Check if message was already processed (Redis with in-memory fallback)
 * Returns true if duplicate, false if new message
 */
const isMessageProcessed = async (messageId: string): Promise<boolean> => {
  const redis = getRedis();

  if (redis) {
    try {
      const key = `${DEDUP_PREFIX}${messageId}`;
      const exists = await redis.get(key);

      if (exists) {
        return true; // Already processed
      }

      // Mark as processed with TTL (Redis handles expiration automatically)
      await redis.set(key, 1, { ex: DEDUP_TTL_SECONDS });
      return false;
    } catch (error) {
      console.error("[WhatsApp Webhook] Redis dedup failed:", error);
      // Fall through to memory cache
    }
  }

  // Fallback to in-memory deduplication with periodic cleanup
  const now = Date.now();

  // Only cleanup every 10 seconds (not on every call - O(1) amortized)
  if (now - lastMemoryCleanup > MEMORY_CLEANUP_INTERVAL) {
    const ttlMs = DEDUP_TTL_SECONDS * 1000;
    for (const [id, timestamp] of memoryDedup.entries()) {
      if (now - timestamp > ttlMs) {
        memoryDedup.delete(id);
      }
    }
    lastMemoryCleanup = now;
  }

  // Check if message was already processed
  if (memoryDedup.has(messageId)) {
    return true;
  }

  // Mark as processed
  memoryDedup.set(messageId, now);
  return false;
};

/**
 * WhatsApp Webhook Endpoint for WaSenderAPI
 *
 * Configure this URL in your WaSenderAPI dashboard:
 * https://your-domain.vercel.app/api/whatsapp/webhook
 *
 * Setup:
 * 1. Go to WaSenderAPI dashboard
 * 2. Navigate to webhook settings
 * 3. Set webhook URL to: https://your-domain/api/whatsapp/webhook
 * 4. Set WASENDER_WEBHOOK_SECRET env var and configure in dashboard
 */

/**
 * WaSenderAPI webhook payload structure (from SDK types)
 *
 * MessagesUpsertEvent:
 * {
 *   type: "messages.upsert",
 *   sessionId?: string,
 *   timestamp?: number,
 *   data: MessagesUpsertData | MessagesUpsertData[]
 * }
 *
 * MessagesUpsertData:
 * {
 *   key: { id: string, fromMe: boolean, remoteId: string, participant?: string },
 *   message?: { conversation?: string, imageMessage?: {...}, ... },
 *   pushName?: string,
 *   messageTimestamp?: number
 * }
 */

// NOTE: verifyWebhookSignature moved to @/lib/whatsapp/webhook-utils.ts for testability

/**
 * POST - Handle incoming WhatsApp messages from WaSenderAPI
 */
export async function POST(request: Request): Promise<Response> {
  // Debug: Log all incoming headers to diagnose signature issues
  const headerNames: string[] = [];
  request.headers.forEach((_, key) => {
    headerNames.push(key);
  });

  console.log("[WhatsApp Webhook] Incoming request:", {
    method: request.method,
    headerNames,
    hasWebhookSignature: !!request.headers.get("x-webhook-signature"),
    hasWasenderSignature: !!request.headers.get("x-wasender-signature"),
    timestamp: new Date().toISOString(),
  });

  // 1. Get signature from headers
  // WaSenderAPI uses "X-Webhook-Signature" header (case-insensitive in HTTP)
  const signature =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-wasender-signature");
  const webhookSecret = process.env.WASENDER_WEBHOOK_SECRET;

  // 2. Verify webhook secret is configured
  if (!webhookSecret) {
    console.error("[WhatsApp Webhook] WASENDER_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 }
    );
  }

  // 3. Get raw body for signature verification
  const rawBody = await request.text();

  // 4. Verify signature
  // WaSenderAPI sends the webhook secret directly as the signature (not HMAC)
  // Support both: direct secret match OR HMAC verification
  const isDirectSecretMatch = signature === webhookSecret;
  const isHmacValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

  if (!isDirectSecretMatch && !isHmacValid) {
    console.warn("[WhatsApp Webhook] Invalid signature, rejecting request", {
      hasSignature: !!signature,
      signatureLength: signature?.length,
      secretLength: webhookSecret.length,
      isDirectMatch: isDirectSecretMatch,
      isHmacMatch: isHmacValid,
      bodyPreview: rawBody.substring(0, 100),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  console.log("[WhatsApp Webhook] Signature verified successfully");

  // 5. Parse verified body
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody) as Record<string, any>;
  } catch {
    console.error("[WhatsApp Webhook] Invalid JSON in request body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Log EVERYTHING for debugging
    console.log(
      "[WhatsApp Webhook] RAW PAYLOAD:",
      JSON.stringify(body, null, 2)
    );

    // Handle test webhook event (legacy format)
    if (body.event === "webhook.test") {
      console.log("[WhatsApp Webhook] Test event received successfully");
      return NextResponse.json({
        success: true,
        message: "Webhook test successful",
      });
    }

    // WaSenderAPI uses 'type' field for event type (SDK standard)
    // Fall back to 'event' for legacy support
    const eventType = body.type || body.event;

    console.log("[WhatsApp Webhook] Event received:", {
      event: body.event,
      type: body.type,
      eventType,
      sessionId: body.sessionId,
      timestamp: new Date().toISOString(),
    });

    switch (eventType) {
      case "message":
      case "messages.received":
      case "messages.upsert": {
        // WaSenderAPI has TWO formats:
        // 1. SDK format: body.data is MessagesUpsertData | MessagesUpsertData[]
        // 2. Webhook format: body.data.messages is the message object
        const rawData = body.data;

        if (!rawData) {
          console.log("[WhatsApp Webhook] No data in payload");
          return NextResponse.json({ success: true });
        }

        // Check if messages are nested under "messages" key (webhook format)
        // or directly in data (SDK format)
        let messageSource = rawData;
        if (rawData.messages && !rawData.key) {
          // Webhook format: data.messages contains the message
          messageSource = rawData.messages;
          console.log("[WhatsApp Webhook] Using nested messages format");
        }

        // Handle both single object and array formats
        const messagesArray = Array.isArray(messageSource)
          ? messageSource
          : [messageSource];

        for (const msgData of messagesArray) {
          // Skip if no message data
          if (!msgData) {
            console.log("[WhatsApp Webhook] Empty message entry, skipping");
            continue;
          }

          // Extract message from WaSenderAPI format
          // SDK types: key.remoteId (not remoteJid), message.conversation for text
          let messageData: WaSenderMessageData;

          if (msgData.key && msgData.message) {
            const key = msgData.key;
            const msg = msgData.message;

            // remoteId is the standard field per SDK, but check remoteJid for compatibility
            const remoteId = key.remoteId || key.remoteJid || "";

            // Check for senderPn (sender phone number) - some APIs provide this for @lid messages
            const senderPn =
              (msgData as any).senderPn || (msgData as any).phoneNumber;

            // Log LID format for debugging
            if (remoteId.includes("@lid")) {
              console.log("[WhatsApp Webhook] LID format detected:", {
                remoteId,
                senderPn,
                participant: key.participant,
                pushName: msgData.pushName,
                allKeys: Object.keys(msgData),
              });
            }

            // Skip messages from self (bot's own messages)
            if (key.fromMe) {
              console.log(
                "[WhatsApp Webhook] Skipping own message (fromMe=true)"
              );
              continue;
            }

            // Determine phone number for replying
            // Priority: senderPn > participant (if not LID) > remoteId (stripped)
            let phoneNumber: string;
            if (senderPn) {
              phoneNumber = String(senderPn).replace(/[^0-9]/g, "");
              console.log("[WhatsApp Webhook] Using senderPn:", phoneNumber);
            } else if (remoteId.includes("@lid")) {
              // LID format without senderPn - cannot reply
              console.error(
                "[WhatsApp Webhook] Cannot reply to LID without senderPn:",
                {
                  remoteId,
                  participant: key.participant,
                  pushName: msgData.pushName,
                }
              );
              // Skip this message - we can't determine the phone number
              continue;
            } else {
              phoneNumber = remoteId
                .replace("@s.whatsapp.net", "")
                .replace("@g.us", "");
            }

            // Extract text from various message types
            const messageText =
              msg.conversation || // Plain text message
              msg.extendedTextMessage?.text || // Extended text (with link preview, etc.)
              msg.imageMessage?.caption || // Image caption
              msg.videoMessage?.caption || // Video caption
              msg.documentMessage?.caption || // Document caption
              msgData.messageBody || // Fallback: some versions use messageBody
              "";

            // Determine message type
            let msgType: WaSenderMessageData["type"] = "text";
            if (msg.imageMessage) {
              msgType = "image";
            } else if (msg.videoMessage) {
              msgType = "video";
            } else if (msg.audioMessage) {
              msgType = "audio";
            } else if (msg.documentMessage) {
              msgType = "document";
            } else if (msg.locationMessage) {
              msgType = "location";
            } else if (msg.contactMessage) {
              msgType = "vcard";
            }

            messageData = {
              id: key.id,
              from: phoneNumber, // Use the determined phone number
              to: "",
              type: msgType,
              text: messageText,
              timestamp: msgData.messageTimestamp || Date.now(),
              isGroup: remoteId.includes("@g.us"),
              sender: msgData.pushName
                ? { id: key.participant || remoteId, name: msgData.pushName }
                : undefined,
            };
          } else {
            // Legacy/fallback format - use data as-is if it matches our expected structure
            console.log("[WhatsApp Webhook] Using legacy message format");
            messageData = msgData as WaSenderMessageData;
          }

          console.log("[WhatsApp Webhook] Parsed message data:", {
            from: messageData.from,
            type: messageData.type,
            textLength: messageData.text?.length || 0,
            text:
              messageData.text?.substring(0, 50) +
              (messageData.text && messageData.text.length > 50 ? "..." : ""),
            isGroup: messageData.isGroup,
          });

          // Skip if no text content for text messages
          if (messageData.type === "text" && !messageData.text) {
            console.log("[WhatsApp Webhook] Empty text message, skipping");
            continue;
          }

          // Deduplication check - prevent processing same message multiple times
          // WaSenderAPI can send multiple events for the same message
          const messageKey = `${messageData.id}-${messageData.from}`;
          if (await isMessageProcessed(messageKey)) {
            console.log(
              "[WhatsApp Webhook] Duplicate message, skipping:",
              messageKey
            );
            continue;
          }

          // Process message and wait for completion
          // The 60s function timeout should be enough for AI processing
          try {
            console.log("[WhatsApp Webhook] Starting message handler...");
            await handleWhatsAppMessage(messageData);
            console.log("[WhatsApp Webhook] Handler completed successfully");
          } catch (error) {
            console.error("[WhatsApp Webhook] Error processing message:", {
              error: error instanceof Error ? error.message : "Unknown error",
              stack: error instanceof Error ? error.stack : undefined,
              from: messageData.from,
              type: messageData.type,
            });
          }
        }

        break;
      }

      case "message.status":
      case "messages.update":
      case "message-receipt.update": {
        // Message delivery status update
        const statusData = body.data as WaSenderStatusData;
        console.log("[WhatsApp Webhook] Message status update:", {
          messageId: statusData?.id,
          status: statusData?.status,
          timestamp: statusData?.timestamp,
        });
        break;
      }

      case "session.status": {
        // Session connection status change
        const sessionData = body.data as WaSenderSessionData;
        console.log("[WhatsApp Webhook] Session status update:", {
          status: sessionData?.status,
          hasQR: !!(sessionData as any)?.qr,
        });
        break;
      }

      case "contact.upsert":
      case "contacts.upsert":
      case "group.update":
      case "groups.update":
      case "groups.upsert":
      case "chats.upsert":
      case "chats.update":
      case "call": {
        // Log other events for debugging but don't process
        console.log(
          `[WhatsApp Webhook] ${eventType}:`,
          JSON.stringify(body.data).substring(0, 200)
        );
        break;
      }

      default:
        console.log(
          "[WhatsApp Webhook] Unknown event:",
          eventType,
          JSON.stringify(body).substring(0, 500)
        );
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return 200 even on error to prevent webhook retries flooding
    return NextResponse.json({ success: false, error: "Processing error" });
  }
}

/**
 * GET - Webhook verification endpoint
 * Used by WaSenderAPI to verify webhook URL is accessible
 */
export function GET(): Response {
  return NextResponse.json({
    status: "active",
    service: "SOFIA WhatsApp Integration",
    provider: "WaSenderAPI",
    version: "2.1",
    timestamp: new Date().toISOString(),
  });
}
