# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## CRITICAL: Current Architecture

**READ THIS FIRST**

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
| **Web App (Next.js)** | Vercel | LIVE |
| **Database** | Supabase PostgreSQL | LIVE |

### Vercel Project (LIVE)
| Key | Value |
|-----|-------|
| **Project Name** | `sofiatesting` |
| **Production URL** | https://sofiatesting.vercel.app |
| **Admin Panel** | https://sofiatesting.vercel.app/admin |
| **Deploy Command** | `vercel --prod` |

### Telegram Bot Toggle

```bash
# TURN ON SOPHIA on Telegram:
supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx

# TURN OFF SOPHIA on Telegram:
supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx
```

**Current status: DISABLED** (as of Jan 2026)

---

## SOPHIA Prompt System (CRITICAL - READ THIS)

**SOPHIA's prompts come from TWO sources with PRIORITY ordering. Understanding this is essential to avoid bugs.**

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOPHIA Prompt Loading                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Database: sophia_prompts table (TAKES PRECEDENCE)          │
│      ├── identity (priority 10)       ← Loaded first            │
│      ├── safety_rules (priority 20)                             │
│      ├── document_routing (priority 30)                         │
│      ├── property_upload (priority 40)                          │
│      ├── response_format (priority 50)                          │
│      ├── calculators (priority 60)                              │
│      └── cyprus_knowledge (priority 70)                         │
│                                                                 │
│   2. File Fallbacks (used if key NOT in DB):                    │
│      └── templates (from prompts/templates/content.ts)          │
│                                                                 │
│   3. prompt-loader.ts merges DB + fallbacks                     │
│      └── 5-minute cache (can cause delays!)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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

---

### Making SOPHIA Prompt Changes (Complete Workflow)

Use this workflow EVERY TIME you modify how SOPHIA responds on WhatsApp.

**Step 1: SEARCH all prompts for the behavior you're changing**

```sql
-- Search DB (check ALL active prompts)
SELECT key, priority, LEFT(content, 500) as preview
FROM sophia_prompts
WHERE is_active = true AND content ILIKE '%keyword%'
ORDER BY priority;
```
```bash
# Search files
grep -rn "keyword" supabase/functions/sophia-bot/prompts/
```

**Step 2: CHECK for conflicting instructions across prompts**

Lower priority number = AI follows that one. If the same behavior is in multiple prompts, the lowest priority number wins.

Real example (Jan 2026): `safety_rules` (priority 20) said "ask fields in 2 messages" while `document_routing` (priority 30) said "ask ALL fields in ONE message". AI followed priority 20. Fix: remove conflicting instruction from the higher-priority prompt.

**Step 3: UPDATE the right place(s)**

- Template content → Edit `prompts/templates/content.ts` (file only, NOT in DB)
- Behaviors → Update DB prompt AND corresponding file to stay in sync

```sql
-- Update database prompt
UPDATE sophia_prompts
SET content = 'new content here', updated_at = NOW()
WHERE key = 'document_routing';
```

**Step 4: DISABLE cache for testing**

In `prompt-loader.ts`, set `CACHE_TTL_MS = 0` (normal value: `5 * 60 * 1000`)

**Step 5: DEPLOY**

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

**Step 6: CLEAR chat history (CRITICAL)**

Chat history pattern copying is the #1 reason prompt changes don't take effect. AI copies old format patterns from conversation history.

```sql
DELETE FROM chat_history WHERE created_at >= NOW() - INTERVAL '1 hour';
```

**Step 7: TEST on WhatsApp, then verify**

```sql
SELECT parts FROM chat_history WHERE role = 'model' ORDER BY created_at DESC LIMIT 1;
```

**Step 8: RE-ENABLE cache** after confirmed working (`CACHE_TTL_MS = 5 * 60 * 1000`), deploy again.

---

### Why Changes Sometimes Don't Work

| Symptom | Cause | Solution |
|---------|-------|----------|
| Changes don't take effect after deploy | 5-minute cache still serving old prompts | Set `CACHE_TTL_MS = 0` in prompt-loader.ts, deploy |
| AI follows old instructions despite DB update | Conflicting rule in HIGHER priority prompt (lower number) | Search ALL prompts for the keyword, fix the lowest-numbered one |
| Updated DB but local file shows old text | DB and file out of sync | Always update BOTH to prevent future confusion |
| Template changes not working | `templates` content is in FILES not DB | Edit `prompts/templates/content.ts` directly |
| Behavior only partially changed | Multiple prompts contain variations of the same rule | Search + grep ALL prompts, consolidate instructions in ONE place |
| **AI keeps using OLD format despite all updates** | **Chat history has examples of old format - AI copies pattern** | **CLEAR chat_history table for the user** |

