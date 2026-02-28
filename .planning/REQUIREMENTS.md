# Requirements: SOPHIA Production Hardening

**Defined:** 2026-03-01
**Core Value:** Agents can trust SOPHIA to do the right thing every time

## v1.4 Requirements

Requirements for v1.4 Security & Performance Hardening milestone. Each maps to roadmap phases.

### Database Security (Row Level Security)

- [ ] **RLS-01**: Enable RLS on Chat table with user-scoped policies
- [ ] **RLS-02**: Enable RLS on User table with self-access policies
- [ ] **RLS-03**: Enable RLS on Message table with chat ownership policies
- [ ] **RLS-04**: Enable RLS on Vote table with user-scoped policies
- [ ] **RLS-05**: Enable RLS on Suggestion table with user-scoped policies
- [ ] **RLS-06**: Enable RLS on Document table with user-scoped policies
- [ ] **RLS-07**: Enable RLS on ZyprusAgent table with agent-scoped policies
- [ ] **RLS-08**: Enable RLS on AgentChatSession table with agent-scoped policies
- [ ] **RLS-09**: Enable RLS on PropertyListing table with agent/admin-scoped policies
- [ ] **RLS-10**: Enable RLS on LandListing table with agent/admin-scoped policies
- [ ] **RLS-11**: Enable RLS on AdminAuditLog table with admin-only policies
- [ ] **RLS-12**: Enable RLS on AdminUserRole table with admin-only policies
- [ ] **RLS-13**: Enable RLS on AgentExecutionLog table with admin-only policies
- [ ] **RLS-14**: Enable RLS on WhatsAppConversation table with agent-scoped policies
- [ ] **RLS-15**: Enable RLS on DocumentSend table with user-scoped policies
- [ ] **RLS-16**: Enable RLS on ListingUploadAttempt table with agent-scoped policies
- [ ] **RLS-17**: Add policies for telegram_group_messages and audit_alerts tables (currently RLS enabled but no policies)

### Authentication & Authorization

- [ ] **AUTH-01**: Add "server-only" import to lib/storage/upload-file.ts
- [ ] **AUTH-02**: Add auth checks to saveChatModelAsCookie server action
- [ ] **AUTH-03**: Add auth checks to generateTitleFromUserMessage server action
- [ ] **AUTH-04**: Add auth checks to deleteTrailingMessages server action
- [ ] **AUTH-05**: Add auth checks to updateChatVisibility server action

### Code Quality & Validation

- [ ] **CODE-01**: Replace console.log statements with structured logging (42 total)
- [ ] **CODE-02**: Add Zod schemas to admin agent endpoints (POST /api/admin/agents)
- [ ] **CODE-03**: Add Zod schemas to admin agent update endpoints (PUT /api/admin/agents/[id])
- [ ] **CODE-04**: Add Zod schemas to user delete endpoint confirmation
- [ ] **CODE-05**: Add Zod schemas to server actions in app/(chat)/actions.ts
- [ ] **CODE-06**: Audit and clean up debug statements in insert_templates.ts

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Performance & UX

- **PERF-01**: Add loading.tsx files to all data-fetching routes (16 pages)
- **PERF-02**: Code-split Monaco editor with next/dynamic (save ~5MB initial bundle)
- **PERF-03**: Lazy-load admin charts (save ~300KB for non-admin users)
- **PERF-04**: Fix N+1 queries in admin dashboard (reduce from 3→1 query)

### Advanced Security

- **SEC-01**: Implement CSRF protection for admin endpoints
- **SEC-02**: Add per-tool rate limiting beyond file uploads
- **SEC-03**: Add pagination limits to prevent large data exports
- **SEC-04**: Replace hardcoded UUIDs with configuration

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Performance optimizations | Deferred to v2 - focus on security first |
| Loading states for all pages | User experience improvement, not security critical |
| Code splitting optimizations | Bundle size optimization, not security critical |
| Circuit breaker patterns | Over-engineering for current scale |
| External monitoring services | Current logging sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RLS-01 | Phase 18 | Pending |
| RLS-02 | Phase 18 | Pending |
| RLS-03 | Phase 18 | Pending |
| RLS-04 | Phase 18 | Pending |
| RLS-05 | Phase 18 | Pending |
| RLS-06 | Phase 18 | Pending |
| RLS-07 | Phase 18 | Pending |
| RLS-08 | Phase 18 | Pending |
| RLS-09 | Phase 18 | Pending |
| RLS-10 | Phase 18 | Pending |
| RLS-11 | Phase 18 | Pending |
| RLS-12 | Phase 18 | Pending |
| RLS-13 | Phase 18 | Pending |
| RLS-14 | Phase 18 | Pending |
| RLS-15 | Phase 18 | Pending |
| RLS-16 | Phase 18 | Pending |
| RLS-17 | Phase 18 | Pending |
| AUTH-01 | Phase 19 | Pending |
| AUTH-02 | Phase 19 | Pending |
| AUTH-03 | Phase 19 | Pending |
| AUTH-04 | Phase 19 | Pending |
| AUTH-05 | Phase 19 | Pending |
| CODE-01 | Phase 20 | Pending |
| CODE-02 | Phase 20 | Pending |
| CODE-03 | Phase 20 | Pending |
| CODE-04 | Phase 20 | Pending |
| CODE-05 | Phase 20 | Pending |
| CODE-06 | Phase 20 | Pending |

**Coverage:**
- v1.4 requirements: 28 total
- Mapped to phases: 28 (100% coverage ✓)
- Unmapped: 0

**Phase Distribution:**
- Phase 18 (Database Security): 17 requirements
- Phase 19 (Authentication Hardening): 5 requirements
- Phase 20 (Code Quality): 6 requirements

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after v1.4 roadmap created — 100% coverage achieved*
