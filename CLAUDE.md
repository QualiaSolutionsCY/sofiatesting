# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## CRITICAL: Current Architecture

**READ THIS FIRST - DO NOT ASSUME VERCEL**

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
| **Telegram Bot** | Supabase Edge Functions | **DISABLED** |
| **AI Proxy (ai-chat)** | Supabase Edge Functions | LIVE |
| **Web App (Next.js)** | NOT DEPLOYED | Future |
| **Database** | Supabase PostgreSQL | LIVE |

**THERE IS NO VERCEL DEPLOYMENT. NEVER SUGGEST VERCEL.**

### Telegram Bot Toggle

```bash
# TURN ON SOPHIA on Telegram:
supabase secrets set SOPHIA_TELEGRAM_ENABLED=true --project-ref vceeheaxcrhmpqueudqx

# TURN OFF SOPHIA on Telegram:
supabase secrets set SOPHIA_TELEGRAM_ENABLED=false --project-ref vceeheaxcrhmpqueudqx
```

**Current status: DISABLED** (as of Jan 2026)

---

### How to Edit SOPHIA Templates/Prompts

**SOPHIA's brain lives in the `sophia-bot` Edge Function, NOT in local files.**

1. **Get current code via Supabase MCP:**
   ```
   mcp__plugin_supabase_supabase__get_edge_function(project_id="vceeheaxcrhmpqueudqx", function_slug="sophia-bot")
   ```

2. **Key file: `prompts.ts`** - Contains ALL SOPHIA instructions, templates, and behavior

3. **Edit locally, then deploy:**
   ```bash
   # Files are extracted to /tmp/sophia-deploy/supabase/functions/sophia-bot/
   # Edit prompts.ts or other files
   cd /tmp/sophia-deploy && supabase functions deploy sophia-bot --no-verify-jwt
   ```

4. **DO NOT edit these local files expecting changes to go live:**
   - `lib/ai/instructions/` - NOT USED by live SOPHIA
   - `docs/templates/` - Reference only, NOT USED by live SOPHIA
   - `docs/knowledge/` - NOT USED by live SOPHIA
   - `app/api/` - NOT USED (no Vercel deployment)

**The ONLY way to update live SOPHIA is to deploy the `sophia-bot` Edge Function.**

---

**DO NOT** suggest:
- Vercel deployments
- Next.js API routes
- Editing local `lib/` or `docs/` files for SOPHIA changes

**DO** use:
- Supabase MCP to get/deploy edge functions
- `supabase functions deploy sophia-bot --no-verify-jwt`
- Project ID: `vceeheaxcrhmpqueudqx`

---

## Quick Reference

**Key documents:** `docs/PRD.md` (requirements), `docs/ARCHITECTURE.md` (system design)

**Slash commands** (`.claude/commands/`): `/deploy-checklist`, `/test-all`, `/tool-audit`, `/new-tool <name> <desc>`, `/telegram-debug`, `/db-check`

**Skills** (project-managed): `sofia-debugger` (debug SOFIA issues), `cyprus-calculator` (property tax calculations)

---

## Current Status

### Recently Implemented
- **`sendEmail` tool** (`lib/ai/tools/send-email.ts`) - Direct email sending from WhatsApp without UI forms
  - Supports optional DOCX document attachments via `documentUrl` parameter
  - Uses Resend API with `sofia@zyprus.com` as sender
  - Registered in WhatsApp message handler (`lib/whatsapp/message-handler.ts`)
  - Flow: User creates document → User asks to email it → AI uses `sendEmail` with document URL

### Configured
- `RESEND_API_KEY` - Set in Supabase Edge Function secrets

### Pending
1. **Resend Domain Verification** - Add SPF/DKIM records for `zyprus.com` in DNS (skip MX record to avoid Google Workspace conflicts)
2. **Deploy to Supabase** - `supabase functions deploy whatsapp-webhook` after domain verification
3. **End-to-End Testing** - Test flow: create document via WhatsApp → send via email with attachment

### SOPHIA Updates (Jan 2026)

