# Project Research Summary

**Project:** SOPHIA v1.1 Reliability & Hardening
**Domain:** Production AI Assistant (WhatsApp bot for real estate agents)
**Researched:** 2026-01-28
**Confidence:** HIGH

## Executive Summary

SOPHIA is a production WhatsApp bot serving 30 real estate agents daily. The v1.1 milestone focuses on reliability hardening rather than new features. The research reveals four interconnected problem areas: **prompt management with priority conflicts** (already caused production bugs), **disabled caching** (TTL set to 0 since January), **late image validation** (errors surface too late), and **inconsistent logging** (563+ console.log calls bypassing the structured logger).

The recommended approach follows a strict dependency order: **logging first** (enables debugging everything else), **cache restoration second** (reduces DB load, enables safe prompt testing), **prompt consolidation third** (requires stable cache), and **validation pipeline fourth** (highest risk, requires all other pieces working). Each phase builds on the previous one, and rushing order will compound debugging difficulty.

The critical risks are: (1) the disabled cache causing unnecessary DB load and unpredictable behavior during development vs production, (2) prompt priority conflicts between `safety_rules` (priority 20) and `document_routing` (priority 30) that already caused the January callback field bug, and (3) the 563 unaudited console.log calls that may leak PII and prevent effective debugging. Mitigation requires restoring production-safe defaults before any feature work.

## Key Findings

### Recommended Stack

The codebase already uses Supabase Edge Functions (Deno) with a solid foundation. No new external dependencies are recommended. The focus is on **using existing infrastructure correctly** rather than adding tools.

**Core patterns to adopt:**
- **Version-based cache validation**: Add `version` column to `sophia_prompts`, check version before using cache to enable instant invalidation
- **LogTape structured logging**: Replace console.log with LogTape (5.3KB, zero dependencies) for hierarchical categories and correlation IDs
- **Singleton promise pattern**: Already exists for taxonomy cache; apply same pattern to prompt loading to prevent stampedes
- **Early validation**: Move image URL validation from tool execution to webhook ingress for better user feedback

**What NOT to add:**
- Deno KV (not available in Supabase Edge Functions)
- External logging services (Supabase dashboard sufficient for 30 users)
- Redis layer (Supabase DB already available, adds complexity)
- LLM hallucination detection APIs (overkill for URL verification)

### Expected Features

| Category | Table Stakes | Differentiators | Anti-Features |
|----------|--------------|-----------------|---------------|
| **Prompt Management** | Versioning, history, conflict detection, one-click rollback | Staged deployment, A/B testing, semantic conflict analysis | Per-agent customization, visual builder, AI auto-optimization |
| **Cache Management** | Status endpoint, manual invalidation, TTL config, hit/miss logging | Auto-invalidate on DB change, cache warming, version-tagged keys | Response caching, distributed sync, complex topology |
| **Error Handling** | Exponential backoff, error categorization, graceful user messaging | Circuit breaker, tiered fallbacks, dead letter queue, health endpoint | Infinite retries, silent failures, complex orchestration |
| **Observability** | Structured logging, correlation IDs, error rate tracking, latency tracking | Full request tracing, AI-specific metrics, dashboard/alerting | Full conversation logging, real-time streaming dashboards |

**Must have for v1.1:**
- Restore cache TTL (currently 0)
- Add correlation IDs to logs
- Implement prompt versioning
- Add health check endpoint

**Defer to v1.2+:**
- A/B testing (requires evaluation infrastructure)
- Dashboard/alerting (manual review sufficient for 30 users)
- Full request tracing (structured logging sufficient)

### Architecture Approach

The architecture changes are primarily **modifications to existing files**, not new components. The key insight from research is that SOPHIA's prompt system has a fundamental flaw: **both DB and files can define the same behavior with different instructions**, and priority conflicts cause the AI to follow unexpected rules.

**Major components to modify:**

1. **prompt-loader.ts** — Add version tracking, restore TTL, add cache invalidation support
2. **utils/logger.ts** — Add request context support, correlation IDs, error categorization
3. **index.ts** — Add admin endpoints (`/health`, `/admin/prompts/invalidate`), wire up logging context
4. **image-persistence.ts** — Add early validation before persistence
5. **sophia_prompts table** — Add `version`, `updated_by` columns; migrate `templates` content to DB

**Data flow change:**

Current: Image validation happens at tool execution time (late, bad UX)
Proposed: Image validation happens at webhook ingress (early, immediate user feedback)

### Critical Pitfalls

1. **Priority Conflict Blindness** — Same instruction in `safety_rules` (priority 20) and `document_routing` (priority 30) causes AI to follow unexpected rule. Prevention: ALWAYS grep ALL prompts before editing; document which prompt "owns" each behavior.

2. **Cache TTL at 0** — Currently disabled for "testing" (since January). Every request hits DB, and behavior differs between development and production. Prevention: Restore to 5 minutes with version-based invalidation BEFORE any other changes.

