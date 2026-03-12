/**
 * Gmail IMAP/SMTP Client
 *
 * Reads emails via IMAP, forwards via SMTP, creates drafts via IMAP APPEND.
 * Uses app password authentication (info@zyprus.com and sophia@zyprus.com).
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { config } from "./config.js";

/**
 * Convert markdown-style text to HTML for email replies.
 * Handles: **bold**, *italic*, bullet points, URLs, newlines.
 */
function markdownToHtml(text: string): string {
  let html = text
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Convert **bold** to <strong>
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Convert *italic* (but not already-converted <strong> tags)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    // Convert URLs to clickable links
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    // Convert bullet points (• or - at line start)
    .replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>")
    // Convert newlines to <br>
    .replace(/\n/g, "<br/>");

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li>.*?<\/li><br\/>?)+)/g, (match) => {
    const cleaned = match.replace(/<br\/>/g, "");
    return `<ul>${cleaned}</ul>`;
  });

  return `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${html}</div>`;
}

export interface EmailMessage {
  messageId: string;
  uid: number;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  date: Date;
  raw: Buffer;
}

/**
 * Create an IMAP client connection
 */
function createImapClient(): ImapFlow {
  return new ImapFlow({
    host: config.gmail.imapHost,
    port: config.gmail.imapPort,
    secure: true,
    auth: {
      user: config.gmail.email,
      pass: config.gmail.appPassword,
    },
    logger: false,
    socketTimeout: 30_000,
  });
}


/**
 * Fetch unread emails from inbox
 */
