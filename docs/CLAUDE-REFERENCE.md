# CLAUDE-REFERENCE.md

Extended reference for SOFIA project. Read `CLAUDE.md` first for essentials.

---

## Making SOPHIA Prompt Changes (Complete Workflow)

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

- Template content -> Edit `prompts/templates/content.ts` (file only, NOT in DB)
- Behaviors -> Update DB prompt AND corresponding file to stay in sync

```sql
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

Chat history pattern copying is the #1 reason prompt changes don't take effect.

```sql
DELETE FROM chat_history WHERE created_at >= NOW() - INTERVAL '1 hour';
```

**Step 7: TEST on WhatsApp, then verify**

```sql
SELECT parts FROM chat_history WHERE role = 'model' ORDER BY created_at DESC LIMIT 1;
```

**Step 8: RE-ENABLE cache** after confirmed working (`CACHE_TTL_MS = 5 * 60 * 1000`), deploy again.

---

## Why Prompt Changes Sometimes Don't Work

| Symptom | Cause | Solution |
|---------|-------|----------|
| Changes don't take effect after deploy | 5-minute cache still serving old prompts | Set `CACHE_TTL_MS = 0` in prompt-loader.ts, deploy |
| AI follows old instructions despite DB update | Conflicting rule in HIGHER priority prompt (lower number) | Search ALL prompts for the keyword, fix the lowest-numbered one |
| Updated DB but local file shows old text | DB and file out of sync | Always update BOTH to prevent future confusion |
| Template changes not working | `templates` content is in FILES not DB | Edit `prompts/templates/content.ts` directly |
| Behavior only partially changed | Multiple prompts contain variations of the same rule | Search + grep ALL prompts, consolidate instructions in ONE place |
| **AI keeps using OLD format despite all updates** | **Chat history has examples of old format - AI copies pattern** | **CLEAR chat_history table for the user** |

---

## Field Collection Prompts Location

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

---

## Checking Current Prompt State

```typescript
// Via Supabase MCP
mcp__plugin_supabase_supabase__execute_sql({
  project_id: "vceeheaxcrhmpqueudqx",
  query: "SELECT key, priority, LEFT(content, 200) as preview FROM sophia_prompts WHERE is_active = true ORDER BY priority"
})
```

---

## Prompt Content Ownership (SINGLE SOURCE OF TRUTH)

Each type of content belongs in exactly ONE place. Never duplicate.

| Content Type | Owner Prompt |
|--------------|--------------|
| **Field collection** ("I'll create X. Please provide:") | `document_routing` |
| **Template output format** (what document looks like) | `templates` |
| **Calculator formats** | `calculators` |
| **Cyprus knowledge/facts** | `cyprus_knowledge` |
| **Safety rules** | `safety_rules` |
| **Upload behavior** | `property_upload` |

---

## Project Overview

**SOFIA v3.2.0** - Next.js 15 AI assistant for Zyprus Property Group (Cyprus real estate). Core features:
- AI chat with Cyprus real estate tools (VAT, transfer fees, capital gains calculators)
- Property listing management with Zyprus API integration (Drupal JSON:API)
- Telegram and WhatsApp bot integration (dual-channel support)
- Document generation (37 DOCX templates via `docx` package, sent via Resend email)

---

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

---

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

---

## Adding AI Tools (Web App)

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

---

## Streaming Chat Architecture

**Main endpoint**: `app/(chat)/api/chat/route.ts` -> SSE via `JsonToSseTransformStream`
**Resume endpoint**: `app/(chat)/api/chat/[id]/stream/route.ts` -> AI SDK `resumeStream` for reconnection

Key patterns:
- `pruneConversationHistory()` prevents unbounded token growth (`lib/ai/conversation-pruning.ts`)
- `stopWhen: stepCountIs(5)` limits tool call chains to 5 steps max
- `smoothStream({ chunking: "word" })` for smooth streaming UX
- System prompt cached 24h via `unstable_cache` (`lib/ai/prompts.ts`)
- Token tracking with `tokenlens` library (catalog cached 24h)
- `maxDuration = 120` seconds for image upload operations

**SSE Event Types**: `0:` text, `2:` tool call, `3:` tool result, `d:` done

---

## Edge Functions (Supabase)

**IMPORTANT**: All bot integrations run on Supabase Edge Functions (Deno), NOT Next.js API routes.

### sophia-bot (Primary Edge Function)

Handles both WhatsApp and Telegram (when enabled).

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
- `assets/` - Shared assets
- `mod.ts` - Barrel export file

### listing-notifier

Polls Zyprus API every 15 min (via pg_cron job #7) to check if uploaded draft listings have been published. Sends WhatsApp notification to the agent when their listing goes live. Expires tracking after 30 days.

### draft-cleanup

Separate edge function for cleaning up old draft listings.

### Zyprus API Clients (THREE locations - know which one to edit)

| Location | Used By | Notes |
|----------|---------|-------|
| `supabase/functions/sophia-bot/zyprus/` | sophia-bot Edge Function | **Primary - edit this for WhatsApp upload changes** |
| `supabase/functions/_shared/zyprus.ts` | Legacy shared code | May be unused - check before editing |
| `lib/zyprus/` | Next.js web app | Only for web app property management |

---

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

---

## Code Style (Ultracite/Biome)

Key rules to follow:
- `enum` -> use `as const` objects
- `any` -> use proper types
- `.forEach()` -> use `for...of`
- `function(){}` -> use arrow functions
- `<button>` -> always add `type` attribute
- Array index keys -> use stable IDs
- No `console.log` in production code (except error logging)
- Use `import type` for type-only imports
- Prefer `at()` over bracket notation for array access

See `.cursor/rules/ultracite.mdc` for full ruleset.

---

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
├── sophia-bot/                   # Main bot (WhatsApp + Telegram)
├── listing-notifier/             # Publication notification polling (pg_cron every 15 min)
├── _shared/                      # Shared code between edge functions
└── draft-cleanup/                # Draft listing cleanup

docs/
├── knowledge/                    # Cyprus real estate knowledge (reference only)
├── templates/                    # 38 document templates (reference only)
└── guides/                       # Setup guides
```

