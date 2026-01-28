# Architecture Research: Reliability Hardening

**Domain:** SOPHIA WhatsApp Bot - Reliability Improvements
**Researched:** 2026-01-28
**Overall Confidence:** HIGH (based on direct codebase analysis)

---

## Current Architecture Summary

### Component Overview

```
                              WhatsApp
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function: sophia-bot                       │
│                                                                             │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  Webhook Auth   │───▶│  Message Handler │───▶│    OpenRouter AI      │  │
│  │  (utils/)       │    │  (index.ts)      │    │    (Gemini 2.0)       │  │
│  └─────────────────┘    └──────────────────┘    └───────────────────────┘  │
│                                │                           │               │
│                                ▼                           ▼               │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │  Prompt Loader  │◀───│  Tool Executor   │───▶│    Zyprus API         │  │
│  │  (services/)    │    │  (tools/)        │    │    (listings)         │  │
│  └─────────────────┘    └──────────────────┘    └───────────────────────┘  │
│          │                     │                                           │
│          ▼                     ▼                                           │
│  ┌─────────────────┐    ┌──────────────────┐                              │
│  │ sophia_prompts  │    │  pending_images  │                              │
│  │  (DB table)     │    │  (DB table)      │                              │
│  └─────────────────┘    └──────────────────┘                              │
│          │                                                                 │
│          ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ prompts/*.ts    │  ◀── Fallback files (used if DB fails)               │
│  │  (8 files)      │                                                       │
│  └─────────────────┘                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key Data Flows

1. **Message Processing**: WhatsApp webhook → signature verification → rate limiting → AI completion → tool execution → response
2. **Prompt Loading**: DB query (sophia_prompts) → merge with file fallbacks → 5-min cache → system prompt assembly
3. **Image Handling**: WaSend decrypt → persist to Supabase Storage → track in pending_images → use on upload

### File Structure (Relevant)

```
supabase/functions/sophia-bot/
├── index.ts                    # Main webhook handler (~700 lines)
├── services/
│   ├── prompt-loader.ts        # DB + file merging, 5-min cache
│   ├── media-decryptor.ts      # WaSend API integration
│   ├── image-persistence.ts    # Supabase Storage uploads
│   └── pending-images.ts       # Cross-webhook image tracking
├── tools/
│   ├── definitions.ts          # Tool schemas (Zod)
│   └── executor.ts             # Tool execution logic
├── utils/
│   ├── logger.ts               # Structured JSON logging with PII redaction
│   ├── url-validator.ts        # SSRF prevention, allowlist
│   └── validation.ts           # Input sanitization
└── prompts/
    ├── core/                   # identity.ts, safety-rules.ts
    ├── behaviors/              # document-routing.ts, property-upload.ts, response-format.ts
    ├── knowledge/              # calculators.ts, cyprus-real-estate.ts
    └── templates/              # content.ts (NOT in DB - file only)
