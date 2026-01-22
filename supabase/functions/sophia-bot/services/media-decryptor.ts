/**
 * Media Decryptor Service
 * Decrypts WhatsApp encrypted media files via WaSend API
 *
 * WhatsApp media is encrypted - we need to call WaSend's decrypt-media endpoint
 * to get a public URL that can be used in property listings.
 */

const WASEND_API_KEY = Deno.env.get("WASENDER_API_KEY") || "";
const DECRYPT_ENDPOINT = "https://www.wasenderapi.com/api/decrypt-media";

interface ImageMessageData {
  url: string;
  mimetype: string;
  mediaKey: string;
  fileSha256?: string;
  fileLength?: string;
  fileName?: string;
}

interface DecryptResponse {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

/**
 * Decrypt a WhatsApp image message and get a public URL
 *
 * @param messageId - Unique message ID from webhook
 * @param imageData - Image message data containing url, mimetype, mediaKey
 * @returns Public URL to decrypted image (valid for 1 hour) or null on failure
 */
export async function decryptWhatsAppImage(
  messageId: string,
  imageData: ImageMessageData
): Promise<string | null> {
  if (!WASEND_API_KEY) {
    console.error("[MediaDecryptor] WASENDER_API_KEY not set");
    return null;
  }

  if (!imageData.url || !imageData.mediaKey || !imageData.mimetype) {
    console.error("[MediaDecryptor] Missing required fields:", {
      hasUrl: !!imageData.url,
      hasMediaKey: !!imageData.mediaKey,
      hasMimetype: !!imageData.mimetype,
    });
    return null;
  }

  console.log(`[MediaDecryptor] Decrypting image for message ${messageId}`);
  console.log(`[MediaDecryptor] Encrypted URL: ${imageData.url.substring(0, 80)}...`);

  try {
    const requestBody = {
      data: {
        messages: {
          key: {
            id: messageId,
          },
          message: {
            imageMessage: {
              url: imageData.url,
              mimetype: imageData.mimetype,
              mediaKey: imageData.mediaKey,
              ...(imageData.fileSha256 && { fileSha256: imageData.fileSha256 }),
              ...(imageData.fileLength && { fileLength: imageData.fileLength }),
              ...(imageData.fileName && { fileName: imageData.fileName }),
            },
          },
        },
      },
    };

    const response = await fetch(DECRYPT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log(`[MediaDecryptor] Response status: ${response.status}`);
    console.log(`[MediaDecryptor] Response: ${responseText.substring(0, 200)}`);

    if (!response.ok) {
      console.error(`[MediaDecryptor] API error: ${response.status} - ${responseText}`);
      return null;
    }

    const result: DecryptResponse = JSON.parse(responseText);

    if (result.success && result.publicUrl) {
      console.log(`[MediaDecryptor] Successfully decrypted! Public URL: ${result.publicUrl.substring(0, 80)}...`);
      return result.publicUrl;
    } else {
      console.error(`[MediaDecryptor] Decryption failed:`, result.error || "Unknown error");
      return null;
    }
  } catch (error) {
    console.error("[MediaDecryptor] Error decrypting image:", error);
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
