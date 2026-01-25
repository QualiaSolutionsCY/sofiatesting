# Architecture Map: SOPHIA (sofiatesting)

**Generated:** 2026-01-24 | **Based on:** Handoff + Brownfield Exploration

---

## Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | Next.js 15.5.7 + React 19 RC | App Router, Turbo dev |
| **AI** | Google Gemini via OpenRouter | `ai` SDK 5.0.26 |
| **Database** | Supabase PostgreSQL | Drizzle ORM (local), raw SQL (Edge) |
| **Deployment** | Supabase Edge Functions | **NO VERCEL** - critical |
| **WhatsApp** | WaSenderAPI + sophia-bot | Webhook → Edge Function |
| **Telegram** | telegram-webhook | Currently DISABLED |
| **Styling** | Tailwind CSS 4.1.17 | |
| **Linting** | Ultracite (Biome) | `pnpm lint` / `pnpm format` |

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
│  ├── sophia-bot (v360)     ← WhatsApp webhook (LIVE)           │
│  ├── telegram-webhook      ← Telegram (DISABLED)                │
│  └── ai-chat               ← AI proxy                           │
│                                                                 │
│  Database (25+ tables):                                         │
│  ├── sophia_prompts (7)    ← Editable via Dashboard             │
│  ├── agents (30)           ← Real estate agents                 │
│  ├── chat_history (2328)   ← WhatsApp conversations             │
│  ├── sophia_user_profiles  ← User preferences                   │
│  └── ... (see full list)                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL (NOT DEPLOYED)                         │
│  Path: ~/Desktop/Projects/aiagents/sofiatesting                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Next.js App (future web UI):                                   │
│  ├── app/(chat)/           ← Chat UI + API routes              │
│  ├── app/(admin)/          ← Admin dashboard                   │
│  ├── app/api/              ← REST endpoints                    │
│  └── components/           ← React components                  │
│                                                                 │
│  Edge Function Source:                                          │
│  └── supabase/functions/sophia-bot/   ← Deploy from here       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## SOPHIA Prompt Architecture (Post-Cleanup)

**Hybrid Loading**: DB sections take precedence, modular files as fallback

```
sophia_prompts (DB) - 7 sections (Dashboard-editable):
├── identity           (priority: 10)
├── safety_rules       (priority: 20)
├── document_routing   (priority: 30)
├── property_upload    (priority: 40)
├── response_format    (priority: 50)
├── calculators        (priority: 60)
└── cyprus_knowledge   (priority: 70)

prompts/ (File fallbacks):
├── core/
│   ├── identity.ts
│   └── safety-rules.ts
├── behaviors/
│   ├── document-routing.ts
│   ├── property-upload.ts
│   └── response-format.ts
├── knowledge/
│   ├── calculators.ts
│   └── cyprus-real-estate.ts
└── templates/
    └── content.ts      ← 43 templates (66KB - too large for DB)

prompt-loader.ts:
├── 5-minute cache TTL
├── Merges DB + fallback (DB wins)
├── Injects agent context ({AGENT_NAME}, {CURRENT_DATE}, etc.)
└── Assembles sections in priority order

prompts.ts (legacy):
└── 198KB monolithic file (4750 lines) - fallback for full prompt
```

---

## Key Files Reference

### Edge Function (sophia-bot)
| File | Purpose | Size |
|------|---------|------|
| `index.ts` | Main handler, webhook routing | 102KB |
| `prompts.ts` | Monolithic prompts (legacy) | 198KB |
| `services/prompt-loader.ts` | Hybrid DB+file loader | 7KB |
| `tools/definitions.ts` | Tool schemas | - |
| `tools/executor.ts` | Tool execution | - |
| `zyprus/client.ts` | Zyprus API client | - |
| `docx-generator.ts` | Document generation | 14KB |

### Local (Next.js)
| Path | Purpose |
|------|---------|
| `lib/ai/` | AI providers, tools, prompts |
| `lib/db/schema.ts` | Drizzle schema |
| `lib/zyprus/` | Zyprus API client |
| `lib/whatsapp/` | WhatsApp utilities |
| `components/` | React UI components |

