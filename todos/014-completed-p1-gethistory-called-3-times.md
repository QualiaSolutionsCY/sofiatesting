# P1 CRITICAL: getHistory() Called 3 Times Per Request

---
status: pending
priority: p1
issue_id: "014"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

**What's broken:** The `getHistory()` function is called 3 times per request, causing redundant database queries.

**Why it matters:**
- 3x unnecessary database load
- Estimated 100-300ms wasted per request
- Increased costs and connection pool usage

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts`

```typescript
// Line 1057 - First call
const history = await getHistory(userId);

// Line 1295 - Second call
const updatedHistoryForEmail = await getHistory(userId);

// Line 1351 - Third call
const updatedHistory = await getHistory(userId);
```

## Proposed Solutions

### Option 1: Cache History Locally (Recommended)
**Pros:** Simple, eliminates redundant queries
**Cons:** Cache may be stale if messages added mid-request
**Effort:** Small (20 min)
**Risk:** Low

```typescript
let cachedHistory = await getHistory(userId);

// Later, if needed fresh:
if (messagesAddedSinceLoad) {
  cachedHistory = await getHistory(userId);
}
```

### Option 2: Remove Updated Calls
**Pros:** Simplest fix
**Cons:** May miss new messages added during processing
**Effort:** Small (10 min)

The "updated" calls at lines 1295 and 1351 may not be necessary if the history doesn't change during the request.

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/index.ts`
**Function:** `getHistory()` in `database.ts`
**Query:** `SELECT role, parts FROM chat_history WHERE user_id = ? LIMIT 10`

## Acceptance Criteria

- [ ] getHistory called only once (or minimally)
- [ ] History cached for request duration
- [ ] No regression in email detection or response generation
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | performance-oracle | Identified issue | 3 redundant DB calls |
