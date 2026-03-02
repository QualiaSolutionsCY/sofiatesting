---
phase: 24-observability-documentation
plan: 01a
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/_shared/sentry.ts
  - supabase/functions/sophia-bot/index.ts
  - supabase/functions/sophia-bot/handlers/webhook.ts
autonomous: true

must_haves:
  truths:
    - "Edge Function errors captured in Sentry with stack traces"
    - "Sentry events include user context (phone number, agent ID)"
    - "Sentry breadcrumbs show request flow before error"
    - "No hardcoded DSN in code (uses env var)"
  artifacts:
    - path: "supabase/functions/_shared/sentry.ts"
      provides: "Sentry client initialization for Edge Functions"
      min_lines: 50
      exports: ["initSentry", "captureError", "addBreadcrumb"]
    - path: "supabase/functions/sophia-bot/index.ts"
      provides: "Sentry initialization on function startup"
      contains: "initSentry()"
    - path: "supabase/functions/sophia-bot/handlers/webhook.ts"
      provides: "Error capture in webhook handler"
      contains: "captureError"
  key_links:
    - from: "supabase/functions/sophia-bot/index.ts"
      to: "../_shared/sentry.ts"
      via: "initSentry() call"
      pattern: "initSentry\\(\\)"
    - from: "supabase/functions/sophia-bot/handlers/webhook.ts"
      to: "../_shared/sentry.ts"
      via: "captureError() in catch blocks"
      pattern: "captureError\\("
---

<objective>
Integrate Sentry error tracking into sophia-bot Edge Function to capture production errors with full context.

Purpose: Enables production debugging with stack traces, user context, and request breadcrumbs (addresses audit finding #20 + #53).
Output: Sentry captures all sophia-bot errors with actionable debugging information.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Existing Sentry configuration
@sentry.edge.config.ts
@sentry.server.config.ts

# Edge Function structure
@supabase/functions/sophia-bot/index.ts
@supabase/functions/sophia-bot/handlers/webhook.ts
@supabase/functions/sophia-bot/utils/logger.ts

# Audit findings reference
@AI-PRODUCTION-AUDIT.md
</context>

<tasks>

<task type="auto">
  <name>Create shared Sentry client for Deno Edge Functions</name>
  <files>supabase/functions/_shared/sentry.ts</files>
  <action>
Create Deno-compatible Sentry integration module in _shared directory (for cross-function imports):
- Import Sentry from esm.sh CDN: `@sentry/deno@8.x` (NOT @sentry/nextjs - Edge Functions use Deno runtime)
- Export `initSentry()` function that initializes with:
  - DSN from `Deno.env.get("SENTRY_DSN")` (matches existing Next.js config)
  - `environment: Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "development"`
  - `tracesSampleRate: 0.1` (10% sampling to match edge config)
  - `enabled: true` in production (check deployment ID), false otherwise
  - Release tag from `Deno.env.get("DENO_DEPLOYMENT_ID")` if available
- Export `captureError(error: Error, context?: Record<string, unknown>)` function:
  - Sets user context (phoneNumber, agentId if provided)
  - Adds tags (channel, correlationId if in context)
  - Calls `Sentry.captureException(error)`
- Export `addBreadcrumb(message: string, category: string, data?: Record<string, unknown>)` function:
  - Wraps `Sentry.addBreadcrumb()` with consistent format
- Follow existing logger.ts pattern for consistent module structure
- NO hardcoded DSN (must come from environment variable)
  </action>
  <verify>
`grep -r "SENTRY_DSN" supabase/functions/_shared/sentry.ts` shows env var usage, NOT hardcoded value.
Module exports initSentry, captureError, addBreadcrumb.
  </verify>
  <done>Shared Sentry module exists at _shared/sentry.ts with Deno-compatible imports and exports all three required functions</done>
</task>

<task type="auto">
  <name>Integrate Sentry into sophia-bot Edge Function</name>
  <files>supabase/functions/sophia-bot/index.ts, supabase/functions/sophia-bot/handlers/webhook.ts</files>
  <action>
**In index.ts:**
- Import `initSentry` from `../_shared/sentry.ts`
- Call `initSentry()` ONCE at module load (top-level, before Deno.serve)
- Add comment: "Initialize Sentry for error tracking (OBS-01)"

**In handlers/webhook.ts:**
- Import `captureError` and `addBreadcrumb` from `../../_shared/sentry.ts`
- Add breadcrumb at start of handleWebhook function (after correlationId generation, ~line 45): `addBreadcrumb("WhatsApp webhook received", "http", { correlationId })`
- In existing try/catch blocks that log errors:
  - Call `captureError(error, { phoneNumber, agentId, correlationId, channel: "whatsapp" })` BEFORE logging
  - Keep existing logger.error calls (Sentry augments, doesn't replace)
- In processRequest error handler (~line 580):
  - Add `captureError(error, { phoneNumber, correlationId })` before silent failure
- Add breadcrumbs for key operations:
  - Before AI call (~line 200): `addBreadcrumb("Calling OpenRouter", "ai", { model })`
  - After tool execution (~line 350): `addBreadcrumb("Tool executed", "tool", { toolName })`
  </action>
  <verify>
`grep "captureError" supabase/functions/sophia-bot/handlers/webhook.ts` shows at least 3 calls.
`grep "initSentry" supabase/functions/sophia-bot/index.ts` shows exactly 1 call at top-level.
`grep "from.*_shared/sentry" supabase/functions/sophia-bot/handlers/webhook.ts` confirms import from shared directory.
  </verify>
  <done>Sentry captures errors in webhook handler with user context and breadcrumbs showing request flow</done>
</task>

</tasks>

<verification>
- [ ] supabase/functions/_shared/sentry.ts exists with Deno imports
- [ ] sophia-bot/index.ts imports and calls initSentry()
- [ ] sophia-bot/handlers/webhook.ts has captureError() calls in catch blocks
- [ ] Breadcrumbs added for key operations (webhook received, AI call, tool execution)
- [ ] No hardcoded DSN in codebase (grep confirms)
</verification>

<success_criteria>
1. Shared Sentry module created at _shared/sentry.ts
2. sophia-bot initializes Sentry on function startup
3. Errors in webhook handler captured with user context
4. Breadcrumbs show request flow before error
5. No hardcoded secrets in codebase
</success_criteria>

<output>
After completion, create `.planning/phases/24-observability-documentation/24-01a-SUMMARY.md`
</output>
