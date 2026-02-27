# AI Production Audit Report

**Project**: sofia-ai-assistant (SOPHIA)
**Type**: MULTI_CHANNEL (WhatsApp + Web App + Telegram)
**Date**: 2026-02-16
**Overall Score**: 25/100 **F (Not Production Ready)**

Grade scale: 90+ = A (Production Ready), 80-89 = B (Minor Issues), 70-79 = C (Significant Issues), 60-69 = D (Major Issues), <60 = F (Not Production Ready)

## Stack Detected

- **AI SDK**: Vercel AI SDK (`ai` v5) + `@ai-sdk/google` + `@ai-sdk/openai` + `@google/generative-ai`
- **AI Provider**: OpenRouter -> `google/gemini-3-flash-preview` (both channels)
- **Channels**: WhatsApp (wasenderapi), Telegram (disabled), Web App (Next.js 15)
- **Database**: Supabase PostgreSQL + Drizzle ORM
- **Auth**: next-auth v5 beta
- **Rate Limiting**: Upstash Redis + in-memory fallback
- **Circuit Breaker**: opossum (exists but underutilized)
- **Error Tracking**: Sentry (web only, not on Edge Function)
- **Email**: Resend
- **Documents**: docx (DOCX generation)

## Summary

- **Total findings**: 120 (after deduplication across agents)
- **Critical**: 22 | **High**: 34 | **Medium**: 46 | **Low**: 18
- **Agents run**: 11/12 (Voice skipped - no voice platform detected)

## Category Scores

| Category | Agent | Score | Weight | Findings (C/H/M/L) |
|----------|-------|-------|--------|---------------------|
| Prompt Quality | 1 | 24/100 | 15.8% | 2/4/4/2 |
| Identity & Safety | 2 | 40/100 | 15.8% | 2/3/2/0 |
| Auth & Subscription | 3 | 17/100 | 15.8% | 2/5/4/1 |
| Channel Reliability | 4 | 22/100 | 10.5% | 3/2/5/2 |
| AI Model Resilience | 5 | 6/100 | 10.5% | 3/4/5/2 |
| Tool Design | 6 | 0/100 | 5.3% | 3/5/8/4 |
| RAG / Knowledge | 7 | 46/100 | 5.3% | 1/3/5/0 |
| Deployment Security | 8 | 25/100 | 10.5% | 3/2/4/2 |
| Conversation Flow | 9 | 69/100 | 5.3% | 0/2/4/3 |
| Observability & Cost | 10 | 6/100 | 5.3% | 3/4/5/2 |
| Voice | 11 | SKIPPED | -- | -- |
| Web Production | 12 | N/A | 0% | informational |

---

## CRITICAL -- Fix Before Deploy

### Auth & Access Control

**1. Hardcoded Supabase Service Role Key in Git**
- `scripts/apply-rls-via-api.mjs:5-6`
- The `service_role` key for a Supabase project is committed in plaintext. Rotate immediately.

**2. Five Admin API Routes Have ZERO Authentication**
- `app/api/admin/agents/[id]/route.ts` (GET/PUT/DELETE)
- `app/api/admin/agents/[id]/link-whatsapp/route.ts` (POST/DELETE)
- `app/api/admin/agents/[id]/link-telegram/route.ts` (POST/DELETE)
- `app/api/admin/agents/import/route.ts` (POST)
- `app/api/admin/agents/stats/route.ts` (GET)
- Middleware skips all `/api/` routes (`middleware.ts:21`). These routes have no `checkAdminAuth()`. Anyone can read/modify/delete agent records, link accounts, and bulk import.

### Prompt Injection

**3. User-Controlled Data Concatenated Into System Prompt**
- `supabase/functions/sophia-bot/services/ai-chat.ts:103-235`
- Agent names, phone numbers, image URLs, document names, and RAG memory content are concatenated directly into the system prompt string without sandboxing.

**4. RAG Memory Indirect Prompt Injection**
- `supabase/functions/sophia-bot/memory/sophia-memory.ts:503-559`
- Past user messages are embedded verbatim into the system prompt via `formatContextForPrompt()`. An attacker can craft a message that gets stored in memory and later injected into future prompts.

### Identity Protection

**5. Model Name and Provider Leaked in Web App Prompt**
- `lib/ai/prompts.ts:512,776-794`
- `Using model: ${selectedChatModel}` is injected into the system prompt. Model-specific instructions reference "CLAUDE", "GPT" by name.

