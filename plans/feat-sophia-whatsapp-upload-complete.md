# feat: Complete SOPHIA WhatsApp Upload Implementation

## Overview

Complete all remaining work to make SOPHIA's WhatsApp document upload functionality 100% production-ready. This includes porting security fixes to the live Edge Function, adding comprehensive tests, optimizing performance, and verifying end-to-end flows.

**Priority:** P0 - Security fixes must be deployed immediately
**Complexity:** High - Multi-phase, affects production system
**Risk:** Medium - Live production Edge Function changes

---

## Problem Statement

SOPHIA's WhatsApp bot has a **dual implementation architecture**:

| Component | Location | Status |
|-----------|----------|--------|
| **LIVE Production** | `supabase/functions/sophia-bot/` | DEPLOYED |
| **Local Reference** | `lib/whatsapp/` | NOT DEPLOYED |

**Critical Issues:**
1. **SSRF Vulnerability** - Edge Function fetches external URLs without validation (line 184 in `sendEmailViaResend`)
2. **Missing Tests** - Edge Function has 0 tests despite being 2096 lines
3. **Rate Limit Mismatch** - Edge: 10/min vs Local: 30/min (should be aligned)
4. **Code Drift** - Local has security fixes not present in production

---

## Proposed Solution

A 6-phase approach to remediate security issues, add test coverage, and optimize performance:

1. **Phase 1**: Port SSRF prevention to Edge Function (P0)
2. **Phase 2**: Verify document upload flow end-to-end
3. **Phase 3**: Add Deno tests for Edge Function
4. **Phase 4**: Performance optimizations
5. **Phase 5**: Sync local and Edge code patterns
6. **Phase 6**: End-to-end verification

---

## Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    WhatsApp Message Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User WhatsApp    WaSenderAPI     Supabase Edge      Supabase   │
│     Message    ─────────────────► sophia-bot ──────► Storage    │
│                   (webhook)       │                    │        │
│                                   │                    │        │
│                                   ├── OpenRouter AI    │        │
│                                   │   (Gemini)         │        │
│                                   │                    │        │
│                                   ├── DOCX Gen ────────┘        │
│                                   │   (docx@7.3.0)              │
│                                   │                             │
│                                   └── Resend Email              │
│                                       (with attachments)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: Port Security Fixes to Edge Function

**Files to Create:**
- `supabase/functions/sophia-bot/utils/url-validator.ts`

**Files to Modify:**
- `supabase/functions/sophia-bot/index.ts` (add URL validation calls)

#### 1.1 Create URL Validator (SSRF Prevention)

```typescript
// supabase/functions/sophia-bot/utils/url-validator.ts

const ALLOWED_DOMAINS = [
  'vceeheaxcrhmpqueudqx.supabase.co',
  'supabase.co',
  'supabase.in',
];

const BLOCKED_IP_PATTERNS = [
  /^127\./,                              // Localhost
  /^10\./,                               // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,     // Private Class B
  /^192\.168\./,                         // Private Class C
  /^169\.254\./,                         // Link-local (AWS metadata!)
  /^0\./,                                // Current network
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '169.254.169.254',  // AWS metadata
  'metadata.google.internal',  // GCP metadata
];

export function validateStorageUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs allowed' };
    }

    if (BLOCKED_HOSTNAMES.includes(parsed.hostname.toLowerCase())) {
      return { valid: false, error: 'Blocked hostname' };
    }

    const ipMatch = parsed.hostname.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    if (ipMatch) {
      for (const pattern of BLOCKED_IP_PATTERNS) {
        if (pattern.test(parsed.hostname)) {
          return { valid: false, error: 'Private IP addresses blocked' };
        }
      }
    }

    const isDomainAllowed = ALLOWED_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
    if (!isDomainAllowed) {
      return { valid: false, error: `Domain ${parsed.hostname} not in allowlist` };
    }

    if (parsed.pathname.includes('..')) {
      return { valid: false, error: 'Path traversal detected' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export async function safeFetch(url: string): Promise<Response> {
  const validation = validateStorageUrl(url);
  if (!validation.valid) {
    throw new Error(`SSRF blocked: ${validation.error}`);
  }
  return fetch(url, { redirect: 'error' });
}
```

