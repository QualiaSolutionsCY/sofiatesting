---
phase: 09-validation-error-handling
plan: 05
subsystem: api
tags: [error-handling, validation, image-processing, user-experience]

# Dependency graph
requires:
  - phase: 09-02
    provides: Error classification utilities (classifyError, getUserFriendlyMessage)
  - phase: 09-04
    provides: Image validation service (validateImagesAtIngress)
provides:
  - Webhook validates images at ingress before storage
  - Tool executor returns user-friendly error messages
  - No technical errors exposed to end users
affects: [All future phases using sophia-bot Edge Function]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Early validation pattern (fail fast at ingress)"
    - "User-friendly error messages throughout tool execution"
    - "Error classification for targeted responses"

key-files:
  created: []
  modified:
    - supabase/functions/sophia-bot/index.ts
    - supabase/functions/sophia-bot/tools/executor.ts

key-decisions:
  - "Validate images at webhook ingress (before persistence) to fail fast"
  - "Send immediate feedback to users for invalid images"
  - "Classify errors by type for contextual user messages"
  - "Never expose technical details (stack traces, API errors) to users"

patterns-established:
  - "Validation at ingress pattern: Check quality at entry point, not at tool execution"
  - "User-friendly error pattern: classifyError → getUserFriendlyMessage → return to user"
  - "Correlation ID tracking: Images linked to webhook calls for debugging"

# Metrics
duration: 3min
completed: 2026-01-29
---

# Phase 09 Plan 05: Error Integration Summary

**Webhook validates images at ingress; tool errors converted to user-friendly messages; production-ready error handling complete**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-29T02:33:06Z
- **Completed:** 2026-01-29T02:35:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Images validated at webhook ingress before storage (fail fast)
- Invalid images immediately reported to users with clear feedback
- Tool executor errors classified and converted to user-friendly messages
- No technical details (stack traces, API errors) exposed to users
- Complete integration of ERR-03 + IMG validation systems

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate early image validation into webhook** - `7831554` (feat)
2. **Task 2: Add user-friendly error messages to tool executor** - `c518894` (feat)

## Files Created/Modified

- `supabase/functions/sophia-bot/index.ts` - Added validateImagesAtIngress integration; validates before persistence
- `supabase/functions/sophia-bot/tools/executor.ts` - Added getUserFriendlyMessage to all error handlers

## User-Facing Error Messages Added

### Image Validation (Webhook Ingress)

- **Empty URL:** "No image URL provided."
- **Hallucinated URL:** "This image URL doesn't look valid. Please send a photo directly from your phone gallery."
- **ibb.co sharing link:** "This is a sharing link, not a direct image URL. Please use the direct image link (starting with i.ibb.co) or send photos directly from your gallery."
- **Security check failed:** "This image URL cannot be accessed for security reasons. Please send photos directly from your gallery."
- **HTTP 404:** "This image could not be found. It may have been deleted."
- **HTTP 403:** "Access to this image is forbidden."
- **Not an image:** "This URL doesn't point to an image. Please send a photo directly from your gallery."
- **Timeout:** "This image took too long to load. Please try a different image or send directly from your gallery."

### Tool Execution Errors

- **Network error:** "I'm having trouble connecting. Please try again in a moment."
- **Auth error:** "There's an authentication issue. Please contact support."
- **Validation error:** "Some information was invalid. Please check your input."
- **Rate limit:** "Too many requests. Please wait a minute and try again."
- **Server error:** "The service is temporarily unavailable. Please try again shortly."
- **Timeout:** "The request took too long. Please try again."
- **AI error:** "I'm having trouble processing your request. Please try rephrasing."
- **Database error:** "There's a database issue. Please try again."
- **Unknown:** "Something went wrong. Please try again or contact support."

### Zyprus API Errors

- **Network/Timeout:** "The property listing service is temporarily slow. Please try again in a moment."
- **Auth:** "There's a configuration issue with the property system. Please contact support."
- **Other:** "Unable to create the listing right now. Please try again shortly."

### Email Errors

- **With attachment:** "Unable to send the email with attachment. Please try again."
- **Without attachment:** "Unable to send the email. Please try again in a moment."

## Integration Points for Image Validation

### Webhook Flow

1. **Extract images** from webhook payload (imageMessage, documentMessage)
2. **Decrypt if needed** (WaSenderAPI encrypted URLs)
3. **Validate at ingress** (validateImagesAtIngress) ← NEW
4. **Persist valid images** to Supabase Storage
5. **Add to pending_images** table with correlation ID

### Validation Logic

```typescript
const validation = await validateImagesAtIngress(imageUrls);

// Only persist valid images
if (validation.valid.length > 0) {
  const validUrls = validation.valid.map(i => i.url);
  persistedImageUrls = await persistImages(validUrls);
  await addPendingImages(phoneNumber, persistedImageUrls, correlationId);
}

// If ALL images invalid, send feedback immediately
if (validation.valid.length === 0 && validation.invalid.length > 0) {
  const userMessage = validation.invalid[0].userMessage;
  await sendTextMessage(phoneNumber, userMessage);
}
```

## Database Migration Required

From 09-04 dependency (documented for reference):

```sql
-- Add correlation_id column to pending_images for debugging
ALTER TABLE pending_images ADD COLUMN IF NOT EXISTS correlation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pending_images_correlation ON pending_images(correlation_id);
```

**Note:** Column is backward-compatible. Code handles missing column gracefully.

## Decisions Made

1. **Validate at ingress, not at tool execution** - Fail fast principle; catch bad images before they reach storage
2. **Send immediate feedback for invalid images** - User knows right away if there's a problem, can resend
3. **Classify errors before generating messages** - Enables context-specific responses (network vs auth vs validation)
4. **Never expose technical details** - Users see "I'm having trouble connecting" not "ECONNREFUSED 127.0.0.1:8080"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - integration straightforward with dependencies (09-02, 09-04) already implemented.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Phase 9 complete!** All validation and error handling infrastructure deployed:

- ✅ Retry with exponential backoff (09-02)
- ✅ Structured error responses (09-02)
- ✅ Health check endpoint (09-03)
- ✅ Image validation service (09-04)
- ✅ Correlation ID tracking (09-04)
- ✅ User-friendly error integration (09-05)

**Production readiness:**
- Webhook handles invalid images gracefully
- Tool errors never expose technical details
- All external service calls have retry logic
- Health checks available for monitoring

**System is production-ready for error scenarios.**

---
*Phase: 09-validation-error-handling*
*Completed: 2026-01-29*
