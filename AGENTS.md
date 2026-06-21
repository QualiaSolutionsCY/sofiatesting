# AGENTS.md

This file provides guidance to Codex when working with this repository.
For detailed reference (commands, schema, troubleshooting, etc.), see `docs/Codex-REFERENCE.md`.

---

## Current Architecture

### Supabase Project (LIVE)
| Key | Value |
|-----|-------|
| **Project ID** | `vceeheaxcrhmpqueudqx` |
| **Dashboard** | https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx |
| **Edge Functions URL** | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/` |
| **WhatsApp Webhook** | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot` |

### What Runs Where
| Component | Runs On | Status |
|-----------|---------|--------|
| **WhatsApp Bot (Sophia)** | Supabase Edge Function `sophia-bot` | LIVE |
| **Telegram Bot (Lead Router)** | Supabase Edge Function `telegram-sophia` | LIVE (Paphos + Others only) |
| **Telegram Indexer** | Supabase Edge Function `telegram-indexer` | LIVE |
| **Listing Notifier** | Supabase Edge Function `listing-notifier` | LIVE (pg_cron every 15 min) |
| **Draft Cleanup** | Supabase Edge Function `draft-cleanup` | LIVE |
| **Prompt Optimizer** | Supabase Edge Function `prompt-optimizer` | LIVE (pg_cron every 6 hours) |
| **Call Audit** | Supabase Edge Function `call-audit` | LIVE |
| **Email Router** | Railway service (`services/email-router/`) | LIVE — forwards emails to sophia-bot `/email` endpoint |
| **Bazaraki Scraper** | Docker service (`services/bazaraki-scraper/`) | Scrapes Bazaraki listings |
| **Web App (Next.js)** | Vercel | ADMIN PANEL ONLY — `/` redirects to `/admin` |
| **Database** | Supabase PostgreSQL | LIVE |

### Vercel Project (ADMIN PANEL ONLY)
| Key | Value |
|-----|-------|
| **Project Name** | `sofiatesting` |
| **Production URL** | https://sofiatesting.vercel.app |
| **Admin Panel** | https://sofiatesting.vercel.app/admin |

### Deploy Commands
```bash
# sophia-bot (primary — WhatsApp + email webhook)
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# telegram-sophia (lead routing + private AI chat)
supabase functions deploy telegram-sophia --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# telegram-indexer (group message indexing)
supabase functions deploy telegram-indexer --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# listing-notifier
supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# draft-cleanup
supabase functions deploy draft-cleanup --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# call-audit (3CX call tracking)
supabase functions deploy call-audit --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# prompt-optimizer (autoresearch)
supabase functions deploy prompt-optimizer --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Vercel web app (admin panel)
vercel --prod
```

### Telegram Bot Toggle
```bash
supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx   # ON
supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx  # OFF
```
**Current status: ENABLED** (re-enabled 2026-03-16)
- Paphos + Others groups: lead routing ON (`telegram_groups.lead_routing_enabled = true`)
- Limassol + Larnaca groups: lead routing OFF (intentional)
- Source code for `telegram-sophia` IS in repo at `supabase/functions/telegram-sophia/`

---

## AI Configuration

| Channel | AI Provider | Implementation |
|---------|-------------|----------------|
| **WhatsApp (sophia-bot)** | OpenRouter -> Codex Sonnet 4.6 | `supabase/functions/sophia-bot/` calls OpenRouter directly |
| **Email (sophia-bot /email)** | OpenRouter -> Codex Sonnet 4.6 | Same AI pipeline, triggered by email-router on Railway |

**Primary Model** (via OpenRouter): `nvidia/nemotron-3-ultra-550b-a55b:free`
**Pro Model** (for uploads): `nvidia/nemotron-3-ultra-550b-a55b:free`
**Fallback Model**: `anthropic/Codex-sonnet-4.6` (paid — kicks in on free-tier rate limits/errors)
**Vision Model** (image classification): `nvidia/nemotron-nano-12b-v2-vl:free`

> The **admin panel** (`app/(admin)/`) is LIVE, and `app/(auth)/` handles NextAuth. Root `/` redirects to `/admin`. All active development is on the WhatsApp bot in `supabase/functions/sophia-bot/`.

---

## SOPHIA Prompt System

**Prompts come from TWO sources with PRIORITY ordering.**

```
DB: sophia_prompts table (TAKES PRECEDENCE)
  identity(10) > safety_rules(20) > reservation_loan_vat_required(25)
  > document_routing(30) > property_upload(40) > response_format(50)
  > calculators(60) > cyprus_knowledge(70)

File Fallbacks (used if key NOT in DB):
  templates (from prompts/templates/content.ts)
  safety_rules (FILE_OVERRIDE — never auto-optimized)

prompt-loader.ts merges DB + fallbacks (5-minute cache)
```

### Key Files
| File | Purpose |
|------|---------|
| `supabase/functions/sophia-bot/services/prompt-loader.ts` | Loads prompts from DB with fallback to files |
| `supabase/functions/sophia-bot/prompts/core/identity.ts` | SOPHIA's identity (fallback) |
| `supabase/functions/sophia-bot/prompts/core/safety-rules.ts` | Safety and behavioral rules (FILE_OVERRIDE — always used) |
| `supabase/functions/sophia-bot/prompts/behaviors/reservation-loan-vat.ts` | Reservation loan & VAT collection rules (fallback) |
| `supabase/functions/sophia-bot/prompts/behaviors/document-routing.ts` | DOCX vs TEXT routing, field collection (fallback) |
| `supabase/functions/sophia-bot/prompts/behaviors/property-upload.ts` | Property upload rules (fallback) |
| `supabase/functions/sophia-bot/prompts/behaviors/response-format.ts` | Response formatting rules (fallback) |
| `supabase/functions/sophia-bot/prompts/knowledge/calculators.ts` | Calculator instructions (fallback) |
| `supabase/functions/sophia-bot/prompts/knowledge/cyprus-real-estate.ts` | Cyprus RE knowledge (fallback) |
| `supabase/functions/sophia-bot/prompts/templates/content.ts` | Template content (ONLY fallback - NOT in DB) |

