# P2 IMPORTANT: Rate Limiter Fails Open on Error

---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

**What's broken:** Rate limiting returns `true` (allow) on any error, meaning database issues bypass rate limiting entirely.

**Why it matters:**
- Attackers causing DB errors can bypass rate limits
- DoS protection ineffective during outages
- Abuse can go unchecked during failures

## Findings

**Location:** `supabase/functions/sophia-bot/utils/rate-limiter.ts` (lines 35-52)

```typescript
if (error) {
  console.error("Rate limit check error:", error.message);
  return true; // Allow on error to prevent blocking legitimate users
}
// ...
catch (error) {
  console.error("Rate limit check exception:", error);
  return true; // Allow on error
}
```

## Proposed Solutions

### Option 1: Implement Fallback Rate Limiter (Recommended)
**Pros:** Rate limiting still works during outages
**Cons:** In-memory state not shared across instances
**Effort:** Small (1 hour)
**Risk:** Low

```typescript
const inMemoryRateLimiter = new Map<string, { count: number, resetAt: number }>();

if (error) {
  // Fall back to in-memory
  const key = `${userId}:${windowStart}`;
  const entry = inMemoryRateLimiter.get(key) || { count: 0, resetAt: windowStart + 60000 };
  if (entry.count >= MAX_MESSAGES_PER_MINUTE) {
    return false; // Block
  }
  entry.count++;
  inMemoryRateLimiter.set(key, entry);
  return true;
}
```

### Option 2: Fail Closed After Repeated Errors
**Pros:** Prevents sustained abuse
**Cons:** May block legitimate users
**Effort:** Small (30 min)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/utils/rate-limiter.ts`
**Current limit:** 10 messages/minute per user
**Database:** `chat_history` table

## Acceptance Criteria

- [ ] Fallback rate limiting implemented
- [ ] Rate limiting works during DB outages
- [ ] Tested with simulated DB errors
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | security-sentinel | Identified fail-open design | Rate limiting bypassable |
