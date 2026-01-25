# Architecture Map: SOFIA v3.1.0

**Generated:** 2026-01-24 | **Skill:** brownfield-explore

---

## Stack Overview

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| **Framework** | Next.js | 15.5.7 | App Router, Turbo dev, NOT deployed |
| **Frontend** | React | 19.0.0-rc | RC release |
| **Language** | TypeScript | 5.6.3 | Strict mode enabled |
| **AI** | Google Gemini | via OpenRouter | `ai` SDK 5.0.26 |
| **Database** | Supabase PostgreSQL | - | Drizzle ORM (local), raw SQL (Edge) |
| **Deployment** | Supabase Edge Functions | Deno | **NO VERCEL** |
| **WhatsApp** | WaSenderAPI | - | sophia-bot Edge Function |
| **Telegram** | - | - | DISABLED |
| **Styling** | Tailwind CSS | 4.1.17 | - |
| **Linting** | Ultracite/Biome | 5.3.9 | `pnpm lint` / `pnpm format` |

---

## Type Safety Assessment

| Check | Status | Notes |
|-------|--------|-------|
| `"strict": true` | ENABLED | tsconfig.json |
| `"strictNullChecks": true` | ENABLED | Explicit |
| Path aliases | `@/*` | Maps to project root |
| `any` usage | Limited | Mostly in legacy adapters |
| Zod validation | Yes | For tool parameters |
| Generated types | Drizzle inferred | `InferSelectModel` |

---

