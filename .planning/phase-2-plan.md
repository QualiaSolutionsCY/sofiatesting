---
phase: 2
goal: "The operational documentation a non-author needs to run and trust the unified Sophia + invoicing system: admin runbook, env reference, and the agent allowlist."
tasks: 3
waves: 1
---

# Phase 2: Content + SEO (Operational Documentation)

**Goal:** A non-author can run and trust the unified Sophia + invoicing system from three new admin-only docs under `docs/`: an admin runbook (invoice lifecycle + Sophia intents + two-Supabase topology), an env reference (variable names + where they live, never values), and the `INVOICE_AUTHORIZED_AGENTS` allowlist with its add/remove procedure.
**Why this phase:** The invoicing + Sophia bridge shipped to production but is undocumented — the only owner who can operate it is the author. These docs turn a shipped feature into an owned, maintainable system before Final QA (Phase 3) and Handoff (Phase 4).

> All three tasks write independent Markdown files under `docs/` and read the same source files (shared *reads*, no shared *writes*) → all Wave 1, parallel-safe.
>
> **Security (rules/security.md):** every doc documents VARIABLE NAMES and WHERE they are set (Vercel env / Supabase Edge secrets), never the secret VALUES. No code in this phase prints or pastes a secret. The grep validations below assert that no known secret literal appears in any doc.

## Task 1 — Admin runbook
**Wave:** 1
**Persona:** none
**Files:** `docs/admin/invoicing-runbook.md` (create) — a standalone operational runbook for the unified Sophia + invoicing system. Must export nothing; pure Markdown.
**Depends on:** none

**Why:** The invoice lifecycle, the Sophia WhatsApp intents, and the two-Supabase-project topology exist only in code and scattered planning notes today. A non-author cannot diagnose "why didn't the invoice reach the group" or "which DB holds invoices" without reading TypeScript. This runbook is the single operational reference.

**Acceptance Criteria:**
- An operator who has never seen the code can read the runbook and explain: which Supabase project holds invoices vs. app data, how an invoice moves from draft to paid/receipt, and which WhatsApp phrases trigger which Sophia action.
- The runbook lists every Sophia invoicing intent (`create_draft`, `list_drafts`, `query_status`, `approve`, `edit_invoice`, `request_correction`, `mark_paid`, `issue_receipt`, `issue_credit_note`, `resend`, `send_pdf`) with the agent phrase that triggers it and the result.
- The runbook documents the request path: WhatsApp → `manageInvoice` tool (sophia-bot, allowlist check) → `invoice-bridge.ts` (HMAC sign) → `POST /api/sophia/intent` (HMAC verify + allowlist re-check) → `runIntent` → invoice DB `tijadsdysuxkxrpdlecq` + PDF bucket.
- The runbook names the two Supabase projects by ref: primary `vceeheaxcrhmpqueudqx` (sophia-bot, agents, listings) and invoice `tijadsdysuxkxrpdlecq` (invoice documents, accessed via `lib/invoices/supabase/server.ts`).
- No secret VALUES appear anywhere.

