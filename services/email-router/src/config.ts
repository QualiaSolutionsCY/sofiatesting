/**
 * Environment configuration for Email Router
 * All secrets come from Railway environment variables
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  gmail: {
    email: required("GMAIL_EMAIL"),
    appPassword: required("GMAIL_APP_PASSWORD"),
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
  },
  resend: {
    apiKey: required("RESEND_API_KEY"),
  },
  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    adminSecret: required("SOPHIA_ADMIN_SECRET"),
  },
  sophia: {
    email: process.env.SOPHIA_GMAIL_EMAIL || "",
    appPassword: process.env.SOPHIA_GMAIL_APP_PASSWORD || "",
    enabled: !!(
      process.env.SOPHIA_GMAIL_EMAIL && process.env.SOPHIA_GMAIL_APP_PASSWORD
    ),
    botUrl:
      process.env.SOPHIA_BOT_URL ||
      "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot",
    pollingIntervalMs: 1 * 60 * 1000, // 1 minute
    storageBucket: "email-attachments",
  },
  polling: {
    intervalMs: 30 * 60 * 1000, // 30 minutes
    // info@ inbox lead-routing is opt-out via env. Defaults ON for backwards
    // compatibility; set INFO_POLLING_ENABLED=false in Railway when the
    // inbox is intentionally disabled (avoids periodic AUTHENTICATIONFAILED
    // log spam from invalid credentials).
    enabled: process.env.INFO_POLLING_ENABLED !== "false",
    // When true, only enqueue Paphos leads for delayed forward; leave
    // non-Paphos and unroutable emails untouched (unread) for human handling.
    paphosOnly: process.env.INFO_PAPHOS_ONLY === "true",
    // Delay in minutes between Paphos lead intake and the actual forward.
    // Defaults to 20. Only meaningful when paphosOnly is true.
    forwardDelayMinutes: Number.parseInt(
      process.env.INFO_FORWARD_DELAY_MINUTES || "20",
      10
    ),
  },
  // info@ Sophia AI auto-reply flag. When ON, Paphos-region leads landing in
  // info@zyprus.com get an AI reply (composed by sophia-bot /email) sent from
  // info@ via Resend, in addition to the existing forward to a Paphos agent.
  // Defaults OFF — must be explicitly enabled in Railway (INFO_PAPHOS_AI_REPLY=true).
  info: {
    paphosAiReply: process.env.INFO_PAPHOS_AI_REPLY === "true",
    // From-address for AI replies on info@ leads. Defaults to GMAIL_EMAIL.
    replyFromAddress: process.env.INFO_REPLY_FROM || process.env.GMAIL_EMAIL || "",
  },
  port: Number.parseInt(process.env.PORT || "3000", 10),
} as const;
