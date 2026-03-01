/**
 * WaSend API Client
 *
 * Handles all WhatsApp messaging via WaSenderAPI.
 * - Text messages with rate limit handling
 * - Document (DOCX) sending via public URLs
 * - Image sending
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { logger, LogCategory } from "./logger.ts";
import { withRetry } from "./retry.ts";

const WASEND_API_KEY = Deno.env.get("WASEND_API_KEY");
const WASEND_BASE_URL = "https://www.wasenderapi.com/api";

/**
 * Sends a text message via WaSend API with rate limit handling
 */
export async function sendTextMessage(
  phoneNumber: string,
  text: string,
): Promise<Response> {
  const sendUrl = `${WASEND_BASE_URL}/send-message`;

  logger.info("WASEND API CALL: sending text message", { category: LogCategory.GENERAL, textLength: text.length });

  try {
    let sendRes = await withRetry(
      () => fetch(sendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WASEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phoneNumber,
          text: text,
        }),
      }),
      { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
      "wasend-send-text"
    );

    const responseText = await sendRes.text();
    logger.info(`WaSend text send response status: ${sendRes.status}`, { category: LogCategory.GENERAL });
    logger.info(`WaSend text send response body: ${responseText}`, { category: LogCategory.GENERAL });
    logger.info(`=== WASEND API CALL COMPLETE ===`, { category: LogCategory.GENERAL });

    // Handle rate limiting (429 status)
    if (sendRes.status === 429) {
      let retryAfter = 5000; // Default 5 seconds

      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.retry_after) {
          retryAfter = (errorJson.retry_after + 1) * 1000;
        }
      } catch (_e) {
        // If parsing fails, use default
      }

      logger.info(
        `WaSendAPI Rate Limit hit. Retrying in ${retryAfter / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      sendRes = await withRetry(
        () => fetch(sendUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WASEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phoneNumber,
            text: text,
          }),
        }),
        { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
        "wasend-send-text-retry"
      );

      const retryResponseText = await sendRes.text();
      logger.info(`WaSend retry response status: ${sendRes.status}`, { category: LogCategory.GENERAL });
      logger.info(`WaSend retry response body: ${retryResponseText}`, { category: LogCategory.GENERAL });

      // Return a new Response since we consumed the body
      return new Response(retryResponseText, {
        status: sendRes.status,
        headers: sendRes.headers
      });
    }

    // Return a new Response since we consumed the body
    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending text message via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

/**
 * Generates a unique filename with timestamp to prevent caching issues
 * Format: BaseName_YYYYMMDD_HHMMSS_XXXX.docx
 */
export function generateUniqueFilename(baseFilename: string): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d{3}Z$/, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();

  // Extract base name without extension
  const baseName = baseFilename.replace(/\.docx$/i, '');

  return `${baseName}_${timestamp}_${random}.docx`;
}

/**
 * Uploads a DOCX file to Supabase Storage and returns the public URL
 * Uses unique filenames to prevent caching issues between different documents
 */
export async function uploadDocxToStorage(
  supabase: ReturnType<typeof createClient>,
  docxContent: Uint8Array,
  filename: string
): Promise<string | null> {
  try {
    // Generate unique filename to prevent cache collisions
    const uniqueFilename = generateUniqueFilename(filename);

    // Upload to Supabase Storage in 'documents' bucket
    const { error } = await supabase.storage
      .from('documents')
      .upload(`docx/${uniqueFilename}`, docxContent, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        cacheControl: 'no-cache, no-store, must-revalidate',
        upsert: false  // Don't overwrite - each document is unique
      });

    if (error) {
      logger.error("Error uploading to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`docx/${uniqueFilename}`);

    logger.info("Uploaded DOCX to Supabase Storage:" + String(urlData.publicUrl), { category: LogCategory.DATABASE });
    return urlData.publicUrl;
  } catch (error) {
    logger.error("Exception uploading to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
    return null;
  }
}

/**
 * Sends a DOCX file via WaSend API using documentUrl
 * WaSend requires a public URL to the document, not direct file upload
 * Also saves the document URL for later email attachment
 */
export async function sendDocxFile(
  supabase: ReturnType<typeof createClient>,
  phoneNumber: string,
  docxContent: Uint8Array,
  filename: string,
  retries: number = 1,
  userId?: string,
  saveLastDocumentFn?: (userId: string, url: string, name: string, type: string) => Promise<void>
): Promise<Response> {
  const sendUrl = `${WASEND_BASE_URL}/send-message`;

  // Step 1: Upload DOCX to Supabase Storage to get a public URL
  const documentUrl = await uploadDocxToStorage(supabase, docxContent, filename);

  if (!documentUrl) {
    logger.error("Failed to upload DOCX to storage, cannot send document", undefined, { category: LogCategory.ZYPRUS });
    // Return a fake error response
    return new Response(JSON.stringify({ error: "Failed to upload document" }), { status: 500 });
  }

  logger.info("Sending document via WaSend with URL:" + String(documentUrl), { category: LogCategory.GENERAL });

  // Step 1.5: Save document URL for later email attachment
  if (userId && saveLastDocumentFn) {
    const docType = filename.toLowerCase().includes("viewing") ? "viewing_form" :
                    filename.toLowerCase().includes("marketing") ? "marketing_agreement" :
                    filename.toLowerCase().includes("reservation") ? "reservation_agreement" : "document";
    await saveLastDocumentFn(userId, documentUrl, filename, docType);
  }

  try {
    let sendRes = await withRetry(
      () => fetch(sendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WASEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phoneNumber,
          text: "Document generated by Sophia",
          documentUrl: documentUrl,
          fileName: filename,
        }),
      }),
      { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
      "wasend-send-docx"
    );

    const responseText = await sendRes.text();
    logger.info("WaSend document send response status:" + String(sendRes.status), { category: LogCategory.GENERAL });
    logger.info("WaSend document send response body:" + String(responseText), { category: LogCategory.GENERAL });

    // Handle rate limiting (429 status)
    if (sendRes.status === 429 && retries > 0) {
      let retryAfter = 5000; // Default 5 seconds

      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.retry_after) {
          retryAfter = (errorJson.retry_after + 1) * 1000;
        }
      } catch (_e) {
        // If parsing fails, use default
      }

      logger.info(
        `WaSendAPI Rate Limit hit. Retrying in ${retryAfter / 1000} seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      return sendDocxFile(supabase, phoneNumber, docxContent, filename, retries - 1, userId, saveLastDocumentFn);
    }

    // Return a new Response since we already consumed the body
    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending DOCX file via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

