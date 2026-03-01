/**
 * Message Processor Service
 *
 * Handles message extraction, parsing, validation, and response formatting.
 */

import { getContext } from "../utils/context.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import { formatPropertyDescription } from "../utils/property-formatter.ts";
import { sendTextMessage } from "../utils/wasend.ts";
import { persistDocument, persistImages } from "./image-persistence.ts";
import { validateImagesAtIngress } from "./image-validator.ts";
import {
  decryptWhatsAppImage,
  isPublicUrl,
  needsDecryption,
} from "./media-decryptor.ts";
import { addPendingDocument } from "./pending-documents.ts";
import { addPendingImages } from "./pending-images.ts";

/**
 * Extracts message content from WaSend webhook payload
 * WaSend Format: { event: "messages.received", data: { messages: { key: {...}, messageBody: "...", message: {...} } } }
 * IMPORTANT: data.messages is a SINGLE OBJECT, not an array
 * IMPORTANT: Use key.cleanedSenderPn for phone number (remoteJid can be LID format)
 * IMPORTANT: WhatsApp images are encrypted - we decrypt them via WaSend API
 */
export async function extractMessage(payload: any): Promise<{
  message: any;
  remoteJid: string | null;
  userMessage: string;
  imageUrls: string[];
} | null> {
  logger.info("Extracting message from payload...", {
    category: LogCategory.GENERAL,
  });
  // DEBUG: Log full payload structure to diagnose image handling
  logger.debug("Full payload keys: " + String(Object.keys(payload)), {
    category: LogCategory.GENERAL,
  });
  logger.debug(
    "Payload preview: " + JSON.stringify(payload).substring(0, 500),
    { category: LogCategory.GENERAL }
  );

  let message = null;
  let remoteJid: string | null = null;
  let userMessage = "";
  const imageUrls: string[] = [];
  let imageDetectedButFailed = false; // Track if images were found but decryption failed

  // WaSend Format: { event: "messages.received", data: { messages: {...} } }
  if (payload.event && payload.data) {
    const event = payload.event;
    const data = payload.data;

    logger.info("Event type:" + String(event), {
      category: LogCategory.GENERAL,
    });

    if (
      event === "messages.upsert" ||
      event === "messages.received" ||
      event === "message" ||
      event === "messages"
    ) {
      // WaSend sends data.messages as a SINGLE OBJECT (not array)
      if (data.messages) {
        message = Array.isArray(data.messages)
          ? data.messages[0]
          : data.messages;
      } else if (data.message) {
        message = data.message;
      } else {
        message = data;
      }
    } else {
      logger.info("Unhandled event type:" + String(event), {
        category: LogCategory.GENERAL,
      });
      return null;
    }
  }
  // Fallback formats for other webhook providers
  else if (payload.from || payload.to) {
    message = payload;
  } else if (payload.data) {
    message = payload.data;
  } else {
    message = payload;
  }

  if (!message) {
    logger.info("No message object found", { category: LogCategory.GENERAL });
    return null;
  }

  // DEBUG: Comprehensive logging to diagnose image handling
  logger.debug(" === MESSAGE STRUCTURE ANALYSIS ===", {
    category: LogCategory.GENERAL,
  });
  logger.debug("Message keys: " + String(Object.keys(message)), {
    category: LogCategory.GENERAL,
  });
  logger.debug("Full message: " + JSON.stringify(message).substring(0, 2000), {
    category: LogCategory.GENERAL,
  });

  if (message.message) {
    logger.debug(
      "message.message keys: " + String(Object.keys(message.message)),
      { category: LogCategory.GENERAL }
    );
    logger.debug(
      "message.message: " + JSON.stringify(message.message).substring(0, 1000),
      { category: LogCategory.GENERAL }
    );
  }

  // Check specific fields that indicate image presence
  const hasImageIndicators = {
    "message.imageMessage": !!message.imageMessage,
    "message.message?.imageMessage": !!message.message?.imageMessage,
    "message.mediaUrl": !!message.mediaUrl,
    "message.media": !!message.media,
    "message.hasMedia": message.hasMedia,
    "message.messageType": message.messageType,
    "message.type": message.type,
  };
  logger.debug("Image indicators: " + JSON.stringify(hasImageIndicators), {
    category: LogCategory.GENERAL,
  });

  // Deep search for "imageMessage" keyword in the entire payload
  const payloadStr = JSON.stringify(message);
  if (payloadStr.includes("imageMessage")) {
    logger.debug(" *** Found 'imageMessage' somewhere in payload! ***", {
      category: LogCategory.GENERAL,
    });
    const imgIdx = payloadStr.indexOf("imageMessage");
    logger.debug(
      "Context around imageMessage: " +
        payloadStr.substring(Math.max(0, imgIdx - 50), imgIdx + 200),
      { category: LogCategory.GENERAL }
    );
  }
  if (payloadStr.includes("mediaKey")) {
    logger.debug(
      " *** Found 'mediaKey' - this is likely an image message ***",
      { category: LogCategory.GENERAL }
    );
  }
  if (payloadStr.includes("mmg.whatsapp.net")) {
    logger.debug(" *** Found encrypted WhatsApp media URL ***", {
      category: LogCategory.GENERAL,
    });
  }

  // Check if message is from me (outgoing) - ignore it
  if (message.key?.fromMe || message.fromMe) {
    logger.info("Ignoring outgoing message (fromMe=true)", {
      category: LogCategory.GENERAL,
    });
    return null;
  }

  // Extract phone number - PRIORITY ORDER per WaSend docs:
  // 1. key.cleanedSenderPn (recommended by WaSend for private chats)
  // 2. key.cleanedParticipantPn (for group chats)
  // 3. key.remoteJid (fallback, but check for LID format)
  // 4. Other fallbacks

  // First try the cleaned phone numbers (these are usually reliable)
  remoteJid = message.key?.cleanedSenderPn || message.key?.cleanedParticipantPn;

  // If not found, try remoteJid but validate it's not a LID
  if (!remoteJid && message.key?.remoteJid) {
    const jid = message.key.remoteJid;
    // LID format is like "520:123456@lid" - we can't use these
    if (!jid.includes(":") && !jid.includes("@lid")) {
      remoteJid = jid;
    } else {
      logger.info("Skipping LID format remoteJid:" + String(jid), {
        category: LogCategory.GENERAL,
      });
    }
  }

  // Fall back to other fields if still not found
  if (!remoteJid) {
    remoteJid =
      message.remoteJid || message.from || message.to || message.phone;
  }

  logger.info("Extracted remoteJid:" + String(remoteJid), {
    category: LogCategory.GENERAL,
  });

  // Extract text content - PRIORITY ORDER per WaSend docs:
  // 1. messageBody (WaSend unified field for all message types including captions)
  // 2. message.conversation (raw text messages)
  // 3. Other fallbacks
  userMessage =
    message.messageBody ||
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.text ||
    message.text ||
    message.body ||
    message.content ||
    "";

  logger.info("Extracted userMessage: " + userMessage.substring(0, 100), {
    category: LogCategory.GENERAL,
  });

  // Get message ID for decryption
  const messageId = message.key?.id || message.id || `msg_${Date.now()}`;

  // Extract image URLs from WhatsApp media messages
  // WaSend provides encrypted URLs that need decryption via their API
  // Check MULTIPLE locations for imageMessage (WaSend payload variations)

  // Helper to process an imageMessage object
  const processImageMessage = async (imgMsg: any, source: string) => {
    const rawUrl = imgMsg.url;
    logger.info(
      `Image: Found in ${source}, URL: ${rawUrl?.substring(0, 80) || "none"}`,
      { category: LogCategory.IMAGE }
    );
    logger.info(
      `Image: Has mediaKey: ${!!imgMsg.mediaKey}, mimetype: ${imgMsg.mimetype || "unknown"}`,
      { category: LogCategory.IMAGE }
    );

    if (rawUrl) {
      // Check if this is an encrypted WhatsApp URL that needs decryption
      if (needsDecryption(rawUrl) && imgMsg.mediaKey) {
        logger.info("Image: Decrypting via WaSend API...", {
          category: LogCategory.IMAGE,
        });
        const decryptedUrl = await decryptWhatsAppImage(messageId, {
          url: rawUrl,
          mimetype: imgMsg.mimetype || "image/jpeg",
          mediaKey: imgMsg.mediaKey,
          fileSha256: imgMsg.fileSha256,
          fileLength: imgMsg.fileLength?.toString(),
        });
        if (decryptedUrl) {
          logger.info(
            `Image: Decryption successful! Public URL: ${decryptedUrl.substring(0, 80)}`,
            { category: LogCategory.IMAGE }
          );
          imageUrls.push(decryptedUrl);
        } else {
          logger.info(
            "Image: Decryption failed - marking imageDetectedButFailed",
            { category: LogCategory.IMAGE }
          );
          imageDetectedButFailed = true;
        }
      } else if (isPublicUrl(rawUrl)) {
        logger.info("Image: Already public URL", {
          category: LogCategory.IMAGE,
        });
        imageUrls.push(rawUrl);
      } else {
        logger.info(
          "Image: Encrypted but missing mediaKey - marking imageDetectedButFailed",
          { category: LogCategory.IMAGE }
        );
        imageDetectedButFailed = true;
      }
    }
  };

  // Location 1: message.message.imageMessage (standard WaSend format)
  if (message.message?.imageMessage) {
    await processImageMessage(
      message.message.imageMessage,
      "message.message.imageMessage"
    );
  }

  // Location 2: message.imageMessage directly (some WaSend variations)
  if (message.imageMessage && !message.message?.imageMessage) {
    await processImageMessage(message.imageMessage, "message.imageMessage");
  }

  // Location 3: data.imageMessage (if message IS the data object)
  if (message.data?.imageMessage && !message.message?.imageMessage) {
    await processImageMessage(
      message.data.imageMessage,
      "message.data.imageMessage"
    );
  }

  // Location 4-5: Fallback checks — ONLY if no images found from primary locations above
  // WaSender often provides the same image in multiple payload fields (imageMessage + mediaUrl),
  // but with different URLs (encrypted vs pre-decrypted). Skip fallbacks to avoid double-counting.
  if (imageUrls.length === 0) {
    // Location 4: Check if WaSend provides decryptedMediaUrl directly
    if (message.decryptedMediaUrl || message.message?.decryptedMediaUrl) {
      const url =
        message.decryptedMediaUrl || message.message?.decryptedMediaUrl;
      logger.info(`Image: Found decryptedMediaUrl: ${url?.substring(0, 80)}`, {
        category: LogCategory.IMAGE,
      });
      if (url && isPublicUrl(url)) {
        imageUrls.push(url);
      }
    }

    // Location 5: Check mediaUrl field (some webhook formats)
    if (message.mediaUrl && !imageUrls.includes(message.mediaUrl)) {
      logger.info(
        `Image: Found mediaUrl: ${message.mediaUrl.substring(0, 80)}`,
        { category: LogCategory.IMAGE }
      );
      if (isPublicUrl(message.mediaUrl)) {
        imageUrls.push(message.mediaUrl);
      }
    }
  }

  // Also check for document messages with images
  if (
    message.message?.documentMessage?.url &&
    message.message?.documentMessage?.mimetype?.startsWith("image/")
  ) {
    const docMsg = message.message.documentMessage;
    const rawUrl = docMsg.url;
    logger.info(
      "Found image in documentMessage, URL: " +
        (rawUrl?.substring(0, 80) || "none"),
      { category: LogCategory.GENERAL }
    );

    if (rawUrl) {
      if (needsDecryption(rawUrl) && docMsg.mediaKey) {
        logger.info("Decrypting document image via WaSend API...", {
          category: LogCategory.GENERAL,
        });
        const decryptedUrl = await decryptWhatsAppImage(messageId + "_doc", {
          url: rawUrl,
          mimetype: docMsg.mimetype,
          mediaKey: docMsg.mediaKey,
          fileSha256: docMsg.fileSha256,
          fileLength: docMsg.fileLength?.toString(),
          fileName: docMsg.fileName,
        });
        if (decryptedUrl) {
          logger.info("Document image decryption successful!", {
            category: LogCategory.GENERAL,
          });
          imageUrls.push(decryptedUrl);
        }
      } else if (isPublicUrl(rawUrl)) {
        imageUrls.push(rawUrl);
      }
    }
  }

  // Capture non-image document attachments (PDF, DOCX — e.g., title deeds)
  // These get persisted to Supabase Storage and tracked in pending_documents
  if (
    message.message?.documentMessage?.url &&
    !message.message?.documentMessage?.mimetype?.startsWith("image/")
  ) {
    const docMsg = message.message.documentMessage;
    const rawUrl = docMsg.url;
    const docMimetype = docMsg.mimetype || "application/octet-stream";
    const docFilename = docMsg.fileName || undefined;

    logger.info("Found non-image document attachment", {
      category: LogCategory.GENERAL,
      operation: "extractMessage",
      mimetype: docMimetype,
      filename: docFilename,
    });

    if (rawUrl) {
      let documentUrl: string | null = null;

      if (needsDecryption(rawUrl) && docMsg.mediaKey) {
        logger.info("Decrypting document via WaSend API...", {
          category: LogCategory.GENERAL,
        });
        documentUrl = await decryptWhatsAppImage(messageId + "_doc", {
          url: rawUrl,
          mimetype: docMimetype,
          mediaKey: docMsg.mediaKey,
          fileSha256: docMsg.fileSha256,
          fileLength: docMsg.fileLength?.toString(),
          fileName: docFilename,
        });
      } else if (isPublicUrl(rawUrl)) {
        documentUrl = rawUrl;
      }

      if (documentUrl) {
        // Persist to Supabase Storage for stable URL
        const persistedUrl = await persistDocument(
          documentUrl,
          docFilename,
          docMimetype
        );
        if (persistedUrl) {
          const phoneNumber =
            remoteJid?.split("@")[0]?.replace(/\D/g, "") || "";
          if (phoneNumber) {
            await addPendingDocument(
              phoneNumber,
              persistedUrl,
              docFilename,
              docMimetype
            );
          }

          // Use placeholder so AI knows a document was sent
          if (!userMessage || userMessage.trim() === "") {
            userMessage = `[User sent document: ${docFilename || "file"}]`;
          }
        }
      }
    }
  }

  // Support for test/simple webhook format with "media" array
  // Format: { from: "+123", body: "...", media: ["url1", "url2"] }
  // These are typically already public URLs from testing
  if (message.media && Array.isArray(message.media)) {
    for (const mediaUrl of message.media) {
      if (typeof mediaUrl === "string" && mediaUrl.startsWith("http")) {
        logger.info(
          "Found image URL in media array: " + mediaUrl.substring(0, 100),
          { category: LogCategory.GENERAL }
        );
        imageUrls.push(mediaUrl);
      }
    }
  }

  // Early image validation (before storage)
  let persistedImageUrls: string[] = [];
  if (imageUrls.length > 0) {
    logger.info("Validating images at ingress", {
      category: LogCategory.IMAGE,
      operation: "webhookImageValidation",
      imageCount: imageUrls.length,
    });

    const validation = await validateImagesAtIngress(imageUrls);

    // Log validation results
    if (validation.invalid.length > 0) {
      logger.warn("Some images failed validation at ingress", {
        category: LogCategory.IMAGE,
        operation: "webhookImageValidation",
        validCount: validation.valid.length,
        invalidCount: validation.invalid.length,
        invalidReasons: validation.invalid.map((i) => i.error),
      });
    }

    // Only persist valid images
    if (validation.valid.length > 0) {
      const validUrls = validation.valid.map((i) => i.url);
      logger.info(
        `Image: Persisting ${validUrls.length} valid image(s) to storage...`,
        { category: LogCategory.IMAGE }
      );
      const persistResults = await persistImages(validUrls);
      persistedImageUrls = persistResults.map((r) => r.url);

      if (persistResults.length > 0) {
        logger.info(
          `Image: Persisted ${persistResults.length} images to Supabase Storage`,
          { category: LogCategory.IMAGE }
        );

        // CRITICAL: Store images in pending_images table with content hash for dedup
        // Content hash prevents the same image from being stored twice even if
        // WhatsApp re-decrypts it into a different temporary URL
        const phoneNumber = remoteJid?.split("@")[0]?.replace(/\D/g, "") || "";
        if (phoneNumber) {
          logger.info("Storing images to pending queue with content hash", {
            category: LogCategory.IMAGE,
            count: persistResults.length,
          });
          await addPendingImages(
            phoneNumber,
            persistResults.map((r) => ({
              url: r.url,
              contentHash: r.contentHash,
            })),
            getContext().correlationId
          );
          logger.info("Images queued for property upload", {
            category: LogCategory.IMAGE,
            count: persistResults.length,
          });
        }
      } else if (validUrls.length > 0) {
        logger.warn("Image warning: Failed to persist any valid images", {
          category: LogCategory.IMAGE,
        });
      }
    }

    // If ALL images were invalid, send feedback to user
    if (validation.valid.length === 0 && validation.invalid.length > 0) {
      // Get the most helpful user message
      const userFeedback =
        validation.invalid[0].userMessage ||
        "These images could not be used. Please send photos directly from your phone gallery.";

      // Send feedback (this happens before AI processing)
      const phoneNumber = remoteJid?.split("@")[0]?.replace(/\D/g, "") || "";
      if (phoneNumber) {
        logger.info("Sending image validation feedback to user", {
          category: LogCategory.IMAGE,
          operation: "webhookImageValidation",
        });
        await sendTextMessage(phoneNumber, userFeedback);
      }
    }
  }

  if (!userMessage || userMessage.trim() === "") {
    // Allow messages with only images if they have a URL
    if (imageUrls.length > 0) {
      logger.info(
        "No text content but found images, using placeholder message",
        { category: LogCategory.GENERAL }
      );
      userMessage = "[User sent image(s)]";
    } else if (imageDetectedButFailed) {
      // Images were detected but decryption failed - don't drop the message!
      logger.info(
        "No text content, images detected but decryption failed - using failure placeholder",
        { category: LogCategory.GENERAL }
      );
      userMessage = "[User sent image(s) but decryption failed]";
    } else {
      logger.info("No text content found in message", {
        category: LogCategory.GENERAL,
      });
      return null;
    }
  }

  return { message, remoteJid, userMessage, imageUrls: persistedImageUrls };
}

