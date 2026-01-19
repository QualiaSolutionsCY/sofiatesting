# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

**Key documents:** `IMPLEMENTATION_PLAN.md` (task tracking), `docs/PRD.md` (requirements), `docs/ARCHITECTURE.md` (system design)

**Slash commands** (`.claude/commands/`): `/deploy-checklist`, `/test-all`, `/tool-audit`, `/new-tool <name> <desc>`, `/telegram-debug`, `/db-check`

**Skills** (project-managed): `sofia-debugger` (debug SOFIA issues), `cyprus-calculator` (property tax calculations)

## Project Overview

**SOFIA v3.1.0** - Next.js 15 AI assistant for Zyprus Property Group (Cyprus real estate). Core features:
- AI chat with Cyprus real estate tools (VAT, transfer fees, capital gains calculators)
- Property listing management with Zyprus API integration (Drupal JSON:API)
- Telegram and WhatsApp bot integration (dual-channel support)
- Document generation (38 DOCX templates via `docx` package, sent via Resend email)

---

## CRITICAL: Supabase Edge Functions Architecture

**SOPHIA runs on Supabase Edge Functions, NOT Vercel.**

### Supabase Project
| Key | Value |
|-----|-------|
| **Project ID** | `vceeheaxcrhmpqueudqx` |
| **Dashboard** | https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx |
| **Edge Functions URL** | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/` |

### What Runs Where
| Component | Function | Purpose |
|-----------|----------|---------|
| **WhatsApp Bot** | `sophia-bot` | Full SOPHIA - chat, calculators, uploads, DOCX |
| **Telegram Bot** | `telegram-sophia` | Lead rerouting only (NOT full chat) |

### Shared Code Architecture (`_shared/` folder)

```
supabase/functions/
├── _shared/                    # Reusable modules
│   ├── adapters/types.ts       # UnifiedMessage, Agent types
│   ├── db.ts                   # Chat history, deduplication
│   ├── prompts.ts              # SOPHIA system prompt (4,500 lines)
│   ├── tools.ts                # Tool definitions + calculator handlers
│   ├── calculators.ts          # VAT, Transfer Fees, Capital Gains
│   ├── services.ts             # Image handling, URL validation
│   ├── zyprus.ts               # Zyprus API client + taxonomy
│   ├── assets/zyprus-logo.ts   # Logo base64
│   └── mod.ts                  # Barrel export
├── sophia-bot/                 # WhatsApp (imports from _shared/)
│   ├── index.ts                # Main handler
│   ├── tools/executor.ts       # Full tool execution (uploads)
│   ├── zyprus/                 # Zyprus API specifics
│   └── ...
└── telegram-sophia/            # Telegram (lead routing only)
    └── ...                     # Separate codebase, NOT using _shared/
```

### Deploy Commands
```bash
# Deploy WhatsApp bot
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Telegram toggle (lead routing)
supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx
supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx
```

### Important Notes for Next Agent
1. **DO NOT create a new telegram-bot** - Telegram is lead-routing only via `telegram-sophia`
2. **sophia-bot imports from `_shared/`** - prompts.ts, db.ts are shared
3. **Upload logic stays in sophia-bot** - `tools/executor.ts`, `zyprus/` folder
4. **Never touch telegram-sophia** - it has its own codebase for lead routing

---

## AI Configuration

**Google Gemini API is mandatory** - set `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY`. Using **Tier 1** (paid) for higher rate limits.

| Model ID | Actual Model | Use Case |
|----------|-------------|----------|
| `chat-model` | `gemini-3-pro-preview` | **Default** - Best reasoning, 1M context, multimodal |
| `chat-model-gemini3` | `gemini-3-pro-preview` | Explicit alias for default |
| `chat-model-pro` | `gemini-2.5-pro` | Previous gen reasoning fallback |
| `chat-model-flash` | `gemini-2.5-flash` | Fast with good quality |
| `chat-model-flash-lite` | `gemini-2.5-flash-lite` | Ultra-fast, cost-efficient |
| `title-model` | `gemini-2.5-flash` | Chat title generation |
| `artifact-model` | `gemini-3-pro-preview` | Uses default model |

See `lib/ai/providers.ts` for implementation details.

## Database

**Supabase PostgreSQL** - Project ID: `ebgsbtqtkdgaafqejjye`, Region: eu-west-3 (Paris)

**CRITICAL**: Vercel requires **Session Pooler** format (IPv4):
```bash
POSTGRES_URL="postgresql://postgres.ebgsbtqtkdgaafqejjye:[PASSWORD]@aws-1-eu-west-3.pooler.supabase.com:5432/postgres"
# NOT: postgresql://postgres:[PASSWORD]@db.ebgsbtqtkdgaafqejjye.supabase.co:5432/postgres (will fail)
```

**Schema** (Drizzle ORM in `lib/db/schema.ts`):
- `User` - email/password auth
- `Chat` - conversations with `visibility` (public/private), `lastContext` for token tracking
- `Message_v2` - chat messages with `parts` (JSON), `attachments` (JSON), CASCADE delete on chat
- `Vote_v2` - message feedback, CASCADE delete on chat/message
- `PropertyListing` - draft listings with `deletedAt` soft delete, `uploadStatus` tracking
- `Stream` - SSE stream resumption, CASCADE delete on chat
- `ListingUploadAttempt` - upload retry tracking with error logs

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

pnpm test:unit        # All unit tests
pnpm test:ai-models   # Test AI model connectivity
PLAYWRIGHT=True pnpm test  # E2E tests (requires dev server)

# Single test file (node:test runner via tsx)
pnpm exec tsx --test tests/unit/your-file.test.ts

# Run specific Playwright test
PLAYWRIGHT=True pnpm exec playwright test tests/e2e/your-file.spec.ts

# Test parallel image uploads
pnpm test:unit:parallel-uploads
```