**Property Uploads - NOW WORKING! ✅**
- ✅ WhatsApp listing uploads work via Edge Function `sophia-bot`
- ✅ Tool name: `createPropertyListing` (auto-uploads to Zyprus as draft)
- ✅ Hardcoded fallback taxonomy UUIDs ensure uploads never fail on taxonomy lookup
- ✅ Minimum 1 image required (reduced from 3)
- ✅ Google Maps links: SOPHIA now asks for area name instead of guessing
- ✅ ibb.co links: SOPHIA explains direct image URLs are needed (i.ibb.co not ibb.co)

**New Fields Added (Jan 16, 2026):**
- ✅ `field_listing_owner` - UUID of agent who owns the listing (for commission tracking)
- ✅ `field_ai_draft_own_reference_id` - Auto-generated reference: `SOPHIA-YYYYMMDD-HHMMSS-TYP`
- ✅ `field_property_views` - Sea View, Mountain View, etc. now properly populated
- Files modified: `zyprus/client.ts`, `zyprus/taxonomy-cache.ts`

**Description Format (Comprehensive Itemized - Jan 16, 2026):**
- ✅ Now generates **itemized bullet lists** matching Zyprus website style
- File: `supabase/functions/sophia-bot/services/description-generator.ts`
- Format:
  ```
  Stunning 4 Bedroom Detached Villa For Sale in Agios Tychonas with Separate Title Deeds

  [Location paragraph]

  KEY FEATURES:
  • 4 Bedrooms
  • 3 Bathrooms
  • 280m² Covered Area
  • 1200m² Plot Size
  • Built in 2019
  • Separate Title Deeds

  INDOOR FEATURES:
  • Air Conditioning
  • Central Heating
  • Wine Cellar

  OUTDOOR FEATURES:
  • Private Swimming Pool
  • Double Garage
  • Landscaped Garden

  PROPERTY VIEWS:
  • Sea View
  • Mountain View

  [Closing + Price + CTA]
  ```

**Region Restrictions:**
- Agents can ONLY upload properties in their assigned region
- Error: "Unfortunately, you are not allowed to market a property outside your region"
- Check `agents` table for `region` field (paphos, limassol, larnaca, nicosia, famagusta, all)

**Image Handling:**
- Phone gallery attachments: ✅ Work automatically (WaSend extracts URLs)
- Direct image URLs: ✅ Must be actual images (not HTML pages like ibb.co sharing links)
- Image validation: HEAD request with GET fallback for servers that don't support HEAD

**Templates & Documents:**
- ✅ Removed "Phone-Only Addon" from Template 17 (Good Client Email)
- ✅ Viewing Forms: SOPHIA now asks "Standard or Advanced?" when type not specified
- ✅ Viewing Form DOCX titles now just show "Viewing Form" (no Standard/Advanced visible to client)
- ✅ **Removed Template 16 (Exclusive Marketing Agreement)** - only Non-Exclusive and Email Marketing remain
- ✅ Non-Exclusive Marketing Agreement fixes:
  - Agent name: Charalambos Pitros (was Pitsillides)
  - Removed "(name of the seller)" text
  - Added signature spacing lines

**Knowledge & Responses:**
- ✅ Deleted `Zoning_Density_Land_.pptx` from knowledge
- ✅ CREA wording now sends as **3 separate messages** (intro, copy-pasteable block, important note)

**Deploy command:** `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`

---

## Project Overview

**SOFIA v3.1.0** - Next.js 15 AI assistant for Zyprus Property Group (Cyprus real estate). Core features:
- AI chat with Cyprus real estate tools (VAT, transfer fees, capital gains calculators)
- Property listing management with Zyprus API integration (Drupal JSON:API)
- Telegram and WhatsApp bot integration (dual-channel support)
- Document generation (37 DOCX templates via `docx` package, sent via Resend email)

## AI Configuration

**OpenRouter is the AI provider** - Gemini models accessed via OpenRouter proxy (Supabase Edge Function `ai-chat`).

