# Requirements: SOPHIA 3CX Call Log Audit

**Defined:** 2026-02-26
**Core Value:** Agents can trust SOPHIA to do the right thing every time

## v1 Requirements

Requirements for 3CX Call Log Audit integration. Each maps to roadmap phases.

### 3CX Integration

- [ ] **3CX-01**: System can login to 3CX web interface with provided credentials
- [ ] **3CX-02**: System can navigate to call log section and extract today's calls
- [ ] **3CX-03**: System can filter calls to target number (22032770) only
- [ ] **3CX-04**: System can exclude internal extensions (70, 64, 99, 801, 900)
- [ ] **3CX-05**: System can extract caller phone numbers from call log table
- [ ] **3CX-06**: System can handle web session management and authentication errors

### Telegram Integration

- [ ] **TG-01**: System can search phone numbers across 4 regional Telegram groups
- [ ] **TG-02**: System can send formatted alerts to "Zypress Others" group
- [ ] **TG-03**: System can track message responses from Vasya
- [ ] **TG-04**: System can handle alternative phone number scenarios
- [ ] **TG-05**: System can stop follow-up when Vasya responds positively

### Call Tracking

- [ ] **TRACK-01**: System can store processed calls in database with timestamps
- [ ] **TRACK-02**: System can track alert status for each missing caller
- [ ] **TRACK-03**: System can prevent duplicate processing of same day's calls
- [ ] **TRACK-04**: System can implement 24-hour follow-up logic
- [ ] **TRACK-05**: System can maintain conversation state per phone number

### Scheduling

- [ ] **SCHED-01**: System can execute audit daily Monday-Friday at 5:00 PM Cyprus time
- [ ] **SCHED-02**: System can skip execution on weekends
- [ ] **SCHED-03**: System can log execution status and errors
- [ ] **SCHED-04**: System can handle timezone calculations correctly
- [ ] **SCHED-05**: System can recover from failed executions

### Alerting

- [ ] **ALERT-01**: System can send initial missing caller alerts using specification template
- [ ] **ALERT-02**: System can send follow-up reminders after 24 hours
- [ ] **ALERT-03**: System can format messages with call time and phone number
- [ ] **ALERT-04**: System can handle response scenarios per specification
- [ ] **ALERT-05**: System can stop alerting when number is found in groups

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Analytics

- **ANLY-01**: Generate daily/weekly call audit reports
- **ANLY-02**: Track missed call patterns and response rates
- **ANLY-03**: Monitor system performance and success rates

### Manual Controls

- **MNCT-01**: Allow manual triggering of audits outside schedule
- **MNCT-02**: Provide admin interface for managing tracked calls
- **MNCT-03**: Support manual override of alert states

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time call monitoring | Daily audit sufficient per specification |
| Call recording integration | Not required for lead tracking |
| Multi-location 3CX systems | Single system specified |
| Complex reporting dashboard | Simple alerting sufficient |
| SMS/WhatsApp alerts | Telegram specified in requirements |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| 3CX-01 | TBD | Pending |
| 3CX-02 | TBD | Pending |
| 3CX-03 | TBD | Pending |
| 3CX-04 | TBD | Pending |
| 3CX-05 | TBD | Pending |
| 3CX-06 | TBD | Pending |
| TG-01 | TBD | Pending |
| TG-02 | TBD | Pending |
| TG-03 | TBD | Pending |
| TG-04 | TBD | Pending |
| TG-05 | TBD | Pending |
| TRACK-01 | TBD | Pending |
| TRACK-02 | TBD | Pending |
| TRACK-03 | TBD | Pending |
| TRACK-04 | TBD | Pending |
| TRACK-05 | TBD | Pending |
| SCHED-01 | TBD | Pending |
| SCHED-02 | TBD | Pending |
| SCHED-03 | TBD | Pending |
| SCHED-04 | TBD | Pending |
| SCHED-05 | TBD | Pending |
| ALERT-01 | TBD | Pending |
| ALERT-02 | TBD | Pending |
| ALERT-03 | TBD | Pending |
| ALERT-04 | TBD | Pending |
| ALERT-05 | TBD | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 0 (awaiting roadmap)
- Unmapped: 25 ⚠️

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after initial definition*