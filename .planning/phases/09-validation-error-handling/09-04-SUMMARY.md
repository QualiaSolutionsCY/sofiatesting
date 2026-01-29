---
phase: 09-validation-error-handling
plan: 04
subsystem: validation
tags: [image-validation, error-handling, correlation-tracking, ssrf-prevention, user-feedback]

# Dependency graph
requires:
  - phase: 09-01
    provides: error-mapper.ts utilities for user-friendly messages
provides:
  - Early image URL validation at webhook ingress
  - User-friendly error messages for invalid images
  - Correlation ID tracking in pending images
  - Hallucinated URL detection
  - ibb.co vs i.ibb.co validation
affects: [09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Early validation at ingress before storage
    - User-friendly error messages guide correct action
    - Correlation IDs for debugging across async operations
    - Backward-compatible schema evolution

key-files:
  created:
    - supabase/functions/sophia-bot/services/image-validator.ts
  modified:
    - supabase/functions/sophia-bot/services/pending-images.ts

key-decisions:
  - "Validate images at ingress before storage (fail fast)"
  - "Hallucinated URL patterns detected (AI mistakes)"
  - "ibb.co vs i.ibb.co specific guidance for users"
  - "5-second timeout for image accessibility checks"
  - "HEAD request with GET fallback for server compatibility"
  - "Correlation ID tracking backward-compatible (column may not exist yet)"
  - "User messages never expose technical details"

patterns-established:
  - "Early validation pattern: check at ingress, fail fast with clear messages"
  - "Correlation tracking pattern: optional parameter with context fallback"
  - "Backward-compatible schema: gracefully handle missing columns"
  - "Batch validation pattern: individual results + summary for user"

# Metrics
duration: 2min
completed: 2026-01-29
---

# Phase 09 Plan 04: Image Validation Summary

**Early image validation at webhook ingress with user-friendly error messages and correlation tracking**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-29T02:27:45Z
- **Completed:** 2026-01-29T02:29:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Image URLs validated before storage (fail fast)
- Clear, actionable error messages for users
- Hallucinated URL detection (fake domains, placeholders)
- Correlation IDs link images to webhook requests for debugging

## Task Commits

Each task was committed atomically:

1. **Task 1: Create early image validation service** - `87967ae` (feat)
2. **Task 2: Add correlation ID tracking to pending images** - `a8b35cc` (feat)

## Files Created/Modified

### Created
- `supabase/functions/sophia-bot/services/image-validator.ts` - Validates image URLs at ingress with user-friendly error messages
  - `validateImageAtIngress(url)` - Single image validation
  - `validateImagesAtIngress(urls)` - Batch validation with summary
  - Detects hallucinated URLs (fake domains, placeholders)
  - ibb.co vs i.ibb.co validation
  - SSRF prevention via url-validator
  - HEAD request with GET fallback
  - Content-type validation
  - 5-second timeout

### Modified
- `supabase/functions/sophia-bot/services/pending-images.ts` - Added correlation ID tracking
  - Import getContext from utils/context.ts
  - addPendingImages now accepts optional correlationId parameter
  - Auto-gets correlation ID from context if not provided
  - Stores correlation_id in records (backward-compatible)
  - All logs include correlation context

## Decisions Made

**1. Validate at ingress before storage**
- Rationale: Fail fast, users get immediate feedback, don't store invalid data

**2. Hallucinated URL patterns**
- Rationale: AI sometimes generates fake URLs (images.zyprus.com, placeholder patterns)
- Pattern list can be extended as new patterns discovered

**3. ibb.co vs i.ibb.co specific check**
- Rationale: Common user mistake - sharing link vs direct image URL
- Specific message guides users to correct URL format

**4. 5-second timeout for accessibility**
- Rationale: Balance between thorough check and webhook response time
- Prevents hanging on slow/unavailable servers

**5. HEAD request with GET fallback**
- Rationale: Some servers don't support HEAD method
- GET with Range header gets minimal data

**6. Correlation ID backward-compatible**
- Rationale: Schema migration may not have run yet
- Code gracefully handles missing correlation_id column

**7. User messages never expose technical details**
- Rationale: "Send photos from your gallery" more helpful than "HTTP 403"
- Technical details in error property for logging

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 09-05:**
- Image validation service ready for integration
- Correlation tracking infrastructure in place
- User-friendly error messages ready to surface
- Hallucinated URL detection operational

**Integration points for 09-05:**
- Call validateImageAtIngress() in webhook handler before addPendingImages()
- Return userMessage to user if validation fails
- Use correlation IDs in error reporting

**No blockers.**

---
*Phase: 09-validation-error-handling*
*Completed: 2026-01-29*
