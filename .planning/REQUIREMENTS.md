# Requirements: SOPHIA Production Audit Fixes

**Defined:** 2026-02-27
**Core Value:** Agents can trust SOPHIA to do the right thing every time
**Source:** Sophia-Code-Review-Report.docx (Cowork audit, Feb 27 2026)

## v1.3 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Critical Security

- [x] **SEC-01**: Password hash column expanded from `varchar(64)` to `varchar(255)` to prevent bcrypt truncation (WA-001)
- [x] **SEC-02**: Chat creation uses `INSERT ON CONFLICT` or transaction to prevent race condition duplicates (WA-003)

### Security Fixes

- [x] **SEC-03**: Listing notifier reads Zyprus API URL from environment variable instead of hardcoded `dev9.zyprus.com` (EF-003)
- [ ] **SEC-04**: Tool arguments validated with Zod schemas before execution in tool executor (EF-004)
- [ ] **SEC-05**: All search queries audited; raw SQL fragments replaced with parameterized queries (WA-005)
- [ ] **SEC-06**: Admin prompt update endpoints reject content exceeding 50KB with 413 response (WA-006)
- [x] **SEC-07**: Registration returns identical response regardless of whether email exists (WA-008)

### Reliability Fixes

- [ ] **REL-01**: Prompt cache uses loading promise pattern (single inflight request) to prevent concurrent DB calls (EF-005)
- [ ] **REL-02**: File upload endpoints enforce per-user rate limiting (WA-007)
- [ ] **REL-03**: Data export queries use JOINs or batch loading instead of N+1 pattern (WA-009)

## v1.4 Requirements (Deferred)

Medium-severity issues from the same audit. Tracked for next milestone.

### Code Quality

- **EF-008**: Per-tool rate limiting with sliding window counters
- **EF-009**: OAuth token validation in Zyprus client before caching
- **EF-010**: AbortController timeout on external image downloads
- **WA-010**: CSRF protection on all state-changing API routes
- **WA-011**: Generic error messages in production (no stack traces)
- **WA-012**: Maximum page size enforcement on all query endpoints
- **WA-013**: Shared logic consolidated into `_shared/` module
- **WA-014**: Hardcoded UUIDs moved to config file or database

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full code deduplication (WA-013) | Refactoring — not a security fix, deferred to v1.4 |
| Health endpoint auth (EF-006) | Standard pattern, low risk |
| Image download timeouts (EF-010) | Medium severity, deferred |
| CSRF protection (WA-010) | Medium severity, Next.js handles most cases |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 15 | Done |
| SEC-02 | Phase 15 | Done |
| SEC-03 | Phase 15 | Done |
| SEC-04 | Phase 16 | Pending |
| SEC-05 | Phase 16 | Pending |
| SEC-06 | Phase 16 | Pending |
| SEC-07 | Phase 15 | Done |
| REL-01 | Phase 17 | Pending |
| REL-02 | Phase 17 | Pending |
| REL-03 | Phase 17 | Pending |

**Coverage:**
- v1.3 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after initial definition*