/**
 * Generates a unique message key for deduplication
 */
export function generateMessageKey(message: any): string | null {
  // Try to extract a unique identifier from the message
  // Priority: message ID > key ID > timestamp + content hash

  if (message.key?.id) {
    return `key:${message.key.id}`;
  }

  if (message.id) {
    return `id:${message.id}`;
  }

  if (message.messageId) {
    return `msgid:${message.messageId}`;
  }

  // Fallback: create a hash from timestamp + first 50 chars of content
  const content =
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.text ||
    message.body ||
    "";
  const timestamp = message.messageTimestamp || Date.now();

  if (content) {
    const contentHash = content.substring(0, 50).replace(/\s+/g, "_");
    return `hash:${timestamp}_${contentHash}`;
  }

  return null;
}

/**
 * Formats text for WhatsApp - converts markdown bold to WhatsApp bold, preserves phone masking
 * Phone masking format: XX**YYYY (e.g., 99**1111)
 * Converts **text** to *text* for WhatsApp bold formatting
 */
export function formatForWhatsApp(text: string): string {
  let formatted = text;

  // Step 0a: Strip code blocks (```...```) - show content as plain text
  // Handle multiline code blocks with optional language specifier
  formatted = formatted.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1");
  // Handle inline code blocks (moved here for logical grouping)
  formatted = formatted.replace(/`([^`]+)`/g, "$1");

  // Step 0b: FIX single-asterisk phone masking (AI mistake) - convert 99*1111 to 99**1111
  // Pattern: 2 digits + single asterisk + 4 digits (but NOT already double asterisk)
  formatted = formatted.replace(/(\d{2})\*(\d{4})(?!\*)/g, "$1**$2");

  // Step 1: Protect phone masking patterns (XX**YYYY) with placeholder
  formatted = formatted.replace(/(\d{2})\*\*(\d{4})/g, "$1{{PHONE_MASK}}$2");

  // Step 2: Convert **text** markdown bold to *text* WhatsApp bold
  // This ensures field names requested by AI are properly bolded
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // Step 3: Restore phone masking pattern
  formatted = formatted.replace(/\{\{PHONE_MASK\}\}/g, "**");

  // Step 4: Add WhatsApp bold (*text*) to specific document labels
  // Match label at start of line or after newline, with or without leading spaces
  formatted = formatted.replace(/^(\s*)(My Mobile:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Registration Details:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Property:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Client Information:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Property Introduced:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Property Link:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Viewing Arranged for:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Fees:)/gm, "$1*$2*");
  formatted = formatted.replace(/^(\s*)(Marketing Price:)/gm, "$1*$2*");

  // Step 5: Apply property description formatting to "Property Introduced" and "Property:" lines
  // This normalizes reg numbers to "Reg No.", title-cases locations, and handles Dimos
  formatted = formatted.replace(
    /^(\s*\*?Property Introduced:\*?\s*)(.+)$/gm,
    (_match, label, content) => `${label}${formatPropertyDescription(content)}`
  );
  formatted = formatted.replace(
    /^(\s*\*?Property:\*?\s*)(.+)$/gm,
    (_match, label, content) => `${label}${formatPropertyDescription(content)}`
  );

  // Remove header markers # Header -> Header
  formatted = formatted.replace(/^#{1,6}\s+/gm, "");
  // Clean up excessive whitespace but preserve single newlines
  formatted = formatted.replace(/[ \t]+/g, " ");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  return formatted.trim();
}

/**
 * Parses CREA wording response into 3 separate messages
 * Message 1: Intro text
 * Message 2: The actual CREA wording (copy-pasteable) - with agent's landline auto-populated
 * Message 3: Important note about landline
 */
export function parseCREAResponse(
  text: string,
  agentLandline?: string
): string[] {
  const messages: string[] = [];

  // The CREA wording block that should be standalone
  // Auto-populate agent's landline if available
  const phoneLine = agentLandline
    ? `+357 ${agentLandline}`
    : "+357 (your land line) [optional]";

  const creaBlock = `Licensed Real Estate Agency
