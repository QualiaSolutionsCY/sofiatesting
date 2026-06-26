import "server-only";
import { createWasender, type WasenderAPIError } from "wasenderapi";
import { isTestEnvironment } from "../constants";
import { logger } from "../logger";

const log = logger.whatsapp.child("client");

/**
 * WhatsApp Client for WaSenderAPI
 * Uses the official wasenderapi npm package for type-safe integration
 *
 * Setup:
 * 1. Create account at https://wasenderapi.com (~$6/month)
 * 2. Connect WhatsApp via QR code
 * 3. Set environment variables:
 *    - WASENDER_API_KEY: Session-specific API key
 *    - WASENDER_PERSONAL_ACCESS_TOKEN: Account-level PAT (optional)
 *    - WASENDER_WEBHOOK_SECRET: For webhook verification
 */

// Environment configuration
const API_KEY = process.env.WASENDER_API_KEY || "";
const PERSONAL_ACCESS_TOKEN = process.env.WASENDER_PERSONAL_ACCESS_TOKEN;
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;

// Log configuration status
if (!API_KEY) {
  log.warn("WASENDER_API_KEY is not set - WhatsApp integration disabled");
}

/**
 * Create the WaSender client instance
 * Uses official SDK with retry support for rate limits
 */
const wasenderClient = API_KEY
  ? createWasender(
      API_KEY,
      PERSONAL_ACCESS_TOKEN,
      undefined, // Use default base URL
      undefined, // Use default fetch
      {
        enabled: true,
        maxRetries: 3,
      },
      WEBHOOK_SECRET
    )
  : null;

/**
 * WhatsApp Client wrapper for SOFIA
 * Provides simplified interface for common operations
 */
export class WhatsAppClient {
  /**
   * Upload a file to WaSenderAPI and get a temporary URL (valid 24h)
   * This is required for sending documents/media via base64
   */
  async uploadFile({
    buffer,
    mimeType,
    filename,
  }: {
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }): Promise<{ success: boolean; url?: string; error?: string }> {
    if (isTestEnvironment) {
      log.debug("Test mode: skipping file upload", { filename, mimeType });
      return { success: true, url: `https://test.example.com/${filename}` };
    }

    if (!API_KEY) {
      return { success: false, error: "WhatsApp API key not configured" };
    }

    try {
      const base64Data = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      log.debug("Uploading file", { filename, mimeType, size: buffer.length });

      const response = await fetch("https://api.wasenderapi.com/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ base64: dataUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        log.error("Upload failed", undefined, {
          status: response.status,
          error: errorData,
        });
        return {
          success: false,
          error:
            errorData.message ||
            errorData.error ||
            `Upload failed: ${response.status}`,
        };
      }