### Field Collection Prompts Location

All "Please provide:" field collection prompts are in `document_routing`:

| Template Type | Trigger Phrases | DB Key |
|--------------|-----------------|--------|
| Rental Registration | "rental", "rental registration" | `document_routing` |
| Standard Seller | "standard", "standard registration" | `document_routing` |
| Seller with Marketing | "with marketing", "marketing agreement" | `document_routing` |
| Advanced Seller | "advanced", "advanced registration" | `document_routing` |
| Bank Registration | "bank registration" | `document_routing` |
| Developer Registration | "developer registration" | `document_routing` |
| Viewing Forms | "viewing form", "standard viewing form" | `document_routing` |
| Reservation Agreement | "reservation", "reservation agreement" | `document_routing` |
| Request Callback | "request callback", "callback" | `document_routing` |

**To change what fields SOPHIA asks for ANY template:**
1. Edit `document_routing` in DB
2. Edit `document-routing.ts` file
3. Clear chat history
4. Test

### Checking Current Prompt State

```typescript
// Via Supabase MCP
mcp__plugin_supabase_supabase__execute_sql({
  project_id: "vceeheaxcrhmpqueudqx",
  query: "SELECT key, priority, LEFT(content, 200) as preview FROM sophia_prompts WHERE is_active = true ORDER BY priority"
})
```

### Prompt Content Ownership (SINGLE SOURCE OF TRUTH)

Each type of content belongs in exactly ONE place. Never duplicate.

| Content Type | Owner Prompt | NOT In |
|--------------|--------------|--------|
| **Field collection** ("I'll create X. Please provide:") | `document_routing` | ~~templates~~ |
| **Template output format** (what document looks like) | `templates` | - |
| **Calculator formats** | `calculators` | - |
| **Cyprus knowledge/facts** | `cyprus_knowledge` | - |
| **Safety rules** | `safety_rules` | - |
| **Upload behavior** | `property_upload` | - |

**BEFORE editing any prompt:**
```bash
grep -rn "text to change" supabase/functions/sophia-bot/prompts/
```

### DO NOT

- Edit local `lib/ai/instructions/` files - NOT USED by live SOPHIA
- Edit `docs/templates/` files - Reference only
- Edit `docs/knowledge/` files - NOT USED
- Use `app/api/` routes - No Vercel deployment
- Assume file changes go live - Must deploy Edge Function
- Forget about the 5-minute cache when testing
- Make changes without searching ALL prompts first
- **Forget to clear chat_history after prompt changes** - AI copies old patterns!

### DO

- ALWAYS search ALL prompts for the behavior before editing (DB + files)
- Check DB first: `sophia_prompts` table
- Search for conflicting instructions (lower priority number wins)
- Update BOTH DB and files to stay in sync
- Bypass cache when testing: `CACHE_TTL_MS = 0`
- Deploy: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
- **CLEAR chat_history table after prompt changes** (AI copies patterns from history!)
- Test on actual WhatsApp before declaring success
- Verify new format in `chat_history` table after testing
- Re-enable cache after testing confirmed working

---

## Quick Reference

**Key documents:** `docs/PRD.md` (requirements), `docs/ARCHITECTURE.md` (system design)

**Skills** (project-managed): `sofia-debugger` (debug SOFIA issues), `cyprus-calculator` (property tax calculations)

---

## Current Operational Notes

### Property Uploads
- `createPropertyListing` tool auto-uploads to Zyprus as unpublished draft
- Minimum 1 image required; must be direct image URLs (not ibb.co sharing pages)
- Image validation: HEAD request with GET fallback
- Hardcoded fallback taxonomy UUIDs ensure uploads never fail on taxonomy lookup
- Description format: itemized bullet lists (KEY FEATURES, INDOOR, OUTDOOR, VIEWS) via `services/description-generator.ts`
- **Upload lock**: Per-property (fingerprint = agent+location+price+owner), NOT per-agent — allows sequential uploads
- **Floor plans**: Separate `floorPlanUrls` field uploads to `field_floor_plan` (distinct from gallery)
- **Bazaraki**: `extractFromBazaraki` tool scrapes Bazaraki listings (HTML + URL fallback) to pre-fill fields
- **Publication notifications**: After upload, listing is tracked in `listing_uploads` table. `listing-notifier` edge function (pg_cron every 15 min) polls Zyprus API and sends WhatsApp notification when published
- **Fields**: `condition`, `orientation`, `priceModifier`, `share_of_land` title deed status all supported

