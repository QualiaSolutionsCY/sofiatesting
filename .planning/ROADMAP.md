# Roadmap

## Current Milestone

**Milestone 9 — Handoff**

Source of truth: `.planning/JOURNEY.md` (full arc). Milestone 8 (`sophiainvoice` embed) shipped to production and closed 2026-06-09; its artifacts live in `.planning/archive/milestone-8-v1.7-sophia-invoice-embed/`.

## Why Now

The unified Sophia + invoicing system is live: `sofiatesting.vercel.app/admin/invoices` runs against `tijadsdysuxkxrpdlecq`, and Sophia drives the full invoice lifecycle over WhatsApp for the authorized allowlist (Fawzi, Marios, Charalambos). With the build done, the remaining work is the production-readiness and client-handoff pass that turns a shipped feature into a documented, owned system.

## Phase 1: Polish

### Goal

A consistent, refined admin surface across the merged Sophia + invoicing panels — no visual seams between the ported `sophiainvoice` UI and the existing `sofiatesting` admin.

### Success criteria

- Shared design tokens (color, spacing, type) applied across `/admin` and `/admin/invoices`.
- Microcopy + labels reviewed for consistency (invoice statuses, action buttons, empty/loading/error states).
- No layout breaks at 375px and 1440px on the invoices dashboard + detail routes.
- `npm run typecheck` and `next build` pass.

### Dependencies

- Milestone 8 shipped (done).

---

## Phase 2: Content + SEO

### Goal

The operational documentation a non-author needs to run and trust the system: admin runbook, env reference, and the agent allowlist.

### Success criteria

- Admin runbook covering invoice lifecycle, Sophia intents, and the two-Supabase-project topology.
- Env reference (`INVOICE_SUPABASE_URL`, `INVOICE_SUPABASE_SERVICE_ROLE`, `SOPHIA_BRIDGE_SECRET`, access-code vars) documented in one place.
- `INVOICE_AUTHORIZED_AGENTS` allowlist documented with the maintenance procedure for adding/removing an agent.
- Admin-only docs; no secrets committed.

### Dependencies

- Phase 1 complete.

---

## Phase 3: Final QA

### Goal

A full regression across both halves of the system — property uploads and invoicing — on staging and production.

### Success criteria

- Sophia property-upload flow verified end-to-end (WhatsApp → draft → Zyprus).
- Invoice lifecycle verified end-to-end via Sophia on WhatsApp (create → approve → mark paid → receipt/credit note → PDF delivery).
- Post-deploy 8-check passes on `sofiatesting.vercel.app` per `rules/deployment.md`.
- No critical console errors on `/admin` or `/admin/invoices`.

### Dependencies

- Phase 2 complete.

---

## Phase 4: Handoff

### Goal

Transfer ownership cleanly: credentials reference, a walkthrough, legacy archival, and final ERP closure.

### Success criteria

- Credentials/reference doc (Supabase projects, Vercel project, Edge Function secrets, third-party keys) handed to the owner.
- Walkthrough of the unified system delivered.
- Legacy `sophiainvoice` GitHub repo confirmed archived (Vercel project already deleted).
- Final ERP closure for the milestone.

### Dependencies

- Phase 3 complete.

---

## Milestone 9 Exit Criteria

- Admin surface visually consistent; typecheck + build green.
- Runbook, env reference, and allowlist documentation in `docs/`.
- Full regression (uploads + invoicing) green on production.
- Credentials reference + walkthrough delivered; legacy `sophiainvoice` repo archived; ERP closed.
