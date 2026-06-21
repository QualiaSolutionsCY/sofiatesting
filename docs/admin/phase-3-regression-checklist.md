# Phase 3 — Human-Run WhatsApp Regression Checklist

**Project:** sofiatesting (sofia-ai-assistant)
**Milestone:** M9 (Handoff) — Phase 3 "Final QA"
**Branch:** feature/invoicing-updates
**Last Updated:** 2026-06-21
**Audience:** A human operator with WhatsApp and a real allowlisted agent number.

This document covers the two regression flows that **cannot** be driven by an automated
agent because they require a live WhatsApp session and a real Zyprus/invoice round-trip:

- **A. Property-upload regression** — WhatsApp → Sophia draft → Zyprus draft listing.
- **B. Invoice-lifecycle regression** — WhatsApp → create → approve → mark paid →
  receipt / credit note → PDF delivery.

Each step below states the **exact phrase to send**, the **Expected** Sophia reply, and a
**Verify in DB** line naming the table/row to inspect. No step says only "check it works".

---

## Automated coverage already completed (do NOT re-run these manually)

Wave-1 of this phase already ran and captured the automated suites and the live HTTP
checks. Read these two reports first so you only run the irreducibly-manual WhatsApp
steps below:

- [`../../.planning/phase-3-qa-results.md`](../../.planning/phase-3-qa-results.md) — suite / build / typecheck results.
- [`../../.planning/phase-3-deploy-check.md`](../../.planning/phase-3-deploy-check.md) — production HTTP probes against the live URL.

**What is already GREEN (no manual action needed):**

| Already verified | Result | Source |
|---|---|---|
| `pnpm build` (`next build`, all routes incl. `/invoices`) | exit 0 — GREEN | qa-results §2 |
| `npx tsc --noEmit` (post-build) | exit 0, 0 errors — GREEN | qa-results §1 |
| `tests/production-readiness.test.ts` (live Edge function) | 29/29 PASS — PRODUCTION READY | qa-results §7 |
| Top-level node:test unit files | 78/79 PASS | qa-results §3 |
| Production HTTP: all admin/invoice routes 307 → `/access` (gated, healthy) | PASS | deploy-check §1 |
| Production HTTP: `/access` public gate page | 200 — deploy is live | deploy-check §1 |

**Known env-blocked / non-blocking items (NOT regressions — do not chase these here):**

- Playwright e2e/routes/integration — Chromium binary not installed in the CI env
  (`pnpm exec playwright install` required). Dev server booted fine; 22 browser-free
  tests passed. (qa-results §6)
- `tests/unit/models.test.ts` — `msw` dev dependency not installed / not in
  `package.json`. (qa-results §3)
- `reviewer-assignment.test.ts` — 10/19 cases assert outdated reviewer emails; test-data
  drift, not a build/typecheck blocker. (qa-results §5)
- `package.json` `test:unit` glob defect — runs the wrong files; real unit signal is in
  the top-level node:test + edge-functions vitest suites. (qa-results §4)

**Two open eyeball items handed to this manual pass** (from deploy-check §3 / §5):

- [ ] JS-console sweep of `/admin` and `/admin/invoices` after entering the
  **`ADMIN_ACCESS_CODE`** env var at `/access?scope=admin` (procedure in deploy-check §3).
  **Expected:** no red/uncaught exceptions blocking render on either page.
  **Verify in DB:** n/a (browser-console check only).
- [ ] Confirm UptimeRobot reads **UP** at `https://stats.uptimerobot.com/bKudHy1pLs`.
  **Expected:** the `sofiatesting` monitor shows UP.
  **Verify in DB:** n/a (status-page eyeball only).

---

## Preconditions (read before either section)

### Two-Supabase-project topology

This system spans **two separate Supabase projects**. Confusing them is the most common
"the data isn't where I expect" incident (per
[`./invoicing-runbook.md`](./invoicing-runbook.md) "Two-Supabase-project topology").

| Concern | Project ref | Holds the tables you inspect below |
|---|---|---|
| **Primary app data** | `vceeheaxcrhmpqueudqx` | `chat_history`, `listing_uploads`, `agents` |
| **Invoicing** | `tijadsdysuxkxrpdlecq` | `invoice_documents`, `invoice_approvals`, `invoice_payments`, `invoice_storage_objects` |

Inspect each table on the project named on that row — never the other one.

### Invoicing allowlist precondition (Section B only)