## What Runs Where

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (LIVE)                              │
│  Project: vceeheaxcrhmpqueudqx                                  │
│  URL: https://vceeheaxcrhmpqueudqx.supabase.co                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Edge Functions:                                                │
│  ├── sophia-bot      ← WhatsApp webhook (LIVE, ~102KB)         │
│  │   ├── index.ts             Main handler                     │
│  │   ├── services/prompt-loader.ts  5-min cached prompts       │
│  │   ├── tools/               definitions.ts, executor.ts      │
│  │   ├── zyprus/              client.ts, taxonomy-cache.ts     │
│  │   ├── docx/                templates, detector              │
│  │   └── prompts/             Modular prompt fallbacks         │
│  │                                                              │
│  └── _shared/                 Common utilities                 │
│      ├── db.ts                Chat history management          │
│      ├── prompts.ts           Legacy fallback                  │
│      ├── calculators.ts       VAT, transfer fees, etc          │
│      └── zyprus.ts            API client (shared)              │
│                                                                 │
│  Database (25 tables):                                          │
│  ├── sophia_prompts (7 rows)        Editable via Dashboard     │
│  ├── agents (30 rows)               Real estate agents         │
│  ├── chat_history (2391 rows)       WhatsApp conversations     │
│  ├── sophia_user_profiles (14)      User preferences           │
│  ├── sophia_conversation_memory (1582)  RAG memory             │
│  ├── telegram_groups (4)            Group configs              │
│  ├── telegram_leads (13)            Lead tracking              │
│  ├── processed_webhooks (1152)      Deduplication              │
│  └── admin_users (3)                Dashboard access           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL NEXT.JS (NOT DEPLOYED)                 │
│  Path: ~/Desktop/Projects/aiagents/sofiatesting                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  app/                                                           │
│  ├── (chat)/           Chat UI + streaming API                 │
│  │   ├── api/chat/     Main streaming endpoint                 │
│  │   └── chat/[id]/    Chat page                               │
│  │                                                              │
│  ├── (admin)/          Admin dashboard                         │
│  │   └── admin/        Listings review, user management        │
│  │                                                              │
│  ├── (auth)/           Login/register                          │
│  │                                                              │
│  └── api/              REST endpoints                          │
│      ├── admin/        Admin APIs                              │
│      ├── listings/     Property CRUD                           │
│      ├── telegram/     Legacy webhook (use Edge instead)       │
│      └── whatsapp/     Legacy webhook (use Edge instead)       │
│                                                                 │
│  lib/                  Shared business logic                   │
│  ├── ai/               providers, prompts, tools/, entitlements│
│  ├── db/               schema.ts, queries.ts, migrations/      │
│  ├── telegram/         lead-router.ts, client.ts               │
│  ├── whatsapp/         message-handler.ts, session-manager     │
│  └── zyprus/           client.ts, taxonomy-cache.ts            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
sofiatesting/
├── app/                     # Next.js App Router (local only)
│   ├── (admin)/admin/       # Admin dashboard
│   ├── (auth)/              # Login, register
│   ├── (chat)/              # Chat UI + API
│   │   ├── api/chat/        # Streaming endpoint
│   │   └── chat/            # Chat pages
│   ├── api/                 # REST endpoints
│   │   ├── admin/           # Admin APIs
│   │   ├── listings/        # Property CRUD
│   │   └── ...
│   └── properties/          # Property management UI
│
├── components/              # React components
│   ├── admin/               # Admin panel components
│   ├── elements/            # Reusable elements
│   └── ui/                  # UI primitives (Radix-based)
│
├── lib/                     # Shared business logic
│   ├── ai/                  # AI configuration
│   │   ├── tools/           # 13 tool definitions
│   │   ├── prompts.ts       # System prompt builder
│   │   ├── providers.ts     # Model configuration
│   │   └── entitlements.ts  # Rate limits
│   ├── db/                  # Database
│   │   ├── schema.ts        # Drizzle schema (25+ tables)
│   │   ├── queries.ts       # DB queries
│   │   └── migrations/      # SQL migrations
│   ├── telegram/            # Telegram bot logic
│   │   ├── lead-router.ts   # Lead forwarding rules
│   │   └── client.ts        # API client
│   ├── whatsapp/            # WhatsApp logic
│   │   ├── message-handler.ts
│   │   └── session-manager.ts
│   └── zyprus/              # Zyprus API (property backend)
│       ├── client.ts        # OAuth, CRUD
│       └── taxonomy-cache.ts # UUID resolution
│
├── supabase/functions/      # EDGE FUNCTIONS (LIVE)
│   ├── sophia-bot/          # Main WhatsApp handler
│   │   ├── index.ts         # Entry (~102KB)
│   │   ├── services/        # prompt-loader, media-decryptor
│   │   ├── tools/           # definitions.ts, executor.ts
│   │   ├── zyprus/          # client.ts, taxonomy-cache.ts
│   │   ├── docx/            # templates, detector
│   │   ├── prompts/         # Modular prompt fallbacks
│   │   │   ├── core/        # identity, safety-rules
│   │   │   ├── behaviors/   # document-routing, property-upload
│   │   │   ├── knowledge/   # calculators, cyprus-real-estate
│   │   │   └── templates/   # content.ts (43 templates)
│   │   └── memory/          # RAG: sophia-memory.ts
│   └── _shared/             # Shared Edge utilities
│       ├── db.ts            # Chat history
│       ├── prompts.ts       # Legacy prompts
│       └── zyprus.ts        # API client
│
├── tests/
│   ├── unit/                # Node.js tests (66+)
│   ├── e2e/                 # Playwright tests
│   └── manual/              # Manual test scripts
│
├── docs/                    # Documentation
│   ├── templates/           # DOCX template sources
│   └── knowledge/           # Cyprus RE knowledge
│
└── UPLOAD-LISTINGS-EXTENSIVE-INFO/  # Zyprus API reference (READ-ONLY)
```

---

## SOPHIA Prompt System

### Two-Source Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOPHIA Prompt Loading                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Database: sophia_prompts table (TAKES PRECEDENCE)          │
│      ├── identity (priority 10)                                 │
│      ├── safety_rules (priority 20)                             │
│      ├── document_routing (priority 30)                         │
│      ├── property_upload (priority 40)                          │
│      ├── response_format (priority 50)                          │
│      ├── calculators (priority 60)                              │
│      └── cyprus_knowledge (priority 70)                         │
│                                                                 │
│   2. File Fallbacks (used if key NOT in DB):                    │
│      ├── prompts/core/identity.ts                               │
│      ├── prompts/core/safety-rules.ts                           │
│      ├── prompts/behaviors/document-routing.ts                  │
│      ├── prompts/behaviors/property-upload.ts                   │
│      ├── prompts/behaviors/response-format.ts                   │
│      ├── prompts/knowledge/calculators.ts                       │
│      ├── prompts/knowledge/cyprus-real-estate.ts                │
│      └── prompts/templates/content.ts (43 templates, file-only) │
│                                                                 │
│   3. prompt-loader.ts merges DB + fallbacks                     │
│      └── 5-minute cache (CACHE_TTL_MS = 5 * 60 * 1000)          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Editing Prompts

| What to change | Where to edit | Deploy needed? |
|----------------|---------------|----------------|
| identity/safety/routing/etc | DB: `sophia_prompts` table | No (5-min cache) |
| Template content | File: `prompts/templates/content.ts` | Yes |
| Add new prompt section | Both DB row + file fallback | Yes |

**Cache bypass for testing**: Set `CACHE_TTL_MS = 0` in `prompt-loader.ts`

---

## Existing Patterns

### API/Backend Patterns

```typescript
// Edge Function handler pattern
serve(async (req: Request) => {
  // HMAC webhook verification
  const signature = extractSignatureHeader(req);
  if (!verifyWebhookSignature(payload, signature, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(phoneNumber);
  if (!rateLimit.allowed) return new Response("Rate limited", { status: 429 });

  // Process message → AI → Response
  const response = await processMessage(message, context);
  return new Response(JSON.stringify(response), { status: 200 });
});
```

### Database Access (Edge Functions)

```typescript
// Direct Supabase client (no Drizzle in Edge Functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(supabaseUrl, supabaseKey);

// Raw SQL for queries
const { data, error } = await supabase
  .from("agents")
  .select("*")
  .eq("mobile", phone);
```

### AI Tool Pattern

```typescript
// Tool definition (lib/ai/tools/)
export const calculateVATTool = {
  description: "Calculate VAT for Cyprus property purchase",
  parameters: z.object({
    propertyPrice: z.number(),
    isFirstHome: z.boolean(),
  }),
  execute: async ({ propertyPrice, isFirstHome }) => {
    // Calculation logic
    return result;
  },
};

// Registration (DUAL registration required)
experimental_activeTools: ["calculateVAT", ...],
tools: { calculateVAT: calculateVATTool, ... }
```

### DOCX Generation Pattern

```typescript
// Template detection
const templateType = detectDocxTemplateType(message, history);

// Generate document
const docBuffer = await createDocxFile(templateType, data);

// Upload to Supabase Storage
const { publicUrl } = await uploadToStorage(docBuffer, filename);

// Send via WaSender
await sendDocumentViaWhatsApp(phoneNumber, publicUrl, filename);
```

---

## For Adding New Features

### Adding a New AI Tool

1. Create tool file: `lib/ai/tools/new-tool.ts`
2. Export `description`, `parameters` (Zod), `execute`
3. Register in `app/(chat)/api/chat/route.ts`:
   - Add to `experimental_activeTools` array
   - Add to `tools` object
4. For Edge Function: add to `sophia-bot/tools/definitions.ts` and `executor.ts`

### Adding a New DOCX Template

1. Add template name to `docx/detector.ts` detection logic
2. Create generator function in `docx/templates/`
3. Add to `docx-generator.ts` switch statement
4. Update `prompts/templates/content.ts` with instructions

### Adding a New Database Table

1. Define in `lib/db/schema.ts` using Drizzle
2. Run `pnpm db:generate` then `pnpm db:migrate`
3. For Edge Functions: use raw SQL (no Drizzle there)

### Modifying SOPHIA's Behavior

1. **Search ALL prompts** for the behavior (DB + files)
2. Check for conflicts (lower priority number wins)
3. Update DB via Supabase Dashboard OR file fallback
4. Set `CACHE_TTL_MS = 0` for testing
5. Deploy: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
6. Test on actual WhatsApp
7. Restore cache TTL

---

## Integration Points

### WhatsApp (WaSenderAPI)

```
Webhook URL: https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot
Secret: WASEND_WEBHOOK_SECRET
Features: Text messages, images, documents (DOCX)
```

### Zyprus API (Property Backend)

```
URL: https://dev9.zyprus.com/jsonapi/...
Auth: OAuth 2.0 (client credentials)
Headers: User-Agent: SophiaAI (required for Cloudflare)
```

### Resend (Email)

```
From: sofia@zyprus.com
Features: Plain text + DOCX attachments
Status: Configured, pending domain verification
```

---

## Risks/Gotchas

| Issue | Impact | Mitigation |
|-------|--------|------------|
| NO VERCEL | Don't suggest Vercel commands | Use Supabase Edge Functions only |
| 5-minute prompt cache | Changes delayed in production | Set `CACHE_TTL_MS = 0` when testing |
| Deno imports in Edge | Can't use npm packages directly | Use `https://esm.sh/` URLs |
| Conflicting prompts | AI follows lower priority number | Search ALL prompts before editing |
| 102KB index.ts | Near Edge Function limits | Consider splitting if grows more |
| Templates in file only | Can't edit via Dashboard | Must deploy to change templates |

---

## Security Observations

| Area | Status | Notes |
|------|--------|-------|
| **RLS** | Enabled | All tables have RLS policies |
| **Webhook auth** | HMAC | WaSenderAPI signature verification |
| **Rate limiting** | Yes | Per-phone number limits |
| **Input validation** | Yes | Phone, URL, payload validation |
| **Secrets** | Supabase Secrets | Not in code or env files |
| **CORS** | Default | Edge Functions handle |

---

## Commands Reference

```bash
# Development
pnpm dev              # Local Next.js (Turbo)
pnpm build            # Production build

# Database
pnpm db:generate      # Generate migrations
pnpm db:migrate       # Apply migrations
pnpm db:studio        # Drizzle Studio GUI

# Testing
pnpm test:unit        # All unit tests
pnpm test:ai-models   # Test AI connectivity

# Deployment (Supabase Edge)
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Linting
pnpm lint             # Check
pnpm format           # Fix
```

---

## Related Skills

After exploration, use these skills for implementation:

- `/sb` - Supabase database, auth, RLS
- `/sf` - Smart fix for debugging
- `/dd` - Deep debug for complex issues
- `/va` - Voice agent development