**Test file locations:**
- `tests/unit/` - Unit tests (Node.js test runner via tsx) - 66+ tests including WhatsApp module
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

## Integrations

**Telegram** (`lib/telegram/`): Webhook at `/api/telegram/webhook`, typing indicators (time-based, 3s interval), message splitting, group lead management via `lib/telegram/lead-router.ts`

**WhatsApp** (`lib/whatsapp/`): Uses WaSenderAPI (~$6/month) for DOCX attachments and text messages. Requires `WASENDER_API_KEY` and `WASENDER_WEBHOOK_SECRET` env vars. Features: text messages, document uploads (upload→URL→send flow), all AI tools including calculators, listings, and document generation. Security: HMAC webhook authentication, Redis session storage, optimized deduplication cache.

**Zyprus API** (`lib/zyprus/`): Drupal JSON:API backend for property/land listings. OAuth 2.0 auth, auto-upload as unpublished drafts. Redis-cached taxonomy (1h TTL) with in-memory fallback. See Zyprus API Quick Reference section below.

## Active Tools

Tool files in `lib/ai/tools/` - each exports `description`, `parameters` (Zod), `execute`:

| Category | Tools |
|----------|-------|
| **Property** | `createListing`, `listListings`, `uploadListing` |
| **Land** | `createLandListing`, `uploadLandListing` |
| **Calculators** | `calculateTransferFees`, `calculateCapitalGains`, `calculateVAT` |
| **Taxonomy** | `getZyprusData` (fetch location/property type UUIDs) |
| **Documents** | `sendDocument` (email DOCX templates via Resend) |
| **UX** | `requestSuggestions` |

**Disabled tools**: `createDocument`, `updateDocument`, `getGeneralKnowledge` (knowledge now embedded in system prompt, cached 24h)

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
app/
├── (auth)/           # Auth pages
├── (chat)/           # Chat UI + /api/chat streaming endpoint
├── (admin)/          # Admin dashboard (listings review, user management)
├── api/              # REST endpoints (listings, templates, telegram, whatsapp)
└── properties/       # Property management UI

lib/
├── ai/               # providers.ts, prompts.ts, tools/, conversation-pruning.ts
├── db/               # schema.ts, queries.ts, migrations/
├── telegram/         # Telegram bot
├── whatsapp/         # WhatsApp bot + DOCX
└── zyprus/           # Zyprus API client

docs/
├── knowledge/        # Cyprus real estate knowledge (embedded in system prompt)
├── templates/        # 38 document templates
└── guides/           # Setup guides
```

## Environment Variables

Required:
```bash
GOOGLE_GENERATIVE_AI_API_KEY=  # or GEMINI_API_KEY
POSTGRES_URL=                   # Session Pooler format (see Database section)
AUTH_SECRET=                    # NextAuth JWT key
```

Optional integrations: `TELEGRAM_BOT_TOKEN`, `WASENDER_API_KEY`, `WASENDER_WEBHOOK_SECRET`, `ZYPRUS_CLIENT_ID`, `ZYPRUS_CLIENT_SECRET`, `ZYPRUS_API_URL`

See `.env.example` for complete list.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 503 Errors | Check GEMINI_API_KEY in Vercel |
| DNS errors on Vercel | Use Session Pooler, not direct connection |
| Tool not working | Verify dual registration (both arrays) |
| Drizzle type errors | Run `pnpm db:generate` |
| "Cannot find module" | Check path aliases (@/lib, @/app) |
| Zyprus API 404 errors | Run `pnpm exec tsx tests/manual/test-zyprus-api.ts` to discover correct endpoint names |
| "Unable to create listing" | Check Vercel logs for taxonomy errors; vocabulary names may have changed |
| Sentry "Project not found" | Verify `SENTRY_PROJECT` env var matches Sentry project slug (not display name) |
| WhatsApp issues | See `IMPLEMENTATION_PLAN.md` → "WhatsApp Integration Hardening" section (Issues #1-6 resolved, 66 tests) |
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

**Architecture**: `lib/zyprus/client.ts` (API client with OAuth 2.0), `lib/zyprus/taxonomy-cache.ts` (Redis-backed cache with 1h TTL and in-memory fallback)

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

5. **AI Notes field**: `field_ai_assistant_notes` is a new text field auto-populated on listing upload with user requirements, property type, and key features summary

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