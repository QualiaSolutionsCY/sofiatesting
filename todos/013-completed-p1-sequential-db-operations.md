# P1 CRITICAL: Sequential Database Operations in Request Path

---
status: pending
priority: p1
issue_id: "013"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

**What's broken:** The main request handler runs 5+ independent database operations sequentially, adding 400-800ms to every request.

**Why it matters:**
- User-facing latency significantly increased
- At scale: DB connection pool exhaustion risk
- Edge Functions have timeout limits

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts` (lines 1031-1094)

```typescript
// Line 1031 - SEQUENTIAL
await addMessage(userId, "user", userMessage);

// Line 1037-1054 - SEQUENTIAL
userContext = await buildUserContext(phoneNumber, userMessage);

// Lines 1057 - SEQUENTIAL
const history = await getHistory(userId);

// Lines 1083-1094 - SEQUENTIAL
const agentInfo = await getAgentByPhone(phoneNumber);
identifiedAgent = await identifyAgentByPhone(phoneNumber, supabaseUrl, supabaseKey);
```

**Impact:** Estimated 400-800ms added per request. These operations are independent.

## Proposed Solutions

### Option 1: Parallelize with Promise.all (Recommended)
**Pros:** Simple fix, major latency reduction
**Cons:** None significant
**Effort:** Small (30 min)
**Risk:** Low

```typescript
const [_, userContext, history, agentInfo, identifiedAgent] = await Promise.all([
  addMessage(userId, "user", userMessage),
  buildUserContext(phoneNumber, userMessage),
  getHistory(userId),
  getAgentByPhone(phoneNumber),
  identifyAgentByPhone(phoneNumber, supabaseUrl, supabaseKey),
]);
```

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/index.ts`
**Components:** Request handler, database operations
**Estimated improvement:** 50-70% latency reduction

## Acceptance Criteria

- [ ] Independent DB operations parallelized
- [ ] Request latency measured before/after
- [ ] No regression in functionality
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | performance-oracle | Identified issue | Sequential ops add 400-800ms |

## Resources

- MDN: Promise.all