**Action:**
- Create `docs/admin/invoicing-runbook.md` following the existing `docs/admin/admin-panel-guide.md` naming/structure convention (admin-only operational doc, Markdown headings).
- Section **"Two-Supabase-project topology"** — extract from `lib/invoices/supabase/server.ts:18` (`INVOICE_SUPABASE_URL`) and `CLAUDE.md` / `.continue-here.md:42` ("app data = Drizzle on `vceeheaxcrhmpqueudqx`; invoicing = supabase-js on `tijadsdysuxkxrpdlecq`"). State: primary DB ref `vceeheaxcrhmpqueudqx` (sophia-bot, agents, listings, Drizzle); invoice DB ref `tijadsdysuxkxrpdlecq` (invoice documents, supabase-js via `lib/invoices/supabase/server.ts`). Tables list from `lib/invoices/supabase/schema.ts:11-23` (`invoice_documents`, `invoice_approvals`, `invoice_payments`, `invoice_storage_objects`, etc.). Warn: never import `lib/invoices/supabase/server` from a client component (`server-only` at line 1).
- Section **"Request path / bridge"** — extract from `supabase/functions/sophia-bot/tools/handlers/invoice.ts` (allowlist check at line 43 `isAllowed`, calls `callInvoiceIntent`), `supabase/functions/sophia-bot/services/invoice-bridge.ts:41` (`callInvoiceIntent` HMAC-signs body with `SOPHIA_BRIDGE_SECRET`, POSTs to `SOPHIA_BRIDGE_URL` default `https://sofiatesting.vercel.app/api/sophia/intent`, header `X-Sophia-Signature`), and `app/api/sophia/intent/route.ts:36` (`verifySignature`) + `:52` (`isAuthorizedAgent` re-check). Note the defense-in-depth: allowlist enforced both in sophia-bot AND in the Vercel route.
- Section **"Invoice lifecycle"** — document the `ApprovalStatus` states from `lib/invoices/types/invoice.ts:7-16` (`draft → sent-to-marios → approved → numbered → sent-to-accounting`, plus `correction-needed`, `corrected-resend`, `cancelled`, `credited`), `PaymentStatus` from `:24` (`not-required | unpaid | paid`), and `DocumentKind` from `:1` (`invoice | credit-note | receipt`). Describe approve flow from `intent-handlers.ts:187-223`: approve assigns official number, then a second `approve` call with `groupMessage` posts the PDF to the accounting group. Describe mark-paid from `:310-324` (`markPaidAndIssueReceiptAction` creates a receipt). Describe credit note from `:326-348` (requires `groupMessage` before issuing).
- Section **"Sophia intents reference"** — a table of all 11 intents from `lib/invoices/sophia/intent-handlers.ts:17-28`, with the triggering agent phrase taken verbatim from the mapping in `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:38-47` (e.g. "create / draft an invoice for {client}" → `create_draft`). Include the two-step group-message follow-up for `approve`, `edit_invoice`, and `issue_credit_note` documented at `invoicing.ts:41-46`.
- Section **"Accounting group notification"** — from `lib/invoices/actions/whatsapp-status.ts:24` (`getWhatsAppGroupStatus`) and the env `INVOICE_ACCOUNTING_GROUP_MSISDN` at `whatsapp-status.ts:25`. State the group JID is configured via that env var and reachability is checked live.
- Cross-link the env reference doc (`./invoicing-env-reference.md`, Task 2) and the allowlist doc (`./invoicing-allowlist.md`, Task 3) by relative path. Do NOT block on them existing at write time — relative links are fine; they land in the same wave.

**Validation:** (builder self-check)
- `test -f docs/admin/invoicing-runbook.md && echo EXISTS` → `EXISTS`
- `grep -c "tijadsdysuxkxrpdlecq" docs/admin/invoicing-runbook.md` → ≥ 1 (invoice DB ref present)
- `grep -c "create_draft\|issue_credit_note\|mark_paid" docs/admin/invoicing-runbook.md` → ≥ 1 (intents documented)
- `grep -rIn "BRIDGE_SECRET=\|SERVICE_ROLE=\|ACCESS_CODE=[A-Za-z0-9]" docs/admin/invoicing-runbook.md | grep -v "where\|set in\|env\|Vercel\|Supabase" ; echo "exit:$?"` → no secret-value assignments

**Context:** Read @lib/invoices/sophia/intent-handlers.ts, @app/api/sophia/intent/route.ts, @supabase/functions/sophia-bot/services/invoice-bridge.ts, @supabase/functions/sophia-bot/tools/handlers/invoice.ts, @supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts, @lib/invoices/types/invoice.ts, @lib/invoices/supabase/server.ts, @lib/invoices/supabase/schema.ts, @lib/invoices/actions/whatsapp-status.ts, @docs/admin/admin-panel-guide.md, @.planning/PROJECT.md

## Task 2 — Env reference
**Wave:** 1
**Persona:** security
**Files:** `docs/admin/invoicing-env-reference.md` (create) — one-place reference for every environment variable the invoicing + Sophia-bridge system reads, with purpose and where each is set. Names only, never values.
**Depends on:** none

**Why:** The invoicing system reads ~13 env vars split across two runtimes (Vercel for the Next.js app, Supabase Edge secrets for sophia-bot). Today an operator setting up a new environment or rotating a key has to grep the codebase. A single env reference is the success criterion of this phase and the precondition for safe rotation in Handoff (Phase 4).

**Acceptance Criteria:**
- Every env var referenced by the invoicing + bridge + access-gate code appears in one table: name, purpose, runtime (Vercel env vs. Supabase Edge secret), required/optional, and the `file:line` that reads it.
- The table covers at minimum: `INVOICE_SUPABASE_URL`, `INVOICE_SUPABASE_SERVICE_ROLE`, `SOPHIA_BRIDGE_SECRET`, `SOPHIA_BRIDGE_URL`, `ADMIN_ACCESS_CODE`, `INVOICES_ACCESS_CODE`, `AUTH_SECRET`, `INVOICE_ACCOUNTING_GROUP_MSISDN`, `SUPABASE_INVOICE_BUCKET`, `WASENDER_API_KEY`, `WASENDER_PERSONAL_ACCESS_TOKEN`, `WASENDER_WEBHOOK_SECRET`.
- The doc explicitly states that `SOPHIA_BRIDGE_SECRET` must hold the SAME value in both runtimes (Vercel + Supabase Edge) for HMAC to verify, and `INVOICE_SUPABASE_SERVICE_ROLE` is server-only (never `NEXT_PUBLIC_`, never client-imported).
- No secret VALUES appear — only names, purposes, and locations.

