# Plan: 22 — Gmail Email Router (Railway Service)

**Mode:** quick
**Created:** 2026-03-09

## Overview

New Node.js service on Railway that polls info@zyprus.com via IMAP every 30 minutes.
Two capabilities: (1) forward emails to agents by region, (2) create draft replies from templates.

## Architecture

```
Railway (Node.js) — cron every 30 min
  ├── IMAP: Read unread emails from info@zyprus.com
  ├── Filter: Skip emails with city names or agent names (already routed)
  ├── Route: Same logic as Telegram lead routing (50/50 rotation)
  ├── SMTP: Forward email to selected agent's communication_email
  ├── IMAP: Pick best template, create draft reply
  └── Supabase: Log forwarded emails, track rotation state
```

## Task 1: Create email-router service

**What:** Build `services/email-router/` with IMAP/SMTP Gmail integration
**Files:**
- `services/email-router/package.json`
- `services/email-router/tsconfig.json`
- `services/email-router/src/index.ts` — entry point, HTTP server + cron
- `services/email-router/src/gmail.ts` — IMAP reader + SMTP sender
- `services/email-router/src/filter.ts` — Skip emails with city/agent names
- `services/email-router/src/router.ts` — Agent routing (from Supabase DB)
- `services/email-router/src/drafter.ts` — Template matching + draft creation
- `services/email-router/src/db.ts` — Supabase client + email tracking
- `services/email-router/src/config.ts` — Environment variables

**Routing rules (from Telegram):**
- Paphos: Marios Azinas / Dimitris Panayiotou (50/50 rotation)
- Limassol: Michelle Longridge / Diana Kultaseva (prefer Diana for Russian)
- Larnaca: Michelle Longridge / Diana Kultaseva
- Nicosia: Ivan Kazakov (regional manager)
- Famagusta: Narine Akopyan (regional manager)
- If agent name mentioned in email → route to that agent
- If someone "owns" the listing → route to them

**Filter rules:**
- Skip if subject/body contains city name (Paphos, Limassol, Larnaca, Nicosia, Famagusta + variants)
- Skip if subject/body contains agent full name from DB
- Process everything else

**Done when:** Service builds, connects to Gmail, filters/routes/forwards correctly

## Task 2: Database migration for email tracking

**What:** Create `email_forwards` table to track processed emails + prevent duplicates
**Files:** Supabase migration via MCP

**Schema:**
- id, gmail_message_id (unique), from_email, subject, forwarded_to_agent_id, forwarded_to_email, region, draft_created, processed_at, created_at

## Task 3: Deploy to Railway

**What:** Deploy service, configure env vars, verify
**Done when:** Service runs on Railway, processes test email correctly