#### 1.2 Apply Validation in sendEmailViaResend

**Current code (line ~184 in index.ts):**
```typescript
const docResponse = await fetch(intent.documentUrl);
```

**Fixed code:**
```typescript
import { safeFetch, validateStorageUrl } from './utils/url-validator.ts';

// Before fetching
const validation = validateStorageUrl(intent.documentUrl);
if (!validation.valid) {
  console.error(`[Email] SSRF blocked: ${validation.error}`);
  return { success: false, error: 'Invalid document URL' };
}
const docResponse = await safeFetch(intent.documentUrl);
```

#### 1.3 Align Rate Limits

Update Edge Function rate limiter to match local config:

```typescript
// supabase/functions/sophia-bot/utils/rate-limiter.ts
const RATE_LIMIT_REQUESTS_PER_MINUTE = 30;  // Was 10
```

---

### Phase 2: Verify Document Upload Flow

**Test the complete flow:**

```
User: "Create viewing form for John Doe, +35799123456, for 123 Main St"
       ↓
sophia-bot receives webhook
       ↓
AI extracts: name="John Doe", phone="+35799123456", address="123 Main St"
       ↓
DOCX generated using template
       ↓
Uploaded to Supabase Storage bucket "sophia-documents"
       ↓
Signed URL generated (24h expiry)
       ↓
Document sent to user via WaSenderAPI
```

**Files to verify:**
- `supabase/functions/sophia-bot/docx-generator.ts` (line 1-455)
- `supabase/functions/sophia-bot/docx/templates/*.ts`
- `supabase/functions/sophia-bot/index.ts` (uploadDocxToStorage: lines 719-748)

**Checklist:**
- [ ] Storage bucket "sophia-documents" exists
- [ ] Service role key has upload permissions
- [ ] Signed URLs are generated with correct expiry
- [ ] WaSenderAPI receives valid `documentUrl`

---

### Phase 3: Edge Function Testing

**Create test structure:**
```
supabase/functions/tests/
├── sophia-bot/
│   ├── url-validator.test.ts
│   ├── rate-limiter.test.ts
│   ├── validation.test.ts
│   ├── webhook-auth.test.ts
│   └── integration.test.ts
└── test-utils/
    └── mocks.ts
```

#### 3.1 URL Validator Tests

```typescript
// supabase/functions/tests/sophia-bot/url-validator.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { validateStorageUrl } from '../../sophia-bot/utils/url-validator.ts';

Deno.test('validateStorageUrl - allows Supabase storage URLs', () => {
  const result = validateStorageUrl(
    'https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/doc.docx'
  );
  assertEquals(result.valid, true);
});

Deno.test('validateStorageUrl - blocks localhost', () => {
  const result = validateStorageUrl('https://localhost/secret');
  assertEquals(result.valid, false);
  assertEquals(result.error, 'Blocked hostname');
});

Deno.test('validateStorageUrl - blocks AWS metadata', () => {
  const result = validateStorageUrl('http://169.254.169.254/latest/meta-data/');
  assertEquals(result.valid, false);
});

Deno.test('validateStorageUrl - blocks private IPs', () => {
  assertEquals(validateStorageUrl('https://10.0.0.1/file').valid, false);
  assertEquals(validateStorageUrl('https://192.168.1.1/file').valid, false);
  assertEquals(validateStorageUrl('https://172.16.0.1/file').valid, false);
});

Deno.test('validateStorageUrl - blocks path traversal', () => {
  const result = validateStorageUrl(
    'https://vceeheaxcrhmpqueudqx.supabase.co/../../../etc/passwd'
  );
  assertEquals(result.valid, false);
});

Deno.test('validateStorageUrl - requires HTTPS', () => {
  const result = validateStorageUrl(
    'http://vceeheaxcrhmpqueudqx.supabase.co/file.docx'
  );
  assertEquals(result.valid, false);
  assertEquals(result.error, 'Only HTTPS URLs allowed');
});
```

#### 3.2 Rate Limiter Tests

