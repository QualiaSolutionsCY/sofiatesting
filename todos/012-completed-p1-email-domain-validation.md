# P1 CRITICAL: Email Domain Validation Missing for AI-Triggered Sends

---
status: pending
priority: p1
issue_id: "012"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

**What's broken:** When the AI detects email-sending intent from its response, it extracts recipient emails using regex and sends without domain validation.

**Why it matters:**
- Prompt injection could cause AI to send emails to attacker-controlled addresses
- AI hallucination could cause emails to random addresses
- Could be used for spam/phishing by manipulating AI responses

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts` (lines 86-149, 154-235)

```typescript
// Pattern matching extracts ANY email - no validation
const sentPatterns = [
  /i have sent (?:the )?(.+?) to ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  ...
];

// sendEmailViaResend accepts any email and sends to it
```

**Contrast:** The `assignTo` parameter in tool executor correctly validates `@zyprus.com` domain (line 134-142).

## Proposed Solutions

### Option 1: Allowlist Domain Validation (Recommended)
**Pros:** Prevents unauthorized emails, simple implementation
**Cons:** Needs allowlist maintenance
**Effort:** Small (1 hour)
**Risk:** Low

```typescript
const ALLOWED_EMAIL_DOMAINS = ['zyprus.com'];
const emailDomain = intent.recipientEmail.split('@')[1].toLowerCase();
if (!ALLOWED_EMAIL_DOMAINS.some(d => emailDomain.endsWith(d))) {
  return { error: 'Cannot send emails to external addresses' };
}
```

### Option 2: User Confirmation Required
**Pros:** Maximum control
**Cons:** Extra friction in UX
**Effort:** Medium (2-3 hours)

Require user to confirm before AI-triggered emails to any address.

### Option 3: Rate Limit External Emails
**Pros:** Allows external with limits
**Cons:** Still allows some abuse
**Effort:** Medium

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/index.ts`
**Components:** Email sending via Resend
**Functions:** `detectEmailSendingIntent()`, `sendEmailViaResend()`

## Acceptance Criteria

- [ ] Email domain validation added before sending
- [ ] Non-zyprus emails blocked or require confirmation
- [ ] Unit tests for domain validation
- [ ] Edge function deployed with fix

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | security-sentinel | Identified issue | AI-triggered emails need validation |

## Resources

- Previous fix: `assignTo` validation in executor.ts
