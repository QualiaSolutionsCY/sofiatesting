---
phase: 3
goal: "A full regression across both halves of the system — property uploads and invoicing — on staging and production."
tasks: 3
waves: 2
---

# Phase 3: Final QA

**Goal:** A full regression across both halves of the system — Sophia property uploads and invoicing — verified to the extent each is mechanically checkable, with the human-only WhatsApp flows captured as exact, runnable regression checklists.
**Why this phase:** Milestone 9 is a handoff. The owner needs proof the unified Sophia + invoicing system is green on production AND a step-by-step script a non-author can re-run to re-verify the WhatsApp flows that no script can drive.

> **QA-phase constraint (read before building):** A builder/verifier CANNOT send real WhatsApp messages, drive a real phone, or act as a Zyprus agent. Tasks are therefore split into (a) things a builder runs and a verifier re-runs by command — test suites, build, the deploy 8-check, a console sweep — and (b) human-only flows, whose deliverable is a *complete, grounded checklist document* that a person executes. "Manually verified on WhatsApp" is NOT an acceptance criterion anywhere in this plan. Every AC below is satisfiable by running a command or reading a file.

## Task 1 — Run the automated regression suites + typecheck/build and capture a results report
**Wave:** 1
**Persona:** backend
**Files:**
- CREATE `.planning/phase-3-qa-results.md` (the captured regression report)
**Depends on:** none

**Why:** The success criteria demand a regression pass; the repo already ships Playwright e2e, unit, edge-function, and production-readiness suites. Running them and capturing PASS/FAIL/SKIP per suite is the only mechanically-verifiable slice of "regression" a builder can produce. Suites that require live secrets will SKIP — documenting *which* skip and *why* is part of the deliverable, not a failure.