### Reviewer Assignment Rules (`rules/reviewer-assignment.ts`)
- FOR SALE (Paphos/Limassol/Larnaca/Nicosia): Reviewer 1 = Lauren, Reviewer 2 = regional office
- FOR SALE (Famagusta): Reviewer 1 = requestfamagusta@zyprus.com, Reviewer 2 = NONE
- FOR RENT: Reviewer 1 = agent who sent it, Reviewer 2 = NONE
- Michelle Rentals: Reviewer 1 = demetra@zyprus.com, Reviewer 2 = requestlimassol@zyprus.com (special case - joint account)
- Charalambos/Lauren cannot upload rentals (rejected with message)

### Region Restrictions
- Agents can ONLY upload in their assigned region (check `agents.region` field)
- Values: paphos, limassol, larnaca, nicosia, famagusta, all

### Regional Office Accounts
| Regional Email | Zyprus UUID | Username |
|----------------|-------------|----------|
| requestpaphos@zyprus.com | c8e05e2a-56e6-4d1f-9a20-31235feaec54 | (azinas) |
| requestlimassol@zyprus.com | c82d28cd-8167-4a2a-9ae8-8168015869c3 | limassol |
| requestlarnaca@zyprus.com | f889a6dc-0973-44b2-b10c-0d681f84f560 | larnaca |
| requestnicosia@zyprus.com | 630cc4fd-d2c7-410a-821d-b0a9adfae4ea | nicosia |
| requestfamagusta@zyprus.com | 7e33cdcd-709d-4fc0-8682-0075dde55964 | famagusta |

### Pending
1. **Resend Domain Verification** - Add SPF/DKIM records for `zyprus.com` in DNS (skip MX to avoid Google Workspace conflicts)
2. **End-to-End Email Testing** - Test flow: create document via WhatsApp → send via email with attachment

**Deploy command:** `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`

---

## Project Overview

**SOFIA v3.2.0** - Next.js 15 AI assistant for Zyprus Property Group (Cyprus real estate). Core features:
- AI chat with Cyprus real estate tools (VAT, transfer fees, capital gains calculators)
- Property listing management with Zyprus API integration (Drupal JSON:API)
- Telegram and WhatsApp bot integration (dual-channel support)
- Document generation (37 DOCX templates via `docx` package, sent via Resend email)

## AI Configuration (Dual Architecture)

**Two separate AI implementations exist** - understand which one you're modifying:

| Channel | AI Provider | Implementation |
|---------|-------------|----------------|
| **WhatsApp (sophia-bot)** | OpenRouter → Gemini | `supabase/functions/sophia-bot/` calls OpenRouter directly |
| **Web App (Next.js)** | Vercel AI SDK | `app/(chat)/api/chat/route.ts` uses AI SDK with OpenRouter |

**Models** (via OpenRouter): `google/gemini-2.0-flash` (default), `google/gemini-pro` (fallback)

Set `OPENROUTER_API_KEY` in Supabase Edge Function secrets. **NO direct Gemini API key needed.**

## Database

**Schema** (Drizzle ORM in `lib/db/schema.ts`):
- `User` - email/password auth
- `Chat` - conversations with `visibility` (public/private), `lastContext` for token tracking
- `Message_v2` - chat messages with `parts` (JSON), `attachments` (JSON), CASCADE delete on chat
- `Vote_v2` - message feedback, CASCADE delete on chat/message
- `PropertyListing` - draft listings with `deletedAt` soft delete, `uploadStatus` tracking
- `Stream` - SSE stream resumption, CASCADE delete on chat
- `ListingUploadAttempt` - upload retry tracking with error logs
- `listing_uploads` - tracks uploaded drafts for publication notification (used by listing-notifier)

## Authentication

1. Access gate cookie (`qualia-access=granted`) required for all pages
2. Guest vs Regular users with different rate limits (`lib/ai/entitlements.ts`)
3. Redis (Upstash) for rate limiting
4. NextAuth.js 5.0 Beta with JWT sessions (30-day expiration)

