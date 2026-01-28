# Requirements: SOPHIA v1.1 Reliability & Hardening

**Defined:** 2026-01-28
**Core Value:** Agents can trust SOPHIA to do the right thing every time

## v1.1 Requirements

### Carried from v1.0

- [x] **LIST-06**: WhatsApp phone gallery images can be uploaded (not just URLs)

### Observability (Logging Foundation)

- [x] **LOG-01**: All requests have correlation ID that flows through entire pipeline
- [x] **LOG-02**: Structured logging with error categorization (info/warn/error/fatal)
- [x] **LOG-03**: Console.log calls migrated to structured logger (563 identified)
- [x] **LOG-04**: Error rate tracking visible in logs (count errors per hour/day)
- [x] **LOG-05**: PII redaction applied to all log output

### Cache Management

- [ ] **CACHE-01**: Prompt cache TTL restored to 5 minutes (currently 0)
- [ ] **CACHE-02**: Version-based cache invalidation (check version before using cache)
- [ ] **CACHE-03**: Admin endpoint to force cache invalidation (/admin/prompts/invalidate)
- [ ] **CACHE-04**: Cache hit/miss logging for debugging
- [ ] **CACHE-05**: Cache status endpoint (/admin/cache/status)

### Prompt System

- [ ] **PRMT-01**: All prompt sections have explicit owner (which file/table "owns" each behavior)
- [ ] **PRMT-02**: Conflict detection script identifies duplicate instructions across prompts
- [ ] **PRMT-03**: Prompt versioning with history (track changes over time)
- [ ] **PRMT-04**: One-click rollback to previous prompt version
- [ ] **PRMT-05**: `templates` content migrated from file-only to DB (single source of truth)

### Error Handling

- [ ] **ERR-01**: External API calls use exponential backoff (OpenRouter, Zyprus, WaSender)
- [ ] **ERR-02**: Errors categorized by type (network, auth, validation, AI, unknown)
- [ ] **ERR-03**: User-friendly error messages for common failures (not technical jargon)
- [ ] **ERR-04**: Health check endpoint (/health) for monitoring

### Image Validation

- [ ] **IMG-01**: Image URLs validated at webhook ingress (not at tool execution)
- [ ] **IMG-02**: Clear error message when image URL is invalid/hallucinated
- [ ] **IMG-03**: Validated images stored with correlation ID for debugging

## v2 Requirements (Deferred)

### Prompt Management
- Staged deployment (test prompts before production)
- A/B testing (compare prompt variations)
- Semantic conflict analysis (AI-powered conflict detection)

### Cache Management
- Auto-invalidate on DB change (trigger-based)
- Cache warming (pre-load prompts on deploy)

### Error Handling
- Circuit breaker pattern (auto-disable failing services)
- Tiered fallbacks (graceful degradation chain)
- Dead letter queue (retry failed operations)

### Observability
- Full request tracing (end-to-end spans)
- AI-specific metrics (token usage, latency by model)
- Dashboard/alerting (proactive monitoring)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-agent prompt customization | Adds complexity, not needed for 30 agents |
| Visual prompt builder | Overkill, DB editing sufficient |
| Real-time streaming dashboards | Manual review sufficient for scale |
| Distributed cache sync | Single Edge Function, not needed |
| External logging services | Supabase dashboard sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIST-06 | Phase 6 | Complete |
| LOG-01 | Phase 6 | Complete |
| LOG-02 | Phase 6 | Complete |
| LOG-03 | Phase 6 | Complete |
| LOG-04 | Phase 6 | Complete |
| LOG-05 | Phase 6 | Complete |
| CACHE-01 | Phase 7 | Pending |
| CACHE-02 | Phase 7 | Pending |
| CACHE-03 | Phase 7 | Pending |
| CACHE-04 | Phase 7 | Pending |
| CACHE-05 | Phase 7 | Pending |
| PRMT-01 | Phase 8 | Pending |
| PRMT-02 | Phase 8 | Pending |
| PRMT-03 | Phase 8 | Pending |
| PRMT-04 | Phase 8 | Pending |
| PRMT-05 | Phase 8 | Pending |
| ERR-01 | Phase 9 | Pending |
| ERR-02 | Phase 9 | Pending |
| ERR-03 | Phase 9 | Pending |
| ERR-04 | Phase 9 | Pending |
| IMG-01 | Phase 9 | Pending |
| IMG-02 | Phase 9 | Pending |
| IMG-03 | Phase 9 | Pending |

**Coverage:**
- v1.1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-01-28*
*Last updated: 2026-01-28 — Phase 6 requirements complete*
