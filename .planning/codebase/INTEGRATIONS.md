# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**AI/LLM:**
- OpenRouter - AI model proxy
  - SDK/Client: `@ai-sdk/openai` via `lib/ai/providers.ts`
  - Auth: `OPENROUTER_API_KEY`
  - Model: `google/gemini-3-flash-preview` (default)
  - Endpoint: `https://openrouter.ai/api/v1`

**Property Listings:**
- Zyprus API (Drupal JSON:API) - Cyprus real estate platform
  - Client: `lib/zyprus/client.ts` (Next.js), `supabase/functions/sophia-bot/zyprus/client.ts` (Edge)
  - Auth: OAuth 2.0 client credentials
  - Env vars: `ZYPRUS_CLIENT_ID`, `ZYPRUS_CLIENT_SECRET`, `ZYPRUS_API_URL`
  - Base URL: `https://dev9.zyprus.com` (dev), `https://zyprus.com` (prod)
  - Features: Property/land listing CRUD, taxonomy lookup, image uploads
  - Headers required: `User-Agent: SophiaAI` (Cloudflare whitelist)
  - Circuit breaker: `opossum` package for resilience

**Messaging:**
- Telegram Bot API - Direct API integration
  - Client: `lib/telegram/client.ts`
  - Auth: `TELEGRAM_BOT_TOKEN` (from @BotFather)
  - Webhook: Supabase Edge Function `telegram-webhook` (DISABLED)
  - Features: Text messages, typing indicators, message forwarding, file downloads

- WaSenderAPI - WhatsApp messaging (~$6/month)
  - SDK: `wasenderapi` npm package
  - Client: `lib/whatsapp/client.ts`
  - Auth: `WASENDER_API_KEY`
  - Webhook: Supabase Edge Function `sophia-bot`
  - Webhook secret: `WASENDER_WEBHOOK_SECRET` (HMAC verification)
  - Features: Text messages, document attachments, image handling

**Email:**
- Resend - Transactional email
  - SDK: `resend` npm package
  - Client: `app/api/documents/send/route.ts`, Edge Function `sophia-bot/tools/executor.ts`
  - Auth: `RESEND_API_KEY`
  - Sender: `sofia@zyprus.com`
  - Features: Email with DOCX attachments, HTML/text formatting

## Data Storage

**Databases:**
- Supabase PostgreSQL (primary)
  - Connection: `POSTGRES_URL` (Session Pooler format)
  - ORM: Drizzle ORM (`lib/db/schema.ts`)
  - Migrations: `lib/db/migrations/`
  - Tables: User, Chat, Message_v2, PropertyListing, LandListing, ZyprusAgent, TelegramLead, etc.

**File Storage:**
- Vercel Blob (for web app - NOT DEPLOYED)
  - SDK: `@vercel/blob`
  - Auth: `BLOB_READ_WRITE_TOKEN`
  - Use: Document uploads, images

- Supabase Storage (for Edge Functions)
  - Use: Generated DOCX documents

**Caching:**
- Upstash Redis (KV Store)
  - SDK: `@upstash/redis`
  - Auth: `KV_REST_API_URL`, `KV_REST_API_TOKEN`
  - Use: Rate limiting, taxonomy cache (1h TTL), session storage
  - Rate limiter: `@upstash/ratelimit` package

## Authentication & Identity

**Auth Provider:**
- NextAuth.js 5.0 Beta (Custom credentials)
  - Config: `app/(auth)/auth.config.ts`
  - Strategy: JWT sessions (30-day expiration)
  - Storage: Database-backed user table
  - Additional: Access gate cookie (`qualia-access=granted`)

**User Types:**
- Guest users (rate-limited)
- Regular users (email/password)
- Zyprus Agents (linked via phone number in `ZyprusAgent` table)

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - SDK: `@sentry/nextjs`
  - Config: `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`
  - DSN: `SENTRY_DSN`
  - Org: `qualia-solutions`
  - Features: Error capture, performance monitoring (10% sample rate)

**Logs:**
- Supabase Edge Function logs (`supabase functions logs <name>`)
- Console logging with structured context
- No dedicated log aggregation service

**Telemetry:**
- OpenTelemetry (optional)
  - SDK: `@opentelemetry/api`
  - Vercel OTEL integration: `@vercel/otel`
  - Token tracking: `tokenlens` library

## CI/CD & Deployment

**Hosting:**
- Supabase Edge Functions (PRIMARY)
  - Project ID: `vceeheaxcrhmpqueudqx`
  - Functions URL: `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/`
  - Functions: `sophia-bot` (WhatsApp), `ai-chat` (AI proxy)

- Vercel (FUTURE - NOT DEPLOYED)
  - Web app hosting
  - Cron jobs

**CI Pipeline:**
- Manual deployment via Supabase CLI
  ```bash
  supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
  ```

## Environment Configuration

**Required env vars (Edge Functions):**
```bash
OPENROUTER_API_KEY         # AI model access
ZYPRUS_CLIENT_ID           # Property API auth
ZYPRUS_CLIENT_SECRET       # Property API auth
ZYPRUS_API_URL             # Property API base URL
WASENDER_API_KEY           # WhatsApp messaging
WASENDER_WEBHOOK_SECRET    # Webhook HMAC verification
RESEND_API_KEY             # Email sending
```

**Required env vars (Next.js - future):**
```bash
POSTGRES_URL               # Database connection
AUTH_SECRET                # JWT signing
KV_REST_API_URL            # Redis caching
KV_REST_API_TOKEN          # Redis auth
SENTRY_DSN                 # Error tracking
```

**Secrets location:**
- Edge Functions: `supabase secrets set KEY=value --project-ref vceeheaxcrhmpqueudqx`
- Next.js: `.env.local` (local), Vercel Dashboard (production)

## Webhooks & Callbacks

**Incoming:**
- WhatsApp webhook: `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot`
  - Security: HMAC signature verification (`WASENDER_WEBHOOK_SECRET`)
  - Handles: Text messages, image attachments, document requests

- Telegram webhook: `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/telegram-webhook`
  - Security: Secret token header (`TELEGRAM_WEBHOOK_SECRET`)
  - Status: DISABLED (toggle via `SOPHIA_TELEGRAM_ENABLED` secret)

**Outgoing:**
- None configured

## Integration Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   WhatsApp      │────▶│  sophia-bot     │
│   (WaSenderAPI) │     │  Edge Function  │
└─────────────────┘     └────────┬────────┘
                                 │
┌─────────────────┐              │       ┌─────────────────┐
│   Telegram      │──────────────┼──────▶│   OpenRouter    │
│   (Bot API)     │              │       │   (Gemini 3)    │
└─────────────────┘              │       └─────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────┐
                    │   Supabase          │
                    │   ├── PostgreSQL    │
                    │   ├── Edge Functions│
                    │   └── Storage       │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │  Zyprus API │  │   Resend    │  │   Upstash   │
     │  (Drupal)   │  │   (Email)   │  │   (Redis)   │
     └─────────────┘  └─────────────┘  └─────────────┘
```

## Service Status

| Service | Status | Notes |
|---------|--------|-------|
| sophia-bot (WhatsApp) | LIVE | Primary chat interface |
| Telegram webhook | DISABLED | Toggle via secret |
| AI proxy (ai-chat) | LIVE | OpenRouter → Gemini |
| Zyprus API | LIVE | Property listings |
| Resend | CONFIGURED | Domain verification pending |
| Sentry | ACTIVE | Error monitoring |

---

*Integration audit: 2026-01-23*
