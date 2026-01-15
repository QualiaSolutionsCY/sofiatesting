# WhatsApp Upload Remediation Plan

**Created:** 2026-01-15
**Status:** Ready for Implementation
**Priority:** Critical
**Estimated Effort:** 3-4 days focused work

---

## Overview

Comprehensive remediation plan addressing 30+ issues identified in the 5-agent review of the SOFIA WhatsApp upload functionality. This plan prioritizes security fixes, establishes testing foundations, and reduces technical debt from the dual-architecture approach.

## Problem Statement

The WhatsApp upload functionality has accumulated significant technical debt:
- **Security:** SSRF vulnerabilities allow access to internal networks
- **Architecture:** 2096-line god object and duplicated Zyprus client
- **Performance:** Sequential DB calls add 40-200ms latency per message
- **Testing:** 0% coverage on core message handler (320 lines)

## Risk Summary

| Area | Critical | High | Medium | Total |
|------|----------|------|--------|-------|
| Security | 0 | 2 | 5 | 7 |
| Architecture | 2 | 3 | 3 | 8 |
| Performance | 3 | 3 | 4 | 10 |
| Testing | 3 | 3 | 2 | 8 |
| **Total** | **8** | **11** | **14** | **33** |

---

## Implementation Phases

### Phase 1: Critical Security Fixes (Day 1 Morning)

#### 1.1 Fix SSRF in send-email.ts

**File:** `lib/ai/tools/send-email.ts:104-121`

**Current (Vulnerable):**
```typescript
if (documentUrl) {
  const docResponse = await fetch(documentUrl);  // No validation
}
```

**Target Implementation:**
```typescript
// lib/ai/security/url-validator.ts
const ALLOWED_DOMAINS = [
  'vceeheaxcrhmpqueudqx.supabase.co',  // Supabase storage
  'storage.googleapis.com',             // GCP if used
];

const BLOCKED_IP_RANGES = [
  /^10\./,                    // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // Private Class B
  /^192\.168\./,              // Private Class C
  /^127\./,                   // Loopback
  /^169\.254\./,              // Link-local (AWS metadata)
  /^0\./,                     // Invalid
];

export function validateExternalUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Only HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs allowed' };
    }

    // Check against allowed domains
    const isAllowed = ALLOWED_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    if (!isAllowed) {
      return { valid: false, error: 'Domain not in allowlist' };
    }

    // Block IP addresses entirely
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      return { valid: false, error: 'IP addresses not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}
```

**Tasks:**
- [ ] Create `lib/ai/security/url-validator.ts`
- [ ] Add unit tests for URL validator (all blocked patterns)
- [ ] Update `send-email.ts` to use validator before fetch
- [ ] Update `lib/zyprus/client.ts:379-443` image fetch to use validator

#### 1.2 Strengthen Webhook Verification

**File:** `app/api/whatsapp/webhook/route.ts:179-182`

**Current (Weak):**
```typescript
const isDirectSecretMatch = signature === webhookSecret;
const isHmacValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
if (!isDirectSecretMatch && !isHmacValid) { // Accepts either
```

**Target:**
```typescript
// Remove direct secret match - HMAC only
const isHmacValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
if (!isHmacValid) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Tasks:**
- [ ] Remove `isDirectSecretMatch` fallback
- [ ] Add timestamp validation to prevent replay attacks
- [ ] Update tests for webhook verification

#### 1.3 Add Rate Limiting to Webhook

**File:** `app/api/whatsapp/webhook/route.ts`

**Implementation:**
```typescript
// lib/whatsapp/rate-limiter.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const webhookRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"), // 30 requests per minute per phone
  prefix: "whatsapp:ratelimit",
});

export async function checkWebhookRateLimit(phoneNumber: string): Promise<boolean> {
  const { success } = await webhookRateLimiter.limit(phoneNumber);
  return success;
}
```

**Tasks:**
- [ ] Create `lib/whatsapp/rate-limiter.ts`
- [ ] Add rate limit check at start of webhook handler
- [ ] Return 429 Too Many Requests when exceeded
- [ ] Add metrics logging for rate limit hits

---

### Phase 2: Testing Foundation (Day 1 Afternoon - Day 2 Morning)

#### 2.1 Create Message Handler Tests

**File to test:** `lib/whatsapp/message-handler.ts` (320 lines, 0% coverage)

**Test file:** `tests/unit/whatsapp-message-handler.test.ts`

```typescript
// tests/unit/whatsapp-message-handler.test.ts
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { handleWhatsAppMessage } from "@/lib/whatsapp/message-handler";

