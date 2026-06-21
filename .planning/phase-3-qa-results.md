# Phase 3 — Final QA: Automated Regression Results

**Project:** sofiatesting (sofia-ai-assistant v3.1.0)
**Milestone:** M9 (Handoff) — Phase 3 "Final QA"
**Branch:** feature/invoicing-updates
**Date:** 2026-06-21
**Runner:** Builder T1 (capture-only — no source/test edits)

This is a capture/report artifact. Test failures recorded below are **DATA**, not blockers
for this task. Each suite row gives the exact command, exit status, and PASS/FAIL/SKIP counts.

---

## Suite Inventory (read before running — what each covers)

| Suite | Entry | What it covers |
|-------|-------|----------------|
| `tsc --noEmit` | `tsconfig.json` | Whole-project TypeScript typecheck |
| `pnpm build` | `next build` | Next.js 15 production build (App Router, all routes incl. `/invoices`) |
| `pnpm test:unit` | `tsx --test tests/unit/**/*.test.ts` | node:test unit tests. NOTE: the `**` glob only resolves the nested `tests/unit/edge-functions/` dir (vitest files) when expanded by the shell — see "test:unit glob defect" below |
| top-level node:test | `tests/unit/*.test.ts` | `conversation-pruning`, `models`, `parallel-image-uploads`, `whatsapp-session`, `whatsapp-webhook` — isolated logic, mocked `fetch` (per `tests/unit/README.md`) |
| `pnpm test:edge-functions` | `vitest run --config vitest.config.ts` | 13 vitest suites over `supabase/functions/sophia-bot/**` (analytics, bank-detection, database, marketing-parsing, phone-masking, prompt-loader, rate-limiter, region-validator, reviewer-assignment, template-consistency, tool-executor, url-validator, webhook-auth) |
| `pnpm test` (Playwright) | `playwright.config.ts` projects: `e2e`, `routes`, `integration` | Browser e2e (chat, sessions, SOFIA formatting, developer registration, margarita extraction, telegram async webhook, test-all-features), API route tests, and `tests/integration/circuit-breaker.test.ts`. Auto-starts `pnpm dev` on :3000 (`webServer`, 120s boot timeout) |
| `tests/production-readiness.test.ts` | `tsx tests/production-readiness.test.ts` | Live hits against deployed `sophia-bot` Edge Function (3 tiers: must-pass / important / edge+security). Reads `WASEND_WEBHOOK_SECRET` (header line 13; read at `tests/production-readiness.test.ts:28`) |

---

## Results Per Suite

| # | Suite | Command | Exit | PASS | FAIL | SKIP | Verdict |
|---|-------|---------|------|------|------|------|---------|
| 1 | TypeScript typecheck | `npx tsc --noEmit` (after build) | **0** | n/a | 0 | n/a | **GREEN** |
| 2 | Next build | `pnpm build` | **0** | all routes | 0 | n/a | **GREEN** |
| 3 | Unit — top-level node:test | `tsx --test tests/unit/{conversation-pruning,models,parallel-image-uploads,whatsapp-session,whatsapp-webhook}.test.ts` | 1 | 78/79 | 1 | 0 | **1 ENV-BLOCKED (msw missing)** |
| 4 | `pnpm test:unit` (as-scripted) | `tsx --test tests/unit/**/*.test.ts` | 1 | 0/13 files | 13 | 0 | **CONFIG DEFECT (glob + wrong runner)** |
| 5 | Edge functions | `pnpm test:edge-functions` | 1 | 326/336 | 10 | 0 | **FAIL (stale test expectations)** |
| 6 | Playwright e2e/routes/integration | `pnpm test` | 1 | 22 | 62 | 34 did not run | **ENV-BLOCKED (Chromium not installed)** |
| 7 | Production readiness (live Edge) | `tsx tests/production-readiness.test.ts` | **0** | 29/29 | 0 | 0 | **GREEN (PRODUCTION READY)** |

---

## Detail

### 1. `npx tsc --noEmit` — GREEN (exit 0, 0 errors)

- **First run (before build): exit 2, 1 error** — `.next/types/validator.ts(458,39): error TS2307: Cannot find module '../../app/invoices/[id]/download/route.js'`. This is a **stale generated-types artifact**: tsc compiles `.next/types/` which references a route whose generated `.js` types had not yet been emitted.
- **Re-run after `pnpm build` regenerated `.next/types`: exit 0, 0 errors.** The typecheck gate is **GREEN** in the correct ordering (build → typecheck), which matches the milestone exit gate "typecheck + build green".

