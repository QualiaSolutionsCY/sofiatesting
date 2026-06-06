# Project State

## Project
See: .planning/PROJECT.md

## Current Position
Phase: 1 of 4 — Read-only port
Status: setup
Assigned to: Last activity: 2026-05-28 — Project initialized
Profile: strict
Last activity: 2026-06-05 — Invoice list: newest-first sort fix; PDF template: due date top, removed notes + redundant Bill To; deployed

Progress: [░░░░░░░░░░] 0%

## Roadmap
| # | Phase | Goal | Status |
|---|-------|------|--------|
| 1 | Read-only port | Lift invoicing UI/lib into /admin/invoices behind NextAuth with a second Supabase client. | ready |
| 2 | Mutations + queue + manual provider | Wire dashboard mutations through the integration queue and manual provider. | — |
| 3 | Sophia tool + intent endpoint | Expose /api/sophia/intent (HMAC) and add manageInvoice tool to sophia-bot with Fawzi-only allowlist. | — |
| 4 | Marios reply forwarding + remaining intents + archive | Forward Marios replies to webhook, complete the intent set, archive sophiainvoice Vercel project. | — |

## Blockers
None.

## Session
Last session: 2026-06-05
Last worked by: Last activity: 2026-05-28 — Project initialized
Resume: —