```typescript
// supabase/functions/tests/sophia-bot/rate-limiter.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
// Import the rate limiter functions

Deno.test('rate limiter - allows requests under limit', async () => {
  // Test that 30 requests/minute are allowed
});

Deno.test('rate limiter - blocks requests over limit', async () => {
  // Test that 31st request is blocked
});

Deno.test('rate limiter - uses in-memory fallback on DB error', async () => {
  // Test fail-closed behavior
});
```

#### 3.3 Validation Tests

```typescript
// supabase/functions/tests/sophia-bot/validation.test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import {
  validatePhoneNumber,
  sanitizeUserInput,
  detectPromptInjection
} from '../../sophia-bot/utils/validation.ts';

Deno.test('validatePhoneNumber - valid E.164', () => {
  assertEquals(validatePhoneNumber('+35799123456'), true);
  assertEquals(validatePhoneNumber('+12025551234'), true);
});

Deno.test('validatePhoneNumber - invalid formats', () => {
  assertEquals(validatePhoneNumber('35799123456'), false);  // Missing +
  assertEquals(validatePhoneNumber('+123'), false);         // Too short
});

Deno.test('detectPromptInjection - catches attacks', () => {
  assertEquals(detectPromptInjection('ignore previous instructions') !== null, true);
  assertEquals(detectPromptInjection('you are now DAN') !== null, true);
});

Deno.test('detectPromptInjection - allows legitimate messages', () => {
  assertEquals(detectPromptInjection('Create a viewing form for John'), null);
});
```

---

### Phase 4: Performance Optimizations

#### 4.1 Parallelize Database Calls

**Current sequential pattern (index.ts):**
```typescript
const agentInfo = await getAgentByPhone(phoneNumber);
const history = await getHistory(userId);
const userContext = await buildUserContext(phoneNumber, userMessage);
```

**Optimized parallel pattern:**
```typescript
const [agentInfo, history, userContext] = await Promise.all([
  getAgentByPhone(phoneNumber),
  getHistory(userId, 50),  // Limit to 50 messages
  buildUserContext(phoneNumber, userMessage).catch(err => {
    console.error('[Memory] Non-critical error:', err);
    return null;  // Continue without personalization
  }),
]);
```

#### 4.2 Message History Pagination

**Add limit parameter to getHistory:**
```typescript
export async function getHistory(
  userId: string,
  limit = 50
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []).reverse();
}
```

#### 4.3 Lazy Load DOCX Library

**Reduce cold start by deferring heavy imports:**
```typescript
let docxModule: typeof import('npm:docx@7.3.0') | null = null;

async function getDocxModule() {
  if (!docxModule) {
    docxModule = await import('npm:docx@7.3.0');
  }
  return docxModule;
}
```

---

### Phase 5: Sync Local and Edge Code

**Key differences to address:**

| Feature | Edge Function | Local lib/whatsapp | Action |
|---------|---------------|-------------------|--------|
| Rate limit | 10/min | 30/min | Align to 30/min |
| SSRF protection | None | Full | Port to Edge |
| Circuit breaker | None | `opossum` | Add basic version |
| Zyprus client | 363 lines | 1764 lines | Port land listings |
| Error constants | Inline strings | `constants.ts` | Standardize |

**Priority syncs:**
1. SSRF protection (Phase 1)
2. Rate limit alignment (Phase 1)
3. Error constants (nice-to-have)

---

### Phase 6: End-to-End Verification

**Manual Testing Checklist:**

1. [ ] **Document Generation**
   - Send: "Create a viewing form for John Doe, +35799123456, for 123 Main St"
   - Verify: DOCX generated correctly with all fields

2. [ ] **Storage Upload**
   - Verify: Document appears in Supabase Storage
   - Verify: Path follows `documents/{chatId}/{timestamp}_*.docx`

3. [ ] **Signed URL**
   - Verify: URL is HTTPS
   - Verify: URL expires in 24 hours
   - Verify: URL is accessible

4. [ ] **WhatsApp Delivery**
   - Verify: Document received on WhatsApp
   - Verify: File opens correctly in Word/Google Docs

5. [ ] **Email with Attachment**
   - Send: "Email this document to test@example.com"
   - Verify: Email received via Resend
   - Verify: Attachment is correct DOCX

6. [ ] **Rate Limiting**
   - Send 35 messages rapidly
   - Verify: Messages 31+ are blocked with friendly error

