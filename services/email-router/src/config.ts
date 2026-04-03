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
    enabled: !!(process.env.SOPHIA_GMAIL_EMAIL && process.env.SOPHIA_GMAIL_APP_PASSWORD),
    botUrl: process.env.SOPHIA_BOT_URL || "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot",
    pollingIntervalMs: 1 * 60 * 1000, // 1 minute
    storageBucket: "email-attachments",
  },
  polling: {
    intervalMs: 30 * 60 * 1000, // 30 minutes
  },
  port: parseInt(process.env.PORT || "3000", 10),
} as const;
