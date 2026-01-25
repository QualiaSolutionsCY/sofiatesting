# Requirements: SOPHIA Production Hardening

**Defined:** 2025-01-23
**Core Value:** Agents can trust SOPHIA to do the right thing every time

## v1 Requirements

### Templates & Responses

- [x] **TMPL-01**: SOPHIA never mentions template numbers to users ✓
- [x] **TMPL-02**: Single reservation template only (official version with witness) ✓
- [x] **TMPL-03**: Email auto-sends to speaking agent's email without asking ✓
- [x] **TMPL-04**: No asterisks visible in WhatsApp messages ✓
- [x] **TMPL-05**: Non-Exclusive Marketing Agreement has proper signature spacing ✓
- [x] **TMPL-06**: Non-Exclusive Marketing Agreement has correct border/frame ✓

### Telegram Lead Routing

- [x] **LEAD-01**: "Others" group routes based on property region ✓
- [x] **LEAD-02**: Nicosia leads go to Ivan (regional manager) ✓
- [x] **LEAD-03**: Famagusta leads go to Narine (regional manager) ✓

### Listing Uploads

- [ ] **LIST-01**: Listing Reviewer 1 correct (Lauren for sales, agent for rentals)
- [ ] **LIST-02**: Listing Reviewer 2 correct (regional manager for sales)
- [ ] **LIST-03**: Listing Owner correct (special email mappings honored)
- [ ] **LIST-04**: My Notes populated with owner details
- [ ] **LIST-05**: Google Maps pin at neutral location (2-3 streets away)
- [ ] **LIST-06**: WhatsApp gallery images uploadable (not just URLs)

## v2 Requirements

(None — all requirements are critical for production)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New template types | Focus on fixing existing templates |
| Web app changes | Edge Function fixes only |
| Telegram bot enable | Disabled by design, separate decision |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMPL-01 | Phase 1 | Complete |
| TMPL-02 | Phase 2 | Complete |
| TMPL-03 | Phase 1 | Complete |
| TMPL-04 | Phase 1 | Complete |
| TMPL-05 | Phase 2 | Complete |
| TMPL-06 | Phase 2 | Complete |
| LEAD-01 | Phase 3 | Complete |
| LEAD-02 | Phase 3 | Complete |
| LEAD-03 | Phase 3 | Complete |
| LIST-01 | Phase 4 | Pending |
| LIST-02 | Phase 4 | Pending |
| LIST-03 | Phase 4 | Pending |
| LIST-04 | Phase 4 | Pending |
| LIST-05 | Phase 4 | Pending |
| LIST-06 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2025-01-23*
*Last updated: 2025-01-23 after initial definition*
