# SOPHIA Production Hardening

## What This Is

Production-ready AI assistant for Zyprus Property Group agents — handling WhatsApp conversations, document generation, property uploads, and lead routing. Fully hardened with Row Level Security, server-side auth enforcement, input validation, structured logging, and version-controlled prompts.

## Core Value

**Agents can trust SOPHIA to do the right thing every time** — correct templates, correct routing, correct uploads, user-friendly errors, no manual intervention needed.

## Current State (v1.6 Shipped — Maintenance Mode)

**Shipped:** 2026-03-20 (v1.6) — in maintenance mode since, with ongoing hotfixes and product additions (see git log)

**Infrastructure:**
- Supabase Edge Functions: `sophia-bot` (WhatsApp), `call-audit` (3CX audit), `listing-notifier`, `draft-cleanup`
- Structured JSON logging with correlation IDs
- 5-minute prompt cache with version-based invalidation
- pg_cron scheduled jobs for automated execution
- Admin endpoints for cache and prompt management
- User-friendly error messages (no technical jargon)
- Row Level Security on all 38 database tables (49 policies)
- Server-only service role key protection (build-time enforcement)
- Auth checks on all server actions + ownership verification
- Zod input validation on all API routes and server actions
- 30-second timeouts + circuit breakers on all external API calls
- Type-safe interfaces for WaSend webhooks and OpenRouter API (zero `any` types)
- Sentry error tracking with user context and breadcrumbs
- Per-agent AI cost monitoring with token extraction and cost aggregation views
- Modular architecture: monolith files split into focused modules + Supabase singleton

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
- Next.js web app with Vercel AI SDK

## Next Milestone

None planned. Project is in maintenance mode — new work happens as quick tasks or hotfix commits directly on `main`. If a formal milestone is needed, run `/qualia-new` or `/qualia-milestone` to scope it.

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

**v1.4 (shipped 2026-03-01):**
- RLS-01 to RLS-17: Row Level Security on all database tables (28 requirements, 10 with schema deviation)
- AUTH-01 to AUTH-05: Server-only guards + server action auth checks
- CODE-01 to CODE-06: Console.log cleanup + Zod validation on all endpoints

**v1.5 (shipped 2026-03-02):**
- SEC-01 to SEC-04: Security quick wins (hardcoded secrets, identity protection, config cleanup)
- RES-01 to RES-04: Resilience infrastructure (timeouts, circuit breakers, retry logic, catch logging)
- TYPE-01 to TYPE-03: Type safety foundation (WaSend/OpenRouter interfaces, zero `any` types)
- OBS-01 to OBS-03: Observability (Sentry integration, AI cost tracking, .env.example)
- CODE-01 to CODE-04: Code quality refactoring (3 monolith splits, Supabase singleton)

**v1.6 (shipped 2026-03-20):**
- FR-1: Upload lock released on 11 early-return paths in field-validation.ts
- FR-2: `listingType` required in Zod + validateRequiredFields
- FR-3: Email Google Maps follow-up loads last 4 messages for context
- FR-4: parsePreExtractedFields regex hardened (MANDATORY delimiter, warn-on-mismatch)
- FR-5: `bedrooms` removed from nullableFields (email studios preserve `bedrooms: 0`)
- FR-6: poolType parsing handles `"none" [warning text]` format
- FR-7: Michelle rental injects `assignTo: demetra@zyprus.com` from special-cases
- FR-8: Removed `.default(0)` from bedrooms Zod schema
- FR-9: Redundant clearPendingImages removed (property-listing.ts is single source)
- FR-10: `condition` field — FALSE POSITIVE (already captured via description-generator)
- FR-11: Email `extractAssignmentFromEmail` matches "assign this/listing to"
- FR-12: ToolResult interface deduplicated (executor.ts canonical, re-exported)

**Maintenance (ongoing, post-2026-03-20):**
- Email upload pipeline rebuild (parity with WhatsApp)
- Document upload support
- Commercial + industrial land types
- Listing notifier public URL + admin panel stats
- Telegram-sophia webhook + indexer forwarding
- Land listing /node/{id}/edit URL disambiguation
- call-audit: only alert on missed calls
- Lifetime tracking (v3.4.1)

### Active

No active requirements. Maintenance hotfixes land directly on `main`. Use `/qualia-quick` for small tasks or `/qualia-new`/`qualia-milestone` for the next formal milestone.

### Out of Scope

| Feature | Reason |
|---------|--------|
| Per-agent prompt customization | Not needed for 30 agents |
| Visual prompt builder | DB editing sufficient |
| External logging services | Supabase dashboard + Sentry sufficient |
| Real-time dashboards | Manual review sufficient |

## Context

**Codebase:**
- ~110,000 lines of TypeScript (+12,331 / -4,435 in v1.5)
- Edge Functions: `sophia-bot/` (~25 files post-refactor), `call-audit/` (~12 files), `listing-notifier/`, `draft-cleanup/`
- Prompt files: 7 files with DB ownership headers
- Migrations: 6 SQL files (call tracking, cron, RLS)
- 72 plans shipped across 6 milestones

**Known issues:**
- Drizzle schema/DB mismatch: 8 tables defined in schema.ts don't exist in production
- Migration history: local/remote mismatch prevents `supabase db push`
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
| Cowork audit → Claude Code pipeline | External review identifies issues, Claude Code fixes them | Good |
| server-only for service role key | Build-time enforcement, not runtime | Good |
| safeParse in API routes, parse in actions | Consistent error handling per context | Good |
| z.literal(true) for confirmations | Prevents truthy-value bypasses | Good |
| RLS applied via MCP (not db push) | Migration history mismatch workaround | Revisit |
| 30s timeout on all external calls | Balances UX with system protection | Good |
| Circuit breakers before retry | Fail fast when services persistently degraded | Good |
| 3-failure/60s-reset threshold | Consistent across all circuit breakers | Good |
| WaSend optional nested fields | Handles payload structure variations by message type | Good |
| OpenRouter types as single source | types/openrouter.ts for all AI interactions | Good |
| Token accumulation across calls | Primary + fallback + retries for accurate cost tracking | Good |
| Env vars organized by category | Better developer comprehension than alphabetical | Good |
| Monolith splits into focused modules | taxonomy-cache, client, property-listing split into 12 modules | Good |
| Supabase singleton pattern | getSupabaseAdmin() eliminates redundant clients | Good |

## Constraints

- **Deployment**: Supabase Edge Functions only (no Vercel for backend)
- **WhatsApp**: WaSenderAPI for media handling
- **Testing**: Real agent phone numbers from `agents` table
- **Backwards Compatible**: Changes must not break existing functionality

---
*Last updated: 2026-04-18 — v1.6 archived, planning folder synced with reality (maintenance mode)*
