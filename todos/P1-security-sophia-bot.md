# P1 Security: sophia-bot Edge Function

**Priority**: P1 (Critical)
**Source**: security-sentinel review
**Created**: 2026-01-11

## Findings

### 1. Webhook Signature Verification Commented Out
**File**: `/tmp/sophia-deploy/supabase/functions/sophia-bot/index.ts`
**Risk**: HIGH - Any actor can send malicious payloads to the webhook

The webhook signature verification is commented out with `// TODO: Re-enable after testing`:
```typescript
// const isValid = await verifyWebhookSignature(req, rawBody);
// if (!isValid) {
//   return new Response("Invalid signature", { status: 401 });
// }
```

**Fix**: Uncomment and enforce signature verification before production use.

### 2. Email Domain Validation Missing
**File**: `tools/executor.ts`
**Risk**: MEDIUM - Potential for assigning listings to non-zyprus emails

The `assignTo` parameter in `createPropertyListing` should validate that emails end with `@zyprus.com`:
```typescript
// Current: No validation
assignTo: args.assignTo as string | undefined

// Needed: Validate domain
if (args.assignTo && !args.assignTo.endsWith('@zyprus.com')) {
  return { error: 'Assignment must be to a @zyprus.com email' };
}
```

### 3. Hardcoded Agent Emails in Rules
**Files**: `rules/reviewer-assignment.ts`, `rules/special-cases.ts`
**Risk**: LOW - Maintenance burden, potential for stale data

Agent emails are hardcoded in multiple places. Consider using the agents database table for all lookups.

## Action Items

- [x] Uncomment webhook signature verification in index.ts ✅ FIXED
- [x] Add email domain validation for `assignTo` parameter ✅ FIXED
- [ ] Consider centralizing email references to agents table (P3 - future)

## Status: RESOLVED (2026-01-11)

## Testing

After fixes:
1. Send request with invalid signature → should return 401
2. Try assigning to non-zyprus email → should return error
3. Normal flow should work unchanged
