# SOPHIA WhatsApp Bot - Fixing Plan

**Generated:** 2026-02-06
**From:** Comprehensive 5-Agent Review (Code Quality, Security, Architecture, Performance, Test Coverage)
**Status:** Ready for Implementation

---

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Code Quality | 2 | 3 | 3 | 2 |
| Security | 0 | 3 | 4 | 2 |
| Architecture | 0 | 3 | 3 | 2 |
| Performance | 0 | 2 | 4 | 2 |

**Overall Assessment:** Good security foundations, significant code duplication, god objects need refactoring.

---

## P0 - Critical (Do Immediately)

### 1. Extract `formatPropertyDescription()` - DRY Violation
**Effort:** 2 hours
**Files:**
- `supabase/functions/sophia-bot/docx/styles.ts:173-310`
- `supabase/functions/sophia-bot/docx/templates/marketing-agreement.ts:105-302`
- `supabase/functions/sophia-bot/docx/templates/reservation-agreement.ts:622-805`

**Problem:** Same 140-line function copy-pasted 3 times. Bug fixes require 3 updates.

**Solution:**
```typescript
// CREATE: supabase/functions/sophia-bot/utils/property-formatter.ts
export const CYPRUS_DISTRICTS = ["paphos", "limassol", "larnaca", "nicosia", "famagusta", "kyrenia"];
export const CYPRUS_AREAS = [...]; // 50+ areas
export const COMPLEX_INDICATORS = [...];
export function formatPropertyDescription(raw: string): FormattedProperty { ... }

// THEN: Import in all 3 files
import { formatPropertyDescription, CYPRUS_DISTRICTS } from "../../utils/property-formatter.ts";
```

---

### 2. Lazy Load DOCX Library - Cold Start
**Effort:** 2 hours
**File:** `supabase/functions/sophia-bot/handlers/webhook.ts:1-79`

**Problem:** `docx@8.5.0` (~500KB) imported on every request. Only ~5% of requests generate DOCX.

**Solution:**
```typescript
// BEFORE: Top-level import
import { Document, Packer } from "https://esm.sh/docx@8.5.0";

// AFTER: Dynamic import when needed
async function generateDocx(templateType: string, data: unknown): Promise<Uint8Array> {
  const { Document, Packer } = await import("https://esm.sh/docx@8.5.0");
  const templates = await import("../docx/templates/index.ts");
  // ...
}
```

**Expected Gain:** 200-500ms faster cold starts for 95% of requests.

---

## P1 - High Priority (This Sprint)

### 3. Sanitize Email Subjects - Security
**Effort:** 30 minutes
**File:** `supabase/functions/sophia-bot/handlers/webhook.ts:208-280`

**Problem:** AI-generated email subjects could contain header injection.

**Solution:**
```typescript
function sanitizeEmailSubject(subject: string): string {
  return subject
    .replace(/[\r\n]/g, ' ')  // Remove newlines
    .replace(/^(to|cc|bcc|from|subject):/gi, '')  // Remove header-like patterns
    .slice(0, 200)  // Reasonable length
    .trim();
}

// Use in detectEmailSendingIntent:
subject: sanitizeEmailSubject(extractedSubject),
```

---

### 4. Generic Zyprus API Errors - Security
**Effort:** 30 minutes
**File:** `supabase/functions/sophia-bot/zyprus/client.ts:694-712`

**Problem:** Internal API error details exposed to users.

**Solution:**
```typescript
// BEFORE
throw new Error(`Failed to create listing (${response.status}): ${errorDetail || "Unknown error"}`);

// AFTER
logger.error("Zyprus API error", { status: response.status, detail: errorDetail });
throw new Error("Unable to create listing. Please try again or contact support.");
```

---

### 5. Extract EmailService from webhook.ts - Architecture
**Effort:** 4 hours
**File:** `supabase/functions/sophia-bot/handlers/webhook.ts` (845 lines)

**Problem:** God object handling webhook auth, email detection, email sending, DOCX routing.

**Solution:**
```typescript
// CREATE: supabase/functions/sophia-bot/services/email-service.ts
export interface EmailIntent {
  recipientEmail: string;
  subject: string;
  body: string;
  documentUrl?: string;
}

export async function detectEmailIntent(
  aiResponse: string,
  history: ChatMessage[],
  agent: Agent | null
): Promise<EmailIntent | null>;

export async function sendEmail(intent: EmailIntent): Promise<EmailResult>;

// webhook.ts imports and calls these instead
```

---

### 6. Parallel Taxonomy Pagination - Performance
**Effort:** 4 hours
**File:** `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts:81-206`

**Problem:** Sequential page fetches. 10 vocabularies x 4 pages = 40 sequential HTTP calls on cache miss.

**Solution:**
```typescript
async function fetchTaxonomyParallel(vocab: string, token: string): Promise<TaxonomyItem[]> {
  // First request to get total count
  const firstPage = await fetch(`${apiUrl}?page[limit]=50`);
  const firstData = await firstPage.json();
  const totalPages = Math.ceil((firstData.meta?.count || 0) / 50);

  if (totalPages <= 1) return parseItems(firstData);

  // Fetch remaining pages in parallel
  const pagePromises = Array.from({ length: totalPages - 1 }, (_, i) =>
    fetch(`${apiUrl}?page[limit]=50&page[offset]=${(i + 1) * 50}`, {...})
  );
  const pages = await Promise.all(pagePromises);
  // Combine results...
}
```

**Expected Gain:** Cache miss time: 10s → 2s

---

### 7. Conditional Pending Images Fetch - Performance
**Effort:** 1 hour
**File:** `supabase/functions/sophia-bot/services/ai-chat.ts:153`

**Problem:** `getPendingImages()` called on EVERY message, even when irrelevant.

