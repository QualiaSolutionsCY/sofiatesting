# Plan: 23 — Email Listing Upload via sophia@zyprus.com

**Mode:** quick
**Created:** 2026-03-11

## Architecture Decision

The email router (Railway/Node.js) already polls info@zyprus.com. The sophia-bot (Supabase Edge Function/Deno) has ALL the AI, tools, and property upload logic.

**Approach:**
1. Add an email inbound handler to sophia-bot edge function (`/sophia-bot/email`)
2. Add sophia@zyprus.com IMAP polling to the email router
3. Email router detects emails to sophia@zyprus.com → calls sophia-bot `/email` endpoint
4. sophia-bot processes via same AI pipeline → returns reply text
5. Email router sends reply via Resend

**User ID for email conversations:** sender email address (keeps email chat_history separate from WhatsApp)

## Task 1: Add email webhook handler to sophia-bot

**What:** Create `supabase/functions/sophia-bot/handlers/email-webhook.ts` — a new handler that:
- Accepts POST with `{ from, fromName, subject, textBody, htmlBody, imageUrls, attachmentUrls }`
- Authenticates via `X-Admin-Secret` header
- Identifies agent by email using existing `getAgentByEmail()`
- Uses sender email as userId for chat_history
- Builds system prompt (same as WhatsApp flow)
- Runs AI chat with all tools enabled (createPropertyListing, createLandListing, etc.)
- Stores messages in chat_history (user message + AI response)
- Returns JSON: `{ reply: string, success: boolean }`

**Files:**
- CREATE: `supabase/functions/sophia-bot/handlers/email-webhook.ts`
- MODIFY: `supabase/functions/sophia-bot/index.ts` — add `/sophia-bot/email` route

**Done when:** sophia-bot has a working `/email` endpoint that processes email content through the full AI pipeline

## Task 2: Add sophia@zyprus.com processing to email router

**What:** Add a handler in the email router that:
- Polls sophia@zyprus.com IMAP (separate credentials: `SOPHIA_GMAIL_EMAIL`, `SOPHIA_GMAIL_APP_PASSWORD`)
- Extracts email content + inline images + attachments
- Uploads image attachments to Supabase storage to get public URLs
- Calls sophia-bot `/sophia-bot/email` endpoint via HTTP POST
- Sends AI reply back to sender via Resend (from sophia@zyprus.com)
- Logs to database for tracking
- Runs on same polling interval as info@ (30 min), or shorter (5 min)

**Files:**
- CREATE: `services/email-router/src/sophia-handler.ts` — sophia email processing logic
- MODIFY: `services/email-router/src/config.ts` — add sophia IMAP credentials (optional env)
- MODIFY: `services/email-router/src/index.ts` — add sophia polling loop
- MODIFY: `services/email-router/src/gmail.ts` — add attachment extraction, second mailbox support

**Done when:** Email router can poll sophia@zyprus.com, process emails through sophia-bot, and reply

## Task 3: Deploy and verify

**What:**
- Deploy sophia-bot edge function: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
- Deploy email router to Railway (git push)
- Verify health checks
- Set required Railway env vars: `SOPHIA_GMAIL_EMAIL`, `SOPHIA_GMAIL_APP_PASSWORD`, `SOPHIA_BOT_URL`

**Done when:** Both services deployed and running