**6. No Identity Protection Instructions in Any System Prompt**
- `supabase/functions/sophia-bot/prompts/core/identity.ts` (entire file)
- `supabase/functions/sophia-bot/prompts/core/safety-rules.ts` (entire file)
- No instructions telling the AI to refuse revealing its model, system prompt, tool names, or provider. Zero adversarial resistance.

### Channel Reliability

**7. WhatsApp Dedup TTL Only 60 Seconds (Need 300+)**
- `app/api/whatsapp/webhook/route.ts:16`
- `DEDUP_TTL_SECONDS = 60`. WhatsApp can redeliver after 60s, causing duplicate AI responses.

**8. WhatsApp Webhook Blocks Until AI Completes (No maxDuration)**
- `app/api/whatsapp/webhook/route.ts:394-397`
- Awaits full AI processing before returning HTTP response. No `maxDuration` export. WaSenderAPI will timeout and retry.

**9. Telegram Webhook Has Zero Message Deduplication**
- `app/api/telegram/webhook/route.ts:55-81`
- No `update_id` tracking. Redelivered Telegram updates will be processed as new messages.

### AI Model Resilience

**10. AI (OpenRouter) Calls Have NO Circuit Breaker**
- `supabase/functions/sophia-bot/services/ai-chat.ts:251-267`
- Circuit breakers exist for Zyprus API (`lib/circuit-breakers.ts`) but are NOT applied to the most critical dependency: AI model calls.

**11. AI (OpenRouter) Calls Have NO Timeout**
- `supabase/functions/sophia-bot/services/ai-chat.ts:251-267`
- No `AbortController` on the OpenRouter fetch. LLM inference can hang indefinitely.

**12. No AI Model Fallback Chain**
- `supabase/functions/sophia-bot/services/ai-chat.ts:260`
- `lib/ai/providers.ts:80`
- Both channels hardcode `google/gemini-3-flash-preview`. If this model is down on OpenRouter, everything fails. No fallback to `gemini-2.0-flash` or `gemini-pro`.

### Tool Safety

**13. No Timeouts on External API Calls in Tool Executors**
- `supabase/functions/sophia-bot/tools/executor.ts` (all fetch calls)
- `lib/ai/tools/create-listing.ts`, `upload-listing.ts`, `send-document.ts`
- Zero `AbortController` usage. A hanging Zyprus API call blocks the entire Edge Function.

**14. service_role Key Passed as Plain String Parameter**
- `supabase/functions/sophia-bot/tools/executor.ts:822`
- `supabaseKey` passed through function parameters. If ever logged in an error, the key leaks.

**15. Tool Argument Injection via Unvalidated assignTo Email**
- `supabase/functions/sophia-bot/tools/executor.ts:325-334`
- Only checks domain is `zyprus.com` but doesn't verify the email exists as a registered agent.

### Knowledge / Caching

**16. Prompt Cache TTL Set to 0 in Production**
- `supabase/functions/sophia-bot/services/prompt-loader.ts:27`
- `CACHE_TTL_MS = 0` with comment "change back after testing". Every WhatsApp message hits the DB for prompts.

### Deployment

**17. No .env.example File Exists**
- 15+ required environment variables with no documentation. New deployments will misconfigure.

**18. Error Messages Leak Internal Details to Clients**
- `app/api/admin/prompts/route.ts:52,78`, `app/api/admin/agents/route.ts:113`, and 30+ other routes
- Raw `error.message` returned in JSON responses, exposing DB errors and stack traces.

**19. xlsx Package Has Known Prototype Pollution (CVE-2023-30533)**
- `package.json` -- `"xlsx": "^0.18.5"`
- HIGH severity vulnerability in a direct production dependency.

### Observability

**20. WhatsApp Channel Discards Token Usage Data**
- `supabase/functions/sophia-bot/services/ai-chat.ts:271`
- Only extracts `choices[0].message`, throws away `usage` object. Cost tracking impossible for the primary channel.

**21. No Cost Alerting or Budget Controls**
- No mechanism anywhere in the codebase to alert on cost spikes, runaway token usage, or budget thresholds.