/**
 * Uploads logo to Supabase Storage and returns public URL
 * Uses a fixed filename so it's only uploaded once
 */
export async function uploadLogoToStorage(
  supabase: ReturnType<typeof createClient>,
  logoBase64: string
): Promise<string | null> {
  try {
    // Convert base64 to Uint8Array
    const binaryString = atob(logoBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const filename = "zyprus-logo.jpg";

    // Upload to Supabase Storage in 'documents' bucket under 'logos' folder
    const { error } = await supabase.storage
      .from('documents')
      .upload(`logos/${filename}`, bytes, {
        contentType: 'image/jpeg',
        upsert: true  // Overwrite if exists
      });

    if (error && !error.message.includes('already exists')) {
      logger.error("Error uploading logo to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(`logos/${filename}`);

    logger.info("Logo URL:" + String(urlData.publicUrl), { category: LogCategory.GENERAL });
    return urlData.publicUrl;
  } catch (error) {
    logger.error("Exception uploading logo to Supabase Storage: " + String(error), { category: LogCategory.ZYPRUS });
    return null;
  }
}

/**
 * Sends the Zyprus logo image via WaSend API
 */
export async function sendLogoImage(
  supabase: ReturnType<typeof createClient>,
  phoneNumber: string,
  logoBase64: string
): Promise<Response> {
  const sendUrl = `${WASEND_BASE_URL}/send-message`;

  // Get or upload logo URL
  const logoUrl = await uploadLogoToStorage(supabase, logoBase64);

  if (!logoUrl) {
    logger.error("Failed to get logo URL", undefined, { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: "Failed to get logo" }), { status: 500 });
  }

  logger.info("Sending logo via WaSend with URL:" + String(logoUrl), { category: LogCategory.GENERAL });

  try {
    const sendRes = await withRetry(
      () => fetch(sendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WASEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: phoneNumber,
          text: "Here's the Zyprus Property Group logo!",
          imageUrl: logoUrl,
        }),
      }),
      { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
      "wasend-send-logo"
    );

    const responseText = await sendRes.text();
    logger.info("WaSend image response:" + String(responseText), { category: LogCategory.GENERAL });

    if (!sendRes.ok) {
      logger.error("WaSend image send failed: " + String(responseText), { category: LogCategory.GENERAL });
    }

    return new Response(responseText, {
      status: sendRes.status,
      headers: sendRes.headers
    });
  } catch (error) {
    logger.error("Error sending logo via WaSend: " + String(error), { category: LogCategory.GENERAL });
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
}

/**
 * Formats phone number for WaSend API
 * WaSend expects E.164 format: +1234567890
 * Input may be: cleanedSenderPn (already clean), remoteJid (with @suffix), or LID format
 */
export function formatPhoneNumber(remoteJid: string | null): string | null {
  if (!remoteJid) return null;

  let number = remoteJid;

  // Remove WhatsApp/LID suffixes if present
  number = number.replace("@s.whatsapp.net", "")
                 .replace("@c.us", "")
                 .replace("@lid", "");

  // If it's a LID (starts with numbers but isn't a phone number format)
  // LIDs are internal WhatsApp identifiers, not usable for sending
  if (number.includes("@") || number.length < 8) {
    logger.info("Invalid phone format (possibly LID)", { category: LogCategory.GENERAL });
    return null;
  }

  // Ensure E.164 format with + prefix
  if (!number.startsWith("+")) {
    // If it's all digits, add +
    if (/^\d+$/.test(number)) {
      number = "+" + number;
    } else {
      // Try to extract just digits
      const digits = number.replace(/\D/g, "");
      if (digits && digits.length >= 8) {
        number = "+" + digits;
      } else {
        logger.info("Could not extract valid phone number from input", { category: LogCategory.GENERAL });
        return null;
      }
    }
  }

  logger.info("Phone number formatted successfully", { category: LogCategory.GENERAL });
  return number;
}
