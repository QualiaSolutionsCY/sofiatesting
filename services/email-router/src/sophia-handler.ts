/**
 * Sophia Email Handler
 *
 * Polls sophia@zyprus.com IMAP for unread emails.
 * For each email:
 *  1. Extract text content + image attachments
 *  2. Upload image attachments to Supabase storage → public URLs
 *  3. Call sophia-bot /email endpoint with content
 *  4. Send AI reply back to sender via Resend (from sophia@zyprus.com)
 *  5. Mark email as read
 *  6. Log to console
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import {
  downloadImageUrl,
  type EmailAttachment,
  extractDocumentAttachments,
  extractInlineImageUrls,
  fetchSophiaUnreadEmails,
  markSophiaEmailAsRead,
  sendSophiaReply,
} from "./gmail.js";

let isSophiaRunning = false;
let lastSophiaRunAt: Date | null = null;
let lastSophiaStats = { processed: 0, replied: 0, errors: 0 };

/**
 * Upload an image attachment to Supabase storage
 * Returns the public URL or null on failure
 */
async function uploadAttachmentToStorage(
  attachment: EmailAttachment,
  supabaseUrl: string,
  serviceRoleKey: string,
  bucket: string
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Generate unique filename
  const ext = attachment.contentType.split("/")[1] || "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `email-attachments/${filename}`;

  try {
    // Ensure bucket exists (create if not)
    const { error: bucketError } = await supabase.storage.createBucket(bucket, {
      public: true,
    });
    // Ignore "already exists" error
    if (bucketError && !bucketError.message.includes("already exists")) {
      console.warn(`[Sophia] Bucket create warning: ${bucketError.message}`);
    }

    // Upload the file
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, attachment.content, {
        contentType: attachment.contentType,
        upsert: false,
      });

    if (error) {
      console.error(
        `[Sophia] Upload error for ${attachment.filename}:`,
        error.message
      );
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData?.publicUrl || null;
  } catch (err) {
    console.error(
      `[Sophia] Failed to upload attachment ${attachment.filename}:`,
      err
    );
    return null;
  }
}

/**
 * Call the sophia-bot /email endpoint
 */
