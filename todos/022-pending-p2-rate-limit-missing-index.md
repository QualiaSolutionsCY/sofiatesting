# P2 IMPORTANT: Rate Limiter Missing Database Index

---
status: pending
priority: p2
issue_id: "022"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

**What's broken:** The rate limiting query scans all messages for a user without proper index, causing O(n) query time as conversation history grows.

**Why it matters:**
- Query time increases linearly with history size
- Rate limiting becomes slow for active users
- Database load increases over time

## Findings

**Location:** `supabase/functions/sophia-bot/utils/rate-limiter.ts` (lines 26-33)

```typescript
const { count, error } = await supabase
  .from("chat_history")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("role", "user")
  .gte("created_at", windowStart);
```

**Missing Index:**
```sql
CREATE INDEX idx_chat_history_rate_limit
ON chat_history (user_id, role, created_at DESC);
```

## Proposed Solutions

### Option 1: Add Composite Index (Recommended)
**Pros:** O(1) query time, simple fix
**Cons:** Slightly slower inserts
**Effort:** Small (15 min)
**Risk:** Low

```sql
CREATE INDEX IF NOT EXISTS idx_chat_history_rate_limit
ON chat_history (user_id, role, created_at DESC);
```

### Option 2: Use Separate Rate Limit Table
**Pros:** Completely isolated from history
**Cons:** Additional table to maintain
**Effort:** Medium (1 hour)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** Database schema (Supabase migration)
**Table:** `chat_history`
**Query:** COUNT with filters on user_id, role, created_at

## Acceptance Criteria

- [ ] Migration created for index
- [ ] Index deployed to Supabase
- [ ] Query performance verified (EXPLAIN ANALYZE)
- [ ] No regression in insert performance

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | performance-oracle | Identified missing index | O(n) rate limit query |