3. **Console.log Sprawl with PII Risk** — 563 console.log calls bypass structured logger; may leak agent phone numbers/data. Prevention: Audit and migrate to structured logger with PII redaction.

4. **DB/File Desync** — Updating DB prompt but forgetting file fallback (or vice versa) causes intermittent behavior. Prevention: Make DB single source of truth; files become disaster recovery only.

5. **Breaking Change Cascade** — "Simple" prompt edits break hidden dependencies for AI reasoning. Prevention: Test full interaction flow after any prompt change; never deploy without WhatsApp testing.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Logging Foundation
**Rationale:** All other phases benefit from better observability. Debugging cache, prompts, and validation issues requires correlated logs. This phase has lowest risk and highest value for subsequent work.
**Delivers:** Correlation IDs across request lifecycle, error categorization, structured logging migration
**Addresses:** Observability table stakes (correlation IDs, structured logging)
**Avoids:** Console.log sprawl pitfall, missing correlation IDs pitfall

### Phase 2: Cache Restoration
**Rationale:** The disabled cache (TTL=0) is a production blocker. Must be fixed before prompt changes, as testing prompts without cache creates false confidence.
**Delivers:** Restored 5-minute TTL with version-based invalidation, admin invalidation endpoint, cache status visibility
**Uses:** Version column in sophia_prompts, existing prompt-loader infrastructure
**Avoids:** Stale cache syndrome (via version checking), development cache confusion pitfall

### Phase 3: Prompt Consolidation
**Rationale:** Depends on stable cache. Prompt changes require cache invalidation to test effectively. This phase resolves the priority conflict architecture flaw.
**Delivers:** Single source of truth per behavior, templates migrated to DB, conflict detection tooling
**Implements:** Prompt system v2 architecture from ARCHITECTURE.md
**Avoids:** Priority conflict blindness, DB/file desync, prompt explosion pitfalls

### Phase 4: Validation Pipeline
**Rationale:** Highest risk phase, touches user-facing behavior. Requires logging (Phase 1) to debug issues, stable cache (Phase 2) for consistent behavior, and clean prompts (Phase 3) for predictable AI responses.
**Delivers:** Early image validation at webhook ingress, user-friendly error messages, simplified tool execution
**Addresses:** Error handling table stakes, image validation improvements
**Avoids:** Silent error swallowing, zombie operations, late validation pitfalls

### Phase Ordering Rationale

- **Logging first** because every other phase generates debugging scenarios. Without correlation IDs, tracing cache misses, prompt conflicts, or validation failures becomes guesswork.
- **Cache second** because testing prompt changes with TTL=0 gives false confidence; production will behave differently. Also reduces DB load for all subsequent testing.
- **Prompts third** because it's the root cause of the January callback bug and sets up clean behavior for validation testing.
- **Validation fourth** because it changes user-visible behavior and needs all debugging tools in place before launch.

### Research Flags

Phases with standard patterns (skip `/gsd:research-phase`):
- **Phase 1 (Logging):** Well-documented patterns; LogTape has excellent docs; correlation ID pattern is standard
- **Phase 2 (Cache):** Version-based invalidation is established pattern; singleton promise already exists in codebase

Phases that may need light research during planning:
- **Phase 3 (Prompts):** Need to audit all 8 prompt sections for overlap before consolidation; may discover unexpected dependencies
- **Phase 4 (Validation):** Early validation pattern is straightforward but needs careful user messaging design

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Recommendations based on existing codebase analysis; no new dependencies |
| Features | HIGH | Feature landscape well-researched with industry sources; appropriate scope for hardening |
| Architecture | HIGH | Direct codebase analysis with line numbers; clear modification paths |
| Pitfalls | HIGH | Pitfalls include SOPHIA-specific evidence from grep analysis and documented incidents |

**Overall confidence:** HIGH

### Gaps to Address

- **Prompt token budget:** Need to measure current prompt size (~10K estimated) and set explicit limits per section during Phase 3
- **Agent testing coordination:** Real agent phone numbers required for testing; need to identify test agent before Phase 4
- **Console.log audit scope:** 563 calls identified but severity (PII risk) not audited; prioritize high-traffic code paths

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of `supabase/functions/sophia-bot/` (file structure, line numbers)
- CLAUDE.md project documentation (prompt system architecture, known bugs)
- Current file state: `prompt-loader.ts` (cache disabled), `logger.ts` (existing structured logger)

### Secondary (MEDIUM confidence)
- [LogTape documentation](https://logtape.org/) — structured logging patterns
- [Deno @std/cache documentation](https://docs.deno.com/runtime/reference/std/cache/) — memoization patterns
- [LaunchDarkly Prompt Versioning](https://launchdarkly.com/blog/prompt-versioning-and-management/) — versioning best practices
- [n8n AI Agent Best Practices](https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/) — rollback requirements

### Tertiary (LOW confidence)
- Industry patterns for circuit breakers — may be overkill for 30-user system; evaluate during Phase 4 if needed

---
*Research completed: 2026-01-28*
*Ready for roadmap: yes*