Only **three** named agents may drive invoicing over WhatsApp. The sender of every
Section-B message **must** be one of them, matched on the **last 8 digits** of the phone
number (per [`./invoicing-allowlist.md`](./invoicing-allowlist.md)):

| Name | MSISDN | Last 8 digits |
|------|--------|---------------|
| Fawzi Goussous | `35799111668` | `99111668` |
| Charalambos Pitros | `35799076732` | `99076732` |
| Marios Polyviou | `35799921560` | `99921560` |

If you send a Section-B phrase from any other number, Sophia returns a **generic refusal**
(`"Invoicing is limited to authorized staff, so I can't action that here."`) and the
request never leaves the bot — that is the *expected* behavior for an unauthorized number,
not a failure. The allowlist is enforced **twice** (in-bot gate, then a defense-in-depth
re-check on the Vercel `/api/sophia/intent` route).

### Full operational context (read for diagnostics)

- [`./invoicing-runbook.md`](./invoicing-runbook.md) — topology, request/bridge path, full
  lifecycle, the 11-intent phrase→action table.
- [`./invoicing-allowlist.md`](./invoicing-allowlist.md) — who can invoice, the two
  enforcement points, add/remove procedure.
- [`./invoicing-env-reference.md`](./invoicing-env-reference.md) — environment **variable
  names** (never values) for the bridge, the invoice Supabase project, the accounting group.

> **Secrets rule:** this checklist names env var **NAMES only** — e.g. `ADMIN_ACCESS_CODE`,
> `SOPHIA_BRIDGE_SECRET`, `INVOICE_ACCOUNTING_GROUP_MSISDN`. Never paste a key, token, JWT,
> HMAC secret, or access code value into this file or any commit. Get values from the
> appropriate secret store.

---

## A. Property-upload regression

**Goal:** a region-valid agent sends a property over WhatsApp → Sophia collects the fields
→ a draft listing is created on Zyprus (`dev9.zyprus.com`) as an unpublished draft.
Grounded in root `CLAUDE.md` ("Property Uploads", region restrictions, min-1-image,
reviewer assignment) and [`../../tests/manual/README-UPLOADS.md`](../../tests/manual/README-UPLOADS.md).

### A.0 — Pick a region-valid agent number