**22. Using Unpinned Preview Model**
- `supabase/functions/sophia-bot/services/ai-chat.ts:260`
- `google/gemini-3-flash-preview` -- preview models can change behavior or pricing without notice.

---

## HIGH -- Fix Soon

### Auth

**23.** Telegram webhook accepts requests without secret token -- `app/api/telegram/webhook/route.ts:29-40`
**24.** No burst rate limiting on web chat AI endpoint -- `app/(chat)/api/chat/route.ts:129-144`
**25.** Admin pages use layout-level auth but no per-page permission checks -- `app/(admin)/admin/layout.tsx:47`
**26.** No RLS policies on core application tables (Chat, Message, PropertyListing) -- `lib/db/schema.ts`
**27.** Cron cleanup unauthenticated in non-production -- `app/api/cron/cleanup/route.ts:24`

### Prompt & Identity

**28.** Prompt injection detection has significant gaps (no encoding bypass, delimiter breaking, multi-language) -- `supabase/functions/sophia-bot/utils/validation.ts:32-66`
**29.** No system prompt leak protection instruction in prompt text -- `supabase/functions/sophia-bot/prompts/core/identity.ts`
**30.** Weak section delimiters (`---`) breakable by user input -- `supabase/functions/sophia-bot/services/prompt-loader.ts:311`
**31.** Web app chat route has NO prompt injection detection -- `app/(chat)/api/chat/route.ts`
**32.** No output filtering on either channel (responses go straight to user) -- both channels
**33.** Tool names exposed to AI with no instruction to hide them -- `supabase/functions/sophia-bot/tools/definitions.ts`
**34.** No topic guardrails / off-topic handling -- `supabase/functions/sophia-bot/prompts/core/safety-rules.ts`

### Channel

**35.** WhatsApp webhook direct secret match not constant-time -- `app/api/whatsapp/webhook/route.ts:181`
**36.** Draft cleanup Edge Function has no authentication -- `supabase/functions/draft-cleanup/index.ts:20-26`

### Resilience

**37.** Web app AI call has no circuit breaker -- `app/(chat)/api/chat/route.ts:216-290`
**38.** Web app streaming has no mid-stream error recovery (resume is a no-op) -- `app/(chat)/api/chat/[id]/stream/route.ts`
**39.** WhatsApp bot retries only 429, not 500/502/503/504 -- `supabase/functions/sophia-bot/services/ai-chat.ts:246-293`
**40.** Circuit breaker fallback throws instead of returning graceful response -- `lib/circuit-breakers.ts:88-92`

### Tools

**41.** `sendDocument` tool uses user ID as session cookie (broken auth) -- `lib/ai/tools/send-document.ts:78`
**42.** Tool responses not validated/truncated before AI re-ingestion -- `supabase/functions/sophia-bot/services/ai-chat.ts:452-457`
**43.** `as any` cast bypasses type safety for Zyprus upload -- `lib/ai/tools/create-listing.ts:477`
**44.** No type validation on Edge Function tool arguments -- `supabase/functions/sophia-bot/tools/executor.ts`
**45.** Transfer fee calculator always applies 50% exemption (wrong) -- `lib/ai/tools/calculate-transfer-fees.ts:51-52`

### Knowledge

**46.** `search_sophia_knowledge` RPC has no data behind it -- knowledge base table appears empty
**47.** No similarity threshold on vector memory searches -- `supabase/functions/sophia-bot/memory/sophia-memory.ts`
**48.** Retrieved knowledge has no source attribution -- memory system

### Deployment

**49.** Health endpoint exposes which API keys are configured -- `supabase/functions/sophia-bot/handlers/health.ts:157-161`
**50.** CSP allows `unsafe-inline` and `unsafe-eval` for scripts -- `next.config.ts:10`

### Conversation

**51.** No human handoff mechanism anywhere in the system -- all prompt/handler files
**52.** No conversation reset capability ("reset memory" is BLOCKED as injection) -- `supabase/functions/sophia-bot/utils/validation.ts:59`

### Observability

**53.** No Sentry integration in Supabase Edge Function (primary production channel) -- `supabase/functions/sophia-bot/`
**54.** AI request/response logging missing token metrics -- `supabase/functions/sophia-bot/services/ai-chat.ts:269-271`
**55.** No per-user token usage aggregation -- analytics table
**56.** `@vercel/speed-insights` installed but `<SpeedInsights />` not rendered -- `package.json`