describe("handleWhatsAppMessage", () => {
  describe("message filtering", () => {
    it("should skip non-text messages", async () => {
      const result = await handleWhatsAppMessage({
        type: "image",
        from: "+1234567890",
        // ...
      });
      assert.strictEqual(result, undefined);
    });

    it("should skip group messages", async () => {
      const result = await handleWhatsAppMessage({
        type: "text",
        isGroup: true,
        // ...
      });
      assert.strictEqual(result, undefined);
    });
  });

  describe("user context", () => {
    it("should create guest user for unknown phone", async () => {
      // Mock getOrCreateWhatsAppUser
      // Assert guest type returned
    });

    it("should identify registered agent", async () => {
      // Mock agent lookup
      // Assert agent permissions
    });
  });

  describe("AI processing", () => {
    it("should retry on transient failure", async () => {
      // Mock streamText to fail twice then succeed
      // Assert 3 total calls
    });

    it("should return quota error message", async () => {
      // Mock quota exceeded error
      // Assert user-friendly message sent
    });
  });
});
```

**Tasks:**
- [ ] Create test file with mock infrastructure
- [ ] Test message filtering (non-text, groups)
- [ ] Test user context creation (guest, agent)
- [ ] Test AI retry logic (success after retry, max retries)
- [ ] Test error messages (quota, initialization, empty response)
- [ ] Target: 80% coverage on message-handler.ts

#### 2.2 Create User Mapping Tests

**File to test:** `lib/whatsapp/user-mapping.ts` (197 lines, 0% coverage)

**Test file:** `tests/unit/whatsapp-user-mapping.test.ts`

**Tasks:**
- [ ] Test phone normalization
- [ ] Test agent lookup (found, not found)
- [ ] Test user creation (new guest, existing guest)
- [ ] Test chat session reuse (within 24h, after 24h)
- [ ] Target: 90% coverage on user-mapping.ts

#### 2.3 Create WaSender Client Tests

**File to test:** `lib/whatsapp/client.ts` (520 lines, manual tests only)

**Test file:** `tests/unit/whatsapp-client.test.ts`

**Tasks:**
- [ ] Mock wasenderapi SDK
- [ ] Test uploadFile with retry logic
- [ ] Test sendDocument flow
- [ ] Test sendLongMessage splitting
- [ ] Test formatPhoneNumber edge cases
- [ ] Test error handling for API failures
- [ ] Target: 70% coverage on client.ts

#### 2.4 Create Upload Listing Tests

**Files to test:** `lib/ai/tools/upload-listing.ts`, `lib/ai/tools/upload-land-listing.ts`

**Tasks:**
- [ ] Mock auth, getUserContext, DB queries
- [ ] Test authentication required
- [ ] Test listing not found
- [ ] Test permission denied (wrong user)
- [ ] Test successful upload flow
- [ ] Test Zyprus API error handling
- [ ] Target: 80% coverage on both files

---

### Phase 3: Performance Fixes (Day 2 Afternoon)

#### 3.1 Parallelize Database Calls

**File:** `lib/whatsapp/message-handler.ts:67-119`

**Current (Sequential):**
```typescript
const dbUser = await getOrCreateWhatsAppUser(phoneNumber);
const dbChat = await getOrCreateWhatsAppChat(dbUser.id, phoneNumber);
await updateAgentLastActive(dbUser.agentId);
await db.insert(agentExecutionLog).values({...});
```

**Target (Parallel where possible):**
```typescript
// First, get user (required for subsequent calls)
const dbUser = await getOrCreateWhatsAppUser(phoneNumber);

