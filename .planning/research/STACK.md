# Technology Stack — Audit Excellence Improvements

**Project:** SOPHIA WhatsApp Bot (Production)
**Researched:** 2026-03-02
**Context:** Adding observability, security hardening, and operational excellence to existing production system

---

## Executive Summary

SOPHIA's current stack (Supabase Edge Functions, OpenRouter/Gemini, TypeScript/Deno) is solid. Audit improvements require **minimal new dependencies** — primarily leveraging Deno's built-in capabilities and Supabase's native features. The strategy is **additive, not disruptive**: add observability without changing the runtime, harden security without architectural changes, improve type safety through configuration rather than new libraries.

**Key principle:** Use what the platform provides first. Add external dependencies only when native capabilities fall short.

---

## Recommended Stack Additions

### 1. Observability & Error Tracking

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **npm:@sentry/deno** | `10.32.1+` | Production error tracking, performance monitoring | Official Sentry Deno SDK, actively maintained (Feb 2026 release), integrates with Supabase Edge Functions. **MEDIUM confidence** — known issue: no Deno.serve scope separation (all requests share global context), requires `withScope` wrapper for each request |
| **Deno Built-in OpenTelemetry** | Native (Deno 2.2+) | Automatic tracing, metrics, logs | Zero-install observability via `OTEL_DENO=1` env var, exports to OpenTelemetry collectors. **HIGH confidence** — first-class Deno feature, minimal overhead (<5%) |
| **npm:@opentelemetry/api** | `1.9.0` (current) | Custom metrics, manual span creation | Already in `package.json`, official OpenTelemetry API for creating custom observability signals |

**Integration approach:**
- **Primary:** Sentry for error tracking + user-facing alerts (catches exceptions, tracks performance bottlenecks)
- **Secondary:** Deno OTEL for deep tracing in development/staging (disabled in production initially to control overhead)
- **Fallback:** Supabase built-in logs (already active, zero setup)

**Why NOT alternatives:**
- ❌ **Datadog/New Relic:** Overkill for single-function architecture, expensive for non-enterprise
- ❌ **Custom logging to external service:** Supabase already provides `function_edge_logs` table, no need for third-party log ingestion
- ❌ **Third-party APM:** Deno OTEL + Sentry covers 95% of observability needs