**Action:**
- Create `docs/admin/invoicing-env-reference.md` (admin-only, Markdown). Lead with a one-paragraph note: this documents variable NAMES and WHERE they live, never values, per `rules/security.md`.
- Build a table with columns: **Variable | Purpose | Runtime | Required | Read at**. Populate from these exact citations:
  - `INVOICE_SUPABASE_URL` — invoice DB URL — Vercel — required — `lib/invoices/supabase/server.ts:18`
  - `INVOICE_SUPABASE_SERVICE_ROLE` — invoice DB service-role key (server-only) — Vercel — required — `lib/invoices/supabase/server.ts:7,19`
  - `SOPHIA_BRIDGE_SECRET` — HMAC shared secret signing the WhatsApp→invoicing bridge; MUST match in both runtimes — Vercel + Supabase Edge — required — verify side `app/api/sophia/intent/route.ts:13`, sign side `supabase/functions/sophia-bot/services/invoice-bridge.ts:16`
  - `SOPHIA_BRIDGE_URL` — bridge endpoint URL (defaults to `https://sofiatesting.vercel.app/api/sophia/intent`) — Supabase Edge — optional — `supabase/functions/sophia-bot/services/invoice-bridge.ts:14`
  - `ADMIN_ACCESS_CODE` — shared code unlocking the admin panel at `/access` — Vercel — required — `lib/access/gate.ts:39`
  - `INVOICES_ACCESS_CODE` — shared code unlocking the invoices page at `/access` — Vercel — required — `lib/access/gate.ts:40`
  - `AUTH_SECRET` — HMAC key signing the access-gate cookie — Vercel — required — `lib/access/gate.ts:17`
  - `INVOICE_ACCOUNTING_GROUP_MSISDN` — accounting WhatsApp group JID for invoice/credit-note delivery — Vercel — required for group send — `lib/invoices/actions/whatsapp-status.ts:25`
  - `SUPABASE_INVOICE_BUCKET` — storage bucket name for generated PDFs (defaults to `invoices`) — Vercel — optional — `lib/invoices/supabase/schema.ts:26`
  - `WASENDER_API_KEY` / `WASENDER_PERSONAL_ACCESS_TOKEN` / `WASENDER_WEBHOOK_SECRET` — WhatsApp send credentials used to deliver invoices/receipts — Vercel — required for WhatsApp delivery — `lib/whatsapp/client.ts` (grep `process.env.WASENDER` to cite exact lines)
- Add a **"Where these live"** section: Vercel env vars are managed via the Vercel dashboard / `vercel env`; Supabase Edge secrets are managed via `supabase secrets set ... --project-ref vceeheaxcrhmpqueudqx` (cite the deploy/secrets pattern from root `CLAUDE.md`). State the HMAC-match requirement for `SOPHIA_BRIDGE_SECRET` prominently.
- Add a **"Rotation note"**: rotating `SOPHIA_BRIDGE_SECRET` requires updating BOTH runtimes atomically or the bridge returns 401 (`route.ts:37`).

**Validation:** (builder self-check)
- `test -f docs/admin/invoicing-env-reference.md && echo EXISTS` → `EXISTS`
- `for v in INVOICE_SUPABASE_URL INVOICE_SUPABASE_SERVICE_ROLE SOPHIA_BRIDGE_SECRET ADMIN_ACCESS_CODE INVOICES_ACCESS_CODE AUTH_SECRET INVOICE_ACCOUNTING_GROUP_MSISDN; do grep -q "$v" docs/admin/invoicing-env-reference.md || echo "MISSING $v"; done` → no `MISSING` lines
- `grep -nE "(SECRET|SERVICE_ROLE|ACCESS_CODE|AUTH_SECRET)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9_/+.-]{12,}" docs/admin/invoicing-env-reference.md ; echo "exit:$?"` → no matches (no pasted secret values)

**Context:** Read @lib/invoices/supabase/server.ts, @lib/invoices/supabase/schema.ts, @app/api/sophia/intent/route.ts, @supabase/functions/sophia-bot/services/invoice-bridge.ts, @lib/access/gate.ts, @lib/invoices/actions/whatsapp-status.ts, @lib/whatsapp/client.ts, @CLAUDE.md, @.planning/PROJECT.md

