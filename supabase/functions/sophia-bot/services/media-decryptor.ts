/**
 * Media Decryptor Service
 * Decrypts WhatsApp encrypted media files via WaSend API
 *
 * WhatsApp media is encrypted - we need to call WaSend's decrypt-media endpoint
 * to get a public URL that can be used in property listings.
 */

import { LogCategory, logger } from "../utils/logger.ts";

const WASEND_API_KEY = Deno.env.get("WASEND_API_KEY") || "";
const DECRYPT_ENDPOINT = "https://www.wasenderapi.com/api/decrypt-media";

interface ImageMessageData {
  url: string;
  mimetype: string;
  mediaKey: string;
  fileSha256?: string;
  fileLength?: string;
  fileName?: string;
}

/** Which wrapper key to use in the WaSend decrypt API request body */
export type MediaMessageType = "imageMessage" | "documentMessage";

interface DecryptResponse {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

/**
 * Decrypt a WhatsApp image message and get a public URL
 *
 * @param messageId - Unique message ID from webhook
 * @param imageData - Media message data containing url, mimetype, mediaKey
 * @param messageType - Wrapper key for the decrypt API (imageMessage or documentMessage)
 * @returns Public URL to decrypted media (valid for 1 hour) or null on failure
 */
export async function decryptWhatsAppImage(
  messageId: string,
  imageData: ImageMessageData,
  messageType: MediaMessageType = "imageMessage"
): Promise<string | null> {
  if (!WASEND_API_KEY) {
    logger.error("[MediaDecryptor] WASEND_API_KEY not set", undefined, {
      category: LogCategory.IMAGE,
    });
    return null;
  }

  if (!imageData.url || !imageData.mediaKey || !imageData.mimetype) {
    logger.error("[MediaDecryptor] Missing required fields", undefined, {
      category: LogCategory.IMAGE,
      hasUrl: !!imageData.url,
      hasMediaKey: !!imageData.mediaKey,
      hasMimetype: !!imageData.mimetype,
    });
    return null;
  }

  logger.debug(`[MediaDecryptor] Decrypting image for message ${messageId}`, {
    category: LogCategory.IMAGE,
  });
  logger.debug(
    `[MediaDecryptor] Encrypted URL: ${imageData.url.substring(0, 80)}...`,
    { category: LogCategory.IMAGE }
  );

  try {
    const mediaPayload = {
      url: imageData.url,
      mimetype: imageData.mimetype,
      mediaKey: imageData.mediaKey,
      ...(imageData.fileSha256 && { fileSha256: imageData.fileSha256 }),
      ...(imageData.fileLength && { fileLength: imageData.fileLength }),
      ...(imageData.fileName && { fileName: imageData.fileName }),
    };

    const requestBody = {
      data: {
        messages: {
          key: {
            id: messageId,
          },
          message: {
            [messageType]: mediaPayload,
          },
        },
      },
    };

    const response = await fetch(DECRYPT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    logger.debug(`[MediaDecryptor] Response status: ${response.status}`, {
      category: LogCategory.IMAGE,
    });
    logger.debug(
      `[MediaDecryptor] Response: ${responseText.substring(0, 200)}`,
      { category: LogCategory.IMAGE }
    );

    if (!response.ok) {
      logger.error(
        `[MediaDecryptor] API error: ${response.status}`,
        new Error(responseText),
        { category: LogCategory.IMAGE }
      );
      return null;
    }

    const result: DecryptResponse = JSON.parse(responseText);

    if (result.success && result.publicUrl) {
      logger.debug(
        `[MediaDecryptor] Successfully decrypted! Public URL: ${result.publicUrl.substring(0, 80)}...`,
        { category: LogCategory.IMAGE }
      );
      return result.publicUrl;
    }
    logger.error(
      "[MediaDecryptor] Decryption failed",
      new Error(result.error || "Unknown error"),
      { category: LogCategory.IMAGE }
    );
    return null;
  } catch (error) {
    logger.error(
      "[MediaDecryptor] Error decrypting image",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.IMAGE }
    );
    return null;
  }
}

/**
 * Decrypt multiple WhatsApp images in parallel
 *
 * @param images - Array of {messageId, imageData} objects
 * @returns Array of public URLs (nulls filtered out)
 */
export async function decryptMultipleImages(
  images: Array<{ messageId: string; imageData: ImageMessageData }>
): Promise<string[]> {
  const results = await Promise.all(
    images.map(({ messageId, imageData }) =>
      decryptWhatsAppImage(messageId, imageData)
    )
  );

  // Filter out failed decryptions
  return results.filter((url): url is string => url !== null);
}

/**
 * Check if image data needs decryption
 * WhatsApp encrypted URLs contain mmg.whatsapp.net
 */
export function needsDecryption(url: string): boolean {
  return url.includes("mmg.whatsapp.net") || url.includes(".enc");
}

/**
 * Check if URL is already a public/accessible URL
 */
export function isPublicUrl(url: string): boolean {
  // URLs that don't need decryption
  return (
    url.startsWith("https://") &&
    !url.includes("mmg.whatsapp.net") &&
    !url.includes(".enc")
  );
}
