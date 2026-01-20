# P2 IMPORTANT: SSRF Risk in Document URL Fetching

---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

**What's broken:** Document URLs extracted from AI responses are fetched without validation, allowing Server-Side Request Forgery (SSRF).

**Why it matters:**
- AI could be manipulated to include internal URLs
- Could access cloud metadata endpoints (169.254.169.254)
- Information disclosure via SSRF
- Could access internal Supabase services

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts` (lines 170-190)

```typescript
if (intent.documentUrl) {
  const docResponse = await fetch(intent.documentUrl);
  // No URL validation before fetch
}
```

Also in `lib/ai/tools/send-email.ts` (lines 104-121).

## Proposed Solutions

### Option 1: Domain Allowlist (Recommended)
**Pros:** Simple, effective
**Cons:** Needs allowlist maintenance
**Effort:** Small (30 min)
**Risk:** Low

```typescript
const ALLOWED_DOC_DOMAINS = ['supabase.co', 'zyprus.com'];
const docUrl = new URL(intent.documentUrl);
if (!ALLOWED_DOC_DOMAINS.some(d => docUrl.hostname.endsWith(d))) {
  throw new Error('Document URL from untrusted source');
}
```

### Option 2: Block Private IP Ranges
**Pros:** Broader protection
**Cons:** More complex implementation
**Effort:** Medium (1 hour)

Block: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:**
- `supabase/functions/sophia-bot/index.ts`
- `lib/ai/tools/send-email.ts`

## Acceptance Criteria

- [ ] Document URL validation implemented
- [ ] Private IPs blocked
- [ ] Only allowed domains accepted
- [ ] Unit tests for URL validation
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | security-sentinel | Identified SSRF risk | Unvalidated fetch() |