An agent can **ONLY** upload properties in their assigned region (`agents.region`; values:
`paphos`, `limassol`, `larnaca`, `nicosia`, `famagusta`, `all`). Sending a property in a
region the agent is not assigned to is **rejected** ("not allowed to market outside your
region", per `README-UPLOADS.md`).

- [ ] Find a valid agent phone + region on project `vceeheaxcrhmpqueudqx`:
  ```sql
  SELECT mobile, full_name, region
  FROM agents
  WHERE can_upload = true AND is_active = true;
  ```
  **Expected:** at least one row; note one agent's `mobile` and `region` — you will send
  the test property from that `mobile`, for a property located in that `region`.
  **Verify in DB:** `agents` table (project `vceeheaxcrhmpqueudqx`) — the chosen
  `mobile`/`region` pair exists with `can_upload = true` and `is_active = true`.

### A.1 — Send the property upload message

Send from the chosen agent's WhatsApp number, for a property **in that agent's region**:

> **Send (example for a Paphos-assigned agent — adjust location to YOUR agent's region):**
> ```
> Upload a property: 3 bedroom apartment for sale in Paphos, 250000 euro,
> 120 sqm, 2 bathrooms, built 2018. Owner: John Smith, 35799000000.
> [attach at least 1 property photo as a direct image]
> ```

- [ ] Sophia acknowledges and begins field collection.
  **Expected:** Sophia confirms she's starting an upload and asks for / echoes the
  collected fields (bedrooms, bathrooms, covered area, price, location, owner). She does
  **not** silently drop the request.
  **Verify in DB:** `chat_history` (project `vceeheaxcrhmpqueudqx`) — a new inbound row
  for the agent's number plus Sophia's reply row are written for this conversation.

### A.2 — Min-1-image enforcement

Per `CLAUDE.md` ("Property Uploads"): **min 1 image required; must be direct image URLs**
(not `ibb.co` sharing pages). Floor plans go in a **separate** `floorPlanUrls` field
(→ `field_floor_plan`), distinct from the gallery.

- [ ] Send the same property **with no image attached** (separate test conversation).
  **Expected:** Sophia does **not** create the draft; she asks for at least one property
  photo before proceeding.
  **Verify in DB:** `listing_uploads` (project `vceeheaxcrhmpqueudqx`) — **no** new
  upload row is created for the image-less attempt (the upload is blocked at the
  min-1-image gate).

### A.3 — Region restriction enforcement

- [ ] From the same agent, send a property located in a **different** region than the
  agent's `agents.region` (e.g. a Paphos-assigned agent sends a Limassol property).
  **Expected:** Sophia rejects with a region-restriction message ("not allowed to market
  outside your region").
  **Verify in DB:** `listing_uploads` (project `vceeheaxcrhmpqueudqx`) — **no** new
  upload row for the out-of-region attempt; `chat_history` shows the refusal reply.

### A.4 — Draft created on Zyprus + publication tracking

After a complete, region-valid, image-bearing upload (A.1):

- [ ] Sophia confirms the draft was created and reports the reviewer assignment.
  **Expected:** Sophia replies that the listing was uploaded as a draft and names the
  reviewer(s) per `CLAUDE.md` "Reviewer Assignment" (FOR SALE Paphos/Limassol/Larnaca/
  Nicosia → Reviewer 1 = Lauren, Reviewer 2 = regional office; FOR RENT → Reviewer 1 =
  the sending agent). `createPropertyListing` auto-uploads to Zyprus as an **unpublished
  draft**.
  **Verify in DB:** `listing_uploads` (project `vceeheaxcrhmpqueudqx`) — a new row exists
  for this property (publication tracked here; `listing-notifier` polls this table every
  15 min per `CLAUDE.md`).
- [ ] Confirm the draft appears in Zyprus.
  **Expected:** the property shows as a draft at
  `https://dev9.zyprus.com/draft-dashboard?ai_state=draft` (per `README-UPLOADS.md`
  "Verification").
  **Verify in DB:** `listing_uploads` (project `vceeheaxcrhmpqueudqx`) — the upload row
  carries the Zyprus draft reference for cross-checking against the draft dashboard.

---

## B. Invoice-lifecycle regression

**Goal:** an allowlisted agent drives an invoice through its full lifecycle over WhatsApp:
`create_draft` → `approve` (two-step) → `mark_paid` / `issue_receipt` →
`issue_credit_note` (two-step) → PDF delivery (`resend` / `send_pdf`). Grounded in the
intent table and lifecycle section of [`./invoicing-runbook.md`](./invoicing-runbook.md).

> **All B steps:** send from an **allowlisted** number (see Preconditions). Inspect tables
> on the **invoice** project `tijadsdysuxkxrpdlecq` (NOT the app project).
> Status enums (per runbook "Invoice lifecycle"):
> approval `draft → sent-to-marios → approved → numbered → sent-to-accounting`
> (plus `correction-needed`, `corrected-resend`, `cancelled`, `credited`);
> payment `not-required | unpaid | paid`.

### B.1 — `create_draft`

> **Send:** `Create an invoice for Acme Ltd, 1500 euro plus VAT, consulting services.`

- [ ] Sophia creates a draft invoice and queues it to Marios for approval.
  **Expected:** Sophia confirms a **draft** invoice was created (client, amount, VAT mode,
  description; default due 30 days) and that it's queued to Marios for approval. She does
  **not** invent an official sequence number — the system assigns those later.
  **Verify in DB:** `invoice_documents` (project `tijadsdysuxkxrpdlecq`) — a new row with
  `kind = invoice`, approval status `draft` (or `sent-to-marios` once queued), payment
  status `unpaid`. Note the document id for the next steps.

### B.2 — `approve` — first call (assigns the official number)

> **Send:** `Approve the Acme invoice.`

- [ ] Sophia assigns the official number and asks for the accounting-group message.
  **Expected (two-step, FIRST call):** Sophia assigns the **official number** and then
  asks **what message to send to the accounting group** — she does NOT yet post to the
  group. (Idempotent: re-approving an already-numbered invoice does not re-number it.)
  **Verify in DB:** `invoice_documents` (project `tijadsdysuxkxrpdlecq`) — the row's
  approval status advances to `approved` / `numbered` and an official number is now set.
  `invoice_approvals` (same project) — an approval row is recorded for this document.

### B.3 — `approve` — second call (posts to the accounting group)

> **Send:** `Send to the group: Acme consulting invoice attached for the books.`

- [ ] Sophia posts the invoice PDF to the accounting WhatsApp group.
  **Expected (two-step, SECOND call):** with `groupMessage` now supplied, Sophia posts the
  PDF to the accounting group (env `INVOICE_ACCOUNTING_GROUP_MSISDN` must be configured on
  Vercel — name only). If the group is unset / the WhatsApp session isn't connected, the
  document is not posted (see runbook "Diagnosing 'the invoice didn't reach the group'").
  **Verify in DB:** `invoice_documents` (project `tijadsdysuxkxrpdlecq`) — approval status
  advances to `sent-to-accounting`. `invoice_storage_objects` (same project) — a generated
  PDF object exists for this document.

### B.4 — `mark_paid` / `issue_receipt`

> **Send:** `Mark the Acme invoice paid.`  *(equivalently: `Issue a receipt for the Acme invoice.`)*

- [ ] Sophia marks the invoice paid and creates a receipt.
  **Expected:** both `mark_paid` and `issue_receipt` run the same handler — Sophia marks
  the invoice **paid** and creates a **receipt** document, naming the new receipt's draft
  number in the reply.
  **Verify in DB:** `invoice_payments` (project `tijadsdysuxkxrpdlecq`) — a payment row
  records the invoice as paid. `invoice_documents` (same project) — the original invoice's
  payment status is now `paid`, and a **new** row with `kind = receipt` exists.

### B.5 — `issue_credit_note` — message required first (two-step)

> **Send (no group message yet):** `Issue a credit note for the Acme invoice.`

- [ ] Sophia refuses to issue until a group message is supplied.
  **Expected (two-step, FIRST call):** because a `groupMessage` is **required** before a
  credit note is issued, Sophia asks *"What message should I send to the group with this
  credit note?"* and does **not** yet cancel the invoice.
  **Verify in DB:** `invoice_documents` (project `tijadsdysuxkxrpdlecq`) — the invoice is
  **still** at its prior status (NOT `credited`), and **no** new `kind = credit-note` row
  exists yet.

### B.6 — `issue_credit_note` — second call (cancels via credit note)

> **Send:** `Send to the group: crediting the Acme invoice, issued in error.`

- [ ] Sophia issues the credit note and cancels the invoice.
  **Expected (two-step, SECOND call):** with the group message supplied,
  `cancelWithCreditNoteAction` cancels the invoice (status → `credited`) and creates a
  **credit-note** document, posting it to the accounting group.
  **Verify in DB:** `invoice_documents` (project `tijadsdysuxkxrpdlecq`) — the original
  invoice's approval status is now `credited`; a new row with `kind = credit-note` exists.
  `invoice_approvals` (same project) — the credit-note action is recorded.

### B.7 — PDF delivery (`resend` / `send_pdf`)

> **Send:** `Resend me the PDF of the Acme invoice.`  *(also triggers `send_pdf`.)*

- [ ] Sophia re-issues and delivers the PDF to the agent's WhatsApp.
  **Expected:** Sophia regenerates/re-attaches the PDF and delivers it to the agent's
  WhatsApp as a document (the `manageInvoice` tool calls `sendDocumentByUrl` when the
  result carries a `pdfUrl`, per runbook "Request path / bridge" step 1).
  **Verify in DB:** `invoice_storage_objects` (project `tijadsdysuxkxrpdlecq`) — a
  generated PDF object exists / is refreshed for this document; the PDF lives in the
  Supabase Storage bucket named by env `SUPABASE_INVOICE_BUCKET` (default `invoices`,
  `generated` path prefix). Cross-check the document id against `invoice_documents`.

---

## Sign-off

- [ ] **Section A** — all property-upload steps pass (region-valid draft created on Zyprus,
  min-1-image enforced, region restriction enforced, `listing_uploads` + `chat_history`
  rows confirmed on project `vceeheaxcrhmpqueudqx`).
- [ ] **Section B** — full invoice lifecycle passes (`create_draft` → `approve` two-step →
  `mark_paid`/`issue_receipt` → `issue_credit_note` two-step → PDF delivery), with each
  state transition confirmed in `invoice_documents` / `invoice_approvals` /
  `invoice_payments` / `invoice_storage_objects` on project `tijadsdysuxkxrpdlecq`.

**Runner:** ____________________   **Date:** ____________   **Result:** PASS / FAIL

---

**Maintainers:** Qualia Solutions
**Status:** Phase 3 manual regression — handoff