---

## MEDIUM -- Plan to Fix

*(46 findings -- summarized by category)*

### Prompt & Safety (4)
- Admin prompt editor accepts arbitrary content with no audit log -- `app/api/admin/prompts/[key]/route.ts`
- `personalizationContext` appended last in prompt (recency bias) -- `ai-chat.ts:235`
- DAN pattern `/\bDAN\b/i` blocks legitimate name "Dan" -- `validation.ts:63`
- Emotional manipulation not addressed in safety rules

### Auth & Access (4)
- Guest auto-creation with no CAPTCHA or IP rate limiting -- `app/(auth)/api/auth/guest/route.ts`
- Middleware blanket bypass for all `/api/` routes -- `middleware.ts:21-23`
- No explicit session expiry configuration in NextAuth -- `auth.config.ts`
- PII stored in chat_history without redaction (GDPR risk) -- `supabase/functions/_shared/db.ts:78-108`

### Channels (5)
- In-memory dedup useless across serverless instances -- `app/api/whatsapp/webhook/route.ts:19-21`
- Edge Function synchronous processing blocks response -- `supabase/functions/sophia-bot/handlers/webhook.ts:568`
- No retry/dead-letter for failed WhatsApp message sends -- `webhook.ts:409-421`
- Sensitive data in debug logs (payload preview, secret length) -- `webhook/route.ts:185-209`
- Edge Function dedup fail-open on DB errors -- `_shared/db.ts:143-150`

### Resilience (5)
- No jitter on OpenRouter retry backoff (thundering herd) -- `ai-chat.ts:278-283`
- WaSend API minimal retry (one retry on 429 only) -- `wasend.ts:46-77`
- Email service (Resend) has no retry or timeout -- `email-service.ts`
- OpenRouter rate limit response headers not tracked -- `ai-chat.ts:269-271`
- Default circuit breaker timeout (10s) too short for LLM calls -- `circuit-breakers.ts:24`

### Tools (8)
- Web/Edge calculators give different results -- `calculate-capital-gains.ts` vs `executor.ts:1096`
- `requestSuggestions` tool has no document ownership check -- `request-suggestions.ts:27`
- Email body HTML injection via user content -- `executor.ts:1254`
- Tool registry uses `Record<string, any>` -- `registry.ts:25`
- Deprecated `features` param still functional -- `create-listing.ts:163`
- Upload lock is in-memory (not cross-instance) -- `executor.ts:27`
- `bedrooms` minimum mismatch (Web=1, Edge=0 for studios) -- `create-listing.ts:72`
- Tool definition mismatch between channels -- `registry.ts` vs `definitions.ts`

### Knowledge (5)
- 30-day memory deletion too aggressive for real estate -- cron cleanup
- Dead code (`extractTopics`/`calculateImportance`) never removed -- `sophia-memory.ts`
- Embedding API key absence triggers only warning, not error -- `sophia-memory.ts`
- No chunking strategy for long messages -- memory system
- Web app channel has zero RAG capabilities

### Deployment (4)
- Full `lodash` package imported (attack surface) -- `package.json`
- `/ping` endpoint available in production (test artifact) -- `middleware.ts:12`
- Sentry DSN hardcoded in all three config files -- `sentry.*.config.ts`
- Admin endpoint 404 response enumerates all available routes -- `handlers/admin.ts:96`

### Conversation (4)
- Silent failure on outer processRequest exception (user gets nothing) -- `webhook.ts:580-583`
- No idle/timeout handling for WhatsApp field collection -- all handlers
- Rate-limited users silently dropped (no feedback) -- `webhook.ts:529-533`
- Prompt injection blocks give no user feedback -- `webhook.ts:536-545`

### Observability (5)
- Model selector in UI misleading (all map to same model) -- `models.ts` vs `providers.ts`
- Edge Function strips stack traces in production (no Sentry either) -- `logger.ts:142`
- OpenRouter API error response logged unsanitized -- `ai-chat.ts:286`
- Analytics data retention only 30 days (no aggregation) -- `cron/cleanup/route.ts:98`
- No per-call AI latency measurement -- `ai-chat.ts:250-293`

---

## LOW -- Nice to Have

*(18 findings -- abbreviated)*