export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  const client = createImapClient();
  const emails: EmailMessage[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen (unread) messages
      const messages = client.fetch(
        { seen: false },
        {
          source: true,
          envelope: true,
          uid: true,
        }
      );

      for await (const msg of messages) {
        try {
          const source = msg.source;
          if (!source) continue;

          const parsed = await simpleParser(source) as ParsedMail;

          const fromAddr = parsed.from?.value?.[0];
          emails.push({
            messageId: parsed.messageId || `uid-${msg.uid}`,
            uid: msg.uid,
            from: fromAddr?.address || "",
            fromName: fromAddr?.name || "",
            to: (parsed.to && !Array.isArray(parsed.to) ? [parsed.to] : parsed.to as any)
              ?.map((t: any) => t?.value?.[0]?.address)
              .filter(Boolean) || [],
            subject: parsed.subject || "(no subject)",
            textBody: parsed.text || "",
            htmlBody: parsed.html || "",
            date: parsed.date || new Date(),
            raw: source,
          });
        } catch (parseErr) {
          console.error(`Failed to parse email uid=${msg.uid}:`, parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("IMAP fetch error:", err);
    try { await client.logout(); } catch { /* ignore */ }
  }

  return emails;
}

/**
 * Mark an email as read (seen)
 */
export async function markAsRead(uid: number): Promise<void> {
  const client = createImapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`Failed to mark uid=${uid} as read:`, err);
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Forward an email to a recipient via Resend API
 * (Railway blocks outbound SMTP, so we use Resend instead)
 */
export async function forwardEmail(
  original: EmailMessage,
  toEmail: string,
  _agentName: string
): Promise<boolean> {
  const forwardSubject = original.subject.startsWith("Fwd:")
    ? original.subject
    : `Fwd: ${original.subject}`;

  // Clean forward — just the original email content, no added text
  const body = original.htmlBody || `<p>${original.textBody.replace(/\n/g, "<br/>")}</p>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${original.fromName || original.from} <sophia@zyprus.com>`,
        to: toEmail,
        subject: forwardSubject,
        html: body,
        text: original.textBody,
        reply_to: original.from,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Resend API error (${response.status}):`, err);
      return false;
    }

    console.log(`Forwarded email "${original.subject}" to ${toEmail} via Resend`);
    return true;
  } catch (err) {
    console.error(`Failed to forward email to ${toEmail}:`, err);
    return false;
  }
}

/**
 * Fetch email templates from Gmail's "Templates" label
 */
export async function fetchTemplates(): Promise<Map<string, { subject: string; html: string; text: string }>> {
  const client = createImapClient();
  const templates = new Map<string, { subject: string; html: string; text: string }>();

  try {
    await client.connect();

    // List all mailboxes to find Templates folder
    const mailboxes = await client.list();
    let templateFolder: string | null = null;

    for (const mb of mailboxes) {
      const name = mb.path.toLowerCase();
      if (name.includes("template") || name.includes("draft")) {
        // Gmail templates are actually stored as canned responses,
        // but for this implementation we use a "Templates" label
        if (name.includes("template")) {
          templateFolder = mb.path;
          break;
        }
      }
    }

    if (!templateFolder) {
      // Try [Gmail]/Drafts as fallback to read template drafts
      templateFolder = "[Gmail]/Drafts";
      console.log("No Templates label found, checking Drafts for templates");
    }

    const lock = await client.getMailboxLock(templateFolder);
    try {
      // Fetch all messages in the templates folder
      const messages = client.fetch("1:*", {
        source: true,
        envelope: true,
      });

      for await (const msg of messages) {
        try {
          const source = msg.source;
          if (!source) continue;
          const parsed = await simpleParser(source) as ParsedMail;
          const name = parsed.subject || `template-${msg.seq}`;
          templates.set(name.toLowerCase(), {
            subject: parsed.subject || "",
            html: parsed.html || "",
            text: parsed.text || "",
          });
        } catch {
          // Skip unparseable templates
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("Failed to fetch templates:", err);
    try { await client.logout(); } catch { /* ignore */ }
  }

  return templates;
}

/**
 * Create a draft reply in Gmail
 */
export async function createDraft(
  inReplyTo: EmailMessage,
  subject: string,
  htmlBody: string,
  textBody: string
): Promise<boolean> {
  const client = createImapClient();

  try {
    await client.connect();

    // Build the raw RFC822 message for the draft
    const boundary = `----=_Part_${Date.now()}`;
    const rawMessage = [
      `From: SOPHIA <${config.gmail.email}>`,
      `To: ${inReplyTo.from}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${inReplyTo.messageId}`,
      `References: ${inReplyTo.messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      textBody,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
      ``,
      `--${boundary}--`,
    ].join("\r\n");

    // Append to Drafts folder
    await client.append("[Gmail]/Drafts", rawMessage, ["\\Draft"]);
    console.log(`Created draft reply to "${subject}" for ${inReplyTo.from}`);

    await client.logout();
    return true;
  } catch (err) {
    console.error("Failed to create draft:", err);
    try { await client.logout(); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Extracted image attachment from a parsed email
 */
export interface EmailAttachment {
  content: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Extract image attachments from a parsed email
 * Returns only image/* MIME types as Buffer objects
 */
export function extractAttachments(parsed: ParsedMail): EmailAttachment[] {
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return [];
  }

  return parsed.attachments
    .filter((att) => att.contentType.startsWith("image/"))
    .map((att) => ({
      content: att.content as Buffer,
      contentType: att.contentType,
      filename: att.filename || `image-${Date.now()}.jpg`,
    }));
}

/**
 * Create an IMAP client for sophia@zyprus.com
 */
export function createSophiaImapClient(): ImapFlow {
  return new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: config.sophia.email,
      pass: config.sophia.appPassword,
    },
    logger: false,
    socketTimeout: 30_000,
  });
}

/**
 * Fetch unread emails from sophia@zyprus.com inbox
 * Returns emails with their parsed attachments for image extraction
 */
export async function fetchSophiaUnreadEmails(): Promise<Array<EmailMessage & { parsedAttachments: EmailAttachment[] }>> {
  const client = createSophiaImapClient();
  const emails: Array<EmailMessage & { parsedAttachments: EmailAttachment[] }> = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const messages = client.fetch(
        { seen: false },
        {
          source: true,
          envelope: true,
          uid: true,
        }
      );

      for await (const msg of messages) {
        try {
          const source = msg.source;
          if (!source) continue;

          const parsed = await simpleParser(source) as ParsedMail;
          const fromAddr = parsed.from?.value?.[0];
          const attachments = extractAttachments(parsed);

          emails.push({
            messageId: parsed.messageId || `uid-${msg.uid}`,
            uid: msg.uid,
            from: fromAddr?.address || "",
            fromName: fromAddr?.name || "",
            to: (parsed.to && !Array.isArray(parsed.to) ? [parsed.to] : parsed.to as any)
              ?.map((t: any) => t?.value?.[0]?.address)
              .filter(Boolean) || [],
            subject: parsed.subject || "(no subject)",
            textBody: parsed.text || "",
            htmlBody: parsed.html || "",
            date: parsed.date || new Date(),
            raw: source,
            parsedAttachments: attachments,
          });
        } catch (parseErr) {
          console.error(`[Sophia] Failed to parse email uid=${msg.uid}:`, parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("[Sophia] IMAP fetch error:", err);
    try { await client.logout(); } catch { /* ignore */ }
  }

  return emails;
}

/**
 * Mark a sophia@zyprus.com email as read
 */
export async function markSophiaEmailAsRead(uid: number): Promise<void> {
  const client = createSophiaImapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`[Sophia] Failed to mark uid=${uid} as read:`, err);
    try { await client.logout(); } catch { /* ignore */ }
  }
}

/**
 * Send a reply from sophia@zyprus.com via Resend API
 */
export async function sendSophiaReply(
  toEmail: string,
  _toName: string,
  subject: string,
  replyBody: string,
  inReplyToMessageId: string,
  resendApiKey: string
): Promise<boolean> {
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  const htmlBody = markdownToHtml(replyBody);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SOPHIA <sophia@zyprus.com>",
        to: toEmail,
        subject: replySubject,
        html: htmlBody,
        text: replyBody,
        headers: {
          "In-Reply-To": inReplyToMessageId,
          "References": inReplyToMessageId,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[Sophia] Resend API error (${response.status}):`, err);
      return false;
    }

    console.log(`[Sophia] Sent reply to ${toEmail} for "${subject}" via Resend`);
    return true;
  } catch (err) {
    console.error(`[Sophia] Failed to send reply to ${toEmail}:`, err);
    return false;
  }
}