**Acceptance Criteria:**
- `.planning/phase-3-qa-results.md` exists and has a row per suite (`test`, `test:unit`, `test:edge-functions`, `tests/production-readiness.test.ts`) with command run, exit status, and PASS/FAIL/SKIP counts.
- `npx tsc --noEmit` result is captured (the invoicing milestone's exit gate is "typecheck + build green").
- `pnpm build` (Next build) result is captured with success/failure.
- For every suite that SKIPS tests, the report names the missing env var / secret that caused the skip (grounded in the test file, e.g. `WASEND_WEBHOOK_SECRET` for production-readiness webhook tests — `tests/production-readiness.test.ts:30`).

**Action:**
1. First inventory each suite by reading its entry so the report describes what it covers — do not claim coverage you didn't read: `tests/production-readiness.test.ts` (live sophia-bot Edge checks: health, calculators, agent ID, webhook, rate limiting, DOCX routing — header lines 1-18), `tests/unit/` (`whatsapp-webhook.test.ts`, `whatsapp-session.test.ts`, `conversation-pruning.test.ts`, `models.test.ts`, `parallel-image-uploads.test.ts`), `tests/e2e/` (Playwright — `chat.test.ts`, `session.test.ts`, `sophia-formatting.test.ts`, `telegram-async-webhook.test.ts`, etc.), `tests/integration/circuit-breaker.test.ts`.
2. Run, capturing full stdout/stderr to the report (use `2>&1 | tee` or redirect): `npx tsc --noEmit`, `pnpm build`, `pnpm test:unit`, `pnpm test:edge-functions`, `pnpm test` (Playwright — it auto-starts the dev server per `playwright.config.ts`; if it cannot bind a port or the dev server fails, record that as a SKIP/ENV-BLOCKED row, do not hang), `pnpm exec tsx tests/production-readiness.test.ts`.
3. For any suite that fails to even start (missing secret, no network), record it as `ENV-BLOCKED` with the exact missing variable, citing the line in the test file that reads it. A suite that runs and reports its own `SKIP` lines counts as run — copy its SKIP summary.
4. Write a short "Regression verdict" section: which suites are green, which are env-blocked, and whether the typecheck/build gate passed.

**Validation:** (builder self-check)
- `test -f .planning/phase-3-qa-results.md && echo EXISTS` → `EXISTS`
- `grep -c "tsc --noEmit" .planning/phase-3-qa-results.md` → ≥ 1
- `grep -Eci "test:unit|test:edge-functions|production-readiness|pnpm build" .planning/phase-3-qa-results.md` → ≥ 4

**Context:** Read @package.json @tests/production-readiness.test.ts @tests/unit/README.md @playwright.config.ts

## Task 2 — Post-deploy 8-check + console-error sweep against production, captured to a report
**Wave:** 1
**Persona:** backend
**Files:**
- CREATE `.planning/phase-3-deploy-check.md` (the captured deploy verification + console sweep)
**Depends on:** none

**Why:** Success criterion 3 is the `rules/deployment.md` post-deploy checklist against `sofiatesting.vercel.app`; criterion 4 is "no critical console errors on `/admin` or `/admin/invoices`". Both are real HTTP/curl/browser checks a builder can run. The access gate means protected routes redirect rather than return 200 — the report must record the redirect behavior as expected, not as a failure.

**Acceptance Criteria:**
- `.planning/phase-3-deploy-check.md` exists with one row per `rules/deployment.md` check: HTTP status of the homepage, auth/access-gate behavior, console errors, API latency (`%{time_total}`), and the UptimeRobot monitor URL to eyeball.
- The report records the actual HTTP status of `https://sofiatesting.vercel.app/` and `https://sofiatesting.vercel.app/admin` and explains the result against the gate: `/admin` is gated by the access cookie (`middleware.ts:32-49`, redirects to `/access?scope=admin`), so a 200 is NOT expected for a cookieless request — a 307/302 redirect to `/access` is the correct, healthy result.
- API latency is measured for at least one real endpoint with `curl -w "%{time_total}"` and the number recorded against the < 500ms target; if an endpoint is auth-gated, the report states what was measured (e.g. the redirect response time) rather than inventing a passing number.
- A console-error sweep of `/admin` and `/admin/invoices` is documented: either (a) the report records that these are access-gated and provides the exact gate-passing path for a human/QA agent (enter `ADMIN_ACCESS_CODE` at `/access?scope=admin`, env var name only — never the value), OR (b) if a browser QA agent with the code reaches the pages, it records the console output. State which path was taken.

**Action:**
1. Run and capture: `curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://sofiatesting.vercel.app/`, then the same for `/admin` and `/admin/invoices`. Record status + timing for each.
2. For each protected route, annotate the result with the gate logic from `middleware.ts` (`/access` redirect for missing/invalid `qs_gate` cookie) so a redirect reads as healthy, not broken. Cite `lib/access/gate.ts` for how the cookie is minted and `middleware.ts` for the redirect.
3. Test the access entry itself is reachable: `curl -s -o /dev/null -w "%{http_code}\n" https://sofiatesting.vercel.app/access` (public per `middleware.ts:18-24`) — a 200 here proves the gate page serves.
4. Record the UptimeRobot monitor URL from `rules/deployment.md` (`https://stats.uptimerobot.com/bKudHy1pLs`) for the human to confirm UP.
5. Write the console-error sweep section per Acceptance Criterion bullet 4 — document the gate-passing procedure (env var NAME only) so the verifier's browser-QA pass can reach `/admin` and `/admin/invoices`.
6. Add a "Deploy verdict" line: pass / pass-with-notes / fail.

**Validation:** (builder self-check)
- `test -f .planning/phase-3-deploy-check.md && echo EXISTS` → `EXISTS`
- `grep -c "sofiatesting.vercel.app" .planning/phase-3-deploy-check.md` → ≥ 3
- `grep -Eci "time_total|http_code|%\{|latency" .planning/phase-3-deploy-check.md` → ≥ 1
- `grep -ci "access" .planning/phase-3-deploy-check.md` → ≥ 1 (gate documented)

**Context:** Read @middleware.ts @lib/access/gate.ts @/home/moayad-qualia/.claude/rules/deployment.md

## Task 3 — Author the human-run WhatsApp regression checklists (property upload + invoice lifecycle)
**Wave:** 2
**Persona:** none
**Files:**
- CREATE `docs/admin/phase-3-regression-checklist.md` (the human-executable regression script)
**Depends on:** Task 1, Task 2

**Why:** Success criteria 1 and 2 — Sophia property upload (WhatsApp → draft → Zyprus) and the full invoice lifecycle over WhatsApp (create → approve → mark paid → receipt/credit note → PDF delivery) — genuinely require a person with WhatsApp and a real agent number. A builder cannot drive them. The builder-achievable, verifier-checkable deliverable is a *complete, grounded checklist*: each step states the exact phrase to send, the expected Sophia reply, and the DB table/row to confirm. It reuses the Task 1/Task 2 reports as the "automated coverage already done" preamble so the human only runs the irreducibly-manual steps.

**Acceptance Criteria:**
- `docs/admin/phase-3-regression-checklist.md` exists with two top-level sections: **A. Property-upload regression** and **B. Invoice-lifecycle regression**.
- Section A walks WhatsApp → draft → Zyprus: send an upload to a region-valid agent number, expected Sophia field-collection replies, and the DB checks — `listing_uploads` (publication tracking, per CLAUDE.md) and `chat_history` on project `vceeheaxcrhmpqueudqx`. It names the region restriction (agent can only upload in `agents.region`) and the min-1-image rule, both grounded in CLAUDE.md.
- Section B covers every lifecycle stage with the exact agent phrase → expected reply → DB check, grounded in the runbook's intent table: `create_draft`, `approve` (two-step group message), `mark_paid`/`issue_receipt`, `issue_credit_note` (two-step, groupMessage required), and PDF delivery (`resend`/`send_pdf`). Each step names the invoice-DB table to inspect on project `tijadsdysuxkxrpdlecq` (`invoice_documents`, `invoice_approvals`, `invoice_payments`, `invoice_storage_objects`).
- The checklist states the allowlist precondition (sender must be Fawzi/Marios/Charalambos per the allowlist doc; matched on last-8 digits) and links the three Phase-2 docs (`invoicing-runbook.md`, `invoicing-allowlist.md`, `invoicing-env-reference.md`) so the runner has the full operational context.
- Every step has a checkbox `- [ ]` and an explicit "Expected" and "Verify in DB" line — no step says only "check it works".
- No secret values appear (env var NAMES only).

**Action:**
1. Build Section B from the runbook's intent table (`docs/admin/invoicing-runbook.md:228-247`) and lifecycle section (lines 149-217). For each lifecycle stage write: the WhatsApp phrase (column "Agent phrase"), the expected Sophia behavior (e.g. `approve` is two-step — first call numbers the invoice and asks for a group message, second call posts to the accounting group — runbook lines 183-193), and the invoice-DB table to confirm the state transition.
2. Build Section A from CLAUDE.md "Property Uploads" + `tests/manual/README-UPLOADS.md`: region restriction, min-1-image, floor-plan field, `listing_uploads` publication tracking polled by `listing-notifier`. Provide a sample upload message and the `chat_history` / `listing_uploads` checks.
3. Add a top "Automated coverage already completed" preamble linking `.planning/phase-3-qa-results.md` and `.planning/phase-3-deploy-check.md` so the human knows what's already green and only runs the manual WhatsApp steps.
4. Add the allowlist + two-Supabase-project preconditions block, linking the three Phase-2 docs.

**Validation:** (builder self-check)
- `test -f docs/admin/phase-3-regression-checklist.md && echo EXISTS` → `EXISTS`
- `grep -c "\- \[ \]" docs/admin/phase-3-regression-checklist.md` → ≥ 8 (at least 8 checkbox steps)
- `grep -Eci "create_draft|approve|mark_paid|issue_credit_note|issue_receipt" docs/admin/phase-3-regression-checklist.md` → ≥ 4
- `grep -Eci "listing_uploads|chat_history|invoice_documents" docs/admin/phase-3-regression-checklist.md` → ≥ 3
- `grep -ci "secret\|service_role\|password" docs/admin/phase-3-regression-checklist.md | head` — manually confirm no secret VALUES appear (names are fine)

**Context:** Read @docs/admin/invoicing-runbook.md @docs/admin/invoicing-allowlist.md @tests/manual/README-UPLOADS.md @CLAUDE.md @.planning/phase-3-qa-results.md @.planning/phase-3-deploy-check.md

## Success Criteria
- [ ] Automated regression suites + `tsc --noEmit` + `pnpm build` run and captured in `.planning/phase-3-qa-results.md`, with each env-blocked/SKIP suite explained by its missing variable.
- [ ] Post-deploy 8-check + API latency + access-gate behavior captured in `.planning/phase-3-deploy-check.md`, with protected-route redirects documented as healthy (not failures).
- [ ] Console-error sweep procedure for `/admin` and `/admin/invoices` documented (gate-passing path, env var names only) or executed.
- [ ] `docs/admin/phase-3-regression-checklist.md` provides complete, grounded, human-runnable scripts for the WhatsApp property-upload flow and the full invoice lifecycle, every step with phrase → expected reply → DB check.

## Verification Contract

### Contract for Task 1 — QA results report exists
**Check type:** file-exists
**Command:** `test -f .planning/phase-3-qa-results.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 1 — typecheck + build captured
**Check type:** grep-match
**Command:** `grep -Eci "tsc --noEmit|pnpm build|next build" .planning/phase-3-qa-results.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the typecheck/build gate result was not recorded

### Contract for Task 1 — all four suites referenced
**Check type:** grep-match
**Command:** `grep -Eci "test:unit|test:edge-functions|production-readiness|playwright|pnpm test" .planning/phase-3-qa-results.md`
**Expected:** Non-zero (≥ 3)
**Fail if:** Returns < 3 — not all regression suites were run/recorded

### Contract for Task 2 — deploy-check report exists
**Check type:** file-exists
**Command:** `test -f .planning/phase-3-deploy-check.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 2 — production URL probed with timing
**Check type:** grep-match
**Command:** `grep -c "sofiatesting.vercel.app" .planning/phase-3-deploy-check.md`
**Expected:** Non-zero (≥ 3) — homepage, /admin, /admin/invoices
**Fail if:** Returns < 3 — the deploy checks did not cover the required routes

### Contract for Task 2 — access gate documented
**Check type:** grep-match
**Command:** `grep -Eci "access|redirect|gate" .planning/phase-3-deploy-check.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — protected-route redirect behavior not explained, so a redirect would be misread as a failure

### Contract for Task 3 — regression checklist exists
**Check type:** file-exists
**Command:** `test -f docs/admin/phase-3-regression-checklist.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 3 — both halves and lifecycle covered
**Check type:** grep-match
**Command:** `grep -Eci "create_draft|approve|mark_paid|issue_receipt|issue_credit_note" docs/admin/phase-3-regression-checklist.md`
**Expected:** Non-zero (≥ 4)
**Fail if:** Returns < 4 — the invoice lifecycle is not fully scripted

### Contract for Task 3 — DB-check grounding present
**Check type:** grep-match
**Command:** `grep -Eci "listing_uploads|chat_history|invoice_documents|invoice_payments" docs/admin/phase-3-regression-checklist.md`
**Expected:** Non-zero (≥ 3)
**Fail if:** Returns < 3 — steps lack the table to inspect, making them unverifiable by the human runner

### Contract for Task 3 — steps are checkboxes (executable)
**Check type:** grep-match
**Command:** `grep -c "\- \[ \]" docs/admin/phase-3-regression-checklist.md`
**Expected:** Non-zero (≥ 8)
**Fail if:** Returns < 8 — not enough discrete, runnable regression steps
