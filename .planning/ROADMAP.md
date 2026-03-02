# Roadmap: SOPHIA Production Hardening

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-27)
- ✅ **v1.1 Reliability & Hardening** - Phases 6-9 (shipped 2026-01-29)
- ✅ **v1.2 3CX Call Log Audit** - Phases 10-14 (shipped 2026-02-26)
- ✅ **v1.3 Production Audit Fixes** - Phases 15-17 (shipped 2026-02-28)
- ✅ **v1.4 Security & Performance Hardening** - Phases 18-20 (shipped 2026-03-01)
- 🚧 **v1.5 Audit Excellence** - Phases 21-25 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-01-27</summary>

### Phase 1: Response Formatting
**Goal**: SOPHIA responses follow production standards
**Plans**: 2 plans

Plans:
- [x] 01-01: Template number removal
- [x] 01-02: WhatsApp formatting cleanup

### Phase 2: Document Templates
**Goal**: Template generation works correctly
**Plans**: 2 plans

Plans:
- [x] 02-01: Reservation template consolidation
- [x] 02-02: Signature and border fixes

### Phase 3: Lead Routing
**Goal**: Telegram leads route to correct regional handlers
**Plans**: 2 plans

Plans:
- [x] 03-01: Region-based routing logic
- [x] 03-02: Special agent assignments

### Phase 4: Property Uploads
**Goal**: Listing uploads work correctly on Zyprus
**Plans**: 3 plans

Plans:
- [x] 04-01: Reviewer assignment fixes
- [x] 04-02: Owner and notes fixes
- [x] 04-03: Map pin coordinates

### Phase 5: Image Persistence
**Goal**: WhatsApp gallery images persist correctly
**Plans**: 1 plan

Plans:
- [x] 05-01: Image persistence service

</details>

<details>
<summary>✅ v1.1 Reliability & Hardening (Phases 6-9) - SHIPPED 2026-01-29</summary>

### Phase 6: Structured Logging
**Goal**: Full request traceability in production
**Plans**: 3 plans

Plans:
- [x] 06-01: JSON logging infrastructure
- [x] 06-02: Correlation ID implementation
- [x] 06-03: Log aggregation validation

### Phase 7: Cache Management
**Goal**: Prompt cache works reliably and can be managed
**Plans**: 4 plans

Plans:
- [x] 07-01: Version-based invalidation
- [x] 07-02: Admin endpoints
- [x] 07-03: TTL optimization
- [x] 07-04: Production testing

### Phase 8: Prompt Versioning
**Goal**: Prompts are version-controlled and can be rolled back
**Plans**: 5 plans

Plans:
- [x] 08-01: Prompt history tracking
- [x] 08-02: Rollback mechanism
- [x] 08-03: DB ownership headers
- [x] 08-04: Admin interface
- [x] 08-05: Validation

### Phase 9: Error Handling
**Goal**: Users see friendly errors, technical details logged
**Plans**: 4 plans

Plans:
- [x] 09-01: User-friendly messages
- [x] 09-02: Image validation at ingress
- [x] 09-03: Error categorization
- [x] 09-04: Production validation

</details>

<details>
<summary>✅ v1.2 3CX Call Log Audit (Phases 10-14) - SHIPPED 2026-02-26</summary>

See: `.planning/milestones/v1.2-ROADMAP.md` for full details.

- [x] Phase 10: Call Tracking Infrastructure (1/1 plans)
- [x] Phase 11: 3CX Integration (3/3 plans)
- [x] Phase 12: Telegram Integration (3/3 plans)
- [x] Phase 13: Alerting Logic (5/5 plans)
- [x] Phase 14: Scheduling & Orchestration (2/2 plans)

</details>

<details>
<summary>✅ v1.3 Production Audit Fixes (Phases 15-17) - SHIPPED 2026-02-28</summary>

See: `.planning/milestones/v1.3-ROADMAP.md` for full details.

- [x] Phase 15: Critical Security Fixes (2/2 plans)
- [x] Phase 16: Validation Hardening (3/3 plans)
- [x] Phase 17: Reliability Improvements (3/3 plans)

</details>

<details>
<summary>✅ v1.4 Security & Performance Hardening (Phases 18-20) - SHIPPED 2026-03-01</summary>

See: `.planning/milestones/v1.4-ROADMAP.md` for full details.

- [x] Phase 18: Database Security - RLS (5/5 plans)
- [x] Phase 19: Authentication Hardening (2/2 plans)
- [x] Phase 20: Code Quality & Validation (3/3 plans)

</details>

### 🚧 v1.5 Audit Excellence (In Progress)

