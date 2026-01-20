---
status: completed
priority: p1
issue_id: "005"
tags: [code-review, security, rag]
dependencies: []
completed_at: "2026-01-11"
---

# API Key Exposed in URL Query Parameter

## Problem Statement

The Google Embedding API key is passed as a URL query parameter instead of via Authorization header. This exposes the key in:
- Server access logs
- Proxy/CDN logs
- Error reporting systems
- Network monitoring tools

**Impact**: API key leakage can lead to unauthorized usage, quota exhaustion, and billing issues.

## Findings

**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
**Lines**: 77-78

```typescript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`,
```

**Severity**: P1 - CRITICAL
**Exploitability**: HIGH - URL parameters are routinely logged

## Proposed Solutions

### Option 1: Move to Authorization Header (Recommended)

**Pros**: Standard OAuth pattern, no URL logging exposure
**Cons**: Requires Google API to support header auth (verify first)
**Effort**: Small (30 min)
**Risk**: Low

```typescript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GOOGLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({...}),
  }
);
```

### Option 2: Keep URL param but add log redaction

**Pros**: No API changes needed
**Cons**: Still vulnerable to external log systems
**Effort**: Medium (1-2 hours)
**Risk**: Medium - doesn't fully solve the problem

## Recommended Action

Implement Option 1 - verify Google's text-embedding API supports Bearer token auth.

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`

**Database Changes**: None

## Acceptance Criteria

- [ ] API key is not visible in any URL
- [ ] Embedding generation still works
- [ ] Error responses don't contain API key

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from security review | Google API key handling |

## Resources

- [Google AI Authentication Docs](https://cloud.google.com/docs/authentication)
- Security audit: agent a097621
