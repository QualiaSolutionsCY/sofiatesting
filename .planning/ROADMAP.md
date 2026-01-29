# Roadmap: SOPHIA Production Hardening

**Created:** 2026-01-23
**Updated:** 2026-01-29

## Milestones

- **v1.0 Production Ready** - Phases 1-5 (shipped 2026-01-27, 93% complete)
- **v1.1 Reliability & Hardening** - Phases 6-9 (in progress)

## Phase Overview

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | SOPHIA Response Fixes | TMPL-01, TMPL-03, TMPL-04 | Complete |
| 2 | DOCX Template Fixes | TMPL-02, TMPL-05, TMPL-06 | Complete |
| 3 | Telegram Lead Routing | LEAD-01, LEAD-02, LEAD-03 | Complete |
| 4 | Listing Upload Fixes | LIST-01 to LIST-05 | Complete |
| 5 | WhatsApp Image Upload | LIST-06 | Carried to v1.1 |
| 6 | Logging Foundation | LOG-01 to LOG-05, LIST-06 | Complete |
| 7 | Cache Restoration | CACHE-01 to CACHE-05 | Complete |
| 8 | Prompt Consolidation | PRMT-01 to PRMT-05 | Complete |
| 9 | Validation & Error Handling | ERR-01 to ERR-04, IMG-01 to IMG-03 | Not started |

---

<details>
<summary>v1.0 Production Ready (Phases 1-5) - SHIPPED 2026-01-27</summary>

## Phase 1: SOPHIA Response Fixes

**Goal:** Clean up SOPHIA's response formatting and behavior
**Status:** Complete
**Plans:** 3/3 complete

### Requirements
- **TMPL-01**: SOPHIA never mentions template numbers to users
- **TMPL-03**: Email auto-sends to speaking agent's email without asking
- **TMPL-04**: No asterisks visible in WhatsApp messages

### Success Criteria
- SOPHIA responses never contain "Template 11", "Template 12", etc.
- When agent asks to send email, it goes to that agent's email automatically
- Bold text in WhatsApp appears bold, not with asterisks

---

## Phase 2: DOCX Template Fixes

**Goal:** Fix and consolidate document templates
**Status:** Complete
**Plans:** 3/3 complete

### Requirements
- **TMPL-02**: Single reservation template only (official version with witness)
- **TMPL-05**: Non-Exclusive Marketing Agreement has proper signature spacing
- **TMPL-06**: Non-Exclusive Marketing Agreement has correct border/frame

### Success Criteria
- Only one reservation template exists (official version)
- Marketing agreement has visible signature lines with proper spacing
- Marketing agreement has correct border/frame appearance

---

## Phase 3: Telegram Lead Routing

**Goal:** Fix "Others" group routing to use regional managers
**Status:** Complete
**Plans:** 1/1 complete

### Requirements
- **LEAD-01**: "Others" group routes based on property region
- **LEAD-02**: Nicosia leads go to Ivan (regional manager)
- **LEAD-03**: Famagusta leads go to Narine (regional manager)

### Success Criteria
- Nicosia property lead from Others goes to Ivan Kazakov
- Famagusta property lead from Others goes to Narine Akopyan
- Each region routes to its designated regional manager

---

## Phase 4: Listing Upload Fixes

**Goal:** Fix reviewer/owner assignment and My Notes population
**Status:** Complete
**Plans:** 2/2 complete

### Requirements
- **LIST-01**: Listing Reviewer 1 correct (Lauren for sales, agent for rentals)
- **LIST-02**: Listing Reviewer 2 correct (regional manager for sales)
- **LIST-03**: Listing Owner correct (special email mappings honored)
- **LIST-04**: My Notes populated with owner details
- **LIST-05**: Google Maps pin at neutral location (2-3 streets away)

### Success Criteria
- Sales listing: Reviewer 1 = Lauren, Reviewer 2 = regional manager
- Famagusta sales: Only Reviewer 1 = requestfamagusta@
- Rental listing: Reviewer 1 = uploading agent
- My Notes contains: Owner name, Tel, Agent (minimum)
- Map pin is ~200m from actual property

---

## Phase 5: WhatsApp Image Upload (Partial)

**Goal:** Enable phone gallery image uploads to SOPHIA with persistent storage
**Status:** 33% complete (1/3 plans), carried to v1.1 as part of Phase 6
**Plans:** 1/3 complete

