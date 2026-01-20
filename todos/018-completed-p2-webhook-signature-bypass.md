# P2 IMPORTANT: Webhook Signature Verification Has Bypass Paths

---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

**What's broken:** Webhook signature verification is implemented but has multiple bypass conditions when secret is not configured or header is missing.

**Why it matters:**
- If WASEND_WEBHOOK_SECRET not set, ANY request can trigger the webhook
- Attackers can send crafted payloads to trigger AI processing
- Could be used for DoS or prompt injection attacks

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts` (lines 1712-1743)

```typescript
if (WASEND_WEBHOOK_SECRET) {
  const signature = extractSignatureHeader(req.headers);
  if (signature) {
    // Verify signature
  } else {
    // NO SIGNATURE - CONTINUES PROCESSING
    logger.info("No webhook signature header received");
  }
} else {
  // SECRET NOT CONFIGURED - CONTINUES PROCESSING
  logger.warn("WASEND_WEBHOOK_SECRET not configured");
}
```

## Proposed Solutions

### Option 1: Make Signature Mandatory (Recommended)
**Pros:** Maximum security
**Cons:** Requires secret to be configured
**Effort:** Small (30 min)
**Risk:** Low

```typescript
if (!WASEND_WEBHOOK_SECRET) {
  return new Response("Configuration error", { status: 500 });
}
const signature = extractSignatureHeader(req.headers);
if (!signature) {
  return new Response("Missing signature", { status: 401 });
}
```

### Option 2: IP Allowlist as Alternative
**Pros:** Works if WaSend doesn't support signatures
**Cons:** IPs can change
**Effort:** Medium

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/index.ts`
**Secret:** `WASEND_WEBHOOK_SECRET`
**Auth file:** `utils/webhook-auth.ts`

## Acceptance Criteria

- [ ] Webhook rejects requests when secret not configured
- [ ] Webhook rejects requests without signature header
- [ ] Verified with WaSend documentation
- [ ] Deployed and tested

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | security-sentinel | Identified bypass paths | Signature check not enforced |