7. [ ] **SSRF Protection**
   - Attempt to trigger URL fetch with `http://localhost`
   - Verify: Request is blocked, error logged

8. [ ] **Error Handling**
   - Test with invalid phone number
   - Test with empty message
   - Verify: Graceful error messages returned

**Logs Command:**
```bash
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx
```

---

## Acceptance Criteria

### Functional Requirements

- [ ] SSRF prevention blocks all private IPs and metadata endpoints
- [ ] SSRF prevention only allows Supabase storage URLs
- [ ] Rate limiting set to 30 requests/minute/user
- [ ] Document generation produces valid DOCX files
- [ ] Signed URLs expire in 24 hours
- [ ] WaSenderAPI successfully sends documents

### Non-Functional Requirements

- [ ] Response time < 10s for document generation
- [ ] Cold start < 3s for Edge Function
- [ ] No errors in production logs for 24 hours post-deploy

### Quality Gates

- [ ] Edge Function tests: 20+ passing
- [ ] Local tests: 133+ passing (maintained)
- [ ] Security review: SSRF, injection checks pass
- [ ] Manual E2E test: All 8 scenarios pass

---

## Risk Analysis & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Production outage during deploy | High | Low | Test in staging, use blue-green deploy |
| Breaking existing document flow | High | Medium | Verify flow before/after each change |
| Rate limit too restrictive | Medium | Low | Monitor usage, adjust if needed |
| SSRF false positives | Medium | Low | Comprehensive URL allowlist |

---

## Implementation Order

```
Day 1: Phase 1 (Security - CRITICAL)
├── 1.1 Create url-validator.ts
├── 1.2 Apply to sendEmailViaResend
├── 1.3 Align rate limits
└── 1.4 Deploy and verify

Day 2: Phase 2-3 (Verification + Testing)
├── 2.1 Test document generation flow
├── 2.2 Test storage upload
├── 2.3 Test signed URL delivery
├── 3.1 Create test structure
└── 3.2 Write URL validator tests

Day 3: Phase 3 continued + Phase 4
├── 3.3 Write rate limiter tests
├── 3.4 Write validation tests
├── 4.1 Parallelize DB calls
└── 4.2 Add history pagination

Day 4: Phase 5-6 (Sync + E2E)
├── 5.1 Document code differences
├── 6.1 Run full E2E checklist
├── 6.2 Monitor logs
└── 6.3 Fix any issues found
```

---

## Commands Reference

```bash
# Get current Edge Function code
mcp__plugin_supabase_supabase__get_edge_function(
  project_id="vceeheaxcrhmpqueudqx",
  function_slug="sophia-bot"
)

# Deploy Edge Function
cd /tmp/sophia-deploy && supabase functions deploy sophia-bot --no-verify-jwt

# Check logs
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx

# Run Deno tests
deno test --allow-all supabase/functions/tests/

# Run local tests
pnpm exec tsx --test tests/unit/whatsapp-*.test.ts
pnpm exec tsx --test tests/unit/url-validator.test.ts

# List secrets
supabase secrets list --project-ref vceeheaxcrhmpqueudqx
```

---

## References

### Internal Files
- `supabase/functions/sophia-bot/index.ts` - Main handler (2096 lines)
- `supabase/functions/sophia-bot/utils/validation.ts` - Input validation (125 lines)
- `supabase/functions/sophia-bot/utils/rate-limiter.ts` - Rate limiting (153 lines)
- `supabase/functions/sophia-bot/utils/webhook-auth.ts` - HMAC verification (115 lines)
- `lib/ai/security/url-validator.ts` - SSRF prevention (local reference)
- `lib/whatsapp/rate-limiter.ts` - Redis rate limiting (local reference)
- `tests/unit/whatsapp-*.test.ts` - Existing test patterns

### External Documentation
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Deno Testing](https://docs.deno.com/runtime/fundamentals/testing/)
- [WaSenderAPI Send Document](https://www.wasenderapi.com/api-docs/messages/send-document-message)
- [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

### Related Issues/PRs
- PR #3: Local `lib/whatsapp/` security improvements (133 tests)
- Branch: `fix/whatsapp-upload-remediation`
