---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/sophia-bot/services/prompt-loader.ts
  - lib/db/queries.ts
  - supabase/functions/listing-notifier/index.ts
  - supabase/functions/sophia-bot/services/ai-chat.ts
  - tests/unit/edge-functions/reviewer-assignment.test.ts
  - tests/unit/edge-functions/region-validator.test.ts
autonomous: true

must_haves:
  truths:
    - "Prompt cache is enabled with 5-minute TTL in production"
    - "Message history queries are capped at reasonable limit to prevent memory issues"
    - "Listing notifier processes multiple listings concurrently"
    - "OpenRouter API calls timeout after 30 seconds to prevent hanging requests"
    - "Business rule tests verify reviewer assignment and region validation"
  artifacts:
    - path: "supabase/functions/sophia-bot/services/prompt-loader.ts"
      provides: "Re-enabled prompt cache"
      contains: "CACHE_TTL_MS = 5 * 60 * 1000"
    - path: "lib/db/queries.ts"
      provides: "Message history with LIMIT"
      contains: ".limit(200)"
    - path: "supabase/functions/listing-notifier/index.ts"
      provides: "Parallel listing checks with batching"
      contains: "Promise.allSettled"
    - path: "supabase/functions/sophia-bot/services/ai-chat.ts"
      provides: "OpenRouter timeout protection"
      contains: "AbortController"
    - path: "tests/unit/edge-functions/reviewer-assignment.test.ts"
      provides: "Reviewer assignment tests"
      min_lines: 100
    - path: "tests/unit/edge-functions/region-validator.test.ts"
      provides: "Region validation tests"
      min_lines: 80
  key_links:
    - from: "supabase/functions/sophia-bot/services/prompt-loader.ts"
      to: "sophia_prompts table"
      via: "DB query with 5min cache"
      pattern: "CACHE_TTL_MS = 5 \\* 60 \\* 1000"
    - from: "lib/db/queries.ts"
      to: "message table"
      via: ".limit(200) after orderBy"
      pattern: "\\.limit\\(200\\)"
    - from: "supabase/functions/listing-notifier/index.ts"
      to: "isListingPublished API"
      via: "Promise.allSettled with batching"
      pattern: "Promise\\.allSettled"
    - from: "supabase/functions/sophia-bot/services/ai-chat.ts"
      to: "OpenRouter API"
      via: "AbortController with 30s timeout"
      pattern: "AbortController"
---

<objective>
Fix 5 critical production issues identified in code review: re-enable prompt cache, add message history LIMIT, parallelize listing notifier, add OpenRouter timeout, and write business rule tests.

Purpose: Address performance bottlenecks (cache disabled, unbounded queries, N+1 loops), prevent hanging requests, and ensure critical business logic is tested.
Output: 6 files modified with immediate production impact on performance and reliability.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/CLAUDE.md
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/services/prompt-loader.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/lib/db/queries.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/listing-notifier/index.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/services/ai-chat.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/rules/reviewer-assignment.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/supabase/functions/sophia-bot/rules/region-validator.ts
@/home/qualia/Desktop/Projects/aiagents/sofiatesting/tests/unit/edge-functions/prompt-loader.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix 4 critical performance issues</name>
  <files>
    supabase/functions/sophia-bot/services/prompt-loader.ts
    lib/db/queries.ts
    supabase/functions/listing-notifier/index.ts
    supabase/functions/sophia-bot/services/ai-chat.ts
  </files>
  <action>
**Fix 1 - Re-enable prompt cache (line 27):**
Change `const CACHE_TTL_MS = 0;` to `const CACHE_TTL_MS = 5 * 60 * 1000;`
Update comment to: `// 5 minutes`

**Fix 2 - Add message history LIMIT (lib/db/queries.ts line 282):**
Add `.limit(200)` after `.orderBy(asc(message.createdAt))`
This prevents unbounded queries when agents have 1000+ messages in 30 days.