// These can run in parallel
const [dbChat, _agentUpdate, _logInsert] = await Promise.all([
  getOrCreateWhatsAppChat(dbUser.id, phoneNumber),
  dbUser.agentId ? updateAgentLastActive(dbUser.agentId) : Promise.resolve(),
  db.insert(agentExecutionLog).values({
    agentId: dbUser.agentId,
    phoneNumber,
    // ...
  }),
]);
```

**Tasks:**
- [ ] Refactor to parallelize independent DB calls
- [ ] Add timing logs to measure improvement
- [ ] Expected: 20-40ms reduction per message

#### 3.2 Add Message History Pagination

**File:** `lib/db/queries.ts:289-316`

**Current (No limit):**
```typescript
return await db.select().from(message)
  .where(and(eq(message.chatId, id), gte(message.createdAt, cutoffDate)))
  .orderBy(asc(message.createdAt));
```

**Target:**
```typescript
const MAX_HISTORY_MESSAGES = 50;

return await db.select().from(message)
  .where(and(eq(message.chatId, id), gte(message.createdAt, cutoffDate)))
  .orderBy(desc(message.createdAt))  // Most recent first
  .limit(MAX_HISTORY_MESSAGES)
  .then(messages => messages.reverse());  // Chronological order
```

**Tasks:**
- [ ] Add LIMIT clause to message history query
- [ ] Test with active chat having 100+ messages
- [ ] Expected: Prevent memory bloat, faster queries

#### 3.3 Optimize User Mapping Queries

**File:** `lib/whatsapp/user-mapping.ts:11-116`

**Current (2-3 sequential queries):**
```typescript
const [agent] = await db.select().from(zyprusAgent).where(...);
if (agent?.userId) {
  const [linkedUser] = await db.select().from(user).where(...);
}
// Later...
const [existingUser] = await db.select().from(user).where(...);
```

**Target (Single JOIN query):**
```typescript
// Fetch user with agent info in one query
const result = await db
  .select({
    user: user,
    agent: zyprusAgent,
  })
  .from(user)
  .leftJoin(zyprusAgent, eq(zyprusAgent.userId, user.id))
  .where(
    or(
      eq(user.email, `whatsapp_${normalizedPhone}@sofia.guest.local`),
      eq(zyprusAgent.whatsappPhoneNumber, normalizedPhone)
    )
  )
  .limit(1);
```

**Tasks:**
- [ ] Refactor to use JOIN query
- [ ] Test both agent and guest flows
- [ ] Expected: 15-30ms reduction per message

---

### Phase 4: Code Quality Fixes (Day 3 Morning)

#### 4.1 Extract Shared Auth Utility

**Files:** `lib/ai/tools/upload-listing.ts:32-41`, `lib/ai/tools/upload-land-listing.ts:31-40`

**Create:** `lib/ai/tools/utils/auth.ts`

```typescript
// lib/ai/tools/utils/auth.ts
import { auth } from "@/app/(auth)/auth";
import { getUserContext } from "@/lib/ai/user-context";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await auth();
  const context = getUserContext();
  return session?.user?.id ?? context?.user.id ?? null;
}

