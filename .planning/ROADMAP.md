# Roadmap: SOPHIA Production Hardening

**Created:** 2026-01-23
**Milestone:** v1.0 Production Ready

## Phase Overview

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | SOPHIA Response Fixes | TMPL-01, TMPL-03, TMPL-04 | ✓ Complete |
| 2 | DOCX Template Fixes | TMPL-02, TMPL-05, TMPL-06 | Pending |
| 3 | Telegram Lead Routing | LEAD-01, LEAD-02, LEAD-03 | ✓ Complete |
| 4 | Listing Upload Fixes | LIST-01, LIST-02, LIST-03, LIST-04, LIST-05 | ✓ Complete |
| 5 | WhatsApp Image Upload | LIST-06 | Pending |

---

## Phase 1: SOPHIA Response Fixes

**Goal:** Clean up SOPHIA's response formatting and behavior
**Plans:** 3 plans

### Requirements
- **TMPL-01**: SOPHIA never mentions template numbers to users
- **TMPL-03**: Email auto-sends to speaking agent's email without asking
- **TMPL-04**: No asterisks visible in WhatsApp messages

### Plans
- [ ] 01-01-PLAN.md — Remove template number mentions from prompts
- [ ] 01-02-PLAN.md — Auto-detect agent email for sendEmail tool
- [ ] 01-03-PLAN.md — Fix WhatsApp formatting (code blocks, bold)

### Key Files
- `supabase/functions/sophia-bot/prompts.ts`
- `supabase/functions/sophia-bot/tools/executor.ts` (sendEmail handler)
- `supabase/functions/sophia-bot/index.ts` (formatForWhatsApp)

### Success Criteria
- SOPHIA responses never contain "Template 11", "Template 12", etc.
- When agent asks to send email, it goes to that agent's email automatically
- Bold text in WhatsApp appears bold, not with asterisks

### Estimated Complexity
Medium - Prompt changes + tool behavior change + formatting fix

---

## Phase 2: DOCX Template Fixes

**Goal:** Fix and consolidate document templates

### Requirements
- **TMPL-02**: Single reservation template only (official version with witness)
- **TMPL-05**: Non-Exclusive Marketing Agreement has proper signature spacing
- **TMPL-06**: Non-Exclusive Marketing Agreement has correct border/frame

### Tasks
1. Replace current reservation templates with official RESERVATION FEE_with witness version
2. Update marketing-agreement.ts signature section with proper spacing
3. Fix marketing-agreement.ts border/frame styling

### Key Files
- `supabase/functions/sophia-bot/docx/templates/reservation-fee.ts`
- `supabase/functions/sophia-bot/docx/templates/marketing-agreement.ts`
- `/home/qualia/Downloads/RESERVATION FEE_with witness and more official than standard (4).docx` (source)

### Success Criteria
- Only one reservation template exists (official version)
- Marketing agreement has visible signature lines with proper spacing
- Marketing agreement has correct border/frame appearance

### Estimated Complexity
Medium - DOCX template work requires careful formatting

---

## Phase 3: Telegram Lead Routing

**Goal:** Fix "Others" group routing to use regional managers
**Plans:** 1 plan

### Requirements
- **LEAD-01**: "Others" group routes based on property region
- **LEAD-02**: Nicosia leads go to Ivan (regional manager)
- **LEAD-03**: Famagusta leads go to Narine (regional manager)

### Plans
- [ ] 03-01-PLAN.md — Region-based routing for Others group

### Key Files
- `lib/telegram/lead-router.ts`
- `lib/telegram/routing-constants.ts`

### Success Criteria
- Nicosia property lead from Others → Ivan Kazakov
- Famagusta property lead from Others → Narine Akopyan
- Each region routes to its designated regional manager

### Estimated Complexity
Medium - Logic change with thorough testing required

---

## Phase 4: Listing Upload Fixes