## Commands

```bash
pnpm dev              # Dev server (Turbo)
pnpm build            # Production build
pnpm lint             # Ultracite check
pnpm format           # Ultracite auto-fix

pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Apply migrations
pnpm db:studio        # Drizzle Studio GUI
pnpm db:push          # Push schema directly (skip migrations)
pnpm db:pull          # Pull schema from database
pnpm db:check         # Check schema consistency
pnpm db:up            # Upgrade snapshots for split migrations

pnpm test:unit        # All unit tests (node:test runner via tsx)
pnpm test:ai-models   # Test AI model connectivity
PLAYWRIGHT=True pnpm test  # E2E tests (requires dev server)

# Edge function tests (vitest - tests sophia-bot code)
pnpm test:edge-functions           # Run once
pnpm test:edge-functions:watch     # Watch mode
pnpm test:edge-functions:coverage  # With coverage

# Single test file (node:test runner via tsx)
pnpm exec tsx --test tests/unit/your-file.test.ts

# Run specific Playwright test
PLAYWRIGHT=True pnpm exec playwright test tests/e2e/your-file.spec.ts

# Test parallel image uploads
pnpm test:unit:parallel-uploads
```

**Test file locations:**
- `tests/unit/` - Unit tests (Node.js test runner via tsx) - 66+ tests including WhatsApp module
- `tests/unit/edge-functions/` - Edge function unit tests (vitest) - tests sophia-bot code with Deno mocks
- `tests/e2e/` - Playwright E2E tests
- `tests/manual/` - Manual test scripts (e.g., `test-ai-models.ts`, `test-zyprus-api.ts`)

## Adding AI Tools

**CRITICAL**: Tools require DUAL registration in `app/(chat)/api/chat/route.ts`:

```typescript
// 1. Import
import { calculateVATTool } from "@/lib/ai/tools/calculate-vat";

// 2. Add to BOTH arrays (keys must match exactly, case-sensitive)
experimental_activeTools: ["calculateVAT", "createListing", "createLandListing", ...],
tools: { calculateVAT: calculateVATTool, createListing: createListingTool, ... }
```

Tool file structure (`lib/ai/tools/`): export `description`, `parameters` (Zod), and `execute` function.

**Property vs Land tools**: Properties have `createListing`/`uploadListing`, land has `createLandListing`/`uploadLandListing` with different field schemas.

## Streaming Chat Architecture

**Main endpoint**: `app/(chat)/api/chat/route.ts` → SSE via `JsonToSseTransformStream`
**Resume endpoint**: `app/(chat)/api/chat/[id]/stream/route.ts` → AI SDK `resumeStream` for reconnection

Key patterns:
- `pruneConversationHistory()` prevents unbounded token growth (`lib/ai/conversation-pruning.ts`)
- `stopWhen: stepCountIs(5)` limits tool call chains to 5 steps max
- `smoothStream({ chunking: "word" })` for smooth streaming UX
- System prompt cached 24h via `unstable_cache` (`lib/ai/prompts.ts`)
- Token tracking with `tokenlens` library (catalog cached 24h)
- `maxDuration = 120` seconds for image upload operations

**SSE Event Types**: `0:` text, `2:` tool call, `3:` tool result, `d:` done

## Edge Functions (Supabase)

**IMPORTANT**: All bot integrations run on Supabase Edge Functions (Deno), NOT Next.js API routes.

### sophia-bot (Primary Edge Function)

