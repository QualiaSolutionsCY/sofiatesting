# SOPHIA Full Review Report

**Date:** 2026-01-24
**Scope:** SOPHIA WhatsApp Bot Prompt Architecture
**Reviewed by:** 5 Parallel Agents (Code Quality, Security, Architecture, Performance, TypeScript)

---

## Executive Summary

The SOPHIA prompt system has **critical issues** that were not fully addressed in the previous session. The handoff claimed template count inconsistencies were fixed, but verification shows **6+ instances remain with wrong counts (25, 28, 40 instead of 43)**.

Beyond the incomplete cleanup, this review uncovered significant concerns across all dimensions:

| Category | Risk Level | Key Finding |
|----------|------------|-------------|
| **Code Quality** | HIGH | 198KB monolith is dead code, 65% LOC can be removed |
| **Security** | MEDIUM | Prompt injection defenses incomplete, agent impersonation possible |
| **Architecture** | GOOD | Hybrid approach sound, but monolith must be deleted |
| **Performance** | CRITICAL | 200KB+ prompts per request = $70/month token waste |
| **TypeScript** | HIGH | 30+ unsafe `as` casts on untrusted AI input |

---

## CRITICAL ISSUES (Must Fix)

### C1. Template Count Inconsistencies NOT Fixed
**Status:** Claimed fixed, actually broken

| Location | Line | Says | Should Say |
|----------|------|------|------------|
| `prompts.ts` | 143 | "40 predefined" | "43" |
| `prompts.ts` | 158 | "40 predefined" | "43" |
| `prompts.ts` | 903 | "28 templates" | "43" |
| `prompts.ts` | 959 | "25 predefined" | "43" |
| `prompts.ts` | 1082 | "40 predefined" | "43" |
| `prompts.ts` | 1119 | "25 predefined" | "43" |
| `prompts/core/identity.ts` | 12, 23 | "40 predefined" | "43" |

**Impact:** SOPHIA gives conflicting information about her capabilities.

### C2. 198KB Monolithic `prompts.ts` is Dead Code
**Status:** Should have been deleted

The hybrid `prompt-loader.ts` now assembles prompts from modular files + DB. The monolithic `prompts.ts`:
- Exports `SYSTEM_PROMPT` (4,743 lines) - **UNUSED**
- Only used export is `ZYPRUS_LOGO_BASE64` (from assets/)
- **4,744 lines of confusion-causing dead code**

### C3. Unsafe Type Assertions in Tool Executor
**File:** `tools/executor.ts`

```typescript
// DANGEROUS - AI can send any data
const location = args.location as string;
const price = args.price as number;
const imageUrls = args.imageUrls as string[];
```

**Impact:** Runtime crashes when AI sends malformed data.

### C4. Token Cost Explosion
**Current:** ~120KB system prompt sent with EVERY request (~30,000 tokens)
**Cost:** ~$70/month at current volume, scales linearly

**Problem:** All 43 templates (66KB) sent even for "hello" messages.

---

## HIGH PRIORITY ISSUES (Should Fix)

### H1. Incomplete Prompt Injection Defenses
**File:** `utils/validation.ts:32-66`

Current patterns can be bypassed via:
- Word splitting: "Ig nore all prev ious"
- Unicode homoglyphs
- Encoded attacks

### H2. Agent Impersonation Risk
**File:** `agents/identifier.ts:43-76`

Authentication relies on phone number partial matching (last 8 digits). No secondary factor for sensitive operations.

### H3. Non-null Assertions on Env Vars
**Files:** `database.ts:4-5`, `taxonomy-cache.ts:10-12`

```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!; // Crashes if not set
```

### H4. Placeholder UUIDs in Production
**File:** `taxonomy-cache.ts:970-1031`

```typescript
"basement": "a1b2c3d4-basement-uuid-placeholder", // Will never match
```

---

## RECOMMENDATIONS (Should Improve)

### R1. Standardize Template Count (5 minutes)
Create single source of truth:

```typescript
// prompts/constants.ts
export const TEMPLATE_COUNT = 43;
export const TEMPLATE_DESCRIPTION = `${TEMPLATE_COUNT} predefined Cyprus real estate templates`;
```

