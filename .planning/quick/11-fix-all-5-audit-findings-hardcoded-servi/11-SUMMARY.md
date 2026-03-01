# Quick Task 11: Fix 4 Audit Findings

## What Changed

### Fix 1: Remove hardcoded service_role JWT (P0)
- **File:** `tests/manual/check-my-notes-logs.ts`
- **Before:** Hardcoded Supabase service_role JWT on line 14
- **After:** Uses env var `SUPABASE_SERVICE_ROLE_KEY` with early exit if missing
- **Commit:** `3fe6f6d`

### Fix 2: Remove setInterval memory leak (P1)
- **File:** `lib/rate-limit.ts`
- **Before:** `setInterval` running forever in serverless, never cleared
- **After:** On-demand cleanup at start of each `rateLimit()` call
- **Commit:** `e09e675`

### Fix 3: Add rate limiting to upload and document routes (P1)
- **Files:** `app/api/listings/upload/route.ts`, `app/api/documents/generate/route.ts`
- **Before:** No rate limiting on these routes
- **After:** 10 req/min per user, returns 429 with X-RateLimit headers
- **Commit:** `ac377d1`

### Fix 4: Dynamic imports for bundle optimization (P2)
- **File:** `components/document-preview.tsx`
- **Before:** Eagerly importing CodeMirror (~500KB) and ProseMirror (~1.3MB)
- **After:** `next/dynamic` lazy loading, deferred until render
- **Commit:** `1e3fc27`

### Skipped: Base64 images in Edge Function
- **Reason:** Images are embedded in generated DOCX files at runtime. Moving to Supabase Storage would add fetch latency on every document generation. Bundle is within Supabase limits (1.5MB / 10MB max).

## Verification
- `npx tsc --noEmit` — PASS
- `npm run build` — PASS
- No hardcoded JWTs in tests/ — PASS
- No setInterval in rate-limit.ts — PASS
- Rate limits on both routes — PASS
- Dynamic imports in document-preview — PASS

## Post-Fix Action Required
- **CRITICAL:** Rotate the Supabase service_role key via dashboard (the old key was in git history)