Handles both WhatsApp and Telegram (when enabled). Deploy: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`

- WhatsApp via WaSenderAPI (~$6/month) for DOCX attachments and text messages
- Secrets: `WASENDER_API_KEY`, `WASENDER_WEBHOOK_SECRET`
- Security: HMAC webhook authentication
- Telegram: typing indicators, message splitting, group lead management (currently DISABLED)

**sophia-bot internal structure:**
```
supabase/functions/sophia-bot/
├── handlers/        # Request routing (webhook.ts, admin.ts, health.ts)
├── prompts/         # AI prompt files (core/, behaviors/, knowledge/, templates/)
├── services/        # Business logic (prompt-loader.ts, description-generator.ts, image-handler.ts, my-notes-generator.ts, bazaraki-scraper.ts)
├── templates/       # Template detection and field extraction (detection.ts, fields.ts, registry.ts)
├── tools/           # AI tool definitions + executor (definitions.ts, executor.ts)
├── agents/          # Agent identification from phone number (identifier.ts)
├── memory/          # Conversation memory management (sophia-memory.ts)
├── rules/           # Business rules (reviewer-assignment.ts, region-validator.ts, bank-detection.ts, etc.)
├── config/          # Centralized constants and UUIDs (business-rules.ts)
├── zyprus/          # Zyprus API client for Edge Function (client.ts, taxonomy-cache.ts)
├── docx/            # DOCX document generation (templates/)
├── utils/           # Helpers (property-formatter.ts, webhook-auth.ts)
└── assets/          # Static assets (zyprus-logo.ts)
```

### _shared (Shared Edge Function Code)

`supabase/functions/_shared/` contains shared utilities imported by edge functions:
- `db.ts` - Chat history operations (`getHistory`, `addMessage`, `claimMessageForProcessing`, `saveLastDocument`, `getLastDocument`) + listing upload tracking (`trackListingUpload`, `getPendingListingUploads`, `markListingPublished`, `markListingExpired`)
- `zyprus.ts` - Legacy shared Zyprus API client
- `calculators.ts` - Shared calculator functions
- `tools.ts` - Shared tool definitions
- `services.ts` - Shared services
- `assets/` - Shared assets (zyprus-logo.ts)
- `mod.ts` - Barrel export file

### listing-notifier

Polls Zyprus API every 15 min (via pg_cron job #7) to check if uploaded draft listings have been published. Sends WhatsApp notification to the agent when their listing goes live. Expires tracking after 30 days. Deploy: `supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`

### draft-cleanup

Separate edge function for cleaning up old draft listings.

### Zyprus API Clients (THREE locations - know which one to edit)

| Location | Used By | Notes |
|----------|---------|-------|
| `supabase/functions/sophia-bot/zyprus/` | sophia-bot Edge Function | **Primary - edit this for WhatsApp upload changes** |
| `supabase/functions/_shared/zyprus.ts` | Legacy shared code | May be unused - check before editing |
| `lib/zyprus/` | Next.js web app | Only for web app property management |

All use Drupal JSON:API backend. OAuth 2.0 auth, auto-upload as unpublished drafts. See Zyprus API Quick Reference section below.

## Active Tools (WhatsApp via sophia-bot Edge Function)

Tool definitions in `supabase/functions/sophia-bot/tools/definitions.ts`, executor in `tools/executor.ts`:

| Category | Tool Name | Description |
|----------|-----------|-------------|
| **Property** | `createPropertyListing` | Creates draft listing on Zyprus (auto-upload, with floor plan support) |
| **Taxonomy** | `getZyprusData` | Fetch locations, property types, features |
| **Agents** | `getRegionalAgents` | List agents by region (for management assignment) |
| **Scraping** | `extractFromBazaraki` | Extract property data from Bazaraki listing URL |
| **Calculators** | `calculateVAT`, `calculateTransferFees`, `calculateCapitalGains` | Cyprus property tax calculations |
| **Email** | `sendEmail` | Send email to agent's registered Zyprus address |

**Key Files for Uploads:**
- `supabase/functions/sophia-bot/tools/executor.ts` - Tool execution logic
- `supabase/functions/sophia-bot/zyprus/client.ts` - Zyprus API client
- `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` - UUID resolution with fallbacks
- `supabase/functions/sophia-bot/services/image-handler.ts` - Image validation
- `supabase/functions/sophia-bot/services/bazaraki-scraper.ts` - Bazaraki listing extraction

**Source of Truth for Zyprus API:** `UPLOAD-LISTINGS-EXTENSIVE-INFO/` (DO NOT modify this folder)

## Code Style (Ultracite/Biome)

Key rules to follow:
- `enum` → use `as const` objects
- `any` → use proper types
- `.forEach()` → use `for...of`
- `function(){}` → use arrow functions
- `<button>` → always add `type` attribute
- Array index keys → use stable IDs
- No `console.log` in production code (except error logging)
- Use `import type` for type-only imports
- Prefer `at()` over bracket notation for array access

**Linting commands:**
- `pnpm lint` - Check for issues
- `pnpm format` - Auto-fix issues

See `.cursor/rules/ultracite.mdc` for full ruleset.

## Project Structure

```
app/                              # Next.js web app (Vercel)
├── (auth)/                       # Auth pages
├── (chat)/                       # Chat UI + /api/chat streaming endpoint
├── (admin)/                      # Admin dashboard (listings review, user management)
├── api/                          # REST endpoints (listings, templates)
└── properties/                   # Property management UI