---

## Database Tables (Key)

| Table | Rows | Purpose |
|-------|------|---------|
| `sophia_prompts` | 7 | Editable prompt sections |
| `agents` | 30 | Real estate agents (region, permissions) |
| `chat_history` | 2328 | WhatsApp conversation messages |
| `sophia_user_profiles` | 13 | User preferences (language, style) |
| `sophia_conversation_memory` | 1520 | Memory with embeddings |
| `processed_webhooks` | 1121 | Deduplication |
| `telegram_leads` | 13 | Lead routing |

---

## Existing Patterns

### AI/Backend
- **Webhook handling**: Verify signature → Dedupe → Process → Respond
- **Tool execution**: Definitions + Executor pattern (separate files)
- **Caching**: 5-min in-memory (prompts), 1h Redis (taxonomy)
- **Error handling**: Try/catch with fallbacks, no circuit breaker in Edge

### Property Uploads
- **Taxonomy resolution**: UUID lookup with hardcoded fallbacks
- **Image validation**: HEAD request with GET fallback
- **Region restrictions**: Agent can only upload in assigned region
- **Reference ID format**: `SOPHIA-YYYYMMDD-HHMMSS-TYP`

### Document Generation
- **Templates**: 43 DOCX templates in `prompts/templates/content.ts`
- **Generation**: `docx` npm package via `docx-generator.ts`
- **Delivery**: Direct WhatsApp via WaSenderAPI

---

## Extension Points

### Adding New Prompt Sections
1. Add to `sophia_prompts` table via Supabase Dashboard
2. Or create file in `prompts/<category>/<name>.ts`
3. Update `FALLBACK_PROMPTS` in `prompt-loader.ts`
4. Add to `orderedKeys` array in `loadSystemPrompt()`

### Adding New Tools
1. Add schema to `tools/definitions.ts`
2. Add executor to `tools/executor.ts`
3. Register in `index.ts` tool array

### Adding New Document Templates
1. Add to `prompts/templates/content.ts` (follow existing format)
2. Update template count in `prompts.ts` (currently 43)
3. Add routing logic in `document_routing` prompt section

---

## Type Safety Assessment

| Aspect | Status |
|--------|--------|
| **Strict mode** | ENABLED (`tsconfig.json`) |
| **Path aliases** | `@/` configured |
| **Any usage** | Limited - mostly in legacy adapters |
| **Supabase types** | Not auto-generated (raw SQL in Edge) |
| **Zod validation** | Used for tool parameters |

---

## Gotchas / Risks

1. **NO VERCEL**: Everything runs on Supabase Edge Functions
2. **Deno imports**: Edge Functions use `jsr:@supabase/*`, not npm
3. **Dual systems**: Prompt editing via Dashboard OR file changes (need deploy)
4. **Monolithic prompts.ts**: 198KB file still exists as backup
5. **No tests for Edge Functions**: Changes are tested in production
6. **5-min cache**: Prompt changes take up to 5 minutes to propagate

---

## Commands to Work

```bash
# Navigate
cd /home/qualia/Desktop/Projects/aiagents/sofiatesting

# Check Edge Function logs
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx

# Deploy Edge Function
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# View prompts in DB
# Use Supabase MCP: execute_sql
# SELECT key, LENGTH(content) as chars, priority FROM sophia_prompts WHERE is_active = true ORDER BY priority

# Local dev (Next.js - not deployed)
pnpm dev
pnpm lint
pnpm format
```

---

## Security Observations

- **RLS**: Enabled on all tables
- **Webhook auth**: HMAC signature verification
- **Agent permissions**: Region-based upload restrictions
- **No hardcoded secrets**: All in Supabase Edge secrets
- **Telegram toggle**: Can disable via secret flag

---

## Next Steps (from Handoff)

1. Monitor Sophia behavior in production
2. Consider adding `templates` section to DB (if needed for Dashboard editing)
3. Future: Migrate monolithic `prompts.ts` to fully modular architecture
