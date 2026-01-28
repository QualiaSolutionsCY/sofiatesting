# Pitfalls Research: Reliability Hardening

**Project:** SOPHIA Production Hardening v1.1
**Domain:** AI assistant reliability hardening for production WhatsApp bot
**Researched:** 2026-01-28
**Confidence:** HIGH (based on codebase analysis + industry patterns)

## Executive Summary

Reliability hardening for production AI systems is fraught with hidden traps. The most dangerous pitfall is **"improving" things that already work** — introducing new bugs while fixing perceived issues. SOPHIA is a production system serving 30 agents; any change risks breaking existing functionality.

This research covers four categories of pitfalls specific to hardening work:
1. **Prompt Management** — Over-engineering, breaking changes, priority conflicts
2. **Caching** — Stale data, invalidation bugs, cache stampedes
3. **Error Handling** — Swallowing errors, retry storms, cascading failures
4. **Logging** — PII exposure, signal-to-noise ratio, debugging blindness

Each pitfall includes warning signs, prevention strategies, and which phase should address it.

---

## Prompt Management Pitfalls

| Pitfall | Warning Signs | Prevention | Phase |
|---------|---------------|------------|-------|
| **Priority Conflict Blindness** — Same instruction in multiple prompts, AI follows lowest priority number (not the one you just edited) | Changes don't take effect; AI behavior contradicts recent edits; "I just updated that!" frustration | ALWAYS `grep` ALL prompts for keywords before editing. Search DB AND files. Document which prompt "owns" each behavior. | PRMT-01, PRMT-02 |
| **DB/File Desync** — Updating DB prompt but forgetting the file fallback (or vice versa), causing inconsistent behavior when DB fails | Intermittent behavior changes; "works sometimes"; different behavior after DB timeout | Update BOTH DB and files atomically. Create checklist enforcing dual updates. Consider removing file fallbacks entirely. | PRMT-02 |
| **Prompt Explosion** — Creating new prompt sections instead of consolidating, leading to unmaintainable sprawl | Many small prompt files; unclear where to make changes; instructions repeated with variations | Consolidate to ~5 canonical sections. Each behavior lives in ONE place. Use includes/references, not duplication. | PRMT-01 |
| **Template Instruction Bleeding** — Template-specific instructions leaking into general prompts, affecting all interactions | SOPHIA mentions reservation fields during property upload; template logic appears in non-template contexts | Isolate template instructions in `templates` section. Use conditional phrasing: "When user requests [template type]..." | PRMT-03 |
| **Breaking Change Cascade** — Editing "simple" prompt text that contains hidden dependencies for AI reasoning | AI stops using tools correctly; field collection flow breaks; unintended behavior changes | Never edit prompts without testing full interaction flow. Use staging/testing with real messages before production. | All PRMT phases |
| **Over-Specification Trap** — Adding so many rules that AI becomes confused or prioritizes wrong rules | AI follows obscure rules over obvious ones; rigid behavior; "I told it to do X but it did Y" | Prefer principles over prescriptions. Delete rules that duplicate common sense. Test with edge cases. | PRMT-01, PRMT-03 |
| **Context Window Bloat** — Prompts grow until they consume most of the context window, leaving less room for conversation | Long conversations fail; AI "forgets" early context; performance degradation | Monitor prompt token count. Set budget per section. Prune aggressively. Current SOPHIA prompt is ~10K tokens — watch this. | PRMT-01 |

### SOPHIA-Specific Prompt Pitfalls

From codebase analysis, SOPHIA has these specific risks:

| Pitfall | Current Evidence | Risk Level |
|---------|------------------|------------|
| Priority conflicts between `safety_rules` (20) and `document_routing` (30) | Documented in CLAUDE.md — callback field collection conflict existed | HIGH — already caused bugs |
| Cache TTL at 0 for "testing" | Line 16 of `prompt-loader.ts`: `const CACHE_TTL_MS = 0;` | MEDIUM — must re-enable before production |
| 8 prompt sections with potential overlap | `orderedKeys` in loader lists identity, safety_rules, document_routing, property_upload, response_format, calculators, cyprus_knowledge, templates | MEDIUM — consolidation needed |

---

## Caching Pitfalls