## Task 3 — Allowlist documentation + maintenance procedure
**Wave:** 1
**Persona:** security
**Files:** `docs/admin/invoicing-allowlist.md` (create) — documents the `INVOICE_AUTHORIZED_AGENTS` allowlist, its two enforcement points, and the exact procedure to add/remove an agent.
**Depends on:** none

**Why:** Only three agents (Fawzi, Charalambos, Marios) may drive invoicing over WhatsApp, and the allowlist is hardcoded in TWO places that must stay in sync — `lib/invoices/constants.ts` (Vercel route) and `supabase/functions/sophia-bot/tools/handlers/invoice.ts` (sophia-bot). A maintainer who updates one and not the other creates a silent authorization mismatch. This doc is the success criterion of the phase and prevents that footgun.

**Acceptance Criteria:**
- The doc names the current allowlist (Fawzi Goussous, Charalambos Pitros, Marios Polyviou) and explains matching is by the last 8 digits of the agent's MSISDN.
- The doc identifies BOTH enforcement points and that they must be kept in sync: `lib/invoices/constants.ts` (`INVOICE_AUTHORIZED_AGENTS`, used by `/api/sophia/intent`) and `supabase/functions/sophia-bot/tools/handlers/invoice.ts` (`ALLOWED_LAST8`, the in-bot gate).
- The doc provides a numbered add-an-agent procedure and a remove-an-agent procedure, including the redeploy steps (rebuild/deploy Vercel for the constant; `supabase functions deploy sophia-bot` for the bot gate).
- The doc states the rationale for defense-in-depth (re-check in the Vercel route at `route.ts:52`) and that an unauthorized number gets a generic deflection (never reveals the allowlist).

**Action:**
- Create `docs/admin/invoicing-allowlist.md` (admin-only, Markdown).
- Section **"Who is on the allowlist"** — list the three entries verbatim from `lib/invoices/constants.ts:10-14`: Fawzi Goussous `35799111668`, Charalambos Pitros `35799076732`, Marios Polyviou `35799921560`. Explain `isAuthorizedAgent` at `constants.ts:20-25` normalizes to digits and compares the last 8.
- Section **"Two enforcement points (keep in sync)"** —
  1. **Vercel route gate:** `lib/invoices/constants.ts` `INVOICE_AUTHORIZED_AGENTS` (`:10`), checked in `app/api/sophia/intent/route.ts:52` (`isAuthorizedAgent(waNumber)` → 403 generic deflection on miss, `route.ts:54-57`). Also used by `lib/invoices/actions/documents.ts:130` to find Marios for the WhatsApp send.
  2. **In-bot gate:** `supabase/functions/sophia-bot/tools/handlers/invoice.ts:27` `ALLOWED_LAST8 = ["99111668", "99076732", "99921560"]`, checked by `isAllowed` (`:29`) before the bridge call (`:43`). This is the FIRST gate — it stops an unauthorized request before it ever leaves the bot.
  - State plainly: the constant in `constants.ts` and the `ALLOWED_LAST8` array in `invoice.ts` encode the SAME three agents and MUST be updated together.
- Section **"Add an agent"** — numbered steps: (1) get the agent's mobile from the `agents` table (Supabase `vceeheaxcrhmpqueudqx`, `mobile` column — cited in `constants.ts:8`); (2) add `{ name, msisdn }` to `INVOICE_AUTHORIZED_AGENTS` in `lib/invoices/constants.ts`; (3) add the last-8 digits to `ALLOWED_LAST8` in `supabase/functions/sophia-bot/tools/handlers/invoice.ts`; (4) if the agent should appear in Sophia's prompt awareness, update the "Authorized staff" line in the DB `invoicing` prompt (and the fallback `supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts:28`); (5) deploy: rebuild/redeploy the Vercel app (`vercel --prod`) AND `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx` (cite deploy commands from root `CLAUDE.md`).
- Section **"Remove an agent"** — the same three code/prompt locations in reverse, plus the same two deploys. Note: removing from only one gate leaves the agent partially authorized (the in-bot gate is the effective block, but leaving them in `constants.ts` means a forged direct call to `/api/sophia/intent` with a valid HMAC would still pass the Vercel re-check — so remove from BOTH).
- Cross-link the runbook (`./invoicing-runbook.md`) and env reference (`./invoicing-env-reference.md`) by relative path.

