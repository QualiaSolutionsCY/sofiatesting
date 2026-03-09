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
  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  polling: {
    intervalMs: 30 * 60 * 1000, // 30 minutes
  },
  port: parseInt(process.env.PORT || "3000", 10),
} as const;