```

---

## Prompt System Integration

### Current State (Problem)

| Source | Priority | Current State |
|--------|----------|---------------|
| `sophia_prompts` DB | 1st (wins) | 7 active rows, editable via Dashboard |
| `prompts/*.ts` files | 2nd (fallback) | 8 files, used when DB key missing |
| `CACHE_TTL_MS` | - | Set to 0 (disabled for testing since Jan 26) |

**Pain Points:**
1. DB and files can drift out of sync (no sync mechanism)
2. No clear "which version is live?" visibility
3. Cache disabled means DB hit on every request
4. File `templates/content.ts` is ONLY in files (not in DB) - design intent unclear

### Recommended Consolidation

**Decision: DB as Single Source of Truth**

Rationale:
- Dashboard editing is the primary use case
- Files should be read-only fallbacks for disaster recovery
- Eliminates sync confusion

**Architecture Changes:**

```
┌──────────────────────────────────────────────────────────────────┐
│                     Prompt System v2                             │
│                                                                  │
│  sophia_prompts (DB)  ◀── Single Source of Truth                 │
│         │                                                        │
│         ├── All 8 sections stored in DB                          │
│         ├── Includes `templates` (currently file-only)           │
│         └── `version` column for change tracking                 │
│                                                                  │
│  prompts/*.ts (Files) ◀── Disaster Recovery Fallback Only        │
│         │                                                        │
│         ├── Generated from DB on deploy (or manual export)       │
│         └── Never edited directly                                │
│                                                                  │
│  Cache Layer                                                     │
│         │                                                        │
│         ├── 5-min TTL (restored)                                 │
│         ├── Admin invalidation endpoint                          │
│         └── Version-based cache busting                          │
└──────────────────────────────────────────────────────────────────┘
```

**Integration Points:**

1. **prompt-loader.ts** (modify):
   - Add `templates` key to DB migration
   - Add `version` column read for cache validation
   - Restore CACHE_TTL_MS = 5 * 60 * 1000
   - Add `forceRefresh` parameter for admin use

2. **sophia_prompts table** (migrate):
   - Add row: `key='templates'` with content from `templates/content.ts`
   - Add column: `version INT DEFAULT 1`
   - Add column: `updated_by TEXT` (audit trail)

3. **New: /admin/prompts endpoint** (create):
   - `POST /admin/prompts/invalidate` - clears cache
   - `GET /admin/prompts/status` - shows cache state + versions

---

## Cache System Integration

### Current State (Problem)

```typescript
// prompt-loader.ts line 16
const CACHE_TTL_MS = 0; // TEMP: Disabled for testing (since Jan 26)
```

**Problems:**
1. Every request hits DB (performance, cost)
2. No admin visibility into cache state
3. No way to force refresh after Dashboard edit

### Recommended Cache Architecture

**Pattern: Version-Based Cache Invalidation**

```
┌───────────────────────────────────────────────────────────────┐
│                    Cache System v2                            │
│                                                               │
│  In-Memory Cache                                              │
│  ├── Key: "prompts"                                           │
│  ├── Value: Map<string, string> (prompt sections)             │
│  ├── TTL: 5 minutes                                           │
│  └── Version: INT (from DB max(version))                      │
│                                                               │
│  Validation Flow:                                             │
│  1. Check if cache exists && not expired                      │
│  2. Quick version check: SELECT MAX(version) FROM sophia_prompts
│  3. If version matches: use cache                             │
│  4. If version differs OR no cache: full reload               │
│                                                               │
│  Admin Invalidation:                                          │
│  POST /admin/prompts/invalidate                               │
│  └── Sets cachedPromptSections = null                         │
│  └── Returns { success: true, nextLoadAt: <timestamp> }       │
└───────────────────────────────────────────────────────────────┘
```

**Integration Points:**

1. **prompt-loader.ts** (modify):
   ```typescript
   // Add version tracking
   let cachedVersion: number = 0;

   async function getPromptSections(supabase) {
     // Quick version check (lightweight query)
     const { data: versionData } = await supabase
       .from("sophia_prompts")
       .select("version")
       .order("version", { descending: true })
       .limit(1)
       .single();

     const currentVersion = versionData?.version || 0;

     // Cache valid if: exists AND not expired AND version matches
     if (cachedPromptSections &&
         Date.now() - cacheTimestamp < CACHE_TTL_MS &&
         currentVersion === cachedVersion) {
       return cachedPromptSections;
     }

     // Full reload
     cachedVersion = currentVersion;
     // ... existing load logic
   }
   ```

2. **index.ts** (modify):
   - Add route handler for `POST /admin/prompts/invalidate`
   - Add route handler for `GET /admin/prompts/status`
   - Authenticate admin requests via shared secret

3. **New: Admin Auth**:
   - Add `ADMIN_SECRET` env var
   - Validate via `Authorization: Bearer <secret>` header

---

## Validation Pipeline

### Current State (Problem)

Image URL validation happens **late** in the pipeline (inside `handleCreatePropertyListing`):

```
User sends images
       │
       ▼
webhook receives ─────────────────────────────────────────────────────┐
       │                                                              │
       ▼                                                              │
AI generates response (may hallucinate URLs)                          │
       │                                                              │
       ▼                                                              │
Tool executor called                                                  │
       │                                                              │
       ▼                                                              │
getPendingImages() - gets real URLs from DB   ◀── Good: ignores AI   │
       │                                                              │
       ▼                                                              │
processImages() - classifies images                                   │
       │                                                              │
       ▼                                                              │
validateImages() - HTTP HEAD check   ◀── PROBLEM: Late validation     │
       │                                                              │
       ▼                                                              │
If validation fails → Error returned to user (bad UX)                 │
```

**Problems:**
1. Hallucinated URLs only caught at tool execution
2. AI may reference non-existent images in response
3. Error messages are technical ("HTTP 404")

### Recommended Validation Architecture

**Pattern: Early Validation with User Feedback**

```
┌───────────────────────────────────────────────────────────────────┐
│                   Image Validation Pipeline v2                    │
│                                                                   │
│  STAGE 1: Webhook Ingress (image-persistence.ts)                  │
│  ├── WhatsApp image received                                      │
│  ├── Decrypt via WaSend                                           │
│  ├── VALIDATE IMMEDIATELY: HTTP HEAD check                        │
│  ├── If invalid: Skip persistence, log warning                    │
│  ├── If valid: Persist to Supabase Storage                        │
│  └── Add to pending_images with `validated=true` flag             │
│                                                                   │
│  STAGE 2: Tool Execution (executor.ts)                            │
│  ├── getPendingImages() returns ONLY validated images             │
│  ├── processImages() - classification only                        │
│  ├── No validateImages() call needed (already validated)          │
│  └── Proceed with upload                                          │
│                                                                   │
│  BENEFIT: User gets instant feedback if image upload fails        │
└───────────────────────────────────────────────────────────────────┘
```

**Integration Points:**

1. **image-persistence.ts** (modify):
   ```typescript
   export async function persistImage(url: string, index: number): Promise<{
     url: string | null;
     validated: boolean;
     error?: string;
   }> {
     // Early validation
     const response = await fetch(url, { method: 'HEAD' });
     if (!response.ok) {
       console.warn(`[ImagePersist] Image ${index} validation failed: ${response.status}`);
       return { url: null, validated: false, error: `HTTP ${response.status}` };
     }

     // Existing persistence logic
     // ...

     return { url: publicUrl, validated: true };
   }
   ```

2. **pending_images table** (migrate):
   - Add column: `validated BOOLEAN DEFAULT false`
   - Add column: `validation_error TEXT`

3. **pending-images.ts** (modify):
   - `addPendingImages()`: accept validation status
   - `getPendingImages()`: filter `WHERE validated = true`

4. **index.ts** (modify):
   - On image message: persist + validate + store status
   - If validation fails: send user message "I couldn't process this image: {reason}"

5. **executor.ts** (simplify):
   - Remove `validateImages()` call (already validated)
   - Keep `hasEnoughImages()` check

---

## Logging Architecture

### Current State

**Existing logger** (utils/logger.ts):
- Structured JSON output
- PII redaction (phone, email)
- Log levels (DEBUG, INFO, WARN, ERROR)
- Context support (operation, messageId, userId)

**Problems:**
1. Inconsistent usage: Some files use `console.log`, others use `logger`
2. No request correlation ID
3. No structured error categorization
4. Hard to trace a single message through the pipeline

### Recommended Logging Architecture

**Pattern: Correlated Structured Logging**

```
┌───────────────────────────────────────────────────────────────────┐
│                    Logging System v2                              │
│                                                                   │
│  Request Context (per webhook call)                               │
│  ├── requestId: UUID (generated at ingress)                       │
│  ├── messageId: WhatsApp message ID                               │
│  ├── agentPhone: Redacted agent identifier                        │
│  └── startTime: Timestamp for duration tracking                   │
│                                                                   │
│  Log Entry Format:                                                │
│  {                                                                │
│    "level": "INFO",                                               │
│    "message": "Tool execution completed",                         │
│    "timestamp": "2026-01-28T12:34:56.789Z",                       │
│    "requestId": "abc-123",           ◀── Correlation              │
│    "messageId": "WAXXXX",                                         │
│    "operation": "createPropertyListing",                          │
│    "duration": 1234,                 ◀── Performance tracking     │
│    "result": "success",                                           │
│    "metadata": { ... }               ◀── Structured details       │
│  }                                                                │
│                                                                   │
│  Error Categories:                                                │
│  ├── VALIDATION_ERROR: Input validation failures                  │
│  ├── API_ERROR: External API failures (Zyprus, WaSend)            │
│  ├── TOOL_ERROR: Tool execution failures                          │
│  └── SYSTEM_ERROR: Unexpected exceptions                          │
└───────────────────────────────────────────────────────────────────┘
```

**Integration Points:**

1. **utils/logger.ts** (modify):
   ```typescript
   export interface RequestContext {
     requestId: string;
     messageId?: string;
     agentPhone?: string;
     startTime: number;
   }

   class Logger {
     private context?: RequestContext;

     setContext(ctx: RequestContext) {
       this.context = ctx;
     }

     info(message: string, metadata?: Record<string, unknown>) {
       const entry = {
         level: 'INFO',
         message,
         timestamp: new Date().toISOString(),
         ...this.context,
         duration: this.context ? Date.now() - this.context.startTime : undefined,
         ...this.redactPII(metadata),
       };
       console.log(JSON.stringify(entry));
     }

     // Similar for error(), warn(), debug()
   }
   ```

2. **index.ts** (modify):
   - At webhook entry: `logger.setContext({ requestId: crypto.randomUUID(), startTime: Date.now() })`
   - Pass logger to services via dependency injection or global

3. **Migrate console.log** (gradual):
   - Phase 1: Add requestId to all `console.log` calls
   - Phase 2: Replace with `logger.*` calls
   - Phase 3: Remove direct console usage

4. **Error categorization**:
   ```typescript
   export enum ErrorCategory {
     VALIDATION = 'VALIDATION_ERROR',
     API = 'API_ERROR',
     TOOL = 'TOOL_ERROR',
     SYSTEM = 'SYSTEM_ERROR',
   }

   logger.error('Zyprus API failed', {
     category: ErrorCategory.API,
     service: 'zyprus',
     statusCode: 403,
   });
   ```

---

## Recommended Build Order

Based on dependencies and risk, here is the suggested phase sequence:

### Phase 1: Logging Foundation (Low Risk, High Value)
**Why First:** All other changes benefit from better observability.

| Task | File | Type |
|------|------|------|
| Add requestId context | utils/logger.ts | Modify |
| Add error categories | utils/logger.ts | Modify |
| Wire up context in webhook entry | index.ts | Modify |

### Phase 2: Cache Restoration (Medium Risk, High Value)
**Why Second:** Reduces DB load, enables safer prompt testing.

| Task | File | Type |
|------|------|------|
| Restore CACHE_TTL_MS to 5 min | services/prompt-loader.ts | Modify |
| Add version tracking column | sophia_prompts (migration) | DB Change |
| Add version-based cache validation | services/prompt-loader.ts | Modify |
| Add admin invalidation endpoint | index.ts | Add Route |

### Phase 3: Prompt Consolidation (Medium Risk, Medium Value)
**Why Third:** Depends on cache being stable, affects AI behavior.

| Task | File | Type |
|------|------|------|
| Migrate templates to DB | sophia_prompts (migration) | DB Change |
| Add updated_by audit column | sophia_prompts (migration) | DB Change |
| Update prompt-loader for 8 keys | services/prompt-loader.ts | Modify |
| Mark file prompts as fallback-only | prompts/*.ts | Document |

### Phase 4: Validation Pipeline (Higher Risk, High Value)
**Why Fourth:** Requires most testing, changes user-facing behavior.

| Task | File | Type |
|------|------|------|
| Add validated column to pending_images | pending_images (migration) | DB Change |
| Add early validation in persistence | services/image-persistence.ts | Modify |
| Update pending-images to track status | services/pending-images.ts | Modify |
| Add user feedback on failed images | index.ts | Modify |
| Remove late validateImages call | tools/executor.ts | Simplify |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Cache restoration | Low | Version tracking prevents stale data |
| Logging changes | Very Low | Additive, no behavior change |
| Prompt consolidation | Medium | Test in staging first, keep file fallbacks |
| Validation pipeline | Medium-High | Feature flag, gradual rollout |

---

## Testing Strategy

### Per-Phase Testing

1. **Logging**: Verify JSON output in Edge Function logs, check requestId correlation
2. **Cache**: Monitor DB query counts, test admin invalidation endpoint
3. **Prompts**: Compare AI responses before/after, verify template routing
4. **Validation**: Upload test images, verify early rejection messages

### Rollback Plan

Each phase should be independently deployable with:
- Feature flags where possible
- DB migrations that are additive (no column removal)
- File fallbacks always available

---

## Sources

- Direct codebase analysis (HIGH confidence)
- `supabase/functions/sophia-bot/` directory structure
- `prompt-loader.ts` (lines 1-240)
- `image-handler.ts` (lines 1-320)
- `image-persistence.ts` (lines 1-91)
- `pending-images.ts` (lines 1-109)
- `logger.ts` (lines 1-142)
- `url-validator.ts` (lines 1-366)
- `executor.ts` (lines 1-910)
- `CLAUDE.md` project documentation