export function requireAuthError() {
  return {
    success: false,
    error: "Authentication required to upload listing",
  } as const;
}
```

**Tasks:**
- [ ] Create shared auth utility
- [ ] Update upload-listing.ts to use utility
- [ ] Update upload-land-listing.ts to use utility
- [ ] Add tests for auth utility

#### 4.2 Replace Magic Numbers with Constants

**Files:** Multiple

**Create:** `lib/whatsapp/constants.ts`

```typescript
// lib/whatsapp/constants.ts
export const WHATSAPP_CONFIG = {
  /** Number of days to retain message history */
  HISTORY_RETENTION_DAYS: 30,

  /** Maximum AI generation retries */
  MAX_AI_RETRIES: 2,

  /** Backoff multiplier for retries (ms) */
  RETRY_BACKOFF_MS: 1000,

  /** Maximum message length before splitting */
  MESSAGE_MAX_LENGTH: 4000,

  /** Delay between split message chunks (ms) */
  MESSAGE_SPLIT_DELAY_MS: 500,

  /** Chat session reuse window (ms) */
  SESSION_REUSE_WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;
```

**Tasks:**
- [ ] Create constants file
- [ ] Update message-handler.ts to use constants
- [ ] Update client.ts to use constants
- [ ] Update user-mapping.ts to use constants

#### 4.3 Standardize Error Response Types

**Create:** `lib/types/result.ts`

```typescript
// lib/types/result.ts
export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

export type UploadResult = Result<{ url: string }>;
export type MessageResult = Result<{ messageId: string }>;
export type ToolResult<T> = Result<T>;

// Helper functions
export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E = string>(error: E): Result<never, E> {
  return { success: false, error };
}
```

**Tasks:**
- [ ] Create result type definitions
- [ ] Update client.ts to use Result types
- [ ] Update tool files to use Result types
- [ ] Add type tests

#### 4.4 Improve Logging with Structured Logger

**Update files to use:** `lib/logger.ts`

```typescript
// Replace console.error with structured logging
logger.error("WhatsApp message handling failed", {
  phoneNumber,
  messageId: messageData.id,
  userId: userContext?.id,
  chatId: sessionChatId,
  errorMessage: error instanceof Error ? error.message : String(error),
  errorStack: error instanceof Error ? error.stack : undefined,
});
```

**Tasks:**
- [ ] Update message-handler.ts error logging
- [ ] Update client.ts error logging
- [ ] Add request correlation IDs
- [ ] Implement PII scrubbing (mask phone numbers in production)

---

### Phase 5: Architecture Documentation (Day 3 Afternoon)

#### 5.1 Document Dual Architecture

**Create:** `docs/architecture/whatsapp-dual-system.md`

```markdown
# WhatsApp Dual Architecture

## Overview
SOFIA has two parallel WhatsApp implementations:
1. **Local (`lib/whatsapp/`)**: Reference code for Next.js integration
2. **Edge (`sophia-bot/`)**: LIVE production on Supabase Edge Functions

## When to Modify Each

| Change Type | Modify Local | Modify Edge | Notes |
|-------------|--------------|-------------|-------|
| AI Tools | Yes | Yes | Sync both |
| Zyprus API | Yes | Yes | Sync both |
| WaSender client | Yes | N/A | Edge has inline |
| DOCX templates | N/A | Yes | Edge only |
| Security | Yes | Yes | Sync both |

## Sync Process

1. Make changes to local `lib/` code
2. Test locally with `pnpm test:unit`
3. Port changes to Edge Function
4. Deploy: `cd supabase && supabase functions deploy sophia-bot --no-verify-jwt`
5. Verify in production

## Key Differences

- Local uses Vercel AI SDK, Edge uses direct OpenRouter fetch
- Local has circuit breakers, Edge does not
- Local has 66+ unit tests, Edge has 0
```

**Tasks:**
- [ ] Create architecture documentation
- [ ] Add sync checklist
- [ ] Document key differences
- [ ] Add to CLAUDE.md references

#### 5.2 Create Modularization Plan for Edge Function

**Document:** `docs/architecture/sophia-bot-modularization.md`

The 2096-line `sophia-bot/index.ts` should be split:

```
sophia-bot/
├── index.ts              # <300 lines - HTTP handler only
├── handlers/
│   └── webhook.ts        # Webhook validation & routing
├── services/
│   ├── email-detector.ts # Email detection & sending
│   ├── docx-handler.ts   # DOCX generation & upload
│   ├── message-parser.ts # Message extraction & validation
│   └── ai-processor.ts   # OpenRouter integration
├── utils/
│   ├── logger.ts         # Structured logging (exists)
│   ├── validation.ts     # Input validation (exists)
│   └── rate-limiter.ts   # Rate limiting (exists)
└── zyprus/
    ├── client.ts         # API client (exists)
    └── taxonomy-cache.ts # Taxonomy caching (exists)
```

**Tasks:**
- [ ] Document target structure
- [ ] Identify extraction priorities
- [ ] Estimate effort per extraction
- [ ] Create tracking issue

---

### Phase 6: Deploy & Verify (Day 3 Evening - Day 4)

#### 6.1 Local Testing

**Commands:**
```bash
# Run all unit tests
pnpm test:unit

# Run specific test files
pnpm exec tsx --test tests/unit/whatsapp-message-handler.test.ts
pnpm exec tsx --test tests/unit/whatsapp-user-mapping.test.ts
pnpm exec tsx --test tests/unit/whatsapp-client.test.ts
pnpm exec tsx --test tests/unit/url-validator.test.ts

# Check types
pnpm typecheck

# Lint
pnpm lint
```

**Tasks:**
- [ ] All unit tests pass
- [ ] Type check passes
- [ ] Lint passes
- [ ] No console errors

#### 6.2 Deploy Edge Function

**Commands:**
```bash
# Get current Edge Function code
mcp__plugin_supabase_supabase__get_edge_function(
  project_id="vceeheaxcrhmpqueudqx",
  function_slug="sophia-bot"
)

# After local changes, deploy
cd /tmp/sophia-deploy && supabase functions deploy sophia-bot --no-verify-jwt

# Check logs
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx
```

**Tasks:**
- [ ] Deploy security fixes to Edge Function
- [ ] Deploy rate limiting
- [ ] Monitor logs for errors
- [ ] Test with real WhatsApp message

#### 6.3 Production Verification

**Manual Tests:**
1. Send text message via WhatsApp → Should receive AI response
2. Send image message → Should be ignored (no error)
3. Send rapid messages (>30/min) → Should hit rate limit
4. Request document email → Should work (SSRF blocked for bad URLs)

**Tasks:**
- [ ] Verify message flow works
- [ ] Verify rate limiting active
- [ ] Verify SSRF protection (try metadata URL)
- [ ] Monitor for 24h stability

---

## Acceptance Criteria

### Security
- [ ] SSRF vulnerability patched (URL allowlist active)
- [ ] Webhook uses HMAC-only verification
- [ ] Rate limiting enforced (30 req/min/phone)
- [ ] PII scrubbed from production logs

### Testing
- [ ] message-handler.ts: 80% coverage
- [ ] user-mapping.ts: 90% coverage
- [ ] client.ts: 70% coverage
- [ ] upload-listing.ts: 80% coverage
- [ ] Total new tests: 50+

### Performance
- [ ] DB calls parallelized (20-40ms improvement)
- [ ] Message history paginated (50 max)
- [ ] User lookup optimized (JOIN query)

### Code Quality
- [ ] No `any` types in modified files
- [ ] Constants extracted
- [ ] Shared auth utility
- [ ] Structured logging

### Documentation
- [ ] Dual architecture documented
- [ ] Modularization plan created
- [ ] CLAUDE.md updated with changes

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Security vulnerabilities | 2 High + 5 Med | 0 High, 2 Med |
| Test coverage (core files) | 0% | 75%+ |
| Message latency | 2-5s | 1.5-4s |
| God object lines | 2096 | Documented plan |

---

## Rollback Plan

If issues arise post-deployment:

1. **Edge Function rollback:**
   ```bash
   # Redeploy previous version from git
   git checkout HEAD~1 -- supabase/functions/sophia-bot/
   supabase functions deploy sophia-bot --no-verify-jwt
   ```

2. **Rate limiting issues:**
   ```bash
   # Temporarily disable rate limiting
   supabase secrets set WHATSAPP_RATE_LIMIT_DISABLED=true --project-ref vceeheaxcrhmpqueudqx
   ```

3. **Full rollback:**
   - Revert all commits from this plan
   - Redeploy clean version

---

## References

### Internal Files
- `lib/whatsapp/message-handler.ts` - Core message processing
- `lib/whatsapp/client.ts` - WaSender API integration
- `lib/whatsapp/user-mapping.ts` - User authentication
- `lib/ai/tools/send-email.ts` - Email with attachments
- `lib/ai/tools/upload-listing.ts` - Property uploads
- `lib/zyprus/client.ts` - Zyprus API (local)
- `supabase/functions/sophia-bot/index.ts` - Live Edge Function

### Review Reports
- Security Audit: SSRF, webhook verification, rate limiting
- Architecture Review: God object, code duplication
- Performance Analysis: Sequential DB calls, memory allocation
- Test Coverage: Critical gaps in core modules

### External Documentation
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
