---
phase: 22-resilience-infrastructure
plan: 01
subsystem: infra
tags: [circuit-breaker, timeout, resilience, zyprus, resend, wasend, abort-signal]

# Dependency graph
requires:
  - phase: existing-infrastructure
    provides: external API integrations (Zyprus, Resend, WaSend)
provides:
  - 30-second timeouts on all 27 external API fetch calls
  - Circuit breaker protection for Zyprus, Resend, and WaSend APIs
  - Fail-fast behavior preventing cascade failures
affects: [23-security-hardening, future-api-integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AbortSignal.timeout(30_000) pattern for all external fetch calls"
    - "Circuit breaker layered with retry logic for robust resilience"
    - "3-failure threshold with 60-second reset timeout"

key-files:
  created: []
  modified:
    - supabase/functions/sophia-bot/zyprus/client.ts
    - supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts
    - supabase/functions/sophia-bot/tools/handlers/email.ts
    - supabase/functions/sophia-bot/services/email-service.ts
    - supabase/functions/sophia-bot/services/duplicate-checker.ts
    - supabase/functions/sophia-bot/memory/sophia-memory.ts
    - supabase/functions/sophia-bot/utils/wasend.ts

key-decisions:
  - "30-second timeout threshold chosen to balance user experience with system protection"
  - "Circuit breaker positioned BEFORE retry logic for WaSend to fail fast when service is degraded"
  - "All circuit breakers use consistent 3-failure threshold and 60s reset timeout matching existing OpenRouter pattern"

patterns-established:
  - "All external fetch calls must include signal: AbortSignal.timeout(30_000)"
  - "Critical external services (Zyprus OAuth, Resend send, WaSend send) must have circuit breaker guards"
  - "Circuit breaker checks occur before operation, with recordSuccess/recordFailure after"

# Metrics
duration: 25min
completed: 2026-03-02
---

# Phase 22 Plan 01: Timeouts and Circuit Breakers Summary

**30-second timeouts on all 27 external API calls with circuit breaker protection for Zyprus OAuth, Resend email, and WaSend WhatsApp APIs**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-02T02:43:00Z
- **Completed:** 2026-03-02T03:08:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added AbortSignal.timeout(30_000) to all 27 external API fetch calls (15 Zyprus + 6 taxonomy + 4 email + 2 duplicate check + 1 embedding)
- Implemented circuit breaker protection for 3 critical external services (Zyprus, Resend, WaSend)
- Layered circuit breakers with existing retry logic for comprehensive resilience
- Prevents indefinite hangs on API failures and enables fail-fast behavior after repeated failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AbortController timeouts to all Zyprus and email fetch calls** - `13ce0af` (feat)
   - 15 timeouts in zyprus/client.ts (OAuth, image downloads, uploads, property/land creation/patch)
   - 6 timeouts in zyprus/taxonomy-cache.ts (parallel pagination fetches)
   - 2 timeouts in tools/handlers/email.ts (attachment fetch, Resend send)
   - 1 timeout in services/email-service.ts (Resend send)
   - 2 timeouts in services/duplicate-checker.ts (Zyprus duplicate search)
   - 1 timeout in memory/sophia-memory.ts (embedding API call)

2. **Task 2: Add circuit breaker protection to Zyprus, Resend, and WaSend APIs** - `3c2cf3f` (feat)
   - Zyprus: Circuit breaker on OAuth token fetch (protects entire API pipeline)
   - Resend: Circuit breaker on email sending
   - WaSend: Circuit breaker on text, document, and image sending (layered before retry)

## Files Created/Modified

- `supabase/functions/sophia-bot/zyprus/client.ts` - Added 15 timeouts + circuit breaker to OAuth token fetch
- `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts` - Added 6 timeouts to parallel pagination fetches
- `supabase/functions/sophia-bot/tools/handlers/email.ts` - Added 2 timeouts (attachment fetch, Resend send)
- `supabase/functions/sophia-bot/services/email-service.ts` - Added 1 timeout + circuit breaker to Resend send
- `supabase/functions/sophia-bot/services/duplicate-checker.ts` - Added 2 timeouts to Zyprus duplicate search
- `supabase/functions/sophia-bot/memory/sophia-memory.ts` - Added 1 timeout to embedding API call
- `supabase/functions/sophia-bot/utils/wasend.ts` - Added circuit breaker to all 3 WaSend functions (text, document, image)

## Decisions Made

**Timeout threshold:** 30 seconds chosen as optimal balance - long enough for legitimate slow responses (large files, slow networks) but short enough to prevent user-facing hangs.

**Circuit breaker placement:** For WaSend, circuit breaker checks occur BEFORE withRetry wrapper to fail fast when service is degraded, while retry logic handles transient failures. This creates layered resilience: circuit breaker (persistent failures) + retry (transient failures).

**Consistent configuration:** All circuit breakers use same thresholds (3 failures, 60s reset) matching existing OpenRouter pattern for operational simplicity.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all 27 fetch calls identified correctly and timeouts added without TypeScript compilation errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for phase 22-02:** Retry and degraded mode logic is already implemented via withRetry utility and circuit breaker infrastructure. No blockers.

**Impact on system:**
- All external API calls now protected against indefinite hangs
- System will fail fast when external services are persistently degraded
- Circuit breakers will automatically recover after 60-second cooldown period
- No breaking changes to existing functionality

## Self-Check: PASSED

All claimed files and commits verified:
- ✓ supabase/functions/sophia-bot/zyprus/client.ts
- ✓ supabase/functions/sophia-bot/services/email-service.ts
- ✓ supabase/functions/sophia-bot/utils/wasend.ts
- ✓ Commit 13ce0af (Task 1: timeouts)
- ✓ Commit 3c2cf3f (Task 2: circuit breakers)

---
*Phase: 22-resilience-infrastructure*
*Completed: 2026-03-02*
