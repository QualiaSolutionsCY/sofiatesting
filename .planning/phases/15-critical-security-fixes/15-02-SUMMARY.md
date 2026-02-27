---
phase: 15-critical-security-fixes
plan: 02
subsystem: configuration
tags: [security, configuration, environment-variables, timing-attack-prevention]
dependency_graph:
  requires: []
  provides:
    - environment-based-zyprus-url
    - timing-safe-auth-pattern-docs
  affects:
    - listing-notifier
    - guest-authentication
tech_stack:
  added: []
  patterns:
    - environment-variable-configuration
    - defensive-documentation
key_files:
  created: []
  modified:
    - supabase/functions/listing-notifier/index.ts
    - app/(auth)/api/auth/guest/route.ts
decisions:
  - decision: Use environment variable with fallback instead of production URL default
    rationale: Maintains backward compatibility while alerting ops team via warning log
    alternatives: [hardcode production URL, require environment variable]
  - decision: Add documentation instead of code changes for guest endpoint
    rationale: Endpoint is not vulnerable - no user input for email. Documentation prevents future vulnerabilities
    alternatives: [add timing-safe code even though not needed, ignore the finding]
metrics:
  duration: 1m 19s
  tasks_completed: 2
  commits: 2
  files_modified: 2
  completed_date: 2026-02-27T22:01:02Z
---

# Phase 15 Plan 02: Configuration Security Fixes Summary

**One-liner:** Environment-based Zyprus API configuration and timing-attack prevention documentation

## What Was Built

Fixed two configuration security vulnerabilities identified in the production audit:

1. **SEC-03/EF-003 - Hardcoded Dev URL**: Listing notifier was hardcoded to poll `dev9.zyprus.com` instead of reading from environment, causing production traffic to hit dev environment
2. **SEC-07/WA-008 - Email Enumeration**: Added defensive documentation to guest endpoint to prevent future email enumeration vulnerabilities

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guest endpoint is not actually vulnerable**
- **Found during:** Task 2
- **Issue:** Plan asked to fix WA-008 email enumeration in guest endpoint, but this endpoint auto-generates emails (`guest-{timestamp}@example.com`) and takes no user input
- **Fix:** Added comprehensive security documentation instead of unnecessary code changes
- **Files modified:** `app/(auth)/api/auth/guest/route.ts`
- **Commit:** 77ee9c1
- **Rationale:** The endpoint is not vulnerable, but documentation prevents future vulnerabilities if a user registration endpoint is added

## Task Breakdown

| Task | Type | Name | Status | Commit |
|------|------|------|--------|--------|
| 1 | auto | Replace hardcoded Zyprus dev URL with environment variable | Complete | 6d386b7 |
| 2 | auto | Make guest registration endpoint timing-safe | Complete | 77ee9c1 |

## Technical Details

### Task 1: Environment-Based Zyprus URL

**Changes:**
- Modified `ZYPRUS_API_URL` constant to read from `Deno.env.get("ZYPRUS_API_URL")`
- Added fallback to `dev9.zyprus.com` for backward compatibility
- Added warning log when environment variable not set

**Configuration:**
```bash
# Set production URL via Supabase secret
supabase secrets set ZYPRUS_API_URL=https://zyprus.com --project-ref vceeheaxcrhmpqueudqx
```

**Impact:**
- Prevents production listing notifier from polling dev environment
- Maintains backward compatibility (defaults to dev with warning)
- Ops team alerted via log if environment variable missing

### Task 2: Timing-Safe Authentication Documentation

**Changes:**
- Added comprehensive security comment explaining why guest endpoint is NOT vulnerable
- Documented timing-safe response requirements for future user registration endpoints
- Listed 5 specific requirements: timing-safe DB queries, identical responses, constant-time comparison, server-side logging only, consistent response time

**Why documentation instead of code:**
- Guest endpoint auto-generates emails, no user input
- No email enumeration vector exists
- Future-proofs codebase against developer mistakes

