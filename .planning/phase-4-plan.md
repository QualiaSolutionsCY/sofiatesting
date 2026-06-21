---
phase: 4
goal: "Transfer ownership cleanly: a credentials/reference doc, a system walkthrough, legacy-repo archival verification, and a pointer to ERP closure — all as builder-verifiable artifacts in docs/admin/."
tasks: 3
waves: 2
---

# Phase 4: Handoff

**Goal:** When this phase is done, the owner can take over the unified Sophia + invoicing system from three written artifacts under `docs/admin/`: (1) a credentials/reference doc inventorying every Supabase project, the Vercel project, and every Edge/Vercel secret NAME + WHERE it lives, (2) a walkthrough doc mapping the whole system and how to operate/deploy each part, and (3) a recorded archival-verification of the legacy `sophiainvoice` repo. ERP closure is noted as a milestone-close step, not driven by a task.
**Why this phase:** This is the final phase of Milestone 9. It converts a shipped, documented system into an *owned* one — the new owner reads three docs and can run, deploy, and trust the system without the original author.

> **Scope note (docs-only).** Every task here writes Markdown under `docs/admin/`. No `.tsx`/`.css` is touched, so no Design fields apply. Per `rules/security.md`, every doc records variable **NAMES + locations only — NEVER secret VALUES**. Per the handoff learnings, no task has an acceptance criterion that requires a human meeting or external action a builder can't verify — the verifiable deliverable for "walkthrough delivered" is the walkthrough DOC existing and covering the system; for "ERP closure" it is a pointer to the `/qualia-milestone` flow, not a builder action.

---

## Task 1 — Credentials & reference handoff doc
**Wave:** 1
**Persona:** none
**Files:** Create `docs/admin/handoff-credentials.md`
**Depends on:** none

**Why:** The single deliverable a new owner needs first is "what services + secrets does this system depend on, and where do I manage each one?" Without one inventory doc, that knowledge lives only in the original author's head and scattered code. This is the spine of the handoff.

**Acceptance Criteria:**
- The doc inventories **both** Supabase projects with their refs/dashboards: primary `vceeheaxcrhmpqueudqx` (app data — sophia-bot, agents, RLS) and invoice `tijadsdysuxkxrpdlecq` (invoicing — `/admin/invoices`), and the Vercel project `sofiatesting` (prod `https://sofiatesting.vercel.app`).
- The doc lists the **Edge Function secret NAMES** managed via `supabase secrets ... --project-ref vceeheaxcrhmpqueudqx` (at minimum: `OPENROUTER_API_KEY`, `WASEND_API_KEY`, `WASEND_WEBHOOK_SECRET`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `CX3_BASE_URL`/`CX3_USERNAME`/`CX3_PASSWORD`, `ZYPRUS_CLIENT_ID`/`ZYPRUS_CLIENT_SECRET`/`ZYPRUS_API_URL`, `SOPHIA_ADMIN_SECRET`, `SOPHIA_BRIDGE_SECRET`, `SENTRY_DSN`, `FIRECRAWL_API_KEY`) and the **Vercel env var NAMES** for the web app — grounded in the grep inventory, not invented.
- The doc names the **third-party services** behind those keys: OpenRouter (AI), WaSenderAPI (WhatsApp), Telnyx/3CX (telephony/call audit), Resend (email), Zyprus API (property uploads), Sentry (errors), Firecrawl (scraping), Telegram Bot API.
- The doc **cross-links** (does NOT duplicate) the Phase-2 `docs/admin/invoicing-env-reference.md` for the invoicing/bridge-specific variable table and rotation procedure.
- The doc contains **zero secret values** — only NAMES + the management surface (Vercel dashboard/`vercel env`, `supabase secrets`).