| Pitfall | Warning Signs | Prevention | Phase |
|---------|---------------|------------|-------|
| **Stale Cache Syndrome** — Serving outdated data long after source changed | Changes take minutes/hours to appear; "I updated it!" frustration; inconsistent behavior across users | Reduce TTL for actively-developed features. Implement cache invalidation endpoint. Add cache version headers. | CACHE-01, CACHE-02 |
| **Cache Stampede** — All instances simultaneously expire cache and hit database | DB latency spikes at TTL boundary; increased error rates every N minutes; load patterns match cache TTL | Implement jitter (random TTL variation). Use singleton promise pattern (SOPHIA already has this for taxonomy). Add stale-while-revalidate. | CACHE-01 |
| **Phantom Cache Hits** — Caching error responses or empty results | Errors persist after fix deployed; users see old errors; "ghost" bugs | Only cache successful responses. Validate data before caching. Set shorter TTL for edge cases. | CACHE-03 |
| **Invalidation Coupling** — Invalidating one cache requires invalidating others (taxonomy depends on prompts, etc.) | Partial updates; some features use new data, others use old; inconsistent state | Map cache dependencies. Create coordinated invalidation. Consider single "config version" that invalidates all. | CACHE-02 |
| **Memory Leak via Cache Growth** — In-memory caches grow unbounded in long-running processes | Memory usage grows over time; Edge Function restarts; OOM errors | Implement LRU eviction. Set max cache size. Clear caches on version deploy. Edge Functions restart often — less risk here. | CACHE-03 |
| **Cache Key Collisions** — Different data cached under same key (e.g., user-specific data cached globally) | Users see each other's data; agent A sees agent B's context; security breach | Include user/session identifiers in cache keys. Audit all cache keys for uniqueness. | CACHE-03 |
| **Development Cache Confusion** — Forgetting cache is disabled during development, then surprised when production behaves differently | "Works on my machine"; development behaves differently than production; unexpected latency after deploy | Always test with cache enabled before deploy. Add cache status to logs. Create "production-like" testing mode. | CACHE-03 |

### SOPHIA-Specific Caching Pitfalls

| Pitfall | Current Evidence | Risk Level |
|---------|------------------|------------|
| Cache disabled (TTL=0) | `CACHE_TTL_MS = 0` in prompt-loader.ts | HIGH — must fix before production |
| Two separate caches (prompts + taxonomy) | `prompt-loader.ts` and `taxonomy-cache.ts` with different TTLs | MEDIUM — need coordinated strategy |
| No cache invalidation endpoint | `invalidateCache()` exists but no HTTP trigger | MEDIUM — admin can't force refresh |
| Stampede protection exists for taxonomy | Lines 74-76: `taxonomyLoadPromise` singleton pattern | LOW — good pattern, apply to prompts |

---

## Error Handling Pitfalls