**Fix 3 - Parallelize listing notifier (listing-notifier/index.ts lines 116-149):**
Replace sequential `for...of` loop with batched parallel processing:
```typescript
// Process in batches of 5 to avoid overwhelming Zyprus API
const BATCH_SIZE = 5;
const batches = [];
for (let i = 0; i < pendingListings.length; i += BATCH_SIZE) {
  batches.push(pendingListings.slice(i, i + BATCH_SIZE));
}

for (const batch of batches) {
  const batchResults = await Promise.allSettled(
    batch.map(async (listing) => {
      results.checked++;
      try {
        const published = await isListingPublished(listing.zyprus_listing_id, token);
        // ... rest of existing logic (WhatsApp send, markListingPublished, expiry check)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Error checking ${listing.zyprus_listing_id}: ${msg}`);
      }
    })
  );
}
```
Preserve all existing error handling, WhatsApp notifications, and DB writes.

**Fix 4 - Add OpenRouter timeout (ai-chat.ts line 251):**
Before the while loop in `callOpenRouter()`, add:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds
```
Add `signal: controller.signal` to fetch options.
After the while loop (before final return), add: `clearTimeout(timeoutId);`
Wrap the entire while loop in try/catch to handle AbortError:
```typescript
try {
  while (retries <= maxRetries) { ... }
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    return { message: null, error: "OpenRouter request timeout (30s)" };
  }
  throw error;
}
```
  </action>
  <verify>
grep "CACHE_TTL_MS = 5 \* 60 \* 1000" supabase/functions/sophia-bot/services/prompt-loader.ts
grep "\.limit(200)" lib/db/queries.ts
grep "Promise\.allSettled" supabase/functions/listing-notifier/index.ts
grep "AbortController" supabase/functions/sophia-bot/services/ai-chat.ts
  </verify>
  <done>
- prompt-loader.ts cache TTL set to 5 minutes
- queries.ts message history capped at 200 messages
- listing-notifier.ts processes 5 listings concurrently in batches
- ai-chat.ts has 30-second timeout on OpenRouter calls
  </done>
</task>

<task type="auto">
  <name>Task 2: Write business rule tests</name>
  <files>
    tests/unit/edge-functions/reviewer-assignment.test.ts
    tests/unit/edge-functions/region-validator.test.ts
  </files>
  <action>
Create comprehensive test suites following the pattern from `prompt-loader.test.ts`.

**reviewer-assignment.test.ts** — Test `assignReviewers()` function:

Import setup:
```typescript
import { describe, it, expect } from "vitest";
import { assignReviewers, RejectionError } from "../../../supabase/functions/sophia-bot/rules/reviewer-assignment.ts";
import { Agent } from "../../../supabase/functions/sophia-bot/agents/identifier.ts";
```

Mock agent factory:
```typescript
function createMockAgent(overrides: Partial<Agent>): Agent {
  return {
    id: "test-id",
    fullName: "Test Agent",
    mobile: "+35799123456",
    communicationEmail: "test@example.com",
    listingOwnerEmail: "test-owner@example.com",
    region: "paphos",
    role: "agent",
    canUpload: true,
    ...overrides,
  };
}
```

Test cases:
1. **FOR SALE - Paphos/Limassol/Larnaca/Nicosia** — verify reviewer1=listings@zyprus.com, reviewer2=request{region}@zyprus.com
2. **FOR SALE - Famagusta** — verify reviewer1=requestfamagusta@zyprus.com, reviewer2=null
3. **FOR RENT - All regions** — verify reviewer1=agent's listingOwnerEmail, reviewer2=null
4. **Michelle rentals** (agent with email demetra@zyprus.com) — verify special routing
5. **Management role rentals** — verify throws RejectionError
6. **Unknown region** — verify fallback behavior

**region-validator.test.ts** — Test `determineRegion()` and `validateRegionalAccess()`:

Import setup:
```typescript
import { describe, it, expect } from "vitest";
import { determineRegion, validateRegionalAccess } from "../../../supabase/functions/sophia-bot/rules/region-validator.ts";
import { Agent } from "../../../supabase/functions/sophia-bot/agents/identifier.ts";
```

