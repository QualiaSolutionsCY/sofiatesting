/**
 * Gmail IMAP/SMTP Client
 *
 * Reads emails via IMAP, forwards via SMTP, creates drafts via IMAP APPEND.
 * Uses app password authentication (info@zyprus.com).
 */

import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { config } from "./config.js";

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
  });
}

/**
 * Create an SMTP transporter
 */
function createSmtpTransporter(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.gmail.smtpHost,
    port: config.gmail.smtpPort,
    secure: true,
    auth: {
      user: config.gmail.email,
      pass: config.gmail.appPassword,
    },
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
 * Forward an email to a recipient
 */
export async function forwardEmail(
  original: EmailMessage,
  toEmail: string,
  agentName: string
): Promise<boolean> {
  const transporter = createSmtpTransporter();

  const forwardSubject = original.subject.startsWith("Fwd:")
    ? original.subject
    : `Fwd: ${original.subject}`;

  const forwardBody = `
---------- Forwarded message ----------
From: ${original.fromName} <${original.from}>
Date: ${original.date.toLocaleString("en-GB", { timeZone: "Asia/Nicosia" })}
Subject: ${original.subject}
To: ${config.gmail.email}

${original.textBody}
`.trim();

  const htmlForwardBody = `
<div style="font-family: Arial, sans-serif; padding: 10px;">
  <p>Hi ${agentName.split(" ")[0]},</p>
  <p>SOPHIA has forwarded this email to you based on your region assignment.</p>
  <hr style="border: 1px solid #ddd;" />
  <p style="color: #666; font-size: 12px;">
    <strong>From:</strong> ${original.fromName} &lt;${original.from}&gt;<br/>
    <strong>Date:</strong> ${original.date.toLocaleString("en-GB", { timeZone: "Asia/Nicosia" })}<br/>
    <strong>Subject:</strong> ${original.subject}
  </p>
  ${original.htmlBody || `<p>${original.textBody.replace(/\n/g, "<br/>")}</p>`}
</div>
`.trim();

  try {
    await transporter.sendMail({
      from: `SOPHIA <${config.gmail.email}>`,
      to: toEmail,
      subject: forwardSubject,
      text: forwardBody,
      html: htmlForwardBody,
      replyTo: original.from,
    });
    console.log(`Forwarded email "${original.subject}" to ${toEmail}`);
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