**Action:**
- Write `docs/admin/handoff-credentials.md` with a top security banner mirroring `docs/admin/invoicing-env-reference.md:7-12` ("records NAMES + WHERE, no VALUES").
- Section 1 "Hosting & data projects": a table of the two Supabase projects (ref, dashboard URL, what it holds) + the Vercel project (name `sofiatesting`, prod URL, "ADMIN PANEL ONLY" per root `CLAUDE.md`).
- Section 2 "Edge Function secrets (Supabase, ref `vceeheaxcrhmpqueudqx`)": a table of the secret NAMES from the grep inventory with one-line purpose + the `supabase secrets list/set --project-ref vceeheaxcrhmpqueudqx` management commands (cite root `CLAUDE.md` Deploy Commands; secret change requires redeploy of `sophia-bot`).
- Section 3 "Vercel env vars (web app)": for the invoicing/bridge vars, link to `invoicing-env-reference.md` instead of restating; list the broader app var NAMES (e.g. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_ACCESS_CODE`, `INVOICES_ACCESS_CODE`, `RESEND_API_KEY`, `ZYPRUS_*`) with `vercel env ls`/`vercel env add` as the management surface.
- Section 4 "Third-party services": a table mapping each external service to its key NAME and where to obtain/rotate it.
- Section 5 "Related docs": link `invoicing-env-reference.md`, `invoicing-runbook.md`, `invoicing-allowlist.md`, and the new `handoff-walkthrough.md` (Task 2).

**Validation:** (builder self-check)
- `test -f docs/admin/handoff-credentials.md && echo EXISTS` → `EXISTS`
- `grep -Ec "vceeheaxcrhmpqueudqx|tijadsdysuxkxrpdlecq" docs/admin/handoff-credentials.md` → ≥ 2 (both Supabase refs present)
- `grep -c "invoicing-env-reference.md" docs/admin/handoff-credentials.md` → ≥ 1 (cross-links, not duplicates)
- `grep -Eic "BEGIN PRIVATE KEY|service_role.{0,40}eyJ|sk-or-v1-|gho_" docs/admin/handoff-credentials.md` → `0` (no secret values leaked)

**Context:** Read @CLAUDE.md (Deploy Commands, Supabase project IDs, secrets, regional accounts) · @docs/admin/invoicing-env-reference.md (the doc to cross-link, and the security-banner pattern at lines 7-12) · @.continue-here.md (two-Supabase-project topology, the bridge architecture)

---

## Task 2 — System walkthrough / onboarding doc
**Wave:** 1
**Persona:** none
**Files:** Create `docs/admin/handoff-walkthrough.md`
**Depends on:** none

**Why:** "Walkthrough delivered" is a meeting (an action a builder can't verify). The builder-achievable, verifier-checkable form is a written walkthrough a new owner reads to understand the unified system end-to-end and operate it on day one. Converts an un-checkable success criterion into a real artifact.

**Acceptance Criteria:**
- The doc contains an **architecture map** of the unified system covering all major components: the WhatsApp bot (`sophia-bot` Edge Function), the admin panel (`/admin`), the invoicing surface (`/admin/invoices`) and the Sophia→invoicing **bridge** (`/api/sophia/intent`, HMAC-signed via `SOPHIA_BRIDGE_SECRET`), and the **two Supabase projects** (`vceeheaxcrhmpqueudqx` app data vs `tijadsdysuxkxrpdlecq` invoicing).
- The doc explains **how to operate/deploy each component**, citing the exact deploy commands from root `CLAUDE.md` (e.g. `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`, `vercel --prod`) and the Telegram toggle.
- The doc **links every operational runbook**: `invoicing-runbook.md`, `invoicing-allowlist.md`, `invoicing-env-reference.md`, `phase-3-regression-checklist.md`, `admin-panel-guide.md`, the Task-1 `handoff-credentials.md`, and the Task-3 `handoff-archival.md` (the archival-verification doc).
- The doc lists **day-1 operational tasks** for the new owner (e.g. confirm access to both Supabase dashboards + Vercel, run the regression checklist, know who is on the invoicing allowlist, know where secrets are managed).

**Action:**
- Write `docs/admin/handoff-walkthrough.md`.
- Section "System map": reproduce the bridge ASCII flow from `.continue-here.md:14-22` (agent WhatsApp → sophia-bot → bridge → `/api/sophia/intent` → invoice actions → invoiceDb + PDF), and a "what runs where" summary mirroring root `CLAUDE.md` (sophia-bot on Supabase Edge; admin panel + invoicing on Vercel; two DBs).
- Section "Operating each component": for sophia-bot, the admin panel, and the invoicing bridge — what it does, where its code lives (cite `.continue-here.md:24-33` key files), and the deploy command (cite root `CLAUDE.md` Deploy Commands; include the Playwright deploy-gate workaround note from `.continue-here.md:40`).
- Section "Runbooks & references": a linked list of the docs above (including `handoff-archival.md`), one line each on when to use it.
- Section "Day-1 checklist": a short ordered list the new owner runs to confirm ownership.
- Section "Milestone / ERP closure": one paragraph stating that final ERP closure for Milestone 9 is performed via the framework `/qualia-milestone` (milestone-close) flow, not a manual step in this doc.

**Validation:** (builder self-check)
- `test -f docs/admin/handoff-walkthrough.md && echo EXISTS` → `EXISTS`
- `grep -Ec "sophia-bot|/admin/invoices|/api/sophia/intent" docs/admin/handoff-walkthrough.md` → ≥ 3 (all major components mapped)
- `grep -Ec "invoicing-runbook.md|invoicing-allowlist.md|phase-3-regression-checklist.md" docs/admin/handoff-walkthrough.md` → ≥ 3 (operational docs linked)
- `grep -c "qualia-milestone" docs/admin/handoff-walkthrough.md` → ≥ 1 (ERP closure pointer present)
- `grep -c "handoff-archival.md" docs/admin/handoff-walkthrough.md` → ≥ 1 (archival-verification doc cross-linked)

**Context:** Read @.continue-here.md (architecture map, key files, deploy commands, Playwright gate) · @CLAUDE.md (what-runs-where table, Deploy Commands, Telegram toggle) · @docs/admin/invoicing-runbook.md (the day-to-day flow to link) · @docs/admin/phase-3-regression-checklist.md (the regression to reference in day-1 tasks)

---

## Task 3 — Legacy repo archival verification
**Wave:** 2
**Persona:** none
**Files:** Create `docs/admin/handoff-archival.md`
**Depends on:** Task 2 (this doc is linked from `handoff-walkthrough.md`'s references; write the walkthrough first so the link target is consistent)

**Why:** The roadmap requires confirming the legacy `sophiainvoice` GitHub repo is archived. The verifiable deliverable is a recorded status check (live `gh` query) plus the exact remediation command — NOT actually archiving the repo, which is an owner action and per `.continue-here.md` was reportedly already done. Verify, record, don't assume.

**Acceptance Criteria:**
- The doc records the **live archive status** of `QualiaSolutionsCY/sophiainvoice` from a `gh repo view` query, including `isArchived` and the repo URL `https://github.com/QualiaSolutionsCY/sophiainvoice`.
- The doc records that the standalone **Vercel project was already deleted** (per `.continue-here.md:6`).
- The doc provides the **exact `gh repo archive` command** the owner runs *if* the repo were ever found un-archived, so the doc is self-sufficient regardless of current state.
- The doc states the **current confirmed state** (repo `isArchived: true` as verified this phase) so the roadmap criterion "legacy `sophiainvoice` repo confirmed archived" has a recorded evidence trail.

**Action:**
- Run the live status check: `gh repo view QualiaSolutionsCY/sophiainvoice --json isArchived,url,name` and capture the JSON output into the doc as the evidence block. (If `gh` is not authed in the builder's environment, record `INSUFFICIENT EVIDENCE: gh not authed` and still include the command for the owner — do NOT invent a status.)
- Write `docs/admin/handoff-archival.md` with: a "Legacy `sophiainvoice` decommission" intro, the captured `gh repo view` evidence block, a one-line note that the Vercel project is deleted (cite `.continue-here.md:6`), and a "Remediation (only if un-archived)" section containing `gh repo archive QualiaSolutionsCY/sophiainvoice --yes`.
- Add a closing line: ERP / milestone closure is handled by `/qualia-milestone` at milestone close (consistent with Task 2).

**Validation:** (builder self-check)
- `test -f docs/admin/handoff-archival.md && echo EXISTS` → `EXISTS`
- `grep -c "QualiaSolutionsCY/sophiainvoice" docs/admin/handoff-archival.md` → ≥ 1
- `grep -Ec "isArchived" docs/admin/handoff-archival.md` → ≥ 1 (status recorded)
- `grep -c "gh repo archive" docs/admin/handoff-archival.md` → ≥ 1 (remediation command present)

**Context:** Read @.continue-here.md (line 6: "Vercel project deleted and GitHub repo archived" — the claim being verified)

---

## Success Criteria
- [ ] `docs/admin/handoff-credentials.md` exists, inventories both Supabase projects + the Vercel project + all Edge/Vercel secret NAMES + third-party services, cross-links `invoicing-env-reference.md`, and contains zero secret values.
- [ ] `docs/admin/handoff-walkthrough.md` exists, maps all major components (sophia-bot, admin panel, invoicing bridge, two DBs), cites deploy commands, links every operational runbook, and points ERP closure at `/qualia-milestone`.
- [ ] `docs/admin/handoff-archival.md` exists, records the live `gh` archive status of `QualiaSolutionsCY/sophiainvoice` (currently `isArchived: true`) and the remediation command.
- [ ] ERP / milestone closure for Milestone 9 is handled via the `/qualia-milestone` (milestone-close) flow — recorded by the pointer in `docs/admin/handoff-walkthrough.md` (`grep -c "qualia-milestone" docs/admin/handoff-walkthrough.md` → ≥ 1) and noted in `docs/admin/handoff-archival.md`.
- [ ] No task required a human meeting or external action; every AC is checkable by reading a file or running a grep/command.

---

## Verification Contract

### Contract for Task 1 — Credentials doc exists
**Check type:** file-exists
**Command:** `test -f docs/admin/handoff-credentials.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 1 — Both Supabase projects inventoried
**Check type:** grep-match
**Command:** `grep -Ec "vceeheaxcrhmpqueudqx|tijadsdysuxkxrpdlecq" docs/admin/handoff-credentials.md`
**Expected:** Non-zero (≥ 2 — both refs present)
**Fail if:** Returns 0 or 1 — a Supabase project is missing from the inventory

### Contract for Task 1 — Cross-links env reference (no duplication)
**Check type:** grep-match
**Command:** `grep -c "invoicing-env-reference.md" docs/admin/handoff-credentials.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the doc duplicates the Phase-2 env reference instead of linking it

### Contract for Task 1 — No secret values leaked
**Check type:** command-exit
**Command:** `grep -Eic "BEGIN PRIVATE KEY|service_role.{0,40}eyJ|sk-or-v1-|gho_" docs/admin/handoff-credentials.md`
**Expected:** `0`
**Fail if:** Non-zero — a secret VALUE (key/JWT/token) was committed, violating rules/security.md

### Contract for Task 2 — Walkthrough doc exists
**Check type:** file-exists
**Command:** `test -f docs/admin/handoff-walkthrough.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 2 — All major components mapped
**Check type:** grep-match
**Command:** `grep -Ec "sophia-bot|/admin/invoices|/api/sophia/intent" docs/admin/handoff-walkthrough.md`
**Expected:** Non-zero (≥ 3)
**Fail if:** Returns < 3 — the architecture map omits a major component

### Contract for Task 2 — Operational runbooks linked
**Check type:** grep-match
**Command:** `grep -Ec "invoicing-runbook.md|invoicing-allowlist.md|phase-3-regression-checklist.md" docs/admin/handoff-walkthrough.md`
**Expected:** Non-zero (≥ 3)
**Fail if:** Returns < 3 — operational docs are not linked from the walkthrough

### Contract for Task 2 — ERP closure pointer present
**Check type:** grep-match
**Command:** `grep -c "qualia-milestone" docs/admin/handoff-walkthrough.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — ERP/milestone closure not addressed

### Contract for Task 2 — Archival doc cross-linked
**Check type:** grep-match
**Command:** `grep -c "handoff-archival.md" docs/admin/handoff-walkthrough.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the walkthrough does not link the archival-verification doc (breaks the Task 3 → Task 2 dependency rationale)

### Contract for Task 3 — Archival doc exists
**Check type:** file-exists
**Command:** `test -f docs/admin/handoff-archival.md && echo EXISTS`
**Expected:** `EXISTS`
**Fail if:** File does not exist

### Contract for Task 3 — Archive status recorded
**Check type:** grep-match
**Command:** `grep -Ec "isArchived" docs/admin/handoff-archival.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — no recorded archive status for the legacy repo

### Contract for Task 3 — Remediation command present
**Check type:** grep-match
**Command:** `grep -c "gh repo archive" docs/admin/handoff-archival.md`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the doc lacks the owner remediation command