### 2. `pnpm build` — GREEN (exit 0)

- `next build` completed successfully. All routes compiled, including invoicing routes `/invoices` (36.6 kB), `/api/...` server functions, and middleware (150 kB). No build errors.

### 3. Unit — top-level node:test files — 78/79 PASS, 1 ENV-BLOCKED

Run directly (the packaged `test:unit` glob does not reach these — see #4):
```
ok  Conversation Pruning            (tests/unit/conversation-pruning.test.ts)
not ok  tests/unit/models.test.ts   — ENV-BLOCKED
ok  Parallel Image Upload Tests     (tests/unit/parallel-image-uploads.test.ts)
ok  Integration: Full Upload Flow   (tests/unit/parallel-image-uploads.test.ts)
ok  WhatsApp Session Utils          (tests/unit/whatsapp-session.test.ts)
ok  WhatsApp Webhook Utils          (tests/unit/whatsapp-webhook.test.ts)
# tests 79  # pass 78  # fail 1  # skipped 0
```
- **`models.test.ts` ENV-BLOCKED:** `Error: Cannot find module 'msw'`. The `msw` (Mock Service Worker) dev dependency is **not installed** (`node_modules/msw` absent) and is **not declared in `package.json` devDependencies**. The other 78 tests pass.

### 4. `pnpm test:unit` (as-scripted) — CONFIG DEFECT, exit 1, 0/13 files pass

- Script: `tsx --test tests/unit/**/*.test.ts` (`package.json:21`).
- When the shell expands `tests/unit/**/*.test.ts` without `globstar`, `**` resolves **only** to the nested `tests/unit/edge-functions/` directory — so the script runs the **13 vitest files** under tsx's node:test runner (NOT the 5 top-level node:test files in #3).
- Every one of those 13 fails identically: `Error: Vitest cannot be imported in a CommonJS module using require(). Please use "import" instead.` Those files are **vitest** suites meant for `test:edge-functions` (#5), not tsx `--test`.
- **This is a pre-existing script/glob mismatch, not a regression introduced by M9.** Captured as data; not fixed (capture-only task). The real unit-test signal is in #3 (top-level) and #5 (edge-functions via vitest).

### 5. `pnpm test:edge-functions` (vitest) — 326/336 PASS, 10 FAIL

```
Test Files  1 failed | 12 passed (13)
     Tests  10 failed | 326 passed (336)
  Duration  2.82s
```
All 10 failures are in **`tests/unit/edge-functions/reviewer-assignment.test.ts`** — stale test expectations vs current default reviewer emails (per `CLAUDE.md` reviewer-assignment rules). The other 12 suites pass clean. Failing cases:

1. Paphos sale — `expected 'zyprus@zyprus.com' to be 'listings@zyprus.com'`
2. Limassol sale — same
3. Larnaca sale — same
4. Nicosia sale — same
5. `assignTo` parameter (management assigns to specific agent) — same
6. Michelle rentals → Demetra — `expected 'limassol@zyprus.com' to be 'demetra@zyprus.com'`
7. Reject rental upload by management (Charalambos) — `expected function to throw, but it didn't`
8. Reject rental upload by management (Lauren) — `expected function to throw, but it didn't`
9. Allow management to upload sales — `expected 'zyprus@zyprus.com' to be 'listings@zyprus.com'`
10. Unknown region → null reviewer2 (`reviewer-assignment.test.ts:307`) — `expected 'zyprus@zyprus.com' to be 'listings@zyprus.com'`

These are test-data drift (the implementation returns `zyprus@zyprus.com` / `limassol@zyprus.com`; the tests still assert the old `listings@zyprus.com` / `demetra@zyprus.com` / throw-on-management-rental behavior). Not fixed per capture-only scope.

### 6. `pnpm test` (Playwright) — 22 PASS, 62 FAIL, 34 did not run — ENV-BLOCKED

- **Dev server booted OK:** the run progressed through `[33/118]` and beyond, and 22 browser-independent tests passed — confirming `pnpm dev` came up on :3000 and `/ping` responded (NOT a webServer/port hang).
- **All 62 failures are the same ENV block:** `Error: browserType.launch: Executable doesn't exist at /home/moayad-qualia/.cache/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-linux64/chrome-headless-shell` → remedy printed by Playwright: `pnpm exec playwright install`. The Chromium browser binary is **not installed** in this environment. (62 occurrences of "Executable doesn't exist" in the log.)
- **34 did not run:** workers aborted after the cascade of browser-launch failures.
- This is **ENV-BLOCKED**, not a logic regression — no test reached an assertion; every failure is at `browserType.launch`. Affects projects `e2e`, `routes`, and `integration` (circuit-breaker) equally since all use `devices["Desktop Chrome"]` in `playwright.config.ts`.

### 7. `tsx tests/production-readiness.test.ts` (live Edge) — 29/29 PASS — GREEN

`.env.local` is present and contains `WASEND_WEBHOOK_SECRET` (2 WASEND matches), so the webhook
signature was configured and **no tests skipped**. The suite hit the live deployed Edge Function
at `https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/sophia-bot`.

```
[PASS] Tier 1 (must-pass): 13/13 passed
[PASS] Tier 2 (important):  8/8 passed
[PASS] Tier 3 (edge cases): 8/8 passed
Total: 29/29 passed, 0 failed   Avg: 434ms
VERDICT: PRODUCTION READY
```
Covered: health endpoint + dependency checks (openrouter/supabase/zyprus), calculator math
(VAT/transfer/CGT) + webhook acceptance, agent identification (known/unknown), webhook error
handling, dedup, 5-way concurrency, DOCX routing, property upload, email send, Bazaraki
extraction, logo, XSS/SQLi/prompt-injection safety, oversized/special-char messages, group +
fromMe skip, and Vercel web app reachability.

> **Note on SKIP path:** if `WASEND_WEBHOOK_SECRET` / `WASENDER_WEBHOOK_SECRET` were absent, the
> secret resolves to `""` (`tests/production-readiness.test.ts:27-30`), the signature header is
> omitted (`:72`), the runner prints `WASENDER_WEBHOOK_SECRET not found in .env.local` (`:1063`),
> and webhook POST tests would fail auth. In THIS run the secret was present, so this skip/fail
> path did NOT trigger.

---

## Regression Verdict

**Milestone exit gate ("typecheck + build green"): PASSED.**
- `pnpm build` → exit 0 (GREEN).
- `npx tsc --noEmit` → exit 0, 0 errors when run after the build generates `.next/types` (GREEN). The pre-build tsc error was a stale generated-route-types ordering artifact, not a source-code type error.

**Green suites (run + pass):**
- `pnpm build` — exit 0.
- `tsc --noEmit` (post-build) — exit 0.
- `tests/production-readiness.test.ts` — 29/29, VERDICT PRODUCTION READY (live Edge function healthy).
- Top-level node:test unit files — 78/79 (only failure is the missing-dependency env block below).

**ENV-BLOCKED (cannot run here, not a code regression):**
- Playwright e2e/routes/integration — Chromium binary not installed (`pnpm exec playwright install` required). Dev server booted fine; 22 browser-free tests passed. 62 failed + 34 didn't run, all at `browserType.launch`.
- `tests/unit/models.test.ts` — `msw` dependency not installed / not in `package.json`.

**Genuine FAIL (code/test drift — recorded, not fixed per capture-only scope):**
- `reviewer-assignment.test.ts` — 10/19 cases assert outdated reviewer emails (`listings@`/`demetra@`) and an outdated "management rental rejected" behavior; implementation now returns `zyprus@`/`limassol@` and does not throw. Test-data drift, not a build/typecheck blocker.

**Config defect (recorded):**
- `package.json:21` `test:unit` glob `tests/unit/**/*.test.ts` runs the wrong files (the vitest edge-functions dir) under tsx's node:test runner; all 13 fail to import vitest. The real top-level unit suite must be invoked explicitly (as in suite #3).

**Overall:** The invoicing-milestone exit gate (typecheck + build) is **GREEN**, and the live
production-readiness suite is **fully GREEN**. The remaining red is non-blocking for handoff:
two ENV-BLOCKED suites (need `playwright install` + `msw` install locally) and one set of
stale `reviewer-assignment` test expectations + a `test:unit` script-glob defect to address in a
follow-up (out of scope for this capture task).
