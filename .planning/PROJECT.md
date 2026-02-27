# SOPHIA Production Hardening

## What This Is

Production-ready AI assistant for Zyprus Property Group agents — handling WhatsApp conversations, document generation, property uploads, and lead routing. Now with structured logging, version-controlled prompts, and robust error handling.

## Core Value

**Agents can trust SOPHIA to do the right thing every time** — correct templates, correct routing, correct uploads, user-friendly errors, no manual intervention needed.

## Current State (v1.3 Shipped)

**Shipped:** 2026-02-28

**Infrastructure:**
- Supabase Edge Functions: `sophia-bot` (WhatsApp), `call-audit` (3CX audit), `listing-notifier`, `draft-cleanup`
- Structured JSON logging with correlation IDs
- 5-minute prompt cache with version-based invalidation
- pg_cron scheduled jobs for automated execution
- Admin endpoints for cache and prompt management
- User-friendly error messages (no technical jargon)

**Key capabilities:**
- WhatsApp AI assistant (SOPHIA) for Zyprus agents
- Property listing creation on Zyprus with image uploads
- 37 DOCX document templates
- Telegram lead routing by region
- Automated daily 3CX call log audit (Mon-Fri 5PM Cyprus)
- Telegram group search for caller phone numbers
- Missing caller alerts with 24-hour follow-up reminders
- Response tracking for alert lifecycle management

**Tech stack:**
- Supabase (Edge Functions, PostgreSQL, Storage, pg_cron, pg_net)
- OpenRouter (Gemini 2.0 Flash)
- WaSenderAPI (WhatsApp)
- Telegram Bot API
- 3CX REST API
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

**v1.2 (shipped 2026-02-26):**
- 3CX-01 to 3CX-06: 3CX integration
- TG-01 to TG-05: Telegram integration
- TRACK-01 to TRACK-05: Call tracking
- ALERT-01 to ALERT-05: Alerting logic
- SCHED-01 to SCHED-05: Scheduling

**v1.3 (shipped 2026-02-28):**
- SEC-01 to SEC-07: Security fixes (password hash, race conditions, validation, enumeration)
- REL-01 to REL-03: Reliability fixes (cache race, rate limiting, N+1 queries)

### Active

(No active milestone — run `/gsd:new-milestone` to start v1.4)

### Out of Scope

| Feature | Reason |
|---------|--------|
| Per-agent prompt customization | Not needed for 30 agents |
| Visual prompt builder | DB editing sufficient |
| Circuit breaker pattern | Retry logic sufficient |
| External logging services | Supabase dashboard sufficient |
| Real-time dashboards | Manual review sufficient |
| Code deduplication across channels (WA-013) | Deferred to v1.4 — refactoring, not security |
| Per-tool rate limiting (EF-008) | Deferred to v1.4 — medium severity |
| CSRF protection (WA-010) | Deferred to v1.4 — medium severity |
| Pagination limits (WA-012) | Deferred to v1.4 — medium severity |
| Hardcoded UUIDs (WA-014) | Deferred to v1.4 — medium severity |

## Context

**Codebase:**
- Edge Functions: `sophia-bot/` (~15 files), `call-audit/` (~12 files), `listing-notifier/`, `draft-cleanup/`
- Prompt files: 7 files with DB ownership headers
- Migrations: 2 SQL files (call tracking + cron scheduling)
- 48 plans shipped across 4 milestones

**Known issues:**
- SOPHIA_ADMIN_SECRET needs to be set for admin endpoints
- correlation_id column migration for pending_images (code handles gracefully)

**Pending operational setup (v1.2):**
- Apply pg_cron migration (replace SERVICE_ROLE_KEY placeholder)
- Set 3CX credentials (CX3_BASE_URL, CX3_USERNAME, CX3_PASSWORD)
- Set Telegram group chat IDs and Vasya's user ID

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
| Atomic audit run claiming | Unique constraint + 23505 catch prevents duplicates | Good |
| Dual 3CX auth (REST + web) | Maximum version compatibility | Good |
| Europe/Nicosia timezone | PostgreSQL handles DST automatically | Good |
| Single-table alert lifecycle | caller_alerts owns full state, eliminated dual-table | Good |
| pg_cron + pg_net scheduling | Proven Supabase pattern (draft-cleanup precedent) | Good |
| 24-hour follow-up threshold | Balances urgency with avoiding spam | Good |
| Per-caller error isolation | One failure doesn't abort entire audit | Good |

## Constraints

- **Deployment**: Supabase Edge Functions only (no Vercel)
- **WhatsApp**: WaSenderAPI for media handling
- **Testing**: Real agent phone numbers from `agents` table
- **Backwards Compatible**: Changes must not break existing functionality

| Cowork audit → Claude Code pipeline | External review identifies issues, Claude Code fixes them | Good |

---
*Last updated: 2026-02-28 after v1.3 milestone complete*