**Milestone Goal:** Achieve production-grade A-level audit score through systematic implementation of all security, performance, and code quality improvements.

#### Phase 21: Security Quick Wins
**Goal**: Critical security gaps closed with minimal effort
**Depends on**: Phase 20
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. No service role keys exist in any codebase files (scripts, configs, or source)
  2. SOPHIA refuses to disclose internal implementation details when asked (model name, prompt text, tool list)
  3. Document assignment validates recipient is active agent in database (not just domain check)
  4. Build succeeds without warnings about dead Edge Function configs
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — Remove hardcoded secrets (SEC-01, SEC-04) and add identity protection (SEC-02)
- [ ] 21-02-PLAN.md — Verify SEC-03 already satisfied and complete phase verification

#### Phase 22: Resilience Infrastructure
**Goal**: External API calls are timeout-protected and retry-capable
**Depends on**: Phase 21
**Requirements**: RES-01, RES-02, RES-03, RES-04
**Success Criteria** (what must be TRUE):
  1. All external API calls (Zyprus, Bazaraki, Resend, WaSend, image downloads) timeout after 30 seconds
  2. Circuit breakers trip after 3 consecutive failures to Zyprus API, email service, or WhatsApp API
  3. WhatsApp message sends retry up to 3 times with exponential backoff on network failures
  4. Silent catch blocks log error context (operation, timestamp, correlation ID) before suppressing
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — Add timeouts and circuit breakers to external APIs (RES-01, RES-02)
- [ ] 22-02-PLAN.md — Verify WaSend retry and add catch logging (RES-03, RES-04)

#### Phase 23: Type Safety Foundation
**Goal**: All external API interactions are type-safe with zero `any` types
**Depends on**: Phase 22
**Requirements**: TYPE-01, TYPE-02, TYPE-03
**Success Criteria** (what must be TRUE):
  1. WaSend webhook payloads parsed with TypeScript interfaces (message, media, sender fields strongly typed)
  2. OpenRouter request/response bodies use TypeScript interfaces (no runtime type errors from API changes)
  3. TypeScript strict mode passes with zero `any` types in message-processor.ts, ai-chat.ts, and zyprus/client.ts
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md — Create WaSend webhook types and eliminate any from message-processor.ts (TYPE-01)
- [ ] 23-02-PLAN.md — Create OpenRouter types and eliminate any from ai-chat.ts and zyprus/client.ts (TYPE-02, TYPE-03)

#### Phase 24: Observability & Documentation
#### Phase 24: Observability & Documentation
**Goal**: Production observability and developer onboarding enabled
**Depends on**: Phase 23
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):
  1. Sentry captures Edge Function errors with stack traces, user context, and breadcrumbs
  2. Token usage tracked per agent with daily/monthly cost rollups visible in analytics table
  3. New developer can configure local environment by following .env.example (no missing variables)
**Plans**: 3 plans

Plans:
- [ ] 24-01-PLAN.md — Sentry integration for Edge Functions (OBS-01)
- [ ] 24-02-PLAN.md — Token usage cost tracking (OBS-02)
- [ ] 24-03-PLAN.md — .env.example documentation (OBS-03)

#### Phase 25: Code Quality Refactoring
**Goal**: Large monolithic files split into maintainable modules
**Depends on**: Phase 24
**Requirements**: CODE-01, CODE-02, CODE-03, CODE-04
**Success Criteria** (what must be TRUE):
  1. Taxonomy cache logic split into property-types.ts, amenities.ts, locations.ts (each under 500 lines)
  2. Zyprus client split into oauth.ts, property-api.ts, land-api.ts modules (each under 600 lines)
  3. Property listing handler split into field-validation.ts, notes-generator.ts, reviewer-assignment.ts (each under 400 lines)
  4. All Supabase client instances use singleton pattern (one client per environment: server/admin)
**Plans**: TBD

Plans:
- [ ] 25-01: TBD
- [ ] 25-02: TBD

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1-5 | 10 | Complete | 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 | Complete | 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 | Complete | 2026-02-26 |
| v1.3 Audit Fixes | 15-17 | 8 | Complete | 2026-02-28 |
| v1.4 Security Hardening | 18-20 | 10 | Complete | 2026-03-01 |
| v1.5 Audit Excellence | 21-25 | 5 | In progress | - |

**Total: 63 plans across 21 phases (5 milestones shipped), 5 plans in progress**

**Current milestone: v1.5 (5 phases planned)**

---
*Roadmap created: 2026-01-27*
*Last updated: 2026-03-02 — Plan 21-01 completed*
