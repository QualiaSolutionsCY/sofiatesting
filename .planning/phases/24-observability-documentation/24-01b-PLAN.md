---
phase: 24-observability-documentation
plan: 01b
type: execute
wave: 2
depends_on: ["24-01a"]
files_modified:
  - supabase/functions/call-audit/index.ts
autonomous: false

must_haves:
  truths:
    - "call-audit errors captured in Sentry with context"
    - "SENTRY_DSN secret configured in Supabase"
    - "Test error visible in Sentry dashboard"
  artifacts:
    - path: "supabase/functions/call-audit/index.ts"
      provides: "Sentry integration in call-audit function"
      contains: "initSentry()"
  key_links:
    - from: "supabase/functions/call-audit/index.ts"
      to: "../_shared/sentry.ts"
      via: "initSentry() and captureError() calls"
      pattern: "(initSentry|captureError)\\("
---

<objective>
Complete Sentry integration for call-audit Edge Function and deploy with secrets configured.

Purpose: Extends Sentry coverage to all production Edge Functions and validates configuration.
Output: All Edge Functions capturing errors in Sentry with production validation.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/24-observability-documentation/24-01a-SUMMARY.md

# Edge Function structure
@supabase/functions/call-audit/index.ts
@supabase/functions/_shared/sentry.ts
</context>

<tasks>

<task type="auto">
  <name>Integrate Sentry into call-audit Edge Function</name>
  <files>supabase/functions/call-audit/index.ts</files>
  <action>
Follow same pattern as sophia-bot, using shared sentry.ts:
- Import `initSentry`, `captureError`, `addBreadcrumb` from `../_shared/sentry.ts`
- Call `initSentry()` at module load (top-level, before Deno.serve)
- Add breadcrumb at audit start: `addBreadcrumb("Call audit started", "cron", { auditDate })`
- Wrap existing error handlers with `captureError(error, { auditRunId, callerCount })`
- Add breadcrumb after each major operation:
  - After 3CX fetch: `addBreadcrumb("3CX calls fetched", "integration", { callCount })`
  - After Telegram alerts sent: `addBreadcrumb("Alerts sent", "telegram", { alertCount })`
  </action>
  <verify>
`grep "captureError" supabase/functions/call-audit/index.ts` shows error capture.
`grep "initSentry" supabase/functions/call-audit/index.ts` shows initialization.
`grep "from.*_shared/sentry" supabase/functions/call-audit/index.ts` confirms import from shared directory.
  </verify>
  <done>call-audit errors captured in Sentry with audit context, using shared _shared/sentry.ts module</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <action>Set SENTRY_DSN secret in Supabase</action>
  <instructions>
Run this command to configure Sentry for Edge Functions:

```bash
supabase secrets set SENTRY_DSN="https://3c3105e6e976377299d56e8bde79ae9f@o4510184257814528.ingest.de.sentry.io/4510965423538256" --project-ref vceeheaxcrhmpqueudqx
```

This uses the same DSN as the Next.js app (from sentry.edge.config.ts).
  </instructions>
  <resume-signal>Type "done" after secret is set</resume-signal>
</task>

<task type="auto">
  <name>Deploy Edge Functions with Sentry integration</name>
  <files>none</files>
  <action>
Deploy Edge Functions with new Sentry integration:

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
supabase functions deploy call-audit --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

After deployment, trigger test error to confirm Sentry capture:
```bash
# Send test webhook that will fail (invalid payload) to trigger error capture
curl -X POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot \
  -H "Content-Type: application/json" \
  -d '{"test":"invalid"}'
```
  </action>
  <verify>
Deployment succeeds without errors.
Check Sentry dashboard for new error event from sophia-bot Edge Function.
  </verify>
  <done>Edge Functions deployed with Sentry integration and test error captured</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Sentry error tracking for Edge Functions with breadcrumbs and context</what-built>
  <how-to-verify>
1. Visit Sentry dashboard: https://qualia-solutions.sentry.io/
2. Check Issues → should see test error from previous task
3. Open error event and verify:
   - Stack trace shows file names and line numbers
   - Environment = "production"
   - Breadcrumbs show request flow (webhook received → calling OpenRouter → etc.)
   - User context populated if test included phone number
4. Send real WhatsApp message to SOPHIA
5. Check Sentry for any new errors during normal operation
  </how-to-verify>
  <resume-signal>Type "approved" if Sentry captures errors with context, or describe issues</resume-signal>
</task>

</tasks>

<verification>
- [ ] call-audit Edge Function has Sentry integration
- [ ] SENTRY_DSN environment variable set in Supabase secrets
- [ ] sophia-bot and call-audit Edge Functions deployed successfully
- [ ] Test error appears in Sentry dashboard with stack trace
- [ ] Breadcrumbs show request flow in error events
- [ ] Production errors now visible in Sentry with actionable debugging info
- [ ] OBS-01 requirement satisfied
</verification>

<success_criteria>
1. call-audit integrated with Sentry
2. Sentry captures Edge Function errors with full stack traces
3. Error events include user context (phone number, agent ID)
4. Breadcrumbs show request flow before error occurred
5. No hardcoded secrets in codebase (DSN from env var)
6. OBS-01 requirement satisfied
</success_criteria>

<output>
After completion, create `.planning/phases/24-observability-documentation/24-01b-SUMMARY.md`
</output>