lib/                              # Shared libraries (used by Next.js app)
├── ai/                           # providers.ts, prompts.ts, tools/, conversation-pruning.ts
├── db/                           # schema.ts, queries.ts, migrations/
├── telegram/                     # Telegram bot utilities
├── whatsapp/                     # WhatsApp bot utilities + DOCX
└── zyprus/                       # Zyprus API client (web app only)

supabase/functions/               # Edge Functions (Deno runtime - LIVE)
├── sophia-bot/                   # Main bot (WhatsApp + Telegram) - see detailed structure above
├── listing-notifier/             # Publication notification polling (pg_cron every 15 min)
├── _shared/                      # Shared code between edge functions (db, calculators, assets)
└── draft-cleanup/                # Draft listing cleanup

docs/
├── knowledge/                    # Cyprus real estate knowledge (reference only)
├── templates/                    # 38 document templates (reference only)
└── guides/                       # Setup guides
```

## Environment Variables

**Supabase Edge Function Secrets** (set via `supabase secrets set`):
```bash
OPENROUTER_API_KEY=             # AI via OpenRouter (NOT Gemini directly)
SUPABASE_URL=                   # Auto-set
SUPABASE_SERVICE_ROLE_KEY=      # Auto-set
TELEGRAM_BOT_TOKEN=             # Telegram bot
WASENDER_API_KEY=               # WhatsApp via WaSender
WASENDER_WEBHOOK_SECRET=        # Webhook HMAC verification
```

**For future Next.js deployment:**
```bash
POSTGRES_URL=                   # Session Pooler format
AUTH_SECRET=                    # NextAuth JWT key
```

See `.env.example` for complete list.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 503 Errors | Check OPENROUTER_API_KEY in Supabase Edge Function secrets |
| Edge Function timeout | Check `supabase functions logs <name>` for errors |
| Tool not working | Verify dual registration (both arrays) |
| Drizzle type errors | Run `pnpm db:generate` |
| "Cannot find module" | Check path aliases or Deno imports |
| Zyprus API 404 errors | Run `pnpm exec tsx tests/manual/test-zyprus-api.ts` to discover correct endpoint names |
| "Unable to create listing" | Check Edge Function logs for taxonomy errors; vocabulary names may have changed |
| Sentry "Project not found" | Verify `SENTRY_PROJECT` env var matches Sentry project slug (not display name) |
| WhatsApp issues | Check `supabase functions logs sophia-bot` |
| Telegram issues | Check `supabase functions logs sophia-bot` (shares the same edge function) |
| Prompt cache not updating | Bump cache key version in `lib/ai/prompts.ts` (e.g., `sophia-base-prompt-v10` → `v11`) |

## Key Patterns

- **Soft deletes**: Check `deletedAt IS NULL` in queries (`PropertyListing` table)
- **CASCADE deletes**: `Chat` deletion auto-deletes related `Message_v2`, `Vote_v2`, `Stream` records
- **Error responses**: Use `ChatSDKError` from `lib/errors.ts`
- **DB schema changes**: `pnpm db:generate` → `pnpm db:migrate` → `pnpm build`
- **Circuit breaker**: `opossum` package for API resilience (Zyprus API)
- **Document generation**: DOCX files via `docx` package, sent via Resend email
- **Lead routing**: SOPHIA spec rules in `lib/telegram/lead-router.ts` for agent assignment
- **Rate limiting**: Redis-backed via `@upstash/ratelimit`, limits in `lib/ai/entitlements.ts`
- **Caching**: System prompt cached 24h (`unstable_cache`), taxonomy cache 1h (Redis with in-memory fallback)
- **Webhook security**: HMAC signature verification for WhatsApp webhooks (`WASENDER_WEBHOOK_SECRET`)

---

## Zyprus API Quick Reference

**Primary client (sophia-bot)**: `supabase/functions/sophia-bot/zyprus/client.ts` (OAuth 2.0), `zyprus/taxonomy-cache.ts` (UUID resolution with hardcoded fallbacks)
**Web app client**: `lib/zyprus/client.ts`, `lib/zyprus/taxonomy-cache.ts` (Redis-backed cache with 1h TTL and in-memory fallback)

### Critical Configuration

```typescript
// MANDATORY headers for ALL requests
headers: {
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/vnd.api+json",
  "Accept": "application/vnd.api+json",
  "User-Agent": "SophiaAI"  // REQUIRED - Cloudflare whitelist
}
```

### Key Gotchas

1. **Indoor features vocabulary**: Use `indoor_property_views` (NOT `indoor_property_features`). The Drupal field is `field_indoor_property_features` but references `taxonomy_term--indoor_property_views`.

2. **Coordinates**: POINT format uses LON first: `"POINT (33.0413 34.6841)"` = LON LAT

3. **AI-generated listings**: Always set `status: false` (unpublished draft), `field_ai_state: "draft"`, `field_ai_generated: true`

4. **Land vs Property**: Different field prefixes - `field_land_price` vs `field_price`, `field_land_map` vs `field_map`

5. **AI Notes**: `field_ai_assistant_notes` does NOT exist on live API (verified Feb 2026). AI notes content is merged into `field_ai_message` instead.

6. **Required relationship fields** (verified Feb 2026):
   - ~~`field_listing_owner`~~ — does NOT exist on live API. The `uid` field (set by OAuth token) determines listing author.
   - `field_ai_listing_instructor` - User UUID who requested the upload
   - `field_ai_listing_reviewer` - Array of reviewer User UUIDs
   - `field_property_views` - Array of taxonomy_term--property_views UUIDs (Sea View, Mountain View, etc.)

7. **Reference ID format**: `field_ai_draft_own_reference_id` and `field_own_reference_id` use format: `Owner - {Agent} - {Seller} - {Phone} - {Email} - Reg No.{Reg}`

8. **Price modifiers** (live API): Price, Guide Price, Offers in region of, Offers over, Negotiable. Default: "Price" (`ab39af2d-c8f5-4971-9fa5-2df6822ab9a9`)

9. **Property status** (live API): Off-plan (`fcb94eb2-ddc8-4654-b017-135eee25c775`), Under construction (`c2ae2a05-8433-4b79-ab30-f5488b222033`)

10. **Floor plans**: Uploaded separately via `field_floor_plan` (images) and `field_pdf_floor_plan` (PDFs). Distinct from property gallery images (`field_gallery_`)

### Debugging

```bash
# Test all Zyprus API endpoints and discover vocabularies
pnpm exec tsx tests/manual/test-zyprus-api.ts
```

| Error | Cause | Solution |
|-------|-------|----------|
| 403 Forbidden | Missing User-Agent | Add `User-Agent: SophiaAI` header |
| 404 on taxonomy | Wrong vocabulary name | Run test script above |
| 422 Unprocessable | Invalid UUID | Verify taxonomy IDs from cache |
| field_gallery_ null | Images failed validation | Check image URLs are direct links (not HTML pages) |

### Testing Property Uploads

```bash
# Test multiple property uploads via webhook (RECOMMENDED)
npx tsx tests/manual/test-multi-upload.ts