### Requirements
- **LIST-06**: WhatsApp gallery images uploadable (not just URLs)

### Completed Work
- Image persistence service created (`image-persistence.ts`)
- Supabase Storage bucket configured

### Remaining Work
Carried to Phase 6 (v1.1) — integration and testing

</details>

---

## v1.1 Reliability & Hardening (In Progress)

**Milestone Goal:** Eliminate system fragility — consolidate prompts, validate images, improve cache management, harden error handling.

---

## Phase 6: Logging Foundation

**Goal:** Establish structured logging with correlation IDs to enable debugging of all subsequent phases
**Depends on:** Nothing (first phase of v1.1)
**Requirements:** LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LIST-06
**Status:** Complete
**Completed:** 2026-01-28
**Plans:** 4 plans

Plans:
- [x] 06-01-PLAN.md — Logger enhancement with correlationId, category, context propagation
- [x] 06-02-PLAN.md — Migrate index.ts console.log (258 calls) to structured logger
- [x] 06-03-PLAN.md — Migrate secondary files (executor, client, image services)
- [x] 06-04-PLAN.md — Complete LIST-06 pending images integration

### Key Files
- `supabase/functions/sophia-bot/utils/logger.ts` (structured logger, needs enhancement)
- `supabase/functions/sophia-bot/utils/context.ts` (NEW: request context propagation)
- `supabase/functions/sophia-bot/index.ts` (add correlation ID at request entry)
- `supabase/functions/sophia-bot/services/image-persistence.ts` (complete LIST-06 integration)
- `supabase/functions/sophia-bot/tools/executor.ts` (tool logging)
- All files with console.log (563 identified, prioritizing 328 in high-traffic paths)

### Success Criteria
1. Every request has a unique correlation ID visible in logs
2. Logs are structured JSON with consistent fields (level, timestamp, correlationId, category)
3. Console.log calls in high-traffic code paths migrated to structured logger
4. Error counts are trackable in logs (can grep for error level)
5. Phone numbers and message content are redacted from logs (PII protection)
6. WhatsApp phone gallery images work end-to-end (LIST-06 completion)

### Estimated Complexity
Medium — Logger infrastructure exists, needs enhancement and migration

---

## Phase 7: Cache Restoration

**Goal:** Restore production-safe caching with version-based invalidation and admin controls
**Depends on:** Phase 6 (needs logging for debugging cache issues)
**Requirements:** CACHE-01, CACHE-02, CACHE-03, CACHE-04, CACHE-05
**Status:** Complete
**Completed:** 2026-01-29
**Plans:** 3 plans

Plans:
- [x] 07-01-PLAN.md — Version checking using MAX(updated_at), migrate to structured logger
- [x] 07-02-PLAN.md — Admin endpoints (/admin/prompts/invalidate, /admin/cache/status)
- [x] 07-03-PLAN.md — Restore 5-minute TTL with comprehensive hit/miss logging

### Key Files
- `supabase/functions/sophia-bot/services/prompt-loader.ts` (restore TTL, add version check)
- `supabase/functions/sophia-bot/index.ts` (add admin endpoints)

### Success Criteria
1. Prompt cache TTL restored to 5 minutes (currently 0)
2. Cache checks MAX(updated_at) before serving cached content (no DB migration needed)
3. Admin can invalidate cache via POST to `/admin/prompts/invalidate`
4. Cache hits and misses are logged with correlation ID
5. Cache status visible via GET to `/admin/cache/status`

### Estimated Complexity
Low-Medium — Restore existing functionality with version checking

---

## Phase 8: Prompt Consolidation

**Goal:** Establish single source of truth for each prompt behavior, eliminating priority conflicts
**Depends on:** Phase 7 (stable cache required for testing prompt changes)
**Requirements:** PRMT-01, PRMT-02, PRMT-03, PRMT-04, PRMT-05
**Status:** Complete
**Completed:** 2026-01-29
**Plans:** 4 plans

Plans:
- [x] 08-01-PLAN.md — Schema versioning + prompt-loader updates (version, is_current columns)
- [x] 08-02-PLAN.md — Templates migration to DB (file-only to DB authoritative)
- [x] 08-03-PLAN.md — Ownership documentation + conflict detection script
- [x] 08-04-PLAN.md — Admin rollback API endpoint

