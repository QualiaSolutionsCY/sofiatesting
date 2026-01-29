# Phase 8: Prompt Consolidation - Context

**Gathered:** 2026-01-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish single source of truth for each prompt behavior, eliminating priority conflicts. Each prompt gets a documented owner (DB or file, not both). Includes conflict detection, versioning, and rollback capability.

**Out of scope:** New prompt behaviors, AI model changes, caching improvements (Phase 7 complete).

</domain>

<decisions>
## Implementation Decisions

### Ownership Model
- **DB is authoritative** for all runtime prompts (identity, safety_rules, document_routing, etc.)
- **Files are development fallbacks only** — used when DB key missing, never override DB
- **`templates` content migrates to DB** — currently file-only, move to sophia_prompts table
- **Ownership documented in code comments** — each prompt file header states "Source: DB key X" or "Source: file-only"

### Conflict Detection
- **Run on every deploy** — conflict check script runs before Edge Function deploy
- **Block deploy on conflicts** — if same instruction exists in multiple prompts at different priorities, deploy fails with clear error
- **Keyword-based detection** — scan for duplicate instruction patterns (e.g., "callback", "email", "template")
- **Output: conflict report** — lists conflicting prompts, priorities, and the duplicate instruction

### Version History
- **Same table approach** — add `version` column to sophia_prompts, keep current row + history
- **Retain 30 days of history** — sufficient for debugging production issues
- **Auto-version on update** — every UPDATE creates new version, old row marked as historical
- **Query pattern:** `WHERE key = X AND is_current = true` for runtime, full history for admin

### Rollback Mechanism
- **Admin API endpoint** — `POST /admin/prompts/rollback` with key and target version
- **Single-prompt scope** — rollback one prompt at a time (safer, more predictable)
- **Immediate effect** — rollback invalidates cache (reuse Phase 7 cache invalidation)
- **Audit log** — rollback action logged with timestamp, admin identifier, reason

### Claude's Discretion
- Exact conflict detection regex patterns
- Version table schema details (separate table vs same table with flag)
- Admin API authentication (reuse x-admin-secret from Phase 7)
- Cleanup job for old versions (cron or manual)

</decisions>

<specifics>
## Specific Ideas

- Production system with 30+ active Zyprus agents on WhatsApp
- Priority: reliability and debuggability over fancy features
- Reuse admin patterns from Phase 7 (x-admin-secret header, /admin/* routes)
- The January callback bug was caused by conflicting instructions at different priorities — this phase prevents recurrence

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-prompt-consolidation*
*Context gathered: 2026-01-29*
