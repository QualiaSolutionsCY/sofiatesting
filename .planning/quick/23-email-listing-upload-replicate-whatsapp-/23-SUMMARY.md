---
quick_task: 23
title: Email Listing Upload via sophia@zyprus.com
date: 2026-03-11
status: complete
commits:
  - 92c5650
  - ebfeead
duration_min: 4
---

# Quick Task 23: Email Listing Upload via sophia@zyprus.com Summary

**One-liner:** Email pipeline routing sophia@zyprus.com inbound mail through the full sophia-bot AI pipeline (agent identification, property upload tools, chat history) with Supabase storage for image attachments.

## What Was Built

### Task 1: sophia-bot email endpoint

**Created:** `supabase/functions/sophia-bot/handlers/email-webhook.ts`

POST `/sophia-bot/email` endpoint:
- Authenticates via `X-Admin-Secret` header (same as admin endpoints, using `constantTimeCompare`)
- Identifies agent by sender email using `getAgentByEmail()`
- Uses sender email as `userId` in `chat_history` (keeps email threads separate from WhatsApp)
- Combines subject + body as user message for full context
- Uploads image attachments as public URLs (passed in from email-router)
- Calls `buildSystemPrompt()` + `chat()` — the same AI pipeline as WhatsApp
- Stores both user message and AI response in `chat_history`
- Returns `{ success, reply, toolsUsed, agentFound, agentName }`

**Modified:** `supabase/functions/sophia-bot/index.ts`

Added route before webhook catch-all:
```
if (url.pathname.endsWith("/email") && req.method === "POST") → handleEmailWebhook
```

### Task 2: email-router sophia handler

**Created:** `services/email-router/src/sophia-handler.ts`

- `processSophiaEmails()` — polls sophia@ IMAP, uploads attachments to Supabase storage bucket `email-attachments`, calls sophia-bot `/email`, replies via Resend from sophia@zyprus.com, marks email as read
- `getSophiaStatus()` — returns polling status for health check
- Handles errors gracefully: on failure, marks email as read to avoid reprocessing

**Modified:** `services/email-router/src/config.ts`

Added `config.sophia` block (opt-in, won't break existing deploy if env vars absent):
- `SOPHIA_GMAIL_EMAIL` — sophia@zyprus.com address
- `SOPHIA_GMAIL_APP_PASSWORD` — app password for IMAP
- `SOPHIA_BOT_URL` — defaults to Supabase function URL
- `pollingIntervalMs: 5 * 60 * 1000` (5 minutes)
- `storageBucket: "email-attachments"`

**Modified:** `services/email-router/src/gmail.ts`

Added sophia-specific IMAP functions:
- `extractAttachments(parsed)` — filters `image/*` attachments from parsed email
- `createSophiaImapClient()` — IMAP client using sophia credentials
- `fetchSophiaUnreadEmails()` — polls sophia@ inbox, returns emails with `parsedAttachments`
- `markSophiaEmailAsRead(uid)` — marks sophia@ emails as read
- `sendSophiaReply(...)` — sends reply via Resend from `sophia@zyprus.com`

**Modified:** `services/email-router/src/index.ts`

- Import and run `processSophiaEmails()` on 5-minute interval (30s delayed start to avoid congestion)
- Added `/trigger/sophia` manual trigger endpoint
- Updated `/health` to include `sophiaMailbox` status block

### Task 3: Deploy

- sophia-bot deployed: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
- Health check: HTTP 200 confirmed
- Branch pushed to trigger Railway redeploy

## Key Files

| File | Action |
|------|--------|
| `supabase/functions/sophia-bot/handlers/email-webhook.ts` | Created |
| `supabase/functions/sophia-bot/index.ts` | Modified — added /email route |
| `services/email-router/src/sophia-handler.ts` | Created |
| `services/email-router/src/config.ts` | Modified — sophia config block |
| `services/email-router/src/gmail.ts` | Modified — sophia IMAP + attachment extraction |
| `services/email-router/src/index.ts` | Modified — sophia polling loop |

## Required Railway Env Vars

Set these in Railway for the email-router service to enable sophia@ polling:

```
SOPHIA_GMAIL_EMAIL=sophia@zyprus.com
SOPHIA_GMAIL_APP_PASSWORD=<google app password>
SOPHIA_BOT_URL=https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot
```

`SOPHIA_BOT_URL` defaults to the Supabase URL so only credentials are strictly required.

## Architecture

```
sophia@zyprus.com inbox
    |
    | IMAP poll every 5 min
    v
email-router (Railway)
    | extract text + image attachments
    | upload images → Supabase storage (email-attachments bucket) → public URLs
    | POST /sophia-bot/email { from, subject, textBody, imageUrls }
    v
sophia-bot edge function (Supabase)
    | getAgentByEmail(from) — identify agent
    | getHistory(from_email) — load email chat history
    | buildSystemPrompt + chat — full AI pipeline with all tools
    | addMessage(chat_history) — store conversation
    | return { reply }
    |
    v
email-router
    | Resend API — send reply from sophia@zyprus.com to sender
    | markSophiaEmailAsRead(uid)
```

## Deviations

None — plan executed exactly as written.

## Self-Check

- [x] `supabase/functions/sophia-bot/handlers/email-webhook.ts` — exists
- [x] `services/email-router/src/sophia-handler.ts` — exists
- [x] sophia-bot deployed — HTTP 200 on health check
- [x] Commits 92c5650 and ebfeead exist