      const data = await response.json();
      // WaSenderAPI returns publicUrl, not url
      const fileUrl = data.url || data.publicUrl;
      log.debug("Upload successful", { url: fileUrl });
      return { success: true, url: fileUrl };
    } catch (error) {
      log.error("Upload error", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * Upload file with retry logic for resilience
   */
  async uploadFileWithRetry(
    params: { buffer: Buffer; mimeType: string; filename: string },
    maxRetries = 2
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    let lastError = "";

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.uploadFile(params);
      if (result.success) {
        return result;
      }

      lastError = result.error || "Unknown error";

      if (attempt < maxRetries) {
        log.debug("Upload retry after error", {
          attempt: attempt + 1,
          maxRetries,
          lastError,
        });
        // Exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    return {
      success: false,
      error: `Upload failed after ${maxRetries + 1} attempts: ${lastError}`,
    };
  }

  /**
   * Send a text message
   */
  async sendMessage({ to, text }: { to: string; text: string }): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (isTestEnvironment) {
      log.debug("Test mode: skipping WhatsApp send", {
        to,
        textLength: text.length,
      });
      return { success: true, messageId: `test-${Date.now()}` };
    }

    if (!wasenderClient) {
      log.warn("Client not configured");
      return { success: false, error: "WhatsApp API key not configured" };
    }

    try {
      const response = await wasenderClient.sendText({
        to: formatPhoneNumber(to),
        text,
      });

      log.debug("Message sent successfully", {
        to,
        textLength: text.length,
        rateLimit: response.rateLimit,
      });

      return {
        success: true,
        messageId: (response.response as any)?.id,
      };
    } catch (error) {
      const apiError = error as WasenderAPIError;
      log.error("Send message error", error, {
        statusCode: apiError.statusCode,
        message: apiError.apiMessage,
        to,
        textLength: text.length,
      });

      return {
        success: false,
        error: apiError.apiMessage || "Failed to send message",
      };
    }
  }

  /**
   * Send a document file
   * Uses the correct WaSenderAPI flow: upload → get URL → send
   */
  async sendDocument({
    to,
    document,
    filename,
    caption,
  }: {
    to: string;
    document: Buffer;
    filename: string;
    caption?: string;
  }): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (isTestEnvironment) {
      log.debug("Test mode: skipping WhatsApp document send", { to, filename });
      return { success: true, messageId: `test-doc-${Date.now()}` };
    }

    if (!wasenderClient) {
      log.warn("Client not configured");
      return { success: false, error: "WhatsApp API key not configured" };
    }

    try {
      // Determine MIME type from filename
      const mimeType = getMimeType(filename);

      // Step 1: Upload the document to get a temporary URL (valid 24h)
      const uploadResult = await this.uploadFileWithRetry({
        buffer: document,
        mimeType,
        filename,
      });

      if (!uploadResult.success || !uploadResult.url) {
        log.error("Document upload failed", undefined, {
          error: uploadResult.error,
        });
        return {
          success: false,
          error: uploadResult.error || "Failed to upload document",
        };
      }

      log.debug("Document uploaded, sending message", {
        to,
        filename,
        uploadUrl: uploadResult.url,
      });

      // Step 2: Send document using the temporary URL
      // Note: fileName is supported by the REST API but not in the SDK types, so
      // we cast. Without it WaSender shows the attachment as "document.pdf"
      // instead of the real invoice/receipt/credit-note filename.
      // Marios's blank-invoice rule: an explicit empty caption ("") means "just the
      // PDF, no text". WaSender rejects an empty OR whitespace-only `text`, so when the
      // caption is blank we OMIT the text field entirely — `text` is optional for a
      // document (wasenderapi DocumentUrlMessage), so the PDF sends with no caption. A
      // missing caption (undefined) still gets the "Document: …" default.
      const documentCaption = caption ?? `Document: ${filename}`;
      const response = await wasenderClient.sendDocument({
        to: formatPhoneNumber(to),
        documentUrl: uploadResult.url,
        fileName: filename,
        ...(documentCaption ? { text: documentCaption } : {}),
      } as Parameters<typeof wasenderClient.sendDocument>[0]);

      log.debug("Document sent successfully", {
        to,
        filename,
        size: document.length,
        rateLimit: response.rateLimit,
      });

      return {
        success: true,
        messageId: (response.response as any)?.id,
      };
    } catch (error) {
      const apiError = error as WasenderAPIError;
      log.error("Send document error", error, {
        statusCode: apiError.statusCode,
        message: apiError.apiMessage,
        to,
        filename,
      });

      return {
        success: false,
        error: apiError.apiMessage || "Failed to send document",
      };
    }
  }

  /**
   * Send an image
   * Uses the correct WaSenderAPI flow: upload → get URL → send (for Buffer)
   */
  async sendImage({
    to,
    image,
    caption,
  }: {
    to: string;
    image: Buffer | string; // Buffer or URL
    caption?: string;
  }): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (isTestEnvironment) {
      log.debug("Test mode: skipping WhatsApp image send", { to });
      return { success: true, messageId: `test-img-${Date.now()}` };
    }

    if (!wasenderClient) {
      return { success: false, error: "WhatsApp API key not configured" };
    }

    try {
      let imageUrl: string;

      if (typeof image === "string") {
        // Already a URL, use directly
        imageUrl = image;
      } else {
        // Buffer: upload first to get URL
        const uploadResult = await this.uploadFileWithRetry({
          buffer: image,
          mimeType: "image/jpeg",
          filename: `image_${Date.now()}.jpg`,
        });

        if (!uploadResult.success || !uploadResult.url) {
          return {
            success: false,
            error: uploadResult.error || "Failed to upload image",
          };
        }

        imageUrl = uploadResult.url;
      }

      const response = await wasenderClient.sendImage({
        to: formatPhoneNumber(to),
        imageUrl,
        text: caption,
      });

      return {
        success: true,
        messageId: (response.response as any)?.id,
      };
    } catch (error) {
      const apiError = error as WasenderAPIError;
      log.error("Send image error", error, {
        statusCode: apiError.statusCode,
        message: apiError.apiMessage,
        to,
      });
      return {
        success: false,
        error: apiError.apiMessage || "Failed to send image",
      };
    }
  }

  /**
   * Send a long text message, automatically splitting if needed
   * WhatsApp has a 4096 character limit per message
   */
  async sendLongMessage({ to, text }: { to: string; text: string }): Promise<{
    success: boolean;
    messageIds?: string[];
    error?: string;
  }> {
    const MAX_LENGTH = 4000; // Leave buffer for safety

    if (text.length <= MAX_LENGTH) {
      const result = await this.sendMessage({ to, text });
      return {
        success: result.success,
        messageIds: result.messageId ? [result.messageId] : undefined,
        error: result.error,
      };
    }

    // Split message by paragraphs first, then by sentences
    const chunks: string[] = [];
    let current = "";

    for (const paragraph of text.split("\n\n")) {
      if (`${current}\n\n${paragraph}`.length > MAX_LENGTH) {
        if (current) {
          chunks.push(current.trim());
        }
        // If single paragraph is too long, split by sentences
        if (paragraph.length > MAX_LENGTH) {
          const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
          let sentenceChunk = "";
          for (const sentence of sentences) {
            if (`${sentenceChunk} ${sentence}`.length > MAX_LENGTH) {
              if (sentenceChunk) {
                chunks.push(sentenceChunk.trim());
              }
              sentenceChunk = sentence;
            } else {
              sentenceChunk += (sentenceChunk ? " " : "") + sentence;
            }
          }
          if (sentenceChunk) {
            chunks.push(sentenceChunk.trim());
          }
          current = "";
        } else {
          current = paragraph;
        }
      } else {
        current += (current ? "\n\n" : "") + paragraph;
      }
    }
    if (current) {
      chunks.push(current.trim());
    }

    // Send each chunk with rate limiting delay
    const messageIds: string[] = [];
    let hasError = false;
    let lastError = "";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const result = await this.sendMessage({ to, text: chunk });

      if (result.success && result.messageId) {
        messageIds.push(result.messageId);
      } else {
        hasError = true;
        lastError = result.error || "Unknown error";
      }

      // Rate limit: wait 500ms between messages
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return {
      success: !hasError,
      messageIds: messageIds.length > 0 ? messageIds : undefined,
      error: hasError ? lastError : undefined,
    };
  }

  /**
   * Check if client is configured and ready
   */
  isConfigured(): boolean {
    return !!wasenderClient;
  }

  /**
   * Get rate limit information from last request
   */
  getRateLimitInfo() {
    // Rate limit info is returned per-request
    // This method exists for API compatibility
    return null;
  }
}

/**
 * Format phone number for WhatsApp API
 * Ensures number is in correct format (no + prefix, just digits)
 */
function formatPhoneNumber(phone: string): string {
  // Group recipients: WaSender addresses WhatsApp groups by JID ("<id>@g.us"),
  // not by phone number. Pass an explicit group JID through untouched, and treat
  // a bare alphanumeric group id (letters present, no "@") as a group JID by
  // appending the "@g.us" suffix. Never strip these like a phone number.
  if (phone.includes("@g.us")) return phone;
  if (/[a-zA-Z]/.test(phone) && !phone.includes("@")) return `${phone}@g.us`;

  // Remove any non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Remove leading + if present (WaSender expects just digits)
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    // Video
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

// Singleton instance
let whatsAppClientInstance: WhatsAppClient | null = null;

export const getWhatsAppClient = (): WhatsAppClient => {
  if (!whatsAppClientInstance) {
    whatsAppClientInstance = new WhatsAppClient();
  }
  return whatsAppClientInstance;
};

/**
 * Export the raw wasender client for advanced operations
 * Use this for direct SDK access (groups, contacts, sessions)
 */
export { wasenderClient };
