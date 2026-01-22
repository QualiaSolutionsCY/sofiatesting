# Codebase Concerns

**Analysis Date:** 2026-01-23

## Tech Debt

**Duplicated Code Between lib/ and Edge Functions:**
- Issue: Critical Zyprus API client and taxonomy cache exist in TWO locations with different implementations
- Files:
  - `lib/zyprus/client.ts` (52KB, 1763 lines)
  - `supabase/functions/sophia-bot/zyprus/client.ts` (18KB, 599 lines)
  - `lib/zyprus/taxonomy-cache.ts` (614 lines)
  - `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` (1340 lines - SIGNIFICANTLY LARGER)
- Impact: Bug fixes or features added to one location are not reflected in the other. Edge Function version is more complete but diverged.
- Fix approach: Extract shared code to `supabase/functions/_shared/` and import from there. Remove lib/zyprus/ entirely since Next.js is not deployed.

**Placeholder UUIDs Not Replaced:**
- Issue: Taxonomy cache contains ~50 placeholder UUIDs that will fail if matched
- Files: `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts:294-305, 974-1031`
- Impact: Features like "basement", "elevator", "fireplace" etc. will not be mapped correctly to Zyprus taxonomy
- Fix approach: Run `pnpm exec tsx tests/manual/test-zyprus-api.ts` to fetch actual UUIDs from Zyprus API and replace placeholders

**Deprecated Fields Still in Schema:**
- Issue: Multiple deprecated fields remain in database schema
- Files: `lib/db/schema.ts:181, 207, 228`
- Impact: Confusion about which fields to use; `propertyType` vs `propertyTypeId`, `verandaArea` vs `coveredVeranda`, `amenityFeature` vs feature ID arrays
- Fix approach: Create migration to remove deprecated fields after confirming no code references them

**Debug Logging in Production:**
- Issue: 565 console.log/warn/error calls in Edge Functions (should use structured logger)
- Files: `supabase/functions/sophia-bot/index.ts` (many DEBUG prefixed logs)
- Impact: Log pollution, potential performance impact, sensitive data exposure risk
- Fix approach: Replace console.* with structured logger (already exists in `./utils/logger.ts`), remove DEBUG prefixes

## Known Bugs

**Skipped E2E Tests:**
- Symptoms: 7 tests marked `test.fixme()` will never run in CI
- Files:
  - `tests/e2e/artifacts.test.ts:17, 36, 56` - All artifact tests skipped
  - `tests/e2e/chat.test.ts:155, 161` - Some chat tests skipped
  - `tests/e2e/session.test.ts:196` - Session test skipped
  - `tests/routes/chat.test.ts:317` - Route test skipped
- Trigger: Tests were likely broken by codebase changes and marked fixme instead of fixed
- Workaround: None - these features are untested

**Fail-Open Webhook Security:**
- Symptoms: Invalid webhook signatures are logged but processing continues
- Files: `supabase/functions/sophia-bot/index.ts:2370-2377`
- Trigger: Any invalid signature will be processed anyway
- Workaround: This is intentional (WaSend signature format issues) but creates security gap

## Security Considerations

**No RLS on Core Tables:**
- Risk: If service role key is compromised, all data is exposed
- Files: `lib/db/schema.ts` - User, Chat, Message_v2, PropertyListing tables
- Current mitigation: App-level auth via NextAuth.js + session checks
- Recommendations: Add RLS policies in Supabase for defense-in-depth. Edge Functions use service role key which bypasses RLS anyway.

**Webhook Signature Verification Bypassed:**
- Risk: Spoofed webhooks could be processed
- Files: `supabase/functions/sophia-bot/index.ts:2358-2391`
- Current mitigation: Return 200 OK always (prevents info leakage), rate limiting
- Recommendations: Investigate proper WaSend signature format or add IP allowlist

**Debug Logs May Contain PII:**
- Risk: Phone numbers, message content logged to webhook_debug_logs table
- Files: `supabase/functions/sophia-bot/index.ts:2402-2430`
- Current mitigation: None - all image payloads + 10% random sample saved
- Recommendations: Add retention policy, redact PII, or disable in production

**Hardcoded UUIDs and Credentials Mappings:**
- Risk: Hardcoded user UUIDs could become stale
- Files: `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts:848-867` (USER_FALLBACKS)
- Current mitigation: Supabase agents table lookup attempted first
- Recommendations: Ensure all agents have zyprus_user_id in agents table

## Performance Bottlenecks

**Large prompts.ts File:**
- Problem: 197KB prompts.ts file (4,734 lines)
- Files: `supabase/functions/sophia-bot/prompts.ts`
- Cause: Entire system prompt and all templates in single file
- Improvement path: Split into multiple files, lazy-load templates, consider external storage

