/**
 * WhatsApp Channel Adapter
 *
 * Normalizes WaSend webhook payloads into UnifiedMessage format.
 * Handles sending responses back via WaSend API.
 *
 * WaSend Format:
 * {
 *   event: "messages.received" | "messages.upsert" | "message" | "messages",
 *   data: {
 *     messages: {
 *       key: { cleanedSenderPn, cleanedParticipantPn, remoteJid, fromMe },
 *       messageBody: string,
 *       message: { conversation, extendedTextMessage, imageMessage, documentMessage }
 *     }
 *   }
 * }
 */

import type { UnifiedMessage, UnifiedResponse } from "./types.ts";

/**
 * WaSend webhook payload structure (real format)
 */
export interface WaSendWebhookPayload {
  event: string;
  data: {
    messages?: WaSendMessage | WaSendMessage[];
    message?: WaSendMessage;
    // Fallback fields for other formats
    from?: string;
    to?: string;
    body?: string;
    text?: string;
  };
}

export interface WaSendMessage {
  key?: {
    cleanedSenderPn?: string;
    cleanedParticipantPn?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  fromMe?: boolean;
  remoteJid?: string;
  from?: string;
  to?: string;
  phone?: string;
  messageBody?: string;
  text?: string;
  body?: string;
  content?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
      url?: string;
    };
    documentMessage?: {
      url?: string;
      mimetype?: string;
      fileName?: string;
    };
    text?: string;
  };
}

/**
 * Extract the actual message object from various WaSend formats
 */
const extractMessageObject = (payload: WaSendWebhookPayload): WaSendMessage | null => {
  const { event, data } = payload;

  // Check for valid message events
  const validEvents = ["messages.upsert", "messages.received", "message", "messages"];
  if (event && !validEvents.includes(event)) {
    console.log("[WhatsApp] Unhandled event type:", event);
    return null;
  }

  let message: WaSendMessage | null = null;

  if (data.messages) {
    // WaSend sends data.messages as SINGLE OBJECT or array
    message = Array.isArray(data.messages) ? data.messages[0] : data.messages;
  } else if (data.message) {
    message = data.message;
  } else if (data.from || data.to) {
    // Fallback for simpler formats
    message = data as unknown as WaSendMessage;
  } else {
    message = data as unknown as WaSendMessage;
  }

  return message || null;
};

/**
 * Extract phone number from WaSend message
 * Priority order per WaSend docs:
 * 1. key.cleanedSenderPn (recommended for private chats)
 * 2. key.cleanedParticipantPn (for group chats)
 * 3. key.remoteJid (fallback, but check for LID format)
 * 4. Other fallbacks
 */
const extractPhoneNumber = (message: WaSendMessage): string | null => {
  // First try the cleaned phone numbers (reliable)
  let phone = message.key?.cleanedSenderPn || message.key?.cleanedParticipantPn;

  // If not found, try remoteJid but validate it's not a LID
  if (!phone && message.key?.remoteJid) {
    const jid = message.key.remoteJid;
    // LID format is like "520:123456@lid" - we can't use these
    if (!jid.includes(":") && !jid.includes("@lid")) {
      phone = jid;
    } else {
      console.log("[WhatsApp] Skipping LID format remoteJid:", jid);
    }
  }

  // Fall back to other fields
  if (!phone) {
    phone = message.remoteJid || message.from || message.to || message.phone || undefined;
  }

  // Clean the phone number
  if (phone) {
    return phone.replace("@c.us", "").replace("@s.whatsapp.net", "");
  }

  return null;
};

/**
 * Extract text content from WaSend message
 * Priority order per WaSend docs:
 * 1. messageBody (WaSend unified field for all message types)
 * 2. message.conversation (raw text messages)
 * 3. Other fallbacks
 */
const extractTextContent = (message: WaSendMessage): string => {
  return message.messageBody ||
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.text ||
    message.text ||
    message.body ||
    message.content ||
    "";
};

/**
 * Extract image URLs from WaSend message
 */
const extractImageUrls = (message: WaSendMessage): string[] => {
  const imageUrls: string[] = [];

  // Check imageMessage
  if (message.message?.imageMessage?.url) {
    imageUrls.push(message.message.imageMessage.url);
  }

  // Check documentMessage with image mimetype
  if (message.message?.documentMessage?.url &&
      message.message?.documentMessage?.mimetype?.startsWith("image/")) {
    imageUrls.push(message.message.documentMessage.url);
  }

  return imageUrls;
};

/**
 * Parse WhatsApp webhook payload into UnifiedMessage
 */
