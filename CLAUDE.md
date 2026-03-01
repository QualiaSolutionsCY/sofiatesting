# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.
For detailed reference (commands, schema, troubleshooting, etc.), see `docs/CLAUDE-REFERENCE.md`.

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
| **Telegram Bot** | Supabase Edge Function `sophia-bot` | **DISABLED** |
| **Listing Notifier** | Supabase Edge Function `listing-notifier` | LIVE (pg_cron every 15 min) |
| **Draft Cleanup** | Supabase Edge Function `draft-cleanup` | LIVE |
| **Web App (Next.js)** | Vercel | **DEPRECATED — IGNORE** |
| **Database** | Supabase PostgreSQL | LIVE |

### Vercel Project (DEPRECATED — DO NOT MODIFY)
| Key | Value |
|-----|-------|
| **Project Name** | `sofiatesting` |
| **Production URL** | https://sofiatesting.vercel.app |
| **Admin Panel** | https://sofiatesting.vercel.app/admin |

### Deploy Commands
```bash
# sophia-bot (primary)
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# listing-notifier
supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Vercel web app
vercel --prod
```

### Telegram Bot Toggle
```bash
supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx   # ON
supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx  # OFF
```
**Current status: DISABLED** (as of Jan 2026)

---

## AI Configuration

| Channel | AI Provider | Implementation |
|---------|-------------|----------------|
| **WhatsApp (sophia-bot)** | OpenRouter -> Gemini | `supabase/functions/sophia-bot/` calls OpenRouter directly |

**Primary Model** (via OpenRouter): `google/gemini-3-flash-preview`, fallback: `google/gemini-2.0-flash`

> **⚠️ IGNORE `app/(chat)/`, `app/(auth)/`, and `app/properties/` directories.** The chat frontend is deprecated and unused. The **admin panel** (`app/(admin)/`) is still LIVE. All active development is on the WhatsApp bot in `supabase/functions/sophia-bot/`. Do NOT read, modify, or reference chat-related files.

---

## SOPHIA Prompt System

**Prompts come from TWO sources with PRIORITY ordering.**

```
DB: sophia_prompts table (TAKES PRECEDENCE)
  identity(10) > safety_rules(20) > document_routing(30) > property_upload(40)
  > response_format(50) > calculators(60) > cyprus_knowledge(70)

File Fallbacks (used if key NOT in DB):
  templates (from prompts/templates/content.ts)

prompt-loader.ts merges DB + fallbacks (5-minute cache)
```

### Key Files
| File | Purpose |
|------|---------|
| `supabase/functions/sophia-bot/services/prompt-loader.ts` | Loads prompts from DB with fallback to files |
| `supabase/functions/sophia-bot/prompts/core/identity.ts` | SOPHIA's identity (fallback) |
| `supabase/functions/sophia-bot/prompts/core/safety-rules.ts` | Safety and behavioral rules (fallback) |
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
- Edit `lib/ai/instructions/`, `docs/templates/`, `docs/knowledge/` - NOT USED by live SOPHIA
- Assume file changes go live without deploying Edge Function
- Make changes without searching ALL prompts first

For the full 8-step prompt change workflow, see `docs/CLAUDE-REFERENCE.md`.

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
- FOR SALE (Paphos/Limassol/Larnaca/Nicosia): Reviewer 1 = Lauren, Reviewer 2 = regional office
- FOR SALE (Famagusta): Reviewer 1 = requestfamagusta@zyprus.com, Reviewer 2 = NONE
- FOR RENT: Reviewer 1 = agent who sent it, Reviewer 2 = NONE
- Michelle Rentals: Reviewer 1 = demetra@zyprus.com, Reviewer 2 = requestlimassol@zyprus.com
- Charalambos/Lauren cannot upload rentals (rejected)

### Region Restrictions
- Agents can ONLY upload in their assigned region (`agents.region` field)
- Values: paphos, limassol, larnaca, nicosia, famagusta, all

### Regional Office Accounts
| Regional Email | Zyprus UUID |
|----------------|-------------|
| requestpaphos@zyprus.com | c8e05e2a-56e6-4d1f-9a20-31235feaec54 |
| requestlimassol@zyprus.com | c82d28cd-8167-4a2a-9ae8-8168015869c3 |
| requestlarnaca@zyprus.com | f889a6dc-0973-44b2-b10c-0d681f84f560 |
| requestnicosia@zyprus.com | 630cc4fd-d2c7-410a-821d-b0a9adfae4ea |
| requestfamagusta@zyprus.com | 7e33cdcd-709d-4fc0-8682-0075dde55964 |

### Key Constants (`config/business-rules.ts`)
```
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  # NOT "Sophia" user d697ac16
LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74"
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"
```

### Pending
1. **Resend Domain Verification** - Add SPF/DKIM records for `zyprus.com` in DNS
2. **End-to-End Email Testing** - Test document creation via WhatsApp -> email with attachment

---

## Quick Reference

| Resource | Location |
|----------|----------|
| Detailed reference (commands, schema, tools, troubleshooting) | `docs/CLAUDE-REFERENCE.md` |
| Zyprus API reference | `docs/ZYPRUS_API_REFERENCE.md` |
| PRD | `docs/PRD.md` |
| Architecture | `.planning/codebase/ARCHITECTURE.md` |
| Upload test docs | `tests/manual/README-UPLOADS.md` |