### Key Files
- `sophia_prompts` table (schema and data)
- `supabase/functions/sophia-bot/prompts/` (all prompt files — document ownership)
- `supabase/functions/sophia-bot/prompts/templates/content.ts` (migrate to DB)
- `supabase/functions/sophia-bot/services/prompt-loader.ts` (versioning)
- `scripts/check-prompt-conflicts.ts` (NEW: conflict detection)

### Success Criteria
1. Each prompt behavior has a documented owner (either DB key or file, not both)
2. Running conflict detection script produces zero conflicts
3. Prompt changes are versioned with timestamps and history queryable
4. Admin can roll back to previous prompt version with single action
5. Template content (`templates` key) is in DB, file is fallback only

### Estimated Complexity
Medium — Careful migration required, risk of breaking existing behavior

---

## Phase 9: Validation & Error Handling

**Goal:** Validate inputs early, handle errors gracefully with user-friendly messages
**Depends on:** Phase 8 (clean prompts ensure predictable AI behavior during validation)
**Requirements:** ERR-01, ERR-02, ERR-03, ERR-04, IMG-01, IMG-02, IMG-03
**Plans:** TBD

### Key Files
- `supabase/functions/sophia-bot/index.ts` (early validation at webhook entry, health endpoint)
- `supabase/functions/sophia-bot/services/image-handler.ts` (image URL validation)
- `supabase/functions/sophia-bot/tools/executor.ts` (error handling, backoff)
- `supabase/functions/sophia-bot/zyprus/client.ts` (API retry logic)
- `supabase/functions/_shared/db.ts` (API call wrappers)

### Success Criteria
1. External API calls (OpenRouter, Zyprus, WaSender) use exponential backoff on failure
2. Errors are categorized by type (network, auth, validation, AI, unknown) in logs
3. Users receive helpful error messages, not technical stack traces
4. Health check endpoint (/health) returns service status and dependencies
5. Image URLs are validated at webhook ingress, not during tool execution
6. Invalid/hallucinated image URLs produce clear error messages to user
7. Validated images stored with correlation ID linking to original request

### Estimated Complexity
Medium-High — Touches user-visible behavior, requires careful error message design

---

## Dependencies

```
v1.0 (Complete)
    Phase 1-4 ──> Phase 5 (partial)

v1.1 (In Progress)
    Phase 6 (Logging) ──> Phase 7 (Cache) ──> Phase 8 (Prompts) ──> Phase 9 (Validation)
                │
                └── LIST-06 completion included
```

**Phase ordering rationale:**
1. **Logging first** — All subsequent phases benefit from correlation IDs and structured logs
2. **Cache second** — Must test prompt changes with production-like cache behavior
3. **Prompts third** — Resolves root cause of January callback bug; clean prompts needed before validation
4. **Validation fourth** — Highest risk (user-visible changes), needs all debugging tools ready

---

## Risk Areas

| Risk | Phase | Impact | Mitigation |
|------|-------|--------|------------|
| Console.log migration scope | 6 | 563 files is large | Prioritize high-traffic paths first |
| Cache version sync | 7 | Stale prompts if version check fails | Test thoroughly in staging |
| Prompt migration data loss | 8 | Broken AI behavior | Backup before migration, test each prompt |
| Breaking change cascade | 8 | Prompts have hidden dependencies | Full WhatsApp testing after each change |
| User-facing error messages | 9 | Bad UX if messages unclear | Review messages with real agent scenarios |
| Image validation timing | 9 | False positives blocking valid images | Conservative validation, clear retry guidance |

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. SOPHIA Response Fixes | v1.0 | 3/3 | Complete | 2026-01-24 |
| 2. DOCX Template Fixes | v1.0 | 3/3 | Complete | 2026-01-24 |
| 3. Telegram Lead Routing | v1.0 | 1/1 | Complete | 2026-01-24 |
| 4. Listing Upload Fixes | v1.0 | 2/2 | Complete | 2026-01-25 |
| 5. WhatsApp Image Upload | v1.0 | 1/3 | Carried | - |
| 6. Logging Foundation | v1.1 | 4/4 | Complete | 2026-01-28 |
| 7. Cache Restoration | v1.1 | 3/3 | Complete | 2026-01-29 |
| 8. Prompt Consolidation | v1.1 | 4/4 | Complete | 2026-01-29 |
| 9. Validation & Error Handling | v1.1 | 0/TBD | Not started | - |

---

*Roadmap created: 2026-01-23*
*Last updated: 2026-01-29 — Phase 8 complete*
*Last updated: 2026-01-29 — Phase 8 planned*