Then search-replace all occurrences.

### R2. Delete or Minimize prompts.ts (30 minutes)
Option A - Delete entirely:
```bash
rm supabase/functions/sophia-bot/prompts.ts
# Move logo to assets/zyprus-logo.ts (already done)
```

Option B - Reduce to logo only:
```typescript
// prompts.ts - DEPRECATED
export { ZYPRUS_LOGO_BASE64 } from "./assets/zyprus-logo.ts";
```

### R3. Dynamic Prompt Assembly (4-6 hours)
**Impact:** 70-80% token savings

```typescript
// Only load relevant sections based on user intent
if (isDocumentRequest(message)) {
  sections.push(DOCUMENT_ROUTING, getRelevantTemplate(message));
} else if (isUploadRequest(message)) {
  sections.push(PROPERTY_UPLOAD);
}
// NOT all 120KB every time
```

### R4. Add Zod Validation to Tool Executor (4-6 hours)
**Impact:** Prevent runtime crashes

```typescript
const CreatePropertySchema = z.object({
  listingType: z.enum(["sale", "rent"]),
  price: z.number().positive(),
  // ...
});

const result = CreatePropertySchema.safeParse(args);
if (!result.success) {
  return { error: result.error.message };
}
```

### R5. Move Logo to External Storage (1 hour)
**Impact:** 184KB less to parse on cold start

```typescript
const LOGO_URL = 'https://vceeheaxcrhmpqueudqx.supabase.co/storage/v1/object/public/assets/logo.png';
```

### R6. Extend Cache TTL (30 minutes)
**Impact:** Fewer DB queries

```typescript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h instead of 5m
// Add manual invalidation endpoint
```

---

## POSITIVE FINDINGS (What's Done Well)

### Security Strengths
- SSRF protection with domain allowlisting
- HMAC webhook signature verification
- Rate limiting with fail-closed behavior
- PII exclusion from AI context

### Architecture Strengths
- Hybrid DB + file fallback is sound design
- Modular prompt structure (core/behaviors/knowledge/templates)
- 5-minute cache for balance
- Clean separation of concerns

### Code Quality Strengths
- Interfaces defined for key data structures
- Async/await patterns used correctly
- Error handling with fallbacks

---

## Action Priority Matrix

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **P0** | Fix template count inconsistencies | 30min | Accuracy |
| **P0** | Delete/minimize prompts.ts | 30min | Clarity |
| **P1** | Add Zod validation to executor | 4-6h | Stability |
| **P1** | Dynamic prompt assembly | 4-6h | 70% cost reduction |
| **P1** | Fix env var non-null assertions | 30min | Reliability |
| **P2** | Enhance prompt injection defenses | 2-3h | Security |
| **P2** | Move logo to external storage | 1h | Performance |
| **P2** | Remove placeholder UUIDs | 1h | Accuracy |
| **P3** | Split templates into individual files | 4-6h | Maintainability |
| **P3** | Add DB indexes | 30min | Query speed |

---

## Files Requiring Changes

### Must Change
| File | Issue | Action |
|------|-------|--------|
| `prompts.ts` | Dead code, wrong counts | Delete or minimize |
| `prompts/core/identity.ts` | Wrong count (40) | Update to 43 |
| `tools/executor.ts` | Unsafe casts | Add Zod validation |
| `database.ts` | Non-null assertions | Add validation |

### Should Change
| File | Issue | Action |
|------|-------|--------|
| `prompt-loader.ts` | Full prompt every time | Add dynamic assembly |
| `utils/validation.ts` | Incomplete injection defense | Add normalization |
| `taxonomy-cache.ts` | Placeholder UUIDs | Remove or get real |
| `assets/zyprus-logo.ts` | 184KB in bundle | Move to storage |

---

## Conclusion

The previous session's work was **partially completed** but the handoff was inaccurate. Key issues:

1. **Template counts NOT fixed** - 6+ instances still wrong
2. **Monolith NOT deleted** - 198KB dead code remains
3. **No type safety** - executor.ts has 30+ unsafe casts
4. **Token waste** - 200KB+ prompts sent unnecessarily

**Recommended next step:** Fix P0 issues (template counts + delete monolith) before any new features.
