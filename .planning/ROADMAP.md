# Roadmap: SOPHIA Production Hardening

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-01-27)
- ✅ **v1.1 Reliability & Hardening** - Phases 6-9 (shipped 2026-01-29)
- 🚧 **v1.2 3CX Call Log Audit** - Phases 10-14 (in progress)

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

### 🚧 v1.2 3CX Call Log Audit (In Progress)

**Milestone Goal:** Automated daily audit of main call center line to ensure no leads are missed.

#### Phase 10: Call Tracking Infrastructure
**Goal**: Database can track processed calls and alert states
**Depends on**: Nothing (first phase of v1.2)
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, TRACK-05
**Success Criteria** (what must be TRUE):
  1. System can store call records with timestamps and prevent duplicate processing
  2. System can track alert status for each missing caller across multiple days
  3. System can maintain conversation state and follow-up timing per phone number
  4. Database prevents processing same day's calls more than once
**Plans**: 1 plan

Plans:
- [x] 10-01-PLAN.md -- Database schema, migration, and call tracking service module

#### Phase 11: 3CX Integration
**Goal**: System can login and extract call logs from 3CX web interface
**Depends on**: Phase 10
**Requirements**: 3CX-01, 3CX-02, 3CX-03, 3CX-04, 3CX-05, 3CX-06
**Success Criteria** (what must be TRUE):
  1. System can authenticate to 3CX web interface using provided credentials
  2. System can navigate to call log section and extract today's calls to target number
  3. System can filter out internal extensions and extract external caller phone numbers
  4. System can handle authentication failures and session timeouts gracefully
**Plans**: 3 plans

Plans:
- [x] 11-01-PLAN.md -- 3CX client scaffold, types, config, and authentication
- [x] 11-02-PLAN.md -- Call log extraction with filtering and phone normalization
- [x] 11-03-PLAN.md -- Error handling, retry logic, and live deployment test (checkpoint pending: 3CX credentials)

#### Phase 12: Telegram Integration
**Goal**: System can search regional groups and send alerts
**Depends on**: Phase 10
**Requirements**: TG-01, TG-02, TG-03, TG-04, TG-05
**Success Criteria** (what must be TRUE):
  1. System can search phone numbers across 4 regional Telegram groups
  2. System can send formatted alerts to "Zypress Others" group with call details
  3. System can track message responses from Vasya and handle alternative number scenarios
  4. System stops follow-up alerts when Vasya responds positively or number is found
**Plans**: 3 plans

Plans:
- [x] 12-01-PLAN.md — Deno Telegram client, group message search, and message indexing
- [x] 12-02-PLAN.md — Alert sending to Zypress Others with DB persistence
- [x] 12-03-PLAN.md — Response tracking from Vasya and alert state management

#### Phase 13: Alerting Logic
**Goal**: System sends correct alerts and handles all response scenarios
**Depends on**: Phase 12
**Requirements**: ALERT-01, ALERT-02, ALERT-03, ALERT-04, ALERT-05
**Success Criteria** (what must be TRUE):
  1. Initial missing caller alerts use specification template with call time and phone number
  2. Follow-up reminders send automatically 24 hours after initial alert
  3. System formats messages correctly and stops alerting based on Vasya's responses
  4. System handles all response scenarios per specification (found/not found/alternative number)
**Plans**: 4 plans

Plans:
- [x] 13-01-PLAN.md — Audit pipeline orchestrator (3CX -> Telegram search -> alerts -> DB tracking)
- [x] 13-02-PLAN.md — Follow-up reminder logic (24-hour timing) and pipeline integration
- [x] 13-03-PLAN.md — Gap closure: call time extraction and propagation (fixes "Unknown"/"N/A")
- [x] 13-04-PLAN.md — Gap closure: response handling verification (deferred — code confirmed correct)

#### Phase 14: Scheduling & Orchestration
**Goal**: Audit runs automatically Monday-Friday at 5:00 PM Cyprus time
**Depends on**: Phase 11, Phase 13
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05
**Success Criteria** (what must be TRUE):
  1. Edge Function executes daily Monday-Friday at exactly 5:00 PM Cyprus time
  2. Execution skips weekends automatically
  3. All execution events and errors are logged with timestamps
  4. System handles timezone calculations correctly across DST changes
  5. Failed executions recover gracefully without corrupting state
**Plans**: TBD

Plans:
- [ ] 14-01: pg_cron scheduled Edge Function setup
- [ ] 14-02: Weekday/weekend logic with timezone handling
- [ ] 14-03: Execution logging and error recovery

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12 → 13 → 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Response Formatting | v1.0 | 2/2 | Complete | 2026-01-27 |
| 2. Document Templates | v1.0 | 2/2 | Complete | 2026-01-27 |
| 3. Lead Routing | v1.0 | 2/2 | Complete | 2026-01-27 |
| 4. Property Uploads | v1.0 | 3/3 | Complete | 2026-01-27 |
| 5. Image Persistence | v1.0 | 1/1 | Complete | 2026-01-27 |
| 6. Structured Logging | v1.1 | 3/3 | Complete | 2026-01-29 |
| 7. Cache Management | v1.1 | 4/4 | Complete | 2026-01-29 |
| 8. Prompt Versioning | v1.1 | 5/5 | Complete | 2026-01-29 |
| 9. Error Handling | v1.1 | 4/4 | Complete | 2026-01-29 |
| 10. Call Tracking Infrastructure | v1.2 | 1/1 | Complete | 2026-02-26 |
| 11. 3CX Integration | v1.2 | 3/3 | Code complete (checkpoint pending) | 2026-02-26 |
| 12. Telegram Integration | v1.2 | 3/3 | Complete | 2026-02-26 |
| 13. Alerting Logic | v1.2 | 4/4 | Complete | 2026-02-26 |
| 14. Scheduling & Orchestration | v1.2 | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-26 for v1.2 milestone*
*Last updated: 2026-02-26*