async function callSophiaBot(payload: {
  from: string;
  fromName: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  imageUrls?: string[];
  documentUrls?: string[];
}): Promise<{ success: boolean; reply: string }> {
  const url = `${config.sophia.botUrl}/email`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": config.supabase.adminSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000), // 2 min — AI calls can take a while
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Sophia] Bot returned ${response.status}: ${errText}`);
      return {
        success: false,
        reply:
          "I encountered an issue processing your email. Please try again.",
      };
    }

    const data = (await response.json()) as { success: boolean; reply: string };
    return data;
  } catch (err) {
    console.error("[Sophia] Failed to call sophia-bot:", err);
    return {
      success: false,
      reply: "I encountered an issue processing your email. Please try again.",
    };
  }
}

/**
 * Main sophia email processing loop
 * Called on its own interval (every 5 minutes by default)
 */
export async function processSophiaEmails(): Promise<void> {
  if (!config.sophia.enabled) {
    return;
  }

  if (isSophiaRunning) {
    console.log("[Sophia] Previous run still in progress, skipping");
    return;
  }

  isSophiaRunning = true;
  const stats = { processed: 0, replied: 0, errors: 0 };

  try {
    console.log(
      `[${new Date().toISOString()}] [Sophia] Starting email processing...`
    );

    // Fetch unread emails from sophia@zyprus.com
    const emails = await fetchSophiaUnreadEmails();
    console.log(`[Sophia] Found ${emails.length} unread emails`);

    for (const email of emails) {
      try {
        stats.processed++;

        console.log(
          `[Sophia] Processing: "${email.subject}" from ${email.from}`
        );

        // Upload image attachments to Supabase storage
        const imageUrls: string[] = [];
        if (email.parsedAttachments.length > 0) {
          console.log(
            `[Sophia] Uploading ${email.parsedAttachments.length} image attachment(s)...`
          );
          for (const attachment of email.parsedAttachments) {
            const publicUrl = await uploadAttachmentToStorage(
              attachment,
              config.supabase.url,
              config.supabase.serviceRoleKey,
              config.sophia.storageBucket
            );
            if (publicUrl) {
              imageUrls.push(publicUrl);
              console.log(
                `[Sophia] Uploaded ${attachment.filename} → ${publicUrl}`
              );
            }
          }
        }

        // Upload document attachments (PDFs, DOCX, KMZ, etc.)
        const documentUrls: string[] = [];
        const docAttachments = extractDocumentAttachments(email as any);
        if (docAttachments.length > 0) {
          process.stdout.write(
            `[Sophia] Uploading ${docAttachments.length} document attachment(s)...\n`
          );
          for (const doc of docAttachments) {
            const publicUrl = await uploadAttachmentToStorage(
              doc,
              config.supabase.url,
              config.supabase.serviceRoleKey,
              config.sophia.storageBucket
            );
            if (publicUrl) {
              documentUrls.push(publicUrl);
              process.stdout.write(
                `[Sophia] Uploaded doc ${doc.filename} → ${publicUrl}\n`
              );
            }
          }
        }

        // If no MIME attachments, check for inline/embedded images in HTML body
        // (Gmail often converts attached images to inline googleusercontent URLs
        // or Google Drive links instead of keeping them as MIME attachments)
        if (imageUrls.length === 0 && email.htmlBody) {
          const inlineUrls = extractInlineImageUrls(email.htmlBody);
          if (inlineUrls.length > 0) {
            console.log(
              `[Sophia] Found ${inlineUrls.length} inline image(s) in HTML body, downloading...`
            );
            for (const inlineUrl of inlineUrls) {
              const attachment = await downloadImageUrl(inlineUrl);
              if (attachment) {
                const publicUrl = await uploadAttachmentToStorage(
                  attachment,
                  config.supabase.url,
                  config.supabase.serviceRoleKey,
                  config.sophia.storageBucket
                );
                if (publicUrl) {
                  imageUrls.push(publicUrl);
                  console.log(`[Sophia] Uploaded inline image → ${publicUrl}`);
                }
              }
            }
          }
        }

        // Call sophia-bot AI endpoint
        const botResult = await callSophiaBot({
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          textBody: email.textBody,
          htmlBody: email.htmlBody || undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          documentUrls: documentUrls.length > 0 ? documentUrls : undefined,
        });

        // Send AI reply back to sender
        const replied = await sendSophiaReply(
          email.from,
          email.fromName,
          email.subject,
          botResult.reply,
          email.messageId,
          config.resend.apiKey
        );

        if (replied) {
          stats.replied++;
        }

        // Mark email as read
        await markSophiaEmailAsRead(email.uid);

        console.log(
          `[Sophia] Processed "${email.subject}" from ${email.from} — replied: ${replied}, images: ${imageUrls.length}`
        );
      } catch (emailErr) {
        stats.errors++;
        console.error(
          `[Sophia] Error processing email "${email.subject}":`,
          emailErr
        );
        // Still try to mark as read to avoid reprocessing on next poll
        try {
          await markSophiaEmailAsRead(email.uid);
        } catch {
          // ignore
        }
      }
    }

    lastSophiaRunAt = new Date();
    lastSophiaStats = stats;
    console.log(
      `[${lastSophiaRunAt.toISOString()}] [Sophia] Done. Processed: ${stats.processed}, Replied: ${stats.replied}, Errors: ${stats.errors}`
    );
  } catch (err) {
    console.error("[Sophia] Email processing failed:", err);
  } finally {
    isSophiaRunning = false;
  }
}

/**
 * Get sophia processing status for health check
 */
export function getSophiaStatus() {
  return {
    enabled: config.sophia.enabled,
    email: config.sophia.email || null,
    lastRun: lastSophiaRunAt?.toISOString() || null,
    lastStats: lastSophiaStats,
    isRunning: isSophiaRunning,
    pollingIntervalSec: config.sophia.pollingIntervalMs / 1000,
    nextRunIn: lastSophiaRunAt
      ? `${Math.max(0, Math.round((config.sophia.pollingIntervalMs - (Date.now() - lastSophiaRunAt.getTime())) / 1000))}s`
      : "starting soon",
  };
}