Set `OPENROUTER_API_KEY` in Supabase Edge Function secrets. **NO direct Gemini API key needed.**

| Model | Via OpenRouter | Use Case |
|-------|----------------|----------|
| `google/gemini-2.0-flash` | Default | Fast, cost-effective |
| `google/gemini-pro` | Fallback | Complex reasoning |

**Edge Function**: `supabase/functions/ai-chat/` proxies requests to OpenRouter.

## Database

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

## Integrations (Supabase Edge Functions)

**IMPORTANT**: All bot integrations run on Supabase Edge Functions, NOT Next.js API routes.

**Telegram** (`supabase/functions/telegram-webhook/`):
- Webhook receives updates from Telegram
- Typing indicators (time-based, 3s interval)
- Message splitting for long responses
- Group lead management via lead-router logic
- Deploy: `supabase functions deploy telegram-webhook`

**WhatsApp** (`supabase/functions/whatsapp-webhook/`):
- Uses WaSenderAPI (~$6/month) for DOCX attachments and text messages
- Secrets: `WASENDER_API_KEY`, `WASENDER_WEBHOOK_SECRET` (set via Supabase dashboard)
- Features: text messages, document uploads, all AI tools
- Security: HMAC webhook authentication, Redis session storage
- Deploy: `supabase functions deploy whatsapp-webhook`

**Shared logic** (`lib/` folder):
- `lib/telegram/` - Telegram-specific utilities (can be imported in Edge Functions)
- `lib/whatsapp/` - WhatsApp-specific utilities
- `lib/ai/` - AI providers, tools, prompts (shared across channels)

**Zyprus API** (`lib/zyprus/`): Drupal JSON:API backend for property/land listings. OAuth 2.0 auth, auto-upload as unpublished drafts. Redis-cached taxonomy (1h TTL) with in-memory fallback. See Zyprus API Quick Reference section below.

## Active Tools (WhatsApp via sophia-bot Edge Function)

Tool definitions in `supabase/functions/sophia-bot/tools/definitions.ts`, executor in `tools/executor.ts`:

| Category | Tool Name | Description |
|----------|-----------|-------------|
| **Property** | `createPropertyListing` | Creates draft listing on Zyprus (auto-upload) |
| **Taxonomy** | `getZyprusData` | Fetch locations, property types, features |
| **Calculators** | `calculateVAT`, `calculateTransferFees`, `calculateCapitalGains` | Cyprus property tax calculations |

**Key Files for Uploads:**
- `supabase/functions/sophia-bot/tools/executor.ts` - Tool execution logic
- `supabase/functions/sophia-bot/zyprus/client.ts` - Zyprus API client
- `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` - UUID resolution with fallbacks
- `supabase/functions/sophia-bot/services/image-handler.ts` - Image validation

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
| WhatsApp issues | Check `supabase functions logs whatsapp-webhook` - see IMPLEMENTATION_PLAN.md for known issues |
| Telegram issues | Check `supabase functions logs telegram-webhook` |
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

6. **Required relationship fields** (Jan 2026):
   - `field_listing_owner` - User UUID who owns the listing (use instructor UUID as fallback)
   - `field_ai_listing_instructor` - User UUID who requested the upload
   - `field_ai_listing_reviewer` - Array of reviewer User UUIDs
   - `field_property_views` - Array of taxonomy_term--property_views UUIDs (Sea View, Mountain View, etc.)

7. **Reference ID format**: `field_ai_draft_own_reference_id` should be `SOPHIA-YYYYMMDD-HHMMSS-TYP` where TYP is first 3 chars of property type (e.g., VIL, APA, TOW)

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

**Key Constants:**
```typescript
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  // For field_ai_listing_instructor
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"   // Michelle Pitsillides
LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74"    // Lauren (reviewer)
DEFAULT_LOCATION = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8"  // Acropolis, Strovolos
DEFAULT_PROPERTY_TYPE = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"  // Apartment
```

See `tests/manual/README-UPLOADS.md` for complete test documentation.