### Prompt Change Rules

**CRITICAL gotchas:**
- Lower priority number wins when prompts conflict
- **ALWAYS clear chat_history after prompt changes** - AI copies old patterns from history
- Template content lives in FILES only (not DB); behaviors live in BOTH DB and files
- 5-minute cache: set `CACHE_TTL_MS = 0` in prompt-loader.ts when testing, re-enable after

**DO:**
- Search ALL prompts (DB + files) before editing any behavior
- Update BOTH DB and file to stay in sync
- Clear chat_history, test on WhatsApp, verify in chat_history table

**DO NOT:**
- Edit `lib/ai/instructions/` — legacy file, NOT USED by live SOPHIA
- Assume file changes go live without deploying Edge Function
- Make changes without searching ALL prompts first

For the full 8-step prompt change workflow, see `docs/Codex-REFERENCE.md`.

---

## Operational Notes

### Property Uploads
- `createPropertyListing` auto-uploads to Zyprus as unpublished draft
- Min 1 image required; must be direct image URLs (not ibb.co sharing pages)
- Upload lock is per-property (fingerprint = agent+location+price+owner), not per-agent
- Floor plans: separate `floorPlanUrls` field -> `field_floor_plan` (distinct from gallery)
- `extractFromBazaraki` tool scrapes Bazaraki listings to pre-fill fields
- Publication tracked in `listing_uploads` table; `listing-notifier` polls every 15 min

### Reviewer Assignment (`rules/reviewer-assignment.ts`)
- FOR SALE (Paphos/Limassol/Larnaca/Nicosia): Reviewer 1 = Lauren (zyprus@zyprus.com), Reviewer 2 = regional office
- FOR SALE (Famagusta): Reviewer 1 = requestfamagusta@zyprus.com, Reviewer 2 = NONE
- FOR RENT: Reviewer 1 = agent who sent it, Reviewer 2 = NONE
- Michelle Rentals: Reviewer 1 = demetra@zyprus.com, Reviewer 2 = requestlimassol@zyprus.com
- Management agents (incl. Charalambos/Lauren) CAN upload rentals (c5aee9b); with listingOwnerEmail "ASK" and no assignTo, owner = their communicationEmail

### Region Restrictions
- Agents can ONLY upload in their assigned region (`agents.region` field)
- Values: paphos, limassol, larnaca, nicosia, famagusta, all

### Regional Office Accounts
| Regional Email | Zyprus UUID |
|----------------|-------------|
| requestpaphos@zyprus.com | ce23963b-ea29-4d42-933e-d0cd60bac5c7 |
| requestlimassol@zyprus.com | c82d28cd-8167-4a2a-9ae8-8168015869c3 |
| requestlarnaca@zyprus.com | f889a6dc-0973-44b2-b10c-0d681f84f560 |
| requestnicosia@zyprus.com | 630cc4fd-d2c7-410a-821d-b0a9adfae4ea |
| requestfamagusta@zyprus.com | 7e33cdcd-709d-4fc0-8682-0075dde55964 |

### Key Constants (`config/business-rules.ts`)
```
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  # NOT "Sophia" user d697ac16
LAUREN_UUID = "34a61949-bd34-4a39-b511-bb4fcb1c5cbb"
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"
DEMETRA_UUID = "b72a0f7c-62d8-4f69-89f3-aaebee31676a"
AZINAS_UUID = "c8e05e2a-56e6-4d1f-9a20-31235feaec54"
CHARALAMBOS_UUID = "71ac4784-238f-45b2-ac15-5f74200601ce"
```

### Email Upload Pipeline
- `email-router` (Railway) watches Gmail inbox, forwards property emails to sophia-bot `/email` endpoint
- `email-webhook.ts` handler: authenticates via `X-Admin-Secret`, identifies agent by email, runs same AI pipeline
- `email-parser.ts`: server-side field extraction BEFORE AI sees the email (prevents hallucination)
- Email uploads use the same tools/reviewers as WhatsApp uploads

### info@ Paphos-only forwarding (delayed)
- `INFO_POLLING_ENABLED=true` — enable info@ inbox polling
- `INFO_PAPHOS_ONLY=true` — only forward Paphos leads; non-Paphos left unread for human handling
- `INFO_FORWARD_DELAY_MINUTES=20` — delay before forwarding (default 20)
- Queue table: `pending_email_forwards` (status: pending/sent/failed). Drained every poll cycle.
- Migration: `supabase/migrations/20260528_pending_email_forwards.sql`

### Pending
- ~~Resend Domain Verification~~ — VERIFIED, domain is live

---

## Quick Reference

| Resource | Location |
|----------|----------|
| Detailed reference (commands, schema, tools, troubleshooting) | `docs/Codex-REFERENCE.md` |
| Zyprus API reference | `docs/ZYPRUS_API_REFERENCE.md` |
| PRD | `docs/PRD.md` |
| Architecture | `.planning/codebase/ARCHITECTURE.md` |
| Upload test docs | `tests/manual/README-UPLOADS.md` |
