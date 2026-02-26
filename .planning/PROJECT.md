# SOPHIA Production Hardening

## What This Is

Production-ready AI assistant for Zyprus Property Group agents — handling WhatsApp conversations, document generation, property uploads, and lead routing. Now with structured logging, version-controlled prompts, and robust error handling.

## Core Value

**Agents can trust SOPHIA to do the right thing every time** — correct templates, correct routing, correct uploads, user-friendly errors, no manual intervention needed.

## Current Milestone: v1.2 3CX Call Log Audit

**Goal:** Add automated daily call log auditing to ensure no leads are missed from the main call center line.

**Target features:**
- Daily 3CX system login and call log extraction (5:00 PM Cyprus time)
- Telegram group search for caller phone numbers across 4 regional groups
- Automated alerts in "Zypress Others" group for missing callers
- Follow-up reminder system for unprocessed numbers
- Scheduled Edge Function with credential management

## Current State (v1.1 Shipped)

**Shipped:** 2026-01-29

**Infrastructure:**
- Supabase Edge Function `sophia-bot` (WhatsApp)
- Structured JSON logging with correlation IDs
- 5-minute prompt cache with version-based invalidation
- Admin endpoints for cache and prompt management
- User-friendly error messages (no technical jargon)

**Key capabilities:**
- WhatsApp image uploads from phone gallery
- Property listing creation on Zyprus
- 37 DOCX document templates
- Telegram lead routing by region
- Health check endpoint for monitoring

**Tech stack:**
- Supabase (Edge Functions, PostgreSQL, Storage)
- OpenRouter (Gemini 2.0 Flash)
- WaSenderAPI (WhatsApp)
- Deno runtime

## Requirements

### Validated

**v1.0 (shipped 2026-01-27):**
- TMPL-01: No template numbers in responses
- TMPL-02: Single reservation template
- TMPL-03: Auto-send to agent's email
- TMPL-04: No asterisks in WhatsApp
- TMPL-05: Proper signature spacing
- TMPL-06: Correct border/frame
- LEAD-01: Region-based routing
- LEAD-02: Nicosia → Ivan
- LEAD-03: Famagusta → Narine
- LIST-01 to LIST-05: Upload fixes

**v1.1 (shipped 2026-01-29):**
- LIST-06: WhatsApp gallery images
- LOG-01 to LOG-05: Structured logging
- CACHE-01 to CACHE-05: Cache management
- PRMT-01 to PRMT-05: Prompt consolidation
- ERR-01 to ERR-04: Error handling
- IMG-01 to IMG-03: Image validation

### Active

**v1.2 3CX Call Log Audit Integration:**
- 3CX system integration for daily call log extraction
- Telegram group search functionality
- Missing caller alert system
- Scheduled audit execution (Mon-Fri 5:00 PM)
- Call tracking database tables

### Out of Scope

| Feature | Reason |
|---------|--------|
| Per-agent prompt customization | Not needed for 30 agents |
| Visual prompt builder | DB editing sufficient |
| Circuit breaker pattern | Retry logic sufficient |
| External logging services | Supabase dashboard sufficient |
| Real-time dashboards | Manual review sufficient |

## Context

**Codebase:**
- Edge Functions: ~15 files in `supabase/functions/sophia-bot/`
- Prompt files: 7 files with DB ownership headers
- Test coverage: Unit tests for key modules

**Known issues:**
- SOPHIA_ADMIN_SECRET needs to be set for admin endpoints
- correlation_id column migration for pending_images (code handles gracefully)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single reservation template | Reduce confusion | Good |
| Auto-detect agent for email | Better UX | Good |
| Region-based routing | Correct lead assignment | Good |
| DB prompts take precedence | Live editing without deploy | Good |
| Logging before other phases | Enables debugging | Good |
| MAX(updated_at) version check | No migration needed | Good |
| Append-only rollback | Never mutates history | Good |
| Validate images at ingress | Fail fast, immediate feedback | Good |

## Constraints

- **Deployment**: Supabase Edge Functions only (no Vercel)
- **WhatsApp**: WaSenderAPI for media handling
- **Testing**: Real agent phone numbers from `agents` table
- **Backwards Compatible**: Changes must not break existing functionality

---
*Last updated: 2026-02-26 after v1.2 milestone start*