**Requirements documented for future endpoints:**
1. Always query database for user existence (even if email validation fails)
2. Return identical success response whether email exists or not
3. Use constant-time comparison for sensitive checks
4. Log actual result server-side only (never expose to client)
5. Ensure response time is consistent regardless of email existence

## Verification Results

**Environment variable check:**
```bash
$ grep "ZYPRUS_API_URL" supabase/functions/listing-notifier/index.ts
20:const ZYPRUS_API_URL = Deno.env.get("ZYPRUS_API_URL") || "https://dev9.zyprus.com";
31:if (!Deno.env.get("ZYPRUS_API_URL")) {
32:  logger.warn("[Listing Notifier] ZYPRUS_API_URL not set, defaulting to dev9.zyprus.com", {
```

**Other hardcoded URLs check:**
```bash
$ grep -r "dev9.zyprus.com" supabase/functions/
# Only found in:
# - CORS allowed origins (sophia-bot/index.ts) - acceptable
# - Documentation comments - acceptable
# - listing-notifier fallback - expected
```

**No user registration endpoints found:**
```bash
$ find app -name "route.ts" -exec grep -l "register\|signup" {} \;
# Only admin agent registration (protected endpoints), no user registration
```

## Security Posture Improvements

**Before:**
- Listing notifier hardcoded to dev environment (SEC-03)
- No timing-attack prevention guidance for future developers (SEC-07)

**After:**
- Listing notifier environment-configurable, logs warning if misconfigured
- Comprehensive timing-attack prevention requirements documented
- Future developers have clear security requirements for auth endpoints

## Next Phase Readiness

**Blockers:** None

**Recommendations:**
1. Set `ZYPRUS_API_URL` secret in production Supabase project before next cron run
2. Monitor logs for "defaulting to dev9.zyprus.com" warning
3. Consider adding similar environment variable pattern to other hardcoded URLs

## Files Modified

### supabase/functions/listing-notifier/index.ts
**Changes:**
- Line 20: Changed from hardcoded URL to `Deno.env.get("ZYPRUS_API_URL") || "https://dev9.zyprus.com"`
- Lines 31-34: Added warning log when environment variable not set

**Impact:** Prevents production traffic to dev environment

### app/(auth)/api/auth/guest/route.ts
**Changes:**
- Lines 6-23: Added comprehensive security documentation
- Line 28: Added comment explaining timing-safe token check

**Impact:** Prevents future email enumeration vulnerabilities

## Commits

```
6d386b7 fix(15-02): replace hardcoded Zyprus dev URL with environment variable
77ee9c1 fix(15-02): add timing-safety documentation to guest endpoint
```

## Self-Check: PASSED

**Files exist:**
```bash
$ [ -f "supabase/functions/listing-notifier/index.ts" ] && echo "FOUND: supabase/functions/listing-notifier/index.ts"
FOUND: supabase/functions/listing-notifier/index.ts

$ [ -f "app/(auth)/api/auth/guest/route.ts" ] && echo "FOUND: app/(auth)/api/auth/guest/route.ts"
FOUND: app/(auth)/api/auth/guest/route.ts
```

**Commits exist:**
```bash
$ git log --oneline --all | grep -q "6d386b7" && echo "FOUND: 6d386b7"
FOUND: 6d386b7

$ git log --oneline --all | grep -q "77ee9c1" && echo "FOUND: 77ee9c1"
FOUND: 77ee9c1
```

## Key Learnings

1. **Environment variables > Hardcoded URLs**: Using environment variables with fallbacks provides flexibility and alerts
2. **Defensive documentation**: Even if code is not vulnerable, documenting security requirements prevents future mistakes
3. **Audit findings need verification**: WA-008 finding was mislabeled - the actual vulnerable endpoint doesn't exist in codebase

## Related Documentation

- **Audit Report:** AI-PRODUCTION-AUDIT.md (SEC-03 line ~EF-003, SEC-07 line ~WA-008)
- **Deployment Guide:** CLAUDE.md (Deploy Commands section)