export const parseWhatsAppMessage = (payload: WaSendWebhookPayload): UnifiedMessage | null => {
  const message = extractMessageObject(payload);
  if (!message) {
    console.log("[WhatsApp] No message object found in payload");
    return null;
  }

  // Check if message is from me (outgoing) - ignore it
  if (message.key?.fromMe || message.fromMe) {
    console.log("[WhatsApp] Ignoring outgoing message (fromMe=true)");
    return null;
  }

  // Extract phone number
  const senderPhone = extractPhoneNumber(message);
  if (!senderPhone) {
    console.log("[WhatsApp] Could not extract phone number from message");
    return null;
  }

  // Extract text and images
  let text = extractTextContent(message);
  const imageUrls = extractImageUrls(message);

  // If no text but has images, use placeholder
  if (!text.trim() && imageUrls.length > 0) {
    text = "[User sent image(s)]";
  }

  // If no text and no images, skip
  if (!text.trim()) {
    console.log("[WhatsApp] No content found in message");
    return null;
  }

  // Build unified message
  const unified: UnifiedMessage = {
    channelType: "whatsapp",
    senderPhone,
    timestamp: new Date(),
    conversationId: senderPhone, // Use phone as conversation ID for WhatsApp
    text,
  };

  // Add images if present
  if (imageUrls.length > 0) {
    unified.images = imageUrls.map(url => ({
      url,
      caption: message.message?.imageMessage?.caption,
    }));
  }

  // Add documents if present (non-image)
  if (message.message?.documentMessage?.url &&
      !message.message?.documentMessage?.mimetype?.startsWith("image/")) {
    unified.documents = [{
      url: message.message.documentMessage.url,
      filename: message.message.documentMessage.fileName || "document",
      mimetype: message.message.documentMessage.mimetype,
    }];
  }

  return unified;
};

/**
 * Generate unique message key for deduplication
 * Format: wa_{phone}_{messageId}_{timestamp}
 */
export const getWhatsAppMessageKey = (payload: WaSendWebhookPayload): string => {
  const message = extractMessageObject(payload);
  if (!message) {
    return `wa_unknown_${Date.now()}`;
  }

  const phone = extractPhoneNumber(message) || "unknown";
  const timestamp = Date.now();
  // Use remoteJid as part of key if available
  const jid = message.key?.remoteJid || message.remoteJid || "";

  return `wa_${phone}_${jid}_${timestamp}`;
};

/**
 * Send text message via WaSend API with rate limit handling
 */
export const sendWhatsAppText = async (
  phone: string,
  text: string,
  apiKey: string
): Promise<boolean> => {
  const sendUrl = "https://www.wasenderapi.com/api/send-message";

  try {
    let response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phone,
        text: text,
      }),
    });

    // Handle rate limiting (429 status)
    if (response.status === 429) {
      let retryAfter = 5000; // Default 5 seconds

      try {
        const errorJson = await response.json();
        if (errorJson.retry_after) {
          retryAfter = (errorJson.retry_after + 1) * 1000;
        }
      } catch {
        // If parsing fails, use default
      }

      console.log(`[WhatsApp] Rate limit hit. Retrying in ${retryAfter / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter));

      response = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phone,
          text: text,
        }),
      });
    }

    if (!response.ok) {
      console.error("[WhatsApp] Failed to send message:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("[WhatsApp] Error sending message:", error);
    return false;
  }
};

/**
 * Send document via WaSend API
 */
export const sendWhatsAppDocument = async (
  phone: string,
  document: NonNullable<UnifiedResponse["document"]>,
  apiKey: string,
  caption?: string
): Promise<boolean> => {
  const sendUrl = "https://www.wasenderapi.com/api/send-document";

  try {
    // Convert ArrayBuffer to base64
    const uint8Array = new Uint8Array(document.buffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: phone,
        document: base64,
        filename: document.filename,
        mimetype: document.mimetype || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        caption,
      }),
    });

    if (!response.ok) {
      console.error("[WhatsApp] Failed to send document:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("[WhatsApp] Error sending document:", error);
    return false;
  }
};

/**
 * Send unified response via WhatsApp
 */
export const sendWhatsAppResponse = async (
  phone: string,
  response: UnifiedResponse,
  apiKey: string
): Promise<boolean> => {
  let success = true;

  // Send text if present
  if (response.text) {
    success = await sendWhatsAppText(phone, response.text, apiKey) && success;
  }

  // Send document if present
  if (response.document) {
    success = await sendWhatsAppDocument(phone, response.document, apiKey) && success;
  }

  return success;
};

/**
 * Verify WaSend webhook signature using HMAC-SHA256
 */
export const verifyWhatsAppSignature = async (
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> => {
  if (!signature || !secret) {
    return false;
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(payload);

    // Import the key for HMAC
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the message
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);

    // Convert to hex
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Compare signatures (constant-time comparison would be better for production)
    return computedSignature === signature.toLowerCase();
  } catch (error) {
    console.error("[WhatsApp] Error verifying signature:", error);
    return false;
  }
};