- Template numbers in Telegram help menu contradict safety rules
- Unused `codePrompt`/`sheetPrompt` exports increase attack surface
- Timing-safe comparison in Edge Function uses custom JS (not crypto API)
- WhatsApp GET endpoint leaks service name/version/provider
- 200 on webhook error (intentional but no dead-letter)
- `sha256=` prefix strip with non-HMAC verification (dead code)
- Health check results don't feed back into routing
- `getRateLimitInfo()` always returns null
- Redundant `description` field wastes tokens
- Hardcoded 3% inflation rate in CGT calculator
- Agent emails exposed via `getRegionalAgents` tool
- Limit inconsistency (schema=50, code=100)
- Web chat `onError` returns generic "Oops"
- Chat history never cleaned up (edge function path)
- Two separate session/memory systems with no shared context
- Context propagation uses global state (not AsyncLocalStorage)
- CLAUDE.md model references stale
- esbuild CORS vulnerability (transitive dev dependency only)

---

## Passing Checks

The following areas demonstrate solid engineering:

**Authentication (where implemented)**
- Chat API verifies session + chat ownership
- Admin layout checks role from `admin_users` table (fail-closed)
- Admin prompts API routes consistently use `checkAdminAuth()`
- Webhook signature verification (HMAC, fail-closed if no secret)
- Edge Function admin uses constant-time comparison
- User data routes derive identity server-side
- Timing-safe password comparison (bcrypt + dummy)

**Input Validation**
- WhatsApp: phone validation, length limits, injection detection, sanitization
- Zod schema validation on API request bodies
- SSRF prevention on image URLs
- Tool call deduplication within AI responses
- Max 5 tool iterations prevents infinite loops

**Resilience Infrastructure (exists, needs to be applied to AI calls)**
- `opossum` circuit breakers with proper config (Zyprus API)
- `withRetry` utility with exponential backoff + jitter (Zyprus/DB)
- Error classification with user-friendly messages (`error-mapper.ts`)
- Health check endpoint tests all 4 dependencies with timeouts
- Rate limiting: 30/min per user with fail-closed on DB errors

**Observability (web app)**
- Sentry client/server/edge with proper sampling and privacy masking
- OpenTelemetry instrumentation
- TokenLens cost tracking on web channel
- Structured logging with PII redaction (Edge Function)
- Correlation ID propagation per request
- Analytics tracking (message_received, tool_used, etc.)

**Web Production**
- All images use `next/image`
- Proper SSR/SSG split (server components for data, client for interactive)
- 404, 500, and error boundary pages exist
- Security headers comprehensive (CSP, HSTS, X-Frame-Options, etc.)
- `.gitignore` properly excludes env files
- `NEXT_PUBLIC_` vars are non-sensitive
- Source maps deleted after Sentry upload
- `dangerouslySetInnerHTML` usage is safe (static theme script)

---

## Priority Remediation Order

### Immediate (this week)
1. **Add `checkAdminAuth()` to all 5 unprotected admin agent API routes** (CRITICAL-2)
2. **Rotate the leaked service role key** and remove from git history (CRITICAL-1)
3. **Re-enable prompt cache TTL** to `5 * 60 * 1000` (CRITICAL-16)
4. **Increase WhatsApp dedup TTL** from 60s to 600s (CRITICAL-7)
5. **Add `export const maxDuration = 60`** to WhatsApp webhook route (CRITICAL-8)

### This sprint
6. Add identity protection instructions to SOPHIA's system prompt (CRITICAL-5,6)
7. Wrap user data in system prompt with "ignore instructions" delimiters (CRITICAL-3,4)
8. Add `AbortController` with 60-90s timeout on OpenRouter fetch (CRITICAL-11)
9. Add circuit breaker around `callOpenRouter()` (CRITICAL-10)
10. Implement model fallback chain: `gemini-3-flash-preview` -> `gemini-2.0-flash` -> `gemini-pro` (CRITICAL-12)
11. Add prompt injection detection to web app chat route (HIGH-31)
12. Fix error messages leaking internal details (CRITICAL-18)
13. Create `.env.example` (CRITICAL-17)

### Next sprint
14. Add output filtering for system prompt fragments and tool names
15. Add Sentry to Edge Function
16. Extract and track token usage from OpenRouter responses
17. Add timeouts to all tool executor fetch calls
18. Fix `sendDocument` broken auth
19. Add human handoff mechanism
20. Add conversation reset capability