**Goal:** Fix reviewer/owner assignment and My Notes population
**Status:** ✓ COMPLETE
**Completed:** 2026-01-25
**Plans:** 2 plans (2/2 executed)

### Requirements
- **LIST-01**: Listing Reviewer 1 correct (Lauren for sales, agent for rentals)
- **LIST-02**: Listing Reviewer 2 correct (regional manager for sales)
- **LIST-03**: Listing Owner correct (special email mappings honored)
- **LIST-04**: My Notes populated with owner details
- **LIST-05**: Google Maps pin at neutral location (2-3 streets away)

### Plans
- [ ] 04-01-PLAN.md — Verify and fix reviewer/owner assignment (Wave 1)
- [ ] 04-02-PLAN.md — Verify and fix My Notes + Map offset (Wave 2)

### Key Files
- `supabase/functions/sophia-bot/rules/reviewer-assignment.ts`
- `supabase/functions/sophia-bot/services/my-notes-generator.ts`
- `supabase/functions/sophia-bot/zyprus/client.ts`
- Supabase `agents` table (data verification)

### Current State Analysis
Most functionality already exists:
- Reviewer logic in `reviewer-assignment.ts` matches spec
- My Notes generator in `my-notes-generator.ts` exceeds spec requirements
- Privacy offset in `client.ts:addPrivacyOffset()` applies ~200m offset
- Agent mappings stored in `agents` table `listing_owner_email` column

Primary work is **verification** rather than new implementation.

### Success Criteria
- Sales listing: Reviewer 1 = Lauren, Reviewer 2 = regional manager
- Famagusta sales: Only Reviewer 1 = requestfamagusta@
- Rental listing: Reviewer 1 = uploading agent
- Marios listings: Owner = azinas@zyprus.com
- Michelle listings: Owner = michelle@zyprus.com
- My Notes contains: Owner name, Tel, Agent (minimum)
- Map pin is ~200m from actual property

### Estimated Complexity
Medium - Primarily verification with minor fixes if needed

---

## Phase 5: WhatsApp Image Upload

**Goal:** Enable phone gallery image uploads to SOPHIA

### Requirements
- **LIST-06**: WhatsApp gallery images uploadable (not just URLs)

### Tasks
1. Research WaSenderAPI media handling capabilities
2. Implement image download from WhatsApp message attachments
3. Create image upload pipeline: WhatsApp → Edge Function → Zyprus API
4. Handle image validation, resizing if needed
5. Update createPropertyListing tool to accept image attachments

### Key Files
- `supabase/functions/sophia-bot/index.ts` (webhook handler)
- `supabase/functions/sophia-bot/services/image-handler.ts`
- `supabase/functions/sophia-bot/tools/executor.ts`

### Success Criteria
- User can send images from phone gallery via WhatsApp
- Images are extracted and uploaded to Zyprus listing
- Error messages are helpful if image upload fails

### Estimated Complexity
High - Requires WhatsApp media API integration + upload pipeline

---

## Dependencies

```
Phase 1 ──┬──> Phase 2 (can run in parallel)
          │
Phase 3 ──┴──> Phase 4 ──> Phase 5
```

- Phase 1 and 2 are independent (template/prompt vs DOCX)
- Phase 3 is independent (Telegram routing)
- Phase 4 depends on understanding current upload flow
- Phase 5 depends on Phase 4 (upload infrastructure)

## Risk Areas

| Risk | Impact | Mitigation |
|------|--------|------------|
| WaSender image API limitations | Phase 5 blocked | Research API first, have fallback plan |
| Zyprus API vocabulary changes | Phase 4 uploads fail | Use hardcoded fallback UUIDs |
| Telegram routing regression | Leads go to wrong agent | Test extensively before deploy |
| DOCX formatting breaks | Documents look unprofessional | Generate and verify each template |

---

*Roadmap created: 2026-01-23*
*Last updated: 2026-01-23 — Phase 1 complete*
