# Phase 04: Listing Upload Fixes - Context

## Phase Goal
Fix reviewer/owner assignment and My Notes population so listings appear in the correct agent dashboards with complete owner information.

## Requirements Covered
- **LIST-01**: Listing Reviewer 1 correct (Lauren for sales, agent for rentals)
- **LIST-02**: Listing Reviewer 2 correct (regional manager for sales)
- **LIST-03**: Listing Owner correct (special email mappings honored)
- **LIST-04**: My Notes populated with owner details
- **LIST-05**: Google Maps pin at neutral location (2-3 streets away)

## Current State Analysis

### What Already Exists

| Component | File | Status |
|-----------|------|--------|
| Reviewer logic | `rules/reviewer-assignment.ts` | EXISTS - needs verification |
| Special cases | `rules/special-cases.ts` | EXISTS - Michelle rental case handled |
| My Notes generator | `services/my-notes-generator.ts` | EXISTS - needs format verification |
| Privacy offset | `zyprus/client.ts:addPrivacyOffset` | EXISTS - 200m offset |
| Agent lookup | `agents/identifier.ts` | EXISTS - uses `listing_owner_email` |
| UUID resolution | `zyprus/taxonomy-cache.ts` | EXISTS - resolves emails to UUIDs |

### Spec Documentation
- `UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/02_REVIEWER_ASSIGNMENTS.md`
- `UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/03_AGENT_ACCOUNTS.md`
- `UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/09_MY_NOTES_FORMAT.md`
- `UPLOAD-LISTINGS-EXTENSIVE-INFO/FROM-MEETINGS/05_REQUIRED_FIELDS.md`

### Key Business Rules

#### Reviewer Assignment
| Property Type | Region | Reviewer 1 | Reviewer 2 |
|--------------|--------|------------|------------|
| FOR SALE | Paphos/Limassol/Larnaca/Nicosia | `listings@zyprus.com` | `request{region}@zyprus.com` |
| FOR SALE | Famagusta | `requestfamagusta@zyprus.com` | (none) |
| FOR RENT | Any | Agent who sent it | (none) |

#### Special Listing Owner Mappings
| Agent | Communicates Via | Listing Owner Should Be |
|-------|-----------------|------------------------|
| Marios Azinas | paphos@zyprus.com | azinas@zyprus.com |
| Michelle | limassol@zyprus.com | michelle@zyprus.com |
| Lysandros | larnaca@zyprus.com | requestlarnaca@zyprus.com |
| Ivan | nicosia@zyprus.com | requestnicosia@zyprus.com |
| Narine | famagusta@zyprus.com | requestfamagusta@zyprus.com |

#### My Notes Format
```
Owner: [Full Name]
Tel: [Phone Number]
Agent: [Agent Name]
Reg: [Registration Number if available]

Notes:
[Any special instructions]
```

## Plan Structure

This phase has **2 plans**:

### Plan 04-01: Verify and Fix Reviewer/Owner Assignment
- Wave 1 (database verification comes first)
- Verify agents table has correct `listing_owner_email` mappings
- Verify `reviewer-assignment.ts` logic matches spec
- Add any missing special case handling

### Plan 04-02: Verify and Fix My Notes + Map Offset
- Wave 2 (depends on 04-01 for agent data context)
- Verify My Notes format matches spec
- Verify privacy offset is appropriate
- Add any missing fields

## Success Criteria
- [ ] Sales listing in Paphos: Reviewer 1 = Lauren, Reviewer 2 = requestpaphos@
- [ ] Sales listing in Famagusta: Reviewer 1 = requestfamagusta@, No Reviewer 2
- [ ] Rental listing: Reviewer 1 = uploading agent, No Reviewer 2
- [ ] Marios uploads: Listing Owner = azinas@zyprus.com
- [ ] Michelle uploads: Listing Owner = michelle@zyprus.com
- [ ] My Notes contains: Owner name, Tel, Agent, Region (optional), Reg (if provided)
- [ ] Map pin is offset ~200m from actual coordinates

## Key Files to Modify
- `supabase/functions/sophia-bot/rules/reviewer-assignment.ts` (if changes needed)
- `supabase/functions/sophia-bot/services/my-notes-generator.ts` (format updates)
- Supabase `agents` table (data verification/fixes via MCP)