Test cases for `determineRegion()`:
1. **Standard names** — "Paphos" → "paphos", "Limassol" → "limassol"
2. **Greek variants** — "Pafos" → "paphos", "Lemesos" → "limassol", "Larnaka" → "larnaca", "Lefkosia" → "nicosia", "Ammochostos" → "famagusta"
3. **Case insensitivity** — "PAPHOS", "paphos", "Paphos" all → "paphos"
4. **Partial matches** — "Paphos City Centre" → "paphos"
5. **Unknown location** — "Unknown Place" → null

Test cases for `validateRegionalAccess()`:
1. **Agent region matches property region** — allowed=true
2. **Agent region='all'** — allowed=true for any property region
3. **Agent region mismatch** — allowed=false, message explains restriction
4. **Unknown property location** — allowed=true (trusts agent's region)

Use same mockAgent factory pattern.
  </action>
  <verify>npm test -- reviewer-assignment.test.ts region-validator.test.ts</verify>
  <done>
- reviewer-assignment.test.ts covers all 6 business rules with 15+ test cases
- region-validator.test.ts covers region detection and access control with 10+ test cases
- All tests pass with vitest
  </done>
</task>

<task type="auto">
  <name>Task 3: Deploy fixes to production</name>
  <files>
    supabase/functions/sophia-bot/services/prompt-loader.ts
    supabase/functions/sophia-bot/services/ai-chat.ts
    supabase/functions/listing-notifier/index.ts
  </files>
  <action>
Deploy updated Edge Functions to production:

```bash
# Deploy sophia-bot (prompt cache + OpenRouter timeout)
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx

# Deploy listing-notifier (parallel processing)
supabase functions deploy listing-notifier --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

Note: lib/db/queries.ts changes affect Next.js web app only (not Edge Functions). No Vercel deploy needed unless requested — this is a backend query optimization that will be picked up on next deployment.

Commit all changes:
```bash
git add supabase/functions/sophia-bot/services/prompt-loader.ts \
  lib/db/queries.ts \
  supabase/functions/listing-notifier/index.ts \
  supabase/functions/sophia-bot/services/ai-chat.ts \
  tests/unit/edge-functions/reviewer-assignment.test.ts \
  tests/unit/edge-functions/region-validator.test.ts

git commit -m "fix(quick-3): fix 5 critical issues - cache, limits, parallelization, timeout, tests

- Re-enable prompt cache (5min TTL) - every WhatsApp message was hitting DB
- Add LIMIT 200 to message history query - prevent unbounded queries
- Parallelize listing notifier (batch of 5) - fix N+1 query pattern
- Add 30s timeout to OpenRouter calls - prevent hanging requests
- Add tests for reviewer assignment + region validation business rules

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
  </action>
  <verify>
supabase functions list --project-ref vceeheaxcrhmpqueudqx | grep -E "sophia-bot|listing-notifier"
git log -1 --oneline
  </verify>
  <done>
- sophia-bot Edge Function deployed with prompt cache and timeout fixes
- listing-notifier Edge Function deployed with parallel processing
- All changes committed to git
- Production is running optimized code
  </done>
</task>

</tasks>

<verification>
1. **Prompt cache enabled** — `grep "CACHE_TTL_MS = 5" supabase/functions/sophia-bot/services/prompt-loader.ts` shows 5-minute TTL
2. **Message limit added** — `grep "\.limit(200)" lib/db/queries.ts` shows cap in place
3. **Parallel processing** — `grep "Promise\.allSettled" supabase/functions/listing-notifier/index.ts` shows batching
4. **Timeout protection** — `grep "AbortController" supabase/functions/sophia-bot/services/ai-chat.ts` shows timeout
5. **Tests written and passing** — `npm test -- reviewer-assignment region-validator` runs green
6. **Edge Functions deployed** — `supabase functions list` shows latest deployment timestamps
</verification>

<success_criteria>
- All 4 performance fixes implemented and deployed to production
- 2 comprehensive test suites written covering 25+ test cases
- All tests passing in CI
- Edge Functions redeployed with fixes live
- Git commit with all changes
- No regressions in existing functionality
</success_criteria>

<output>
After completion, create `.planning/quick/3-fix-top-5-critical-issues-re-enable-prom/3-SUMMARY.md`
</output>