**Validation:** (builder self-check)
- `test -f docs/admin/invoicing-allowlist.md && echo EXISTS` → `EXISTS`
- `grep -c "INVOICE_AUTHORIZED_AGENTS" docs/admin/invoicing-allowlist.md` → ≥ 1
- `grep -c "ALLOWED_LAST8" docs/admin/invoicing-allowlist.md` → ≥ 1 (both enforcement points documented)
- `grep -c "supabase functions deploy sophia-bot\|vercel --prod" docs/admin/invoicing-allowlist.md` → ≥ 1 (redeploy steps present)

**Context:** Read @lib/invoices/constants.ts, @app/api/sophia/intent/route.ts, @supabase/functions/sophia-bot/tools/handlers/invoice.ts, @supabase/functions/sophia-bot/prompts/behaviors/invoicing.ts, @lib/invoices/actions/documents.ts, @CLAUDE.md

## Success Criteria
- [ ] `docs/admin/invoicing-runbook.md` exists and covers the invoice lifecycle, all 11 Sophia intents, the bridge request path, and the two-Supabase-project topology (`vceeheaxcrhmpqueudqx` + `tijadsdysuxkxrpdlecq`).
- [ ] `docs/admin/invoicing-env-reference.md` documents every invoicing/bridge/access env var name, its purpose, runtime (Vercel vs. Supabase Edge), and read location — in one place.
- [ ] `docs/admin/invoicing-allowlist.md` documents `INVOICE_AUTHORIZED_AGENTS`, both enforcement points, and the add/remove maintenance procedure with redeploy steps.
- [ ] No secret VALUES committed in any of the three docs — variable names and locations only.
- [ ] The three docs cross-link each other by relative path.

## Verification Contract

### Contract for Task 1 — Admin runbook (exists)
**Check type:** file-exists
**Command:** `test -f docs/admin/invoicing-runbook.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 1 — Admin runbook (topology)
**Check type:** grep-match
**Command:** `grep -c "tijadsdysuxkxrpdlecq" docs/admin/invoicing-runbook.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the invoice Supabase project ref is not documented

### Contract for Task 1 — Admin runbook (intents)
**Check type:** grep-match
**Command:** `grep -c "create_draft\|issue_credit_note\|mark_paid" docs/admin/invoicing-runbook.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the Sophia intents are not documented

### Contract for Task 2 — Env reference (exists)
**Check type:** file-exists
**Command:** `test -f docs/admin/invoicing-env-reference.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 2 — Env reference (coverage)
**Check type:** command-exit
**Command:** `for v in INVOICE_SUPABASE_URL INVOICE_SUPABASE_SERVICE_ROLE SOPHIA_BRIDGE_SECRET ADMIN_ACCESS_CODE INVOICES_ACCESS_CODE AUTH_SECRET INVOICE_ACCOUNTING_GROUP_MSISDN; do grep -q "$v" docs/admin/invoicing-env-reference.md || echo "MISSING $v"; done`
**Expected:** No output (no `MISSING` lines)
**Fail if:** Any `MISSING <var>` line is printed — a required env var is undocumented

### Contract for Task 2 — Env reference (no secret values)
**Check type:** command-exit
**Command:** `grep -nE "(SECRET|SERVICE_ROLE|ACCESS_CODE|AUTH_SECRET)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9_/+.-]{12,}" docs/admin/invoicing-env-reference.md; echo "exit:$?"`
**Expected:** `exit:1` (no matches)
**Fail if:** Any line matches — a secret VALUE was pasted into the doc

### Contract for Task 3 — Allowlist (exists)
**Check type:** file-exists
**Command:** `test -f docs/admin/invoicing-allowlist.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 3 — Allowlist (both enforcement points)
**Check type:** grep-match
**Command:** `grep -c "ALLOWED_LAST8" docs/admin/invoicing-allowlist.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the in-bot enforcement point is not documented (only one of two gates covered)

### Contract for Task 3 — Allowlist (redeploy procedure)
**Check type:** grep-match
**Command:** `grep -c "supabase functions deploy sophia-bot\|vercel --prod" docs/admin/invoicing-allowlist.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the maintenance procedure omits the redeploy steps, leaving a maintainer with a desynced allowlist

### Contract for all tasks — No known secret literals in any doc
**Check type:** command-exit
**Command:** `grep -rIlE "eyJ[A-Za-z0-9_-]{20,}|sb_secret_|sbp_[A-Za-z0-9]{20,}" docs/admin/invoicing-*.md; echo "exit:$?"`
**Expected:** `exit:1` (no files match)
**Fail if:** Any doc contains a JWT-shaped or Supabase service-role / secret literal
