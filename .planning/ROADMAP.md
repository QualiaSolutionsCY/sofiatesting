# Roadmap: SOPHIA Production Hardening

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-27)
- ✅ **v1.1 Reliability & Hardening** - Phases 6-9 (shipped 2026-01-29)
- ✅ **v1.2 3CX Call Log Audit** - Phases 10-14 (shipped 2026-02-26)
- ✅ **v1.3 Production Audit Fixes** - Phases 15-17 (shipped 2026-02-28)
- 🚧 **v1.4 Security & Performance Hardening** - Phases 18-20 (in progress)

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

### 🚧 v1.4 Security & Performance Hardening (In Progress)

**Milestone Goal:** Fix all medium-severity audit findings — RLS policies, service role protection, auth hardening, and code quality improvements.

#### Phase 18: Database Security (RLS)
**Goal**: All core tables protected with Row Level Security policies
**Depends on**: Nothing (independent security work)
**Requirements**: RLS-01, RLS-02, RLS-03, RLS-04, RLS-05, RLS-06, RLS-07, RLS-08, RLS-09, RLS-10, RLS-11, RLS-12, RLS-13, RLS-14, RLS-15, RLS-16, RLS-17
**Success Criteria** (what must be TRUE):
  1. All 17 core tables have RLS enabled and functional policies
  2. Users can only access their own data (Chat, User, Message, Vote, Suggestion, Document)
  3. Agents can only access their own sessions and listings (ZyprusAgent, AgentChatSession, PropertyListing, LandListing, WhatsAppConversation, ListingUploadAttempt)
  4. Admin tables require admin role (AdminAuditLog, AdminUserRole, AgentExecutionLog)
  5. Orphaned tables (telegram_group_messages, audit_alerts) have appropriate policies created
**Plans**: 5 plans in 2 waves

Plans:
- [ ] 18-01-PLAN.md — RLS policies for web app user tables (Chat, User, Message, Vote, Suggestion, Document)
- [ ] 18-02-PLAN.md — RLS policies for agent tables (ZyprusAgent, AgentChatSession, PropertyListing, LandListing, ListingUploadAttempt, WhatsAppConversation)
- [ ] 18-03-PLAN.md — RLS policies for admin tables (AdminAuditLog, admin_users, AgentExecutionLog)
- [ ] 18-04-PLAN.md — RLS policies for orphaned tables (telegram_group_messages, audit_alerts)
- [ ] 18-05-PLAN.md — Apply migrations and verify RLS enforcement

#### Phase 19: Authentication Hardening
**Goal**: Service role key protected and all server actions have auth checks
**Depends on**: Phase 18 (RLS must exist before server actions can rely on it)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Service role key never accessible from client-side code (server-only import added)
  2. All server actions reject unauthenticated requests with 401
  3. Server actions derive user ID from auth.uid(), never trust client input
  4. No auth bypasses exist in cookie, title generation, message deletion, or visibility endpoints
**Plans**: TBD

Plans:
- [ ] 19-01: TBD during planning
- [ ] 19-02: TBD during planning

#### Phase 20: Code Quality & Validation
**Goal**: All endpoints validated with Zod, debug statements cleaned up
**Depends on**: Phase 19 (auth must be in place before validation makes sense)
**Requirements**: CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06
**Success Criteria** (what must be TRUE):
  1. All 42 console.log statements replaced with structured logging or removed
  2. All admin agent endpoints validate inputs with Zod schemas
  3. User deletion requires validated confirmation payload
  4. Server actions in actions.ts have Zod schema validation
  5. No debug statements remain in insert_templates.ts
**Plans**: TBD

Plans:
- [ ] 20-01: TBD during planning
- [ ] 20-02: TBD during planning

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0 MVP | 1-5 | 10 | Complete | 2026-01-27 |
| v1.1 Reliability | 6-9 | 16 | Complete | 2026-01-29 |
| v1.2 Call Audit | 10-14 | 14 | Complete | 2026-02-26 |
| v1.3 Audit Fixes | 15-17 | 8 | Complete | 2026-02-28 |
| v1.4 Security Hardening | 18-20 | TBD | Not started | - |

**Total: 17 phases shipped, 3 phases in v1.4**

---
*Roadmap created: 2026-01-27*
*Last updated: 2026-03-01 — v1.4 roadmap created with Phases 18-20*