# Test direct API upload (bypasses SOPHIA)
npx tsx tests/manual/upload-sophia-ai.ts

# Test Edge Function webhook (single property)
npx tsx tests/manual/test-sophia-edge-upload.ts

# Test all Zyprus API endpoints
npx tsx tests/manual/test-zyprus-api.ts
```

**Important:** Test phone numbers must match registered agents in `agents` table.
- Use `SELECT mobile, full_name, region FROM agents WHERE can_upload = true` to find valid numbers
- Agent region must match property location or upload will be rejected

**Verification:**
- Draft Dashboard: https://dev9.zyprus.com/draft-dashboard?ai_state=draft
- Edge Function Logs: Use Supabase MCP `get_logs` with service="edge-function"
- Chat History: Query `chat_history` table in Supabase for SOPHIA responses

**Key Constants** (centralized in `supabase/functions/sophia-bot/config/business-rules.ts`):
```typescript
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  // sophia_ai service account (NOT "Sophia" user d697ac16)
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"   // Michelle Pitsillides
LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74"    // Lauren (reviewer)
DEFAULT_LOCATION = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8"  // Acropolis, Strovolos
DEFAULT_PROPERTY_TYPE = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"  // Apartment
DEFAULT_PRICE_MODIFIER = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9"  // Price
PROPERTY_STATUS = { "off-plan": "fcb94eb2...", "under construction": "c2ae2a05..." }
```

See `tests/manual/README-UPLOADS.md` for complete test documentation.
