# WhatsApp Dual Architecture

## Overview

SOFIA has two parallel WhatsApp implementations due to deployment constraints:

1. **Local (`lib/whatsapp/`)**: Reference code for Next.js integration (NOT deployed)
2. **Edge (`supabase/functions/sophia-bot/`)**: LIVE production on Supabase Edge Functions

This dual architecture exists because:
- The Next.js app is NOT deployed to Vercel
- WhatsApp bot runs on Supabase Edge Functions (Deno runtime)
- Local code serves as reference and for local testing

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     LIVE PRODUCTION                              │
│                                                                  │
│   WhatsApp → WaSenderAPI → Supabase Edge Function (sophia-bot)  │
│                                ↓                                 │
│                          OpenRouter API                          │
│                                ↓                                 │
│                          Zyprus API (Drupal)                    │
│                                ↓                                 │
│                          WaSenderAPI → WhatsApp                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     LOCAL REFERENCE (Not Deployed)               │
│                                                                  │
│   lib/whatsapp/              lib/ai/tools/                      │
│   ├── message-handler.ts     ├── send-email.ts                  │
│   ├── client.ts              ├── upload-listing.ts              │
│   ├── user-mapping.ts        └── registry.ts                    │
│   ├── rate-limiter.ts                                           │
│   └── constants.ts           lib/zyprus/                        │
│                              ├── client.ts (1764 lines)         │
│                              └── taxonomy-cache.ts              │
└─────────────────────────────────────────────────────────────────┘
```

## When to Modify Each

| Change Type | Modify Local | Modify Edge | Notes |
|-------------|--------------|-------------|-------|
| **AI Tools** | Yes | Yes | Sync tool definitions |
| **Zyprus API** | Yes | Yes | API client changes |
| **Security** | Yes | Yes | URL validation, etc. |
| **WaSender client** | Yes | N/A | Edge has inline impl |
| **DOCX templates** | N/A | Yes | Edge only |
| **Prompts/Instructions** | N/A | Yes | Edge has own prompts.ts |
| **Rate limiting** | Yes | Yes | Sync logic |
| **Error handling** | Yes | Yes | Sync patterns |

## Key Differences

| Aspect | Local (`lib/`) | Edge (`sophia-bot/`) |
|--------|----------------|----------------------|
| **Runtime** | Node.js | Deno |
| **AI Provider** | Vercel AI SDK via myProvider | Direct OpenRouter fetch |
| **Tool Calling** | `experimental_activeTools` array | OpenRouter `tools` param |
| **Zyprus Client** | 1764 lines with circuit breakers | 363 lines, simplified |
| **Unit Tests** | 60+ tests | 0 tests |
| **Caching** | Redis + in-memory fallback | Supabase KV |

## Sync Process

When making changes that affect both systems:

1. **Make changes to local `lib/` code first**
   ```bash
   # Edit local files
   vim lib/whatsapp/message-handler.ts
   ```

2. **Run local tests**
   ```bash
   pnpm test:unit
   ```

3. **Port changes to Edge Function**
   ```bash
   # Get current Edge Function code
   mcp__plugin_supabase_supabase__get_edge_function(
     project_id="vceeheaxcrhmpqueudqx",
     function_slug="sophia-bot"
   )

   # Files extracted to: /tmp/sophia-deploy/supabase/functions/sophia-bot/
   ```

4. **Deploy Edge Function**
   ```bash
   cd /tmp/sophia-deploy && supabase functions deploy sophia-bot --no-verify-jwt
   ```

5. **Verify in production**
   ```bash
   supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx
   ```

## Supabase Project Reference

| Key | Value |
|-----|-------|
| **Project ID** | `vceeheaxcrhmpqueudqx` |
| **Dashboard** | https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx |
| **Edge Functions URL** | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/` |
| **WhatsApp Webhook** | `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot` |

## Code Duplication Concerns

The following code is duplicated and should be kept in sync:

### 1. Zyprus API Client
- **Local**: `lib/zyprus/client.ts` (1764 lines)
- **Edge**: `sophia-bot/zyprus/client.ts` (363 lines)
- **Drift**: Local has circuit breakers, land listings, file uploads that Edge lacks

### 2. Taxonomy Cache
- **Local**: `lib/zyprus/taxonomy-cache.ts`
- **Edge**: `sophia-bot/zyprus/taxonomy-cache.ts`
- **Drift**: Local has background refresh, Edge is simpler

### 3. URL Validation
- **Local**: `lib/ai/security/url-validator.ts` (NEW)
- **Edge**: Should be added to prevent SSRF

### 4. Rate Limiting
- **Local**: `lib/whatsapp/rate-limiter.ts` (NEW)
- **Edge**: Has own `utils/rate-limiter.ts`

## Technical Debt

1. **God Object**: `sophia-bot/index.ts` is 2096 lines
   - Should be split into handlers/, services/, utils/

2. **Missing Circuit Breakers in Edge**
   - Zyprus API calls have no resilience

3. **No Tests for Edge Function**
   - All validation happens in local code only

4. **Different Error Handling Patterns**
   - Local has structured logging, Edge uses console

## Migration Plan

See `sophia-bot-modularization.md` for the plan to:
1. Split index.ts into focused modules
2. Add shared type definitions
3. Implement circuit breakers
4. Add Deno-compatible tests