**Solution:**
```typescript
// BEFORE: Always fetches
const accumulatedImages = await getPendingImages(phoneNumber);

// AFTER: Only when relevant
let accumulatedImages: string[] = [];
const lowerMessage = context.userMessage?.toLowerCase() || "";
if (context.imageUrls?.length || lowerMessage.includes("property") || lowerMessage.includes("upload")) {
  accumulatedImages = await getPendingImages(phoneNumber);
}
```

---

## P2 - Medium Priority (Next Sprint)

### 8. Create Configuration Module - Architecture
**Effort:** 2 hours
**Scattered in:** `taxonomy-cache.ts`, `executor.ts`, `reviewer-assignment.ts`

**Problem:** Business-critical values scattered across 5+ files.

**Solution:**
```typescript
// CREATE: supabase/functions/sophia-bot/config/business-rules.ts
export const REGIONAL_EMAILS = {
  paphos: "requestpaphos@zyprus.com",
  limassol: "requestlimassol@zyprus.com",
  // ...
};

export const DEFAULT_COORDINATES = {
  paphos: { lat: 34.7720, lon: 32.4297 },
  // ...
};

export const USER_FALLBACKS = { ... };
export const AGENT_NAME_MAP = { ... };
```

---

### 9. Stale-While-Revalidate for Taxonomy - Performance
**Effort:** 3 hours
**File:** `supabase/functions/sophia-bot/zyprus/taxonomy-cache.ts:72-74`

**Problem:** Full reload on cache expiry causes 2-5s delays.

**Solution:**
```typescript
const CACHE_TTL = 60 * 60 * 1000;      // 1 hour - fresh
const STALE_TTL = 2 * 60 * 60 * 1000;  // 2 hours - serve stale while refreshing

export async function loadTaxonomy(): Promise<TaxonomyCache> {
  const now = Date.now();

  if (cache && now - cache.lastUpdated < CACHE_TTL) {
    return cache; // Fresh
  }

  if (cache && now - cache.lastUpdated < STALE_TTL) {
    refreshTaxonomyInBackground().catch(() => {}); // Fire-and-forget
    return cache; // Serve stale immediately
  }

  return await refreshTaxonomy(); // Truly expired
}
```

---

### 10. Consolidate Detection Logic - Architecture
**Effort:** 3 hours
**Files:** `templates/detection.ts`, `docx-generator.ts`, `docx/detector.ts`, `webhook.ts`

**Problem:** Template detection duplicated in 4 files.

**Solution:** Make `templates/detection.ts` the single source of truth. Remove duplicates from other files.

---

### 11. Unify Viewing Form Parsers - Code Quality
**Effort:** 3 hours
**Files:** `viewing-form-single.ts`, `viewing-form-multiple.ts`, `viewing-form-advanced.ts`

**Problem:** Similar but subtly different regex patterns.

**Solution:**
```typescript
// CREATE: supabase/functions/sophia-bot/utils/viewing-form-parser.ts
export interface PersonData {
  name: string;
  idNumber: string;
  issuedBy: string;
}

export function parsePersonInfo(text: string): PersonData[] {
  // Single unified implementation
}
```

---

## P3 - Low Priority (Backlog)

### 12. Phone Number Exact Matching - Security
**File:** `supabase/functions/sophia-bot/agents/identifier.ts:60-88`

**Problem:** Last 8 digits ILIKE could match wrong agent.

**Solution:** Use exact matching after normalization, or add confirmation flow.

---

### 13. HTTPS-Only Image URLs - Security
**File:** `supabase/functions/sophia-bot/utils/url-validator.ts:304-366`

**Problem:** HTTP allowed for images (MITM risk).

**Solution:** Consider enforcing HTTPS-only or content integrity checks.

---

### 14. Extend Version Check Interval - Performance
**File:** `supabase/functions/sophia-bot/services/prompt-loader.ts:27`

**Problem:** Version check every 30 seconds.

**Solution:** Extend to 60 seconds or disable for Edge Functions with short lifespans.

---

### 15. Full XML Entity Encoding in DOCX Fallback - Security
**File:** `supabase/functions/sophia-bot/docx-generator.ts:457-465`

**Problem:** Only `<` and `>` escaped, not `&`, `'`, `"`.

**Solution:** Add full XML entity encoding.

---

## Test Coverage Gaps

| Area | Status | Priority |
|------|--------|----------|
| DOCX template rendering | ❌ No tests | High |
| Zyprus API client | ❌ No tests | High |
| Image handling pipeline | ❌ No tests | Medium |
| createPropertyListing tool | ⚠️ Partial | Medium |

**Well Tested:** Webhook auth, URL validation, rate limiting, calculators, prompt loading.

---

## Implementation Order (Recommended)

| Week | Tasks | Total Effort |
|------|-------|--------------|
| **Week 1** | #1 Extract formatPropertyDescription, #2 Lazy load DOCX, #3 Email sanitization, #4 Generic errors | 5h |
| **Week 2** | #5 Extract EmailService, #6 Parallel taxonomy | 8h |
| **Week 3** | #7 Conditional images, #8 Config module, #9 Stale-while-revalidate | 6h |
| **Backlog** | #10-15 as capacity allows | ~10h |

---

## Verification After Each Fix

1. Deploy: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
2. Test on WhatsApp with real messages
3. Check logs: `supabase functions logs sophia-bot`
4. Verify no regressions in existing functionality

---

## Related Files (Don't Delete)

- `docs/UPLOAD-LISTINGS-EXTENSIVE-INFO/` - Zyprus API source of truth
- `docs/ZYPRUS_API_REFERENCE.md` - API reference
- `CLAUDE.md` - Project instructions (keep updated)