CREA Reg. No. 742 & CREA Lic. No. 378/E
CSC Zyprus Property Group LTD
${phoneLine}`;

  // Check if response contains the CREA block pattern
  const hasCreaCert =
    text.includes("Licensed Real Estate Agency") &&
    text.includes("CREA Reg") &&
    text.includes("CSC Zyprus");

  if (!hasCreaCert) {
    return [formatForWhatsApp(text)];
  }

  // Message 1: Intro
  const introText =
    "Of course. Here is the required CREA wording that should be added below each property post you make on social media or other online platforms:";
  messages.push(introText);

  // Message 2: The CREA wording block (standalone for copy-paste)
  messages.push(creaBlock);

  // Message 3: Important note
  const noteText =
    "Important Note: For professional compliance, it is recommended to use your Zyprus landline in online posts, which is already connected to your mobile phone, rather than your personal mobile number.";
  messages.push(noteText);

  logger.info("[CREA] Split into 3 messages for social media wording", {
    category: LogCategory.GENERAL,
  });
  return messages;
}

/**
 * Parses a template response into separate parts: Subject, Body, and Notes (if any)
 * Returns an array of message parts to be sent separately
 * @param text - The AI response text
 * @param agentLandline - Optional agent landline for CREA wording auto-population
 */
export function parseTemplateResponse(
  text: string,
  agentLandline?: string
): string[] {
  const messages: string[] = [];

  // Check for CREA wording response - split into 3 messages
  // Trigger if response contains the CREA block (Licensed Real Estate Agency + CREA Reg + CSC Zyprus)
  const lowerText = text.toLowerCase();
  const hasCreaBlock =
    lowerText.includes("licensed real estate agency") &&
    lowerText.includes("crea reg") &&
    lowerText.includes("csc zyprus");
  if (hasCreaBlock) {
    // This is a CREA wording response - split into 3 messages with agent's landline
    const creaSplit = parseCREAResponse(text, agentLandline);
    if (creaSplit.length > 1) {
      return creaSplit;
    }
  }

  // Check if this is a template response with Subject line
  if (!text.includes("Subject:")) {
    // Not a template - return as single message
    return [formatForWhatsApp(text)];
  }

  // Split by lines for easier processing
  const lines = text.split("\n");

  let subjectLine = "";
  const bodyLines: string[] = [];
  const noteLines: string[] = [];
  let inNote = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Extract Subject line (first line starting with "Subject:")
    if (trimmedLine.startsWith("Subject:") && !subjectLine) {
      subjectLine = trimmedLine;
      continue;
    }

    // ONLY these are separate notes - NOT "Looking forward", "For the confirmation", "Please confirm"
    // Only actual explicit notes/reminders get separated
    const lowerLine = trimmedLine.toLowerCase();
    if (
      lowerLine.startsWith("note:") ||
      lowerLine.startsWith("reminder:") ||
      lowerLine.startsWith("important:") ||
      lowerLine.startsWith("n.b.") ||
      lowerLine.startsWith("nb:") ||
      (lowerLine.includes("warning") && lowerLine.includes("reminder"))
    ) {
      inNote = true;
    }

    if (inNote) {
      noteLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }

  // Add Subject as first message
  if (subjectLine) {
    messages.push(formatForWhatsApp(subjectLine));
  }

  // Add Body as second message (includes confirmation text, looking forward, etc.)
  const bodyText = bodyLines.join("\n").trim();
  if (bodyText) {
    messages.push(formatForWhatsApp(bodyText));
  }

  // Add Notes as third message ONLY if there's an actual Note/Reminder section
  const noteText = noteLines.join("\n").trim();
  if (noteText) {
    messages.push(formatForWhatsApp(noteText));
  }

  // If we somehow ended up with no messages, return original as single message
  if (messages.length === 0) {
    return [formatForWhatsApp(text)];
  }

  logger.info(
    `Parsed template into ${messages.length} parts: Subject="${subjectLine.substring(0, 50)}...", Body=${bodyText.length} chars, Notes=${noteText.length} chars`,
    { category: LogCategory.GENERAL }
  );

  return messages;
}
