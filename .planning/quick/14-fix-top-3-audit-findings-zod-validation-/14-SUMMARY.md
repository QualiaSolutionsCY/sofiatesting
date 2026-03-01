---
phase: quick-14
plan: 01
subsystem: security, resilience, code-quality
tags: [zod-validation, retry-logic, dead-code-cleanup, mcp-config, documentation]

dependency-graph:
  requires:
    - audit findings from AI-PRODUCTION-AUDIT.md
    - existing retry.ts utility
    - existing Zod validation pattern in agents route
  provides:
    - validated admin endpoints (400 on invalid input)
    - resilient WaSender API calls (2 retries on 5xx/network errors)
    - clean codebase (dead code removed)
    - accurate documentation
  affects:
    - app/api/admin/prompts/[key]/route.ts
    - supabase/functions/sophia-bot/utils/wasend.ts
    - .mcp.json
    - CLAUDE.md

tech-stack:
  added: []
  patterns:
    - Zod validation in admin API endpoints
    - withRetry wrapper for external API calls

key-files:
  created: []
  modified:
    - app/api/admin/prompts/[key]/route.ts
    - supabase/functions/sophia-bot/utils/wasend.ts
    - .mcp.json
    - CLAUDE.md
  deleted:
    - lib/whatsapp/template-manager.ts
    - lib/ai/template-manager.ts

decisions: []

metrics:
  duration: ~25 minutes
  completed: 2026-03-01
  commits: 3
  files_changed: 7
  lines_added: 170
  lines_removed: 381
  net_reduction: 211 lines
---

# Quick Task 14: Fix Top 3 Audit Findings (Zod Validation + WaSender Retry + Cleanup)

**One-liner:** Added Zod validation to admin prompts endpoint, wrapped WaSender API calls with retry logic (2 retries, exponential backoff), and cleaned up dead code + documentation errors.

## What Was Done

### Fix 1: Add Zod Validation to Admin Prompts Endpoint

**Before:**
- `app/api/admin/prompts/[key]/route.ts` PUT handler had manual string validation
- No structured error responses
- Pattern inconsistent with other admin endpoints

**After:**
- Import `z` from "zod"
- Created `updatePromptSchema` with `content` (required string) and `updatedBy` (optional string)
- Replaced manual validation with `.safeParse(body)`
- Return 400 with structured error details:
  ```json
  {
    "error": "Validation failed",
    "details": {
      "content": { "_errors": ["Content is required"] }
    }
  }
  ```
- Follows same pattern as `app/api/admin/agents/route.ts`

**Note:** `app/api/documents/generate/route.ts` already had Zod validation (lines 11-15, 40-47) so no changes needed.

**Commit:** `66c6781`

---

### Fix 2: Add Retry Logic for WaSender API Calls

**Before:**
- WaSender API calls were fire-and-forget (no retry on 5xx/network failures)
- Only 429 rate limit had custom retry logic
- Transient network errors could fail message delivery

**After:**
- Import `withRetry` from `./retry.ts`
- Wrapped **4 fetch calls** with `withRetry()`:
  1. `sendTextMessage()` initial call (line 29)
  2. `sendTextMessage()` retry after 429 (line 67)
  3. `sendDocxFile()` (line 198)
  4. `sendLogoImage()` (line 316)

**Retry Config:**
```typescript
{
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 5000
}
```

**Behavior:**
- Retries on **5xx errors** and **network failures** only
- Does NOT retry 429 (rate limit) — existing custom logic preserved
- Exponential backoff with jitter: 1s → 2s → 4s (capped at 5s)
- Logs retry attempts via structured logger

**Deployment:**
- Deployed `sophia-bot` Edge Function successfully
- No errors in deployment

**Commit:** `3c2aa99`

---

### Fix 3: Dead Code Cleanup + Documentation Fixes

**3a. Deleted Orphaned Files:**
- `lib/whatsapp/template-manager.ts` (2,613 bytes, 0 imports)
- `lib/ai/template-manager.ts` (6,666 bytes, 0 imports)
- **Total removed:** 9,279 bytes of dead code

**3b. Fixed .mcp.json:**
- **Before:** Only had Postman + Railway MCP servers
- **After:** Added Supabase MCP server:
  ```json
  "supabase": {
    "command": "npx",
    "args": ["-y", "supabase-mcp-server@latest", "--project-ref", "vceeheaxcrhmpqueudqx"]
  }
  ```
- Now has all 3 required MCP servers (Supabase, Postman, Railway)

**3c. Fixed CLAUDE.md Quick Reference:**
1. **Architecture path:** `docs/ARCHITECTURE.md` → `.planning/codebase/ARCHITECTURE.md` (actual location)
2. **Removed skills line:** Deleted `| Skills | sofia-debugger, cyprus-calculator |` (those skills don't exist)

**Commit:** `a3d09cd`

---

## Verification

### Security Check
✅ Admin prompts endpoint rejects invalid input with 400 + structured errors
✅ Zod schema validates both required and optional fields
✅ Pattern consistent with other admin endpoints

### Resilience Check
✅ WaSender API calls automatically retry on 5xx/network errors
✅ Retry config: 2 retries, exponential backoff (1s base, 5s max)
✅ Existing 429 rate limit handling preserved
✅ Edge Function deployed successfully

### Code Quality Check
✅ Dead code files deleted (0 imports confirmed)
✅ .mcp.json has all 3 servers (supabase, postman, railway)
✅ CLAUDE.md Quick Reference points to correct paths
✅ TypeScript compilation: pre-existing errors only (not from our changes)

---

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `66c6781` | fix(quick-14): add Zod validation to admin prompts PUT endpoint | app/api/admin/prompts/[key]/route.ts |
| `3c2aa99` | fix(quick-14): add retry logic for WaSender API calls | supabase/functions/sophia-bot/utils/wasend.ts |
| `a3d09cd` | chore(quick-14): cleanup dead code and fix documentation | 5 files (deleted 2, modified 3) |

---

## Impact

**Security:**
- Admin endpoints now reject invalid input before hitting database
- Consistent validation patterns across all admin routes
- Structured error messages help frontend handle validation failures

**Resilience:**
- WhatsApp messaging now resilient to transient 5xx errors
- Network failures automatically retry with exponential backoff
- Message delivery reliability improved without user intervention

**Code Quality:**
- 211 net lines removed (dead code + refactoring)
- MCP configuration complete for all integrations
- Documentation accurate and maintainable

---

## Next Steps

- Monitor WaSender retry logs in production (check for excessive retries)
- Consider adding retry metrics to admin dashboard
- Run next round of audit findings (quick task 15+)

---

## Self-Check: PASSED

**Created files:** None
**Modified files:**
- ✅ app/api/admin/prompts/[key]/route.ts (Zod import + schema)
- ✅ supabase/functions/sophia-bot/utils/wasend.ts (withRetry import + 4 usages)
- ✅ .mcp.json (3 servers present)
- ✅ CLAUDE.md (correct paths, no skills line)

**Deleted files:**
- ✅ lib/whatsapp/template-manager.ts (confirmed deleted)
- ✅ lib/ai/template-manager.ts (confirmed deleted)

**Commits:**
- ✅ 66c6781 (exists in git log)
- ✅ 3c2aa99 (exists in git log)
- ✅ a3d09cd (exists in git log)

**Deployment:**
- ✅ sophia-bot Edge Function deployed (no errors)

All claims verified.