**Edge Function Bundle Size:**
- Current capacity: 948KB total for sophia-bot function
- Limit: Deno Deploy has ~20MB limit but cold start increases with size
- Files: `supabase/functions/sophia-bot/` (entire directory)
- Scaling path: Lazy imports, tree shaking, split into multiple functions

**Taxonomy Cache Loads on Every Request:**
- Problem: Full taxonomy (locations, features, users) loaded into memory
- Files: `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts:210-277`
- Cause: No persistent cache between Edge Function invocations
- Improvement path: Use Supabase KV or Redis for cross-invocation caching (1h TTL already implemented but only for single invocation)

## Fragile Areas

**sophia-bot/index.ts Monolith:**
- Files: `supabase/functions/sophia-bot/index.ts` (2,586 lines)
- Why fragile: All webhook handling, message processing, email detection, DOCX generation in one file
- Safe modification: Extract into separate service modules (already partially done with ./services/)
- Test coverage: Minimal - mostly manual testing via WhatsApp

**Taxonomy Name Matching:**
- Files: `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts`
- Why fragile: Zyprus API vocabulary names can change without notice
- Safe modification: Always test with `test-zyprus-api.ts` after changes
- Test coverage: None - relies on fallback UUIDs

**DOCX Template Detection:**
- Files: `supabase/functions/sophia-bot/docx/detector.ts`
- Why fragile: AI response parsing for template triggers is brittle
- Safe modification: Add new patterns carefully, test with actual AI responses
- Test coverage: Minimal unit tests

## Scaling Limits

**Rate Limiting Per Phone:**
- Current capacity: ~100 messages/hour per phone (configurable)
- Limit: Redis lookup on every message
- Files: `supabase/functions/sophia-bot/utils/rate-limiter.ts`
- Scaling path: Already using database-based limiting, could add Redis for lower latency

**Message Deduplication:**
- Current capacity: Relies on database unique constraint
- Limit: Could bottleneck under high webhook retry storms
- Files: `supabase/functions/_shared/db.ts:claimMessageForProcessing()`
- Scaling path: Add Redis-based fast path before database check

## Dependencies at Risk

**No Package:**
- Risk: WaSenderAPI is third-party service (~$6/month)
- Impact: WhatsApp integration depends on external service availability
- Migration plan: Could switch to official WhatsApp Business API (more expensive, more reliable)

**Deno ESM Imports:**
- Risk: Version pinned imports from esm.sh could break
- Files: All Edge Function files import from `https://esm.sh/*`
- Impact: If esm.sh changes or goes down, deployments fail
- Migration plan: Consider vendoring critical dependencies

## Missing Critical Features

**No Supabase Type Generation:**
- Problem: Manual TypeScript types for database tables
- Blocks: Type safety when querying Supabase tables from Edge Functions
- Files: `supabase/functions/sophia-bot/*.ts` - all use manual types

**No Automated Testing for Edge Functions:**
- Problem: No unit or integration tests for sophia-bot
- Blocks: Confident refactoring, regression detection
- Files: `supabase/functions/sophia-bot/` (no test files)

**No Monitoring/Alerting:**
- Problem: Errors only visible in Supabase logs
- Blocks: Proactive issue detection
- Files: N/A - missing infrastructure

## Test Coverage Gaps

**Edge Functions Completely Untested:**
- What's not tested: All sophia-bot logic including tool execution, DOCX generation, Zyprus uploads
- Files: `supabase/functions/sophia-bot/**/*.ts`
- Risk: Regressions in WhatsApp bot, broken property uploads, incorrect tax calculations
- Priority: High - this is the primary production code

**E2E Tests Mostly Skipped:**
- What's not tested: Artifact creation, some chat flows, sessions
- Files: `tests/e2e/artifacts.test.ts`, `tests/e2e/chat.test.ts`, `tests/e2e/session.test.ts`
- Risk: UI regressions in web app (though web app is not deployed)
- Priority: Low - web app not in production

**Tool Execution Not Mocked:**
- What's not tested: AI tool execution paths in isolation
- Files: `lib/ai/tools/*.ts`, `supabase/functions/sophia-bot/tools/executor.ts`
- Risk: Tool bugs only caught via manual WhatsApp testing
- Priority: High - tools are core functionality

**Zyprus API Integration:**
- What's not tested: Real API responses, taxonomy changes, upload failures
- Files: `lib/zyprus/client.ts`, `supabase/functions/sophia-bot/zyprus/client.ts`
- Risk: Uploads fail silently or with confusing errors
- Priority: Medium - has fallback UUIDs but incomplete

---

*Concerns audit: 2026-01-23*
