---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, security, privacy, rag]
dependencies: []
completed_at: "2026-01-11"
---

# Phone Numbers Exposed in AI Prompts

## Problem Statement

The `formatContextForPrompt` function includes the full phone number in the context string sent to the AI model. This PII is:
- Sent to OpenRouter/Gemini APIs (third parties)
- Potentially stored in their logs
- Could be included in AI training data

**Impact**: Privacy violation, potential GDPR/compliance issues.

## Findings

**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
**Lines**: 391-392

```typescript
lines.push("### User Profile");
lines.push(`- **Name**: ${context.profile.name || "Unknown"}`);
lines.push(`- **Phone**: ${context.profile.phone_number}`);  // Full phone number!
```

**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts`
**Lines**: 1042-1043

```typescript
console.log(`[Memory] Built context for user: ${userContext.profile.name || phoneNumber}`);
```

Phone number also appears in logs.

**Severity**: P2 - HIGH (Privacy)

## Proposed Solutions

### Option 1: Remove phone from prompt context (Recommended)

**Pros**: Simple, no PII sent to AI
**Cons**: AI can't reference phone if needed (unlikely use case)
**Effort**: Small (15 min)
**Risk**: Low

```typescript
lines.push("### User Profile");
lines.push(`- **Name**: ${context.profile.name || "Unknown"}`);
// Remove phone number line entirely
lines.push(`- **User ID**: ${context.profile.id.slice(0, 8)}...`); // Anonymized ID
```

### Option 2: Mask phone number

**Pros**: Partial info visible for context
**Cons**: Still some PII exposure
**Effort**: Small (15 min)
**Risk**: Low

```typescript
const maskedPhone = phoneNumber.slice(0, 3) + "****" + phoneNumber.slice(-2);
lines.push(`- **Phone**: ${maskedPhone}`);  // "357****32"
```

### Option 3: Use internal user reference only

**Pros**: Maximum privacy
**Cons**: Requires updating prompt to explain
**Effort**: Small (15 min)
**Risk**: Low

## Recommended Action

Implement Option 1 - remove phone number entirely from AI context. The AI doesn't need it.

## Technical Details

**Affected Files**:
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/memory/sophia-memory.ts`
- `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts` (logging)

**Database Changes**: None

## Acceptance Criteria

- [ ] Phone number not included in AI prompt context
- [ ] Phone number not logged in console (or masked)
- [ ] User still identifiable by internal ID
- [ ] Personalization still works

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-11 | Created from security review | PII minimization in AI prompts |

## Resources

- Security audit: agent a097621
- [GDPR Data Minimization](https://gdpr-info.eu/art-5-gdpr/)