| Pitfall | Warning Signs | Prevention | Phase |
|---------|---------------|------------|-------|
| **Silent Error Swallowing** — Catching exceptions and logging but not surfacing to user | Operations fail silently; users confused why nothing happened; "it just stopped" reports | Always return error messages to user. Distinguish recoverable vs fatal errors. Never catch-and-ignore. | REL-02 |
| **Retry Storm** — Aggressive retries overwhelming already-stressed service | Latency spikes during outages; 10x traffic during failures; cascading failures | Implement exponential backoff with jitter. Set retry limits (max 3). Use circuit breaker pattern. | REL-02 |
| **Error Message Exposure** — Leaking internal error details (stack traces, paths, secrets) to users | Users see raw error messages; debugging info in WhatsApp; potential security breach | Sanitize all user-facing errors. Map internal errors to user-friendly messages. Log details internally only. | REL-02, REL-03 |
| **Cascading Failure** — One component failure (e.g., taxonomy API) brings down entire system | Total outage from partial failure; single dependency becomes SPOF; no graceful degradation | Implement fallbacks for every external dependency. SOPHIA already has hardcoded fallback UUIDs — good pattern. | REL-02 |
| **Retry Without Backoff** — Immediate retries without delay creating thundering herd | Server load spikes; rate limit hits; API bans | Always use exponential backoff. Start at 100ms, cap at 30s. Add jitter (randomness) to prevent synchronized retries. | REL-02 |
| **Fail-Open Security** — Treating errors as "allow" when they should be "deny" | Rate limit bypass during DB errors; auth bypass during failures; security holes | Fail closed for security-critical paths. SOPHIA's rate limiter already does this correctly. | REL-01 |
| **Error Conflation** — Treating all errors the same (retryable vs fatal vs user-error) | Retrying user errors; giving up on transient failures; poor recovery | Classify errors: 4xx = user error (don't retry), 5xx = server error (retry), network = transient (retry with backoff) | REL-02 |
| **Zombie Operations** — Operations that appear to succeed but actually failed | Data inconsistency; user thinks action completed; eventual failures | Verify operation success. Check response status. Use idempotency keys for critical operations. | REL-01 |

### SOPHIA-Specific Error Handling Pitfalls

| Pitfall | Current Evidence | Risk Level |
|---------|------------------|------------|
| Good fallback pattern for rate limiting | `rate-limiter.ts` has in-memory fallback + fail-closed after 3 DB errors | LOW — good pattern |
| Good fallback pattern for taxonomy | Hardcoded fallback UUIDs throughout `taxonomy-cache.ts` | LOW — already implemented |
| 267 try/catch blocks in sophia-bot | Grep shows widespread error handling | MEDIUM — need to audit for silent swallowing |
| No circuit breaker for external APIs | OpenRouter, WaSender, Zyprus API calls lack circuit breaker | MEDIUM — should add for reliability |

---

## Logging Pitfalls

| Pitfall | Warning Signs | Prevention | Phase |
|---------|---------------|------------|-------|
| **PII Leakage** — Logging phone numbers, emails, personal data in plain text | GDPR/privacy violations; security audit failures; data breach risk | SOPHIA already has PII redaction in `logger.ts` — verify it's used everywhere. Audit all `console.log` calls. | REL-03 |
| **Log Volume Explosion** — Verbose logging that overwhelms storage and makes finding issues impossible | Huge log files; high storage costs; grep takes forever; signal lost in noise | Use log levels correctly (DEBUG vs INFO vs ERROR). Don't log every request in production. Sample high-volume events. | REL-03 |
| **Insufficient Context** — Logs that don't include enough information to debug issues | "Error occurred" with no context; can't reproduce issues; need to add more logging and redeploy | Always include operation, user ID (redacted), and relevant parameters. Use structured logging. | REL-03 |
| **Missing Correlation IDs** — No way to trace a request across multiple log entries | Can't follow request flow; debugging requires timestamp matching; multi-service debugging impossible | Add message/request ID to all log entries. Pass correlation ID through entire request lifecycle. | REL-03 |
| **Production Debug Logging** — Debug-level logging enabled in production | Performance degradation; log storage explosion; sensitive data exposure | Set log level via environment variable. Default to INFO in production. SOPHIA does this correctly in `logger.ts`. | REL-03 |
| **Console.log Sprawl** — Using `console.log` instead of structured logger | Inconsistent log format; missing timestamps; no PII redaction; can't filter by level | Audit all `console.log` calls. Replace with `logger.info/error/warn`. SOPHIA has 563+ console calls — need migration. | REL-03 |
| **Stack Trace Exposure** — Full stack traces in logs revealing system internals | Security vulnerability; implementation details exposed; path disclosure | Sanitize stack traces in production. Log reference ID instead of full trace. Keep full trace in separate secure log. | REL-03 |
| **Log-Only Error Handling** — Logging errors but not acting on them | Issues detected but never fixed; pattern of recurring errors; reactive firefighting | Pair logging with alerts. Track error rates. Set up anomaly detection on error counts. | REL-03 |

### SOPHIA-Specific Logging Pitfalls

| Pitfall | Current Evidence | Risk Level |
|---------|------------------|------------|
| Good structured logger exists | `logger.ts` with PII redaction, log levels, JSON output | LOW — infrastructure exists |
| 563 console.log calls in sophia-bot | Grep shows widespread raw console usage | HIGH — need to migrate to structured logger |
| Redaction patterns need audit | Current regex for phone/email may miss edge cases | MEDIUM — verify patterns |
| No correlation ID across requests | Log entries hard to trace through request flow | MEDIUM — add message ID |

---

## Integration Pitfalls

| Pitfall | Warning Signs | Prevention | Phase |
|---------|---------------|------------|-------|
| **Backwards Incompatibility** — Changes break existing functionality for current users | "It was working yesterday"; agent complaints; regression bugs | Always deploy behind feature flags. Test with real agent phone numbers. Have instant rollback capability. | All phases |
| **Testing in Production** — Skipping staging and testing directly on production | Real agent disruption; embarrassing errors; data corruption | Create staging flow (separate phone number). Test every change before production deploy. | All phases |
| **Webhook Idempotency Failure** — Same message processed multiple times | Duplicate responses; duplicate uploads; confused users | Verify `processed_messages` table is working. Add idempotency keys to critical operations. Already exists but needs verification. | REL-01 |
| **API Contract Drift** — External APIs (WaSender, Zyprus, OpenRouter) change without notice | Sudden failures; format errors; authentication issues | Pin API versions where possible. Monitor for deprecation notices. Have fallback for critical operations. | REL-02 |
| **Secret Rotation Chaos** — Rotating secrets without coordination | Auth failures after rotation; downtime; manual intervention needed | Document all secrets and their rotation procedures. Test rotation in staging first. | REL-02 |
| **Edge Function Cold Starts** — First request after idle period is slow | Occasional slow responses; users think system is broken | Accept as Deno limitation. Ensure graceful timeout handling. Consider keep-alive pings. | REL-02 |
| **Database Connection Pooling** — Too many connections or connection leaks | Database connection errors; intermittent failures; "max connections" errors | Supabase handles pooling. Use single client instance per request. Don't create clients in loops. | REL-01 |
| **Multi-Phase Deployment Gaps** — Deploying phase N before phase N-1 is verified complete | Inconsistent state; partial features; debugging nightmares | Complete each phase fully before starting next. Don't parallelize related phases. | All phases |

### SOPHIA-Specific Integration Pitfalls

| Pitfall | Current Evidence | Risk Level |
|---------|------------------|------------|
| Webhook dedup exists but needs verification | `processed_messages` table mentioned but needs load testing | MEDIUM — REL-01 target |
| External API dependencies | WaSender, OpenRouter, Zyprus API, Supabase — 4 external deps | MEDIUM — any could cause outage |
| Testing with real agents required | Per CLAUDE.md: "Test phone numbers must match registered agents in `agents` table" | MEDIUM — careful coordination needed |

---

## Phase Mapping

### Phase: PRMT (Prompt System)

| Pitfall | Priority | Mitigation in Phase |
|---------|----------|---------------------|
| Priority Conflict Blindness | P0 | Create single source of truth per behavior |
| DB/File Desync | P0 | Either remove fallbacks or automate sync |
| Prompt Explosion | P1 | Consolidate from 8 to ~5 sections |
| Context Window Bloat | P2 | Set token budget, measure current usage |

### Phase: IMG (Image Handling)

| Pitfall | Priority | Mitigation in Phase |
|---------|----------|---------------------|
| Silent Error Swallowing | P0 | Return clear error messages to user |
| Zombie Operations | P1 | Verify upload success, validate URLs |
| Error Message Exposure | P1 | Sanitize technical errors for user |

### Phase: CACHE (Cache Management)

| Pitfall | Priority | Mitigation in Phase |
|---------|----------|---------------------|
| Stale Cache Syndrome | P0 | Reduce TTL to 1 minute |
| Development Cache Confusion | P0 | Re-enable cache (currently at 0) |
| No Invalidation Endpoint | P1 | Add admin-accessible cache clear |
| Cache Stampede | P2 | Apply singleton promise pattern to prompts |

### Phase: REL (System Reliability)

| Pitfall | Priority | Mitigation in Phase |
|---------|----------|---------------------|
| Console.log Sprawl | P0 | Migrate to structured logger |
| Webhook Idempotency Failure | P0 | Verify dedup under load |
| Missing Correlation IDs | P1 | Add message ID to all logs |
| API Contract Drift | P2 | Add monitoring for external API health |

---

## Critical Path Pitfalls

These pitfalls could cause production outages or data loss if not addressed:

1. **Cache TTL at 0** — Currently disabled, must re-enable before any production deploy
2. **DB/File Desync** — Conflicting instructions cause unpredictable AI behavior
3. **Console.log with PII** — 563 unaudited console calls may leak agent data
4. **Webhook Dedup Unverified** — Duplicate processing could cause duplicate uploads/documents

## Pre-Deploy Checklist (From Pitfalls)

Before any reliability hardening deploy:

- [ ] Cache TTL restored to production value (5 minutes or 1 minute, not 0)
- [ ] All prompts searched for conflicts (DB and files)
- [ ] Console.log calls audited for PII
- [ ] Tested with real agent phone number from `agents` table
- [ ] Rollback plan documented (previous Edge Function version)
- [ ] Webhook dedup verified working

---

## Sources

- [AI Agents: Reliability Challenges & Proven Solutions](https://www.edstellar.com/blog/ai-agent-reliability-challenges)
- [Common AI Agent Development Mistakes](https://www.wildnetedge.com/blogs/common-ai-agent-development-mistakes-and-how-to-avoid-them)
- [Prompt Versioning Best Practices](https://latitude-blog.ghost.io/blog/prompt-versioning-best-practices/)
- [Prompt Versioning & Management Guide](https://launchdarkly.com/blog/prompt-versioning-and-management/)
- [Cache Invalidation Nightmare](https://triotechsystems.com/the-cache-invalidation-nightmare-what-youre-likely-doing-wrong/)
- [Mastering Caching: Strategies, Patterns & Pitfalls](https://bool.dev/blog/detail/mastering-caching-strategies-patterns-pitfalls)
- [Retry Storms: What They Are and How to Deal With Them](https://bytesizeddesign.substack.com/p/understanding-retry-storms-what-they)
- [Building Resilient Systems: Circuit Breakers and Retry Patterns](https://dasroot.net/posts/2026/01/building-resilient-systems-circuit-breakers-retry-patterns/)
- [How to Keep Sensitive Data Out of Your Logs](https://www.skyflow.com/post/how-to-keep-sensitive-data-out-of-your-logs-nine-best-practices)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [API Backwards Compatibility Best Practices](https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices)

---

*Research completed: 2026-01-28*
