# Summary: 22 — Gmail Email Router

**Completed:** 2026-03-09

## What Was Built

New Railway Node.js service that polls info@zyprus.com via IMAP every 30 minutes:

1. **Email Forwarding** — Reads unread emails, filters out already-routed ones (containing city names or agent names), then forwards to the appropriate agent using the same rotation logic as Telegram lead routing:
   - Paphos: Marios Azinas / Dimitris Panayiotou (50/50)
   - Limassol: Michelle / Diana (prefer Diana for Russian)
   - Larnaca: Michelle / Diana rotation
   - Other regions: Regional agent rotation
   - Agent name mentioned → route directly to them

2. **Draft Replies** — Fetches templates from Gmail's Templates label, scores them against incoming email content, creates draft reply in Gmail Drafts folder using the best-matching template.

3. **Tracking** — All processed emails logged to `email_forwards` table in Supabase with deduplication via `gmail_message_id`. Separate `email_forwarding_rotation` table for fair distribution (independent from Telegram rotation).

## Deployment

| Component | Location | Status |
|-----------|----------|--------|
| Railway service | https://sophia-email-router-production.up.railway.app | LIVE |
| Health check | /health | 200 OK |
| Manual trigger | POST /trigger | Working |
| DB tables | email_forwards, email_forwarding_rotation | Created |
| RLS | Deny all (service_role bypasses) | Secured |

## Files Created

```
services/email-router/
  package.json          — Dependencies (imapflow, nodemailer, mailparser, supabase-js)
  tsconfig.json         — TypeScript config
  Dockerfile            — Multi-stage build for Railway
  .gitignore            — node_modules, dist, .env
  src/
    index.ts            — HTTP server + polling loop
    config.ts           — Environment config
    gmail.ts            — IMAP reader, SMTP forwarder, draft creator
    filter.ts           — Skip emails with city/agent names
    router.ts           — Agent routing (region-based rotation)
    drafter.ts          — Template matching + draft creation
    db.ts               — Supabase client, email tracking, rotation state
```

## Environment Variables (Railway)

- GMAIL_EMAIL, GMAIL_APP_PASSWORD — Gmail app password auth
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Database access
- PORT — HTTP server port

## Secrets Also Stored

- Supabase secrets: GMAIL_EMAIL, GMAIL_APP_PASSWORD (for future Edge Function use)