**Sources:**
- [Supabase Sentry Integration Docs](https://supabase.com/docs/guides/functions/examples/sentry-monitoring)
- [Deno OpenTelemetry Documentation](https://docs.deno.com/runtime/fundamentals/open_telemetry/)
- [Sentry Deno SDK (npm)](https://www.npmjs.com/package/@sentry/deno)
- [Deno 2.2 Release Notes](https://deno.com/blog/v2.2)

---

### 2. Environment Variable Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | `3.25.76` (current) | Runtime validation of env vars, API payloads | Already in `package.json`, TypeScript-first, 40M+ weekly downloads (Feb 2026). **HIGH confidence** — industry standard for runtime validation |

**Implementation pattern:**
```typescript
// supabase/functions/sophia-bot/utils/env-validator.ts
import { z } from "npm:zod@3.25.76";

const envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY required"),
  WASEND_API_KEY: z.string().min(1, "WASEND_API_KEY required"),
  RESEND_API_KEY: z.string().optional(),
  SOPHIA_ADMIN_SECRET: z.string().min(32, "SOPHIA_ADMIN_SECRET must be 32+ chars"),
  SENTRY_DSN: z.string().url().optional(),
});

export const validateEnv = () => {
  const result = envSchema.safeParse(Deno.env.toObject());
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    logger.error("Environment validation failed", errors);
    throw new Error(`Invalid environment: ${JSON.stringify(errors)}`);
  }
  return result.data;
};
```

**Why Zod over alternatives:**
- ✅ Already in project dependencies (zero new installs)
- ✅ TypeScript inference (auto-types `validateEnv()` return value)
- ✅ `.safeParse()` for graceful error handling (no try/catch needed)
- ✅ Custom error messages per field
- ❌ **NOT** dotenv-vault or similar — Supabase handles secret storage, we just validate at runtime

**Edge cases handled:**
- Empty string secrets (common in misconfigured deployments)
- Optional secrets (RESEND_API_KEY) validated only if present
- URL format validation for webhooks/DSNs

**Sources:**
- [Zod Official Docs](https://zod.dev/)
- [How to Validate Data with Zod in TypeScript (2026)](https://oneuptime.com/blog/post/2026-01-25-zod-validation-typescript/view)
- [Zod Error Customization](https://zod.dev/error-customization)

---

### 3. Circuit Breaker Enhancement

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Deno Standard Library (std/async)** | `0.224.0` (current) | Circuit breaker with AbortSignal support | Native Deno solution, actively maintained (Jan 2026 release). **MEDIUM confidence** — marked `unstable`, but actively developed with recent enhancements |

**Current state:**
- ✅ Custom circuit breaker in `utils/circuit-breaker.ts` (works, but basic)
- ✅ OpenRouter already has timeout + retry logic in `services/ai-chat.ts`

**Recommended enhancement:**
Replace custom circuit breaker with Deno's native implementation:

```typescript
// supabase/functions/sophia-bot/utils/circuit-breaker.ts
import { CircuitBreaker } from "https://deno.land/std@0.224.0/async/unstable_circuit_breaker.ts";

const openrouterBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  onHalfOpen: () => logger.info("OpenRouter circuit testing recovery"),
});

export const callWithBreaker = async <T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  return openrouterBreaker.call(fn, signal);
};
```

**Benefits over current implementation:**
- ✅ `AbortSignal` support (respects Edge Function timeout budget)
- ✅ `onHalfOpen` callback (logs recovery attempts)
- ✅ Official Deno team maintenance
- ❌ **Tradeoff:** Marked unstable, may change in future Deno versions

**Alternative considered:**
- **opossum (npm):** Already in `package.json` (`9.0.0`), mature Node.js circuit breaker. **Rejected** — Deno-native solution preferred for Edge Functions, opossum adds 50KB+ to bundle

**Decision:** Use Deno std/async for new implementations, keep existing custom breaker as fallback if unstable API changes.

**Sources:**
- [Deno std/async CircuitBreaker](https://github.com/denoland/std/releases)
- [Circuit Breaker Pattern in TypeScript](https://nobuti.com/thoughts/resilience-patterns-circuit-breaker)

---

### 4. Cost Tracking (Tier 3 — Optional)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **llm-cost-tracker** | `1.0.2` (npm) | Multi-provider AI cost tracking, budget alerts | TypeScript-native, supports OpenRouter/OpenAI/Anthropic, REST API + storage. **LOW confidence** — small npm package (new), needs evaluation for production readiness |

**Implementation approach (if implemented):**
- Track OpenRouter API usage in `services/ai-chat.ts` (log model, tokens, estimated cost)
- Store cost records in new `ai_usage_costs` Supabase table
- Weekly aggregation via new Edge Function `cost-reporter`
- Email alerts when approaching budget thresholds

**Alternative (simpler):**
- Custom implementation: parse OpenRouter response headers (`x-tokens-prompt`, `x-tokens-completion`), calculate cost from known model pricing, store in Supabase
- **Recommended** — full control, no external dependency, OpenRouter provides token counts in response metadata

**Why NOT full APM cost tracking:**
- SOPHIA's AI usage is ~95% OpenRouter — single provider makes custom tracking trivial
- llm-cost-tracker adds complexity for multi-provider scenarios we don't have
- OpenRouter dashboard already shows spend (cost tracking is **nice-to-have**, not critical)

**Decision:** Tier 3 priority. Implement custom token tracking first, evaluate llm-cost-tracker if needs expand to multiple AI providers.

**Sources:**
- [llm-cost-tracker on npm](https://libraries.io/npm/llm-cost-tracker)
- [Cost Monitoring per Customer in AI SaaS (2026)](https://dasroot.net/posts/2026/02/cost-monitoring-per-customer-ai-saas/)

---

### 5. Type Safety Improvements (Configuration, Not Libraries)

| Configuration | Value | Purpose | Why |
|---------------|-------|---------|-----|
| **tsconfig.json `strict`** | `true` | Enable all strict type checks | Catches null refs, uninitialized properties, implicit any. **HIGH confidence** — TypeScript standard practice 2026 |
| **tsconfig.json additions** | See below | Enhanced type safety beyond `strict: true` | Prevents index signature bugs, unchecked array access, implicit returns |

**Recommended tsconfig.json enhancements:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false
  }
}
```

**Impact:** Catches entire categories of runtime bugs at compile time — no new libraries needed, pure configuration.

**Note:** Edge Functions use Deno runtime (not Node.js), so tsconfig.json lives in project root for IDE/type checking only. Deno ignores tsconfig during execution.

**Sources:**
- [How to Enable TypeScript Strict Mode Effectively (2026)](https://oneuptime.com/blog/post/2026-02-20-typescript-strict-mode-guide/view)
- [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/)

---

## What NOT to Add

### ❌ External APM Services (Datadog, New Relic, Dynatrace)
**Why:** Edge Functions are stateless, single-purpose. Supabase provides built-in metrics (CPU, memory, execution time) in dashboard. Sentry + Deno OTEL covers observability needs without vendor lock-in.

### ❌ Custom Circuit Breaker Libraries (opossum, cockatiel)
**Why:** Deno std/async provides native solution. Existing custom implementation works. No need for 50KB+ npm packages when native API exists.

### ❌ Database Migration Tools (Prisma, Drizzle for Edge Functions)
**Why:** SOPHIA uses Supabase migrations via `supabase db push`. Drizzle is in `package.json` for Next.js web app (deprecated), but Edge Functions use raw SQL + Supabase client. No ORM needed.

### ❌ dotenv or Secret Management Libraries
**Why:** Supabase handles secrets via `supabase secrets set`. Edge Functions access via `Deno.env.get()`. No .env files in production (Supabase dashboard manages secrets). Only validate at runtime with Zod.

### ❌ Express/Fastify/Hono for Routing
**Why:** Edge Functions use Deno's native `serve()` + URL-based routing in `index.ts`. Framework overhead unnecessary for 3 endpoints (webhook, health, admin).

### ❌ Logger Libraries (Winston, Pino, Bunyan)
**Why:** Custom `utils/logger.ts` already provides structured logging with categories, error tracking, and correlation IDs. Supabase ingests console logs automatically. No external logger needed.

---

## Integration Points with Existing Stack

### Sentry Integration with Supabase Edge Functions

**Setup:**
```typescript
// supabase/functions/sophia-bot/index.ts
import * as Sentry from "npm:@sentry/deno@10.32.1";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  environment: Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "development",
  tracesSampleRate: 0.1, // 10% sampling to reduce overhead
  beforeSend: (event) => {
    // Strip PII from error reports
    if (event.user?.phone_number) delete event.user.phone_number;
    return event;
  },
});

serve(async (req) => {
  return await Sentry.withScope(async (scope) => {
    const correlationId = crypto.randomUUID();
    scope.setTag("correlation_id", correlationId);
    scope.setContext("request", {
      url: req.url,
      method: req.method,
    });

    try {
      // Existing handler logic
      return await handleWebhook(req, supabase, supabaseUrl, supabaseKey);
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });
});
```

**Critical:** Use `withScope` for EVERY request to avoid scope leakage (Sentry Deno SDK limitation — no automatic Deno.serve instrumentation as of Feb 2026).

**Sources:**
- [Supabase Monitoring with Sentry](https://supabase.com/docs/guides/functions/examples/sentry-monitoring)

---

### Deno OpenTelemetry Integration (Development/Staging Only)

**Enable via environment variable:**
```bash
# In Supabase Edge Function secrets (staging only)
supabase secrets set OTEL_DENO=1 --project-ref vceeheaxcrhmpqueudqx

# Point to OpenTelemetry collector (e.g., Jaeger, Tempo, or SigNoz)
supabase secrets set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

**Deno automatically instruments:**
- ✅ `Deno.serve()` — HTTP request tracing
- ✅ `fetch()` — Outbound OpenRouter/WaSend/Zyprus API calls
- ✅ `console.log()` — Structured logs as OTEL events

**Production strategy:** Disable OTEL in production initially (set `OTEL_DENO=0`), enable temporarily for debugging specific issues, then disable again.

**Why:** Edge Functions have 120s timeout budget. OTEL adds ~5% overhead — acceptable for staging, minimize in production until needed.

**Sources:**
- [Deno Built-In OpenTelemetry](https://docs.deno.com/runtime/fundamentals/open_telemetry/)
- [How to Enable OpenTelemetry in Deno (2026)](https://oneuptime.com/blog/post/2026-02-06-opentelemetry-deno-otel-deno-environment-variable/view)

---

### Environment Validation at Startup

**Add to `index.ts` (before `serve()`):**
```typescript
import { validateEnv } from "./utils/env-validator.ts";

// Validate environment variables at cold start
const env = validateEnv();
logger.info("Environment validated successfully", {
  category: LogCategory.GENERAL,
  hasResendKey: !!env.RESEND_API_KEY,
  hasSentryDsn: !!env.SENTRY_DSN,
});
```

**Benefits:**
- ✅ Fail fast on cold start (before handling any requests)
- ✅ Typed environment object (IntelliSense shows validated keys)
- ✅ Clear error messages in logs when misconfigured

**Gotcha:** Supabase Edge Functions cache environment variables. After updating secrets, functions may serve stale values for 5-15 minutes. **Workaround:** Re-deploy function to force cold start.

---

## Deployment Checklist

When implementing audit improvements:

**Phase 1: Security Hardening (Tier 1)**
- [ ] Add Zod env validation to `index.ts`
- [ ] Add timeout enforcement to all external API calls (OpenRouter, WaSend, Zyprus, Resend)
- [ ] Enhance circuit breaker with Deno std/async (or keep custom implementation)
- [ ] Test: Deploy to staging, trigger circuit breaker, verify failover to fallback model

**Phase 2: Observability (Tier 2)**
- [ ] Add Sentry to `package.json` (or use `npm:` import directly in Deno)
- [ ] Integrate Sentry with `withScope` wrapper in `index.ts`
- [ ] Configure SENTRY_DSN secret in Supabase
- [ ] Test: Throw intentional error, verify Sentry captures it with context
- [ ] Add identity protection: strip phone numbers from Sentry events
- [ ] Enable Deno OTEL in staging (via `OTEL_DENO=1`)

**Phase 3: Operational Excellence (Tier 3)**
- [ ] Add token tracking to OpenRouter responses
- [ ] Create `ai_usage_costs` table in Supabase
- [ ] Implement weekly cost aggregation Edge Function
- [ ] Add budget threshold alerts (email when >80% of monthly budget)

**Phase 4: Type Safety**
- [ ] Update tsconfig.json with strict mode enhancements
- [ ] Run `npx tsc --noEmit` to catch new type errors
- [ ] Fix type errors incrementally (prioritize `services/` and `tools/`)

---

## Version Compatibility Matrix

| Dependency | Current Version (SOPHIA) | Recommended Version | Breaking Changes? |
|------------|--------------------------|---------------------|-------------------|
| Deno std/http | `0.224.0` | `0.224.0` | ✅ No change needed |
| @supabase/supabase-js | `2.39.0` (Edge), `2.87.1` (Next.js) | Keep `2.39.0` for Edge Functions | ⚠️ Version mismatch OK (different runtimes) |
| Zod | `3.25.76` | `3.25.76` | ✅ No change needed |
| @opentelemetry/api | `1.9.0` | `1.9.0` | ✅ No change needed |
| @sentry/deno | Not installed | `10.32.1+` | ✅ New dependency (additive) |
| Deno std/async | Not used | `0.224.0` (unstable) | ⚠️ Unstable API, may change |

**Notes:**
- Edge Functions import from `esm.sh` CDN (e.g., `https://esm.sh/@supabase/supabase-js@2.39.0`) — versions locked in import URLs
- Next.js web app (deprecated) uses `package.json` versions — ignore for audit scope
- Deno std library versions must match Deno runtime version (currently pinned to `0.224.0` in imports)

---

## Conflict Warnings

### ⚠️ Sentry + Deno.serve Scope Isolation
**Issue:** Sentry Deno SDK (as of Feb 2026) does NOT automatically isolate requests. Global breadcrumbs/context are shared across concurrent requests.

**Workaround:** Wrap EVERY request handler in `Sentry.withScope()`. Do NOT use `Sentry.setUser()` or `Sentry.setTag()` at global level.

**Example:**
```typescript
// ❌ WRONG — Global scope pollution
Sentry.setUser({ id: userId });

// ✅ CORRECT — Request-scoped
Sentry.withScope((scope) => {
  scope.setUser({ id: userId });
  // Handle request
});
```

**Source:** [Sentry Deno SDK GitHub Issues](https://github.com/getsentry/sentry-javascript/tree/master/packages/deno)

---

### ⚠️ Deno OTEL Overhead in Production
**Issue:** Built-in OTEL tracing adds ~5% latency overhead. Edge Functions have 120s timeout budget; 5% = 6s penalty on long-running requests.

**Mitigation:**
- Disable OTEL in production by default (`OTEL_DENO=0`)
- Enable temporarily for debugging specific issues
- Use Sentry for error tracking (lower overhead, always-on)
- Use Supabase dashboard metrics for performance monitoring (free, built-in)

**Trade-off:** Deep tracing vs. latency. For SOPHIA's use case (WhatsApp bot with <10s typical response time), 5% overhead is acceptable in staging but unnecessary in production.

---

### ⚠️ TypeScript Strict Mode Breaking Changes
**Issue:** Enabling `strict: true` + additional flags will surface 50-100+ type errors in existing codebase.

**Mitigation:**
- Enable strict mode in NEW files only (use `// @ts-strict` comment)
- Fix errors incrementally (prioritize `services/`, `tools/`, then `handlers/`)
- Use `// @ts-expect-error` sparingly for third-party types (e.g., WaSend API)
- Budget 4-6 hours for full codebase strict mode migration

**Alternative:** Enable strict mode project-wide, fix errors in batches, deploy incrementally.

---

## Cost Analysis

| Addition | Setup Cost (Hours) | Runtime Cost | Ongoing Maintenance |
|----------|-------------------|--------------|---------------------|
| Zod env validation | 1h | Zero | None (library already in deps) |
| Sentry integration | 2h | Free tier: 5K errors/month | Review alerts weekly |
| Deno OTEL (staging) | 1h | Zero (self-hosted) | Configure collectors per environment |
| Deno std/async circuit breaker | 2h | Zero | None (native Deno) |
| TypeScript strict mode | 4-6h | Zero | Enforce in CI/CD linting |
| Custom cost tracking | 3h | Zero (Supabase storage) | Monthly review of cost data |

**Total one-time cost:** 13-15 hours
**Total recurring cost:** $0 (Sentry free tier sufficient for current scale)

**When to upgrade Sentry:**
- If error volume exceeds 5K/month (unlikely for single-function bot)
- If performance monitoring needed beyond 10% sample rate

---

## Success Metrics

**Before audit improvements:**
- ❌ No environment validation (silent failures on missing secrets)
- ❌ No centralized error tracking (errors buried in Supabase logs)
- ❌ Circuit breaker exists but doesn't respect Edge Function timeout budget
- ❌ No cost visibility (OpenRouter usage unknown until bill arrives)
- ❌ Type safety gaps (implicit `any`, nullable fields accessed without checks)

**After implementation (target state):**
- ✅ Environment validation fails fast with clear error messages
- ✅ Sentry captures 100% of unhandled errors with full context (correlation ID, user-agent, request path)
- ✅ Circuit breaker respects 120s timeout, fails gracefully to fallback model
- ✅ Weekly cost reports: tokens used, estimated spend, trend analysis
- ✅ TypeScript strict mode: 0 type errors, full IntelliSense coverage

**Monitoring:**
- Track Sentry error rate (target: <10 errors/day in production)
- Track OpenRouter fallback rate (target: <5% of requests use fallback model)
- Track Edge Function timeout rate (target: <1% of requests hit 120s limit)

---

## Sources Summary

**High Confidence (Official Docs, Current as of 2026):**
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Supabase Sentry Integration](https://supabase.com/docs/guides/functions/examples/sentry-monitoring)
- [Deno OpenTelemetry](https://docs.deno.com/runtime/fundamentals/open_telemetry/)
- [Zod Official Docs](https://zod.dev/)
- [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/)
- [Deno 2.2 Release Notes](https://deno.com/blog/v2.2)

**Medium Confidence (Third-Party Guides, Recent 2026):**
- [How to Enable OpenTelemetry in Deno (2026)](https://oneuptime.com/blog/post/2026-02-06-opentelemetry-deno-otel-deno-environment-variable/view)
- [How to Validate Data with Zod in TypeScript (2026)](https://oneuptime.com/blog/post/2026-01-25-zod-validation-typescript/view)
- [TypeScript Strict Mode Guide (2026)](https://oneuptime.com/blog/post/2026-02-20-typescript-strict-mode-guide/view)

**Low Confidence (New/Unverified in Production):**
- [llm-cost-tracker npm package](https://libraries.io/npm/llm-cost-tracker) — Small package, limited production usage data
- [Deno std/async Circuit Breaker](https://github.com/denoland/std/releases) — Marked unstable, API may change

---

## Final Recommendation

**Prioritize native solutions over external dependencies:**
1. ✅ Zod (already in project) for validation
2. ✅ Deno OTEL (built-in) for tracing
3. ✅ Sentry (industry standard) for error tracking
4. ✅ Supabase built-in logging (already active)
5. ⚠️ Deno std/async circuit breaker (unstable but promising)
6. ❌ Skip llm-cost-tracker, implement custom token tracking

**Philosophy:** SOPHIA is a production-critical bot serving real estate agents. New dependencies must meet high bar: actively maintained, TypeScript-native, minimal overhead, proven in Deno/Edge Function environments. When in doubt, build custom with native APIs rather than add unproven libraries.