---

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

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 503 Errors | Check OPENROUTER_API_KEY in Supabase Edge Function secrets |
| Edge Function timeout | Check `supabase functions logs <name>` for errors |
| Tool not working (web app) | Verify dual registration (both arrays) in route.ts |
| Drizzle type errors | Run `pnpm db:generate` |
| "Cannot find module" | Check path aliases or Deno imports |
| Zyprus API 404 errors | Run `pnpm exec tsx tests/manual/test-zyprus-api.ts` to discover correct endpoint names |
| "Unable to create listing" | Check Edge Function logs for taxonomy errors; vocabulary names may have changed |
| Sentry "Project not found" | Verify `SENTRY_PROJECT` env var matches Sentry project slug (not display name) |
| WhatsApp issues | Check `supabase functions logs sophia-bot` |
| Telegram issues | Check `supabase functions logs sophia-bot` (shares the same edge function) |
| Prompt cache not updating | Bump cache key version in `lib/ai/prompts.ts` (e.g., `sophia-base-prompt-v10` -> `v11`) |

---

## Key Patterns

- **Soft deletes**: Check `deletedAt IS NULL` in queries (`PropertyListing` table)
- **CASCADE deletes**: `Chat` deletion auto-deletes related `Message_v2`, `Vote_v2`, `Stream` records
- **Error responses**: Use `ChatSDKError` from `lib/errors.ts`
- **DB schema changes**: `pnpm db:generate` -> `pnpm db:migrate` -> `pnpm build`
- **Circuit breaker**: `opossum` package for API resilience (Zyprus API)
- **Document generation**: DOCX files via `docx` package, sent via Resend email
- **Lead routing**: SOPHIA spec rules in `lib/telegram/lead-router.ts` for agent assignment
- **Rate limiting**: Redis-backed via `@upstash/ratelimit`, limits in `lib/ai/entitlements.ts`
- **Caching**: System prompt cached 24h (`unstable_cache`), taxonomy cache 1h (Redis with in-memory fallback)
- **Webhook security**: HMAC signature verification for WhatsApp webhooks (`WASENDER_WEBHOOK_SECRET`)

---

## Zyprus API Quick Reference

See `docs/ZYPRUS_API_REFERENCE.md` for comprehensive API docs.

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
   - ~~`field_listing_owner`~~ -- does NOT exist on live API. The `uid` field (set by OAuth token) determines listing author.
   - `field_ai_listing_instructor` - User UUID who requested the upload
   - `field_ai_listing_reviewer` - Array of reviewer User UUIDs
   - `field_property_views` - Array of taxonomy_term--property_views UUIDs
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
npx tsx tests/manual/test-multi-upload.ts        # Multiple uploads via webhook (RECOMMENDED)
npx tsx tests/manual/upload-sophia-ai.ts         # Direct API upload (bypasses SOPHIA)
npx tsx tests/manual/test-sophia-edge-upload.ts  # Edge Function webhook (single property)
npx tsx tests/manual/test-zyprus-api.ts          # Test all Zyprus API endpoints
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
SOPHIA_AI_UUID = "7026c7a3-1ef0-419f-9957-15a8c161b614"  // sophia_ai service account
MICHELLE_UUID = "dc2688d2-0ea1-4c13-b03d-3309ee8de6a4"   // Michelle Pitsillides
LAUREN_UUID = "0caa9a75-362a-4156-b11b-b52839243b74"    // Lauren (reviewer)
DEFAULT_LOCATION = "7dbc931e-90eb-4b89-9ac8-b5e593831cf8"  // Acropolis, Strovolos
DEFAULT_PROPERTY_TYPE = "e3c4bd56-f8c4-4672-b4a2-23d6afe6ca44"  // Apartment
DEFAULT_PRICE_MODIFIER = "ab39af2d-c8f5-4971-9fa5-2df6822ab9a9"  // Price
PROPERTY_STATUS = { "off-plan": "fcb94eb2...", "under construction": "c2ae2a05..." }
```

See `tests/manual/README-UPLOADS.md` for complete test documentation.
