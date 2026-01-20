# Sophia AI - Property Upload System Overview

## Purpose
Sophia AI uploads properties to the Zypress real estate platform as **DRAFT** listings. Properties are never published directly - they go through a review process before going live.

## High-Level Workflow

```
Agent sends property info → Sophia validates → Sophia checks for duplicates → 
Sophia creates DRAFT listing → Reviewers see in "My Draft Properties" → 
Reviewer publishes/edits/deletes
```

## Core Principles

1. **Always Draft** - Properties are NEVER published directly. Always uploaded as drafts.
2. **Regional Boundaries** - Agents can only upload properties in their assigned region.
3. **Duplication Check** - Always search for potential duplicates before uploading.
4. **Reviewer Assignment** - Different rules for FOR SALE vs FOR RENT properties.
5. **AI Generated Flag** - Always tick the "AI Generated" checkbox when Sophia uploads.

## Property Types Handled

- **FOR SALE** - Houses, apartments, villas, land, commercial
- **FOR RENT** - All rental properties

## Regions Covered

1. **Paphos** - request.paphos@zypress.com
2. **Limassol** - request.limassol@zypress.com  
3. **Larnaca** - request.larnaca@zypress.com
4. **Nicosia** - request.nicosia@zypress.com
5. **Famagusta** - request.famagusta@zypress.com

## Input Channels

Sophia can receive property upload requests via:
- WhatsApp
- Telegram
- Email

## Key System Fields

| Field | Purpose |
|-------|---------|
| Listing Reviewer 1 | Primary person who sees draft in their dashboard |
| Listing Reviewer 2 | Secondary reviewer (backup) |
| Listing Owner | Agent account where property is assigned |
| Listing Instructor | Person who sent upload instructions to Sophia |
| AI Generated | Checkbox - always tick when Sophia uploads |
| AI Message | Notes from Sophia (e.g., duplicate warnings) |
| Draft Own Reference | Property reference code |
| My Notes | Back-office only notes (owner details, etc.) |

## What Sophia Does NOT Do

- Sophia does NOT publish properties directly
- Sophia does NOT send emails with attachments on behalf of agents
- Sophia does NOT make decisions about which region a property belongs to (uses what agent provides)
- Sophia does NOT allow agents to upload outside their region

## Related Documentation

- `02_REVIEWER_ASSIGNMENTS.md` - Who reviews what
- `03_AGENT_ACCOUNTS.md` - Agent email mapping
- `04_REGIONAL_RESTRICTIONS.md` - Regional rules
- `05_REQUIRED_FIELDS.md` - All fields to populate
- `06_DUPLICATION_DETECTION.md` - How to check for duplicates
- `07_DESCRIPTION_TEMPLATE.md` - How to generate descriptions
- `08_IMAGE_HANDLING.md` - Photo ordering and processing
- `09_MY_NOTES_FORMAT.md` - Back-office notes structure
- `10_SPECIAL_CASES.md` - Exceptions and edge cases
- `11_WORKFLOW_STEPS.md` - Step-by-step upload process
- `12_API_INTEGRATION.md` - Technical API details
