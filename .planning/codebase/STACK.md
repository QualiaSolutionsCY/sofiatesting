# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript 5.6.3 - All application code (Next.js, Edge Functions, libraries)
- Deno TypeScript - Supabase Edge Functions runtime

**Secondary:**
- SQL - Database migrations and queries via Drizzle ORM

## Runtime

**Environment:**
- Node.js (pnpm requires Node 18+)
- Deno (Supabase Edge Functions)

**Package Manager:**
- pnpm 10.0.0
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Next.js 15.5.7 - Web framework (NOT DEPLOYED - bots are primary)
- React 19.0.0-rc - UI library (release candidate version)

**AI/LLM:**
- AI SDK (`ai` 5.0.26) - Vercel AI SDK for streaming, tools, multi-model support
- `@ai-sdk/openai` 2.0.11 - OpenRouter adapter
- `@ai-sdk/google` 2.0.44 - Direct Gemini (unused, via OpenRouter)
- `@ai-sdk/react` 2.0.26 - React hooks for chat UI

**Testing:**
- Playwright 1.57.0 - E2E tests
- Node.js built-in test runner via tsx 4.19.1 - Unit tests

**Build/Dev:**
- Turbo - Dev server (`next dev --turbo`)
- Drizzle Kit 0.25.0 - Database migrations
- Biome 2.2.2 - Linting/formatting via Ultracite wrapper
- Ultracite 5.3.9 - Opinionated linting preset

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.34.0 - Database ORM, type-safe SQL
- `zod` 3.25.76 - Schema validation (AI tools, API inputs)
- `next-auth` 5.0.0-beta.25 - Authentication (JWT sessions)
- `wasenderapi` 0.1.5 - WhatsApp messaging client
- `resend` 6.5.2 - Email sending (DOCX attachments)
- `docx` 9.5.1 - DOCX document generation (37 templates)

**Infrastructure:**
- `@supabase/supabase-js` 2.87.1 - Supabase client
- `@upstash/redis` 1.35.6 - Redis client (rate limiting, caching)
- `@upstash/ratelimit` 2.0.6 - Rate limiting middleware
- `postgres` 3.4.4 - PostgreSQL driver (Session Pooler)
- `opossum` 9.0.0 - Circuit breaker pattern (Zyprus API resilience)

**UI (for future web deployment):**
- Radix UI primitives - Accessible components
- Tailwind CSS 4.1.17 - Styling
- Framer Motion 11.3.19 - Animations
- Lucide React 0.446.0 - Icons
- Recharts 3.5.0 - Charts
- ProseMirror - Rich text editor

**Observability:**
- `@sentry/nextjs` 10.29.0 - Error tracking
- `tokenlens` 1.3.0 - Token usage tracking
- OpenTelemetry packages - Distributed tracing

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ESNext
- Module: ESNext with bundler resolution
- Strict mode enabled
- Path alias: `@/*` maps to project root

**Build:**
- `next.config.ts` - Next.js config with Sentry wrapper
- `drizzle.config.ts` - Database migration config
- `playwright.config.ts` - E2E test config
- `postcss.config.mjs` - Tailwind PostCSS

**Environment:**
- `.env.local` - Local development (not committed)
- `.env.example` - Template for environment variables
- Supabase secrets for Edge Functions (`supabase secrets set`)

**Key Environment Variables:**
```bash
# AI (Required for chat)
OPENROUTER_API_KEY=           # AI via OpenRouter proxy

# Database
POSTGRES_URL=                 # Session pooler connection

# Auth
AUTH_SECRET=                  # NextAuth JWT signing

# Integrations
TELEGRAM_BOT_TOKEN=           # Telegram bot
WASENDER_API_KEY=             # WhatsApp via WaSender
RESEND_API_KEY=               # Email sending
ZYPRUS_CLIENT_ID=             # Zyprus OAuth
ZYPRUS_CLIENT_SECRET=         # Zyprus OAuth

# Caching/Rate Limiting
KV_REST_API_URL=              # Upstash Redis
KV_REST_API_TOKEN=            # Upstash Redis

# Observability
SENTRY_DSN=                   # Error tracking
```

## Platform Requirements

**Development:**
- Node.js 18+ (for pnpm and Next.js)
- pnpm 10.0.0 (specified in packageManager field)
- Deno (for local Edge Function testing)

**Production:**
- Supabase Edge Functions (Deno runtime) - PRIMARY
  - Project: `vceeheaxcrhmpqueudqx`
  - Functions: `sophia-bot`, `ai-chat`
- Supabase PostgreSQL - Database
- Upstash Redis - Caching and rate limiting
- Vercel (FUTURE) - Web app hosting (currently NOT deployed)

**Deployment Commands:**
```bash
# Deploy Edge Functions
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Database migrations
pnpm db:migrate
```

---

*Stack analysis: 2026-01-23*
