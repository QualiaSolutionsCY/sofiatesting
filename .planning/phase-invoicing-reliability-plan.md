---
phase: invoicing-reliability
goal: "No invoicing delivery path reports success unless the send actually succeeded; two legal documents can never share an official number; the approval audit trail is durably recorded."
tasks: 5
waves: 3
---

# Phase Invoicing-Reliability: Truthful delivery + number integrity + audit trail

**Goal:** Every admin toast and every Sophia reply is gated on the REAL send result; two legally-distinct documents can NEVER get the same official number; the approval audit trail is durably written and rebuilt from the DB.
**Why this phase:** Marios reports "the system says it sent but nothing arrived." The audit (`.planning/reports/review/REVIEW.md`) found 1 CRITICAL (duplicate legal numbers under concurrency) and 15 HIGH (send paths report success while delivering nothing). This phase makes the money-handling surface honest and tamper-evident.

> Source of truth: `@.planning/reports/review/REVIEW.md`. All file:line citations below were re-confirmed against the live code on 2026-06-25.
>
> **Stack constraint (do not violate):** `npx tsc --noEmit` does NOT cover `supabase/functions/**`. Edge-function changes (Task 4) MUST be validated with `deno check` and/or deploy — a backtick bug once slipped past tsc and was only caught at deploy. tsc IS authoritative for `lib/`, `components/`, `app/`.
> **Prompt constraint:** the invoicing prompt is file-pinned via `FILE_OVERRIDE_KEYS` in `supabase/functions/sophia-bot/services/prompt-loader.ts` — no task here touches prompts; do not reintroduce DB-prompt drift.
> **Backwards-compat constraint:** must not break normal invoice create/approve delivery, the already-fixed credit-note caption, the already-fixed receipt→Marios-only routing, or the already-fixed admin Send-email (RESEND_API_KEY on Vercel). Every change THREADS a boolean — it does not remove an existing working send.

---

## Task 1 — Thread real send-result booleans through the Marios-WhatsApp action layer + fix the blank-caption fallback
**Wave:** 1
**Persona:** backend
**Files:** `lib/invoices/actions/documents.ts`
**Depends on:** none

**Why:** `notifyMariosOverWhatsApp` (`documents.ts:131-196`) returns `Promise<void>` and swallows every failure (`catch (error) { sendLogger.error(...) }`, `documents.ts:191-195`), and `notifyMariosApprovedAction` (`documents.ts:117-122`) discards everything. No success signal can reach any caller, so every Sophia/admin "sent to Marios" claim is unverifiable. Separately, when the caption is blank (receipts: `caption=""` at `documents.ts:160-161`) and the PDF send fails, the fallback calls `client.sendMessage({ text: "" })` (`documents.ts:189`) which WaSender rejects (empty text — `lib/whatsapp/client.ts:267-272` documents that the document path OMITS empty text for exactly this reason), so the fallback also fails silently. Same flaw in `sendDocumentToAccountingGroup` (`documents.ts:521-524`). This task makes the action layer report truth; Tasks 2–3 consume the booleans.

**Acceptance Criteria:**
- `notifyMariosOverWhatsApp` returns `Promise<boolean>` — `true` only when a WhatsApp message (document OR text fallback) actually succeeded, `false` on missing Marios / unconfigured client / both sends failing / thrown error.
- `notifyMariosApprovedAction` returns the boolean from `notifyMariosOverWhatsApp` on its `DocumentsActionResult` (add a `mariosNotified: boolean` field to `DocumentsActionResult`, OR return the boolean — see Action) so callers can gate.
- When the caption is blank and the PDF send fails, the code does NOT call `sendMessage({ text: "" })` — it either retries the document or returns `false`. No empty-text WaSender call is ever made.
- `sendDocumentToAccountingGroup` blank-caption fallback (`documents.ts:521-524`) has the same guard: never `sendMessage({ text: "" })`.
- Existing callers still compile (`resendCorrectedInvoiceAction`, `cancelWithCreditNoteAction`, `markPaidAndIssueReceiptAction`, `sendToMariosAction` already `await` it — they must keep working; their return values may stay discarded for now except where Task 2/3 wires them).

**Action:**
1. Change `notifyMariosOverWhatsApp` signature to `Promise<boolean>`. Return `false` at the early `if (!marios)` (`:136`) and `if (!client.isConfigured())` (`:171`) guards. On the document send (`:177`), capture `sent.success`. In the `if (!sent.success)` branch (`:184-190`): if `caption.trim()` is non-empty, attempt the text fallback and `return text.success`; if `caption` is blank, do NOT call `sendMessage` — log and `return false` (the empty-caption document is the only valid form; an empty text fallback is impossible). On success path `return true`. In the outer `catch` (`:191-195`) `return false`.
2. Change `notifyMariosApprovedAction` (`:117-122`) to capture `const mariosNotified = await notifyMariosOverWhatsApp(document, { approved: true });` and add `mariosNotified` to the returned object. Add `mariosNotified?: boolean;` to the `DocumentsActionResult` type (`:52-58`).
3. In `sendDocumentToAccountingGroup` (`:499-530`), in the `if (!sent.success)` branch (`:521-524`): only attempt the `sendMessage` text fallback when `caption.trim()` is non-empty; when blank, log and `return false`. (The group caption is sometimes intentionally blank — `notifyAccountingGroupOfInvoiceAction` `:544-546` — so the empty-text fallback there is the bug.)
4. Leave `notifyGroupOfCreditNote` (`:455-492`) UNCHANGED — its caption is always non-empty (`documents.ts:463-464`), confirmed by the audit (`REVIEW.md:48` "the `notifyGroupOfCreditNote` path … is NOT affected").

**Validation:** (builder self-check)
- `grep -n "Promise<boolean>" lib/invoices/actions/documents.ts` → `notifyMariosOverWhatsApp` now listed (≥ 1 new match beyond `sendDocumentToAccountingGroup`).
- `grep -n "sendMessage({ to: marios.msisdn, text: caption })" lib/invoices/actions/documents.ts` → returns 0 (the unconditional empty-text fallback is gone).
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

**Context:** Read @lib/invoices/actions/documents.ts @lib/whatsapp/client.ts @.planning/reports/review/REVIEW.md

---

## Task 2 — Wire `forwardAccountingAction` and Sophia `request_correction`/`resend` intents to REAL senders; relabel the no-op manual provider
**Wave:** 2
**Persona:** backend
**Files:** `lib/invoices/actions/documents.ts`, `lib/invoices/sophia/intent-handlers.ts`, `lib/invoices/integrations/manual-provider.ts`
**Depends on:** Task 1

**Why:** Three live operator/agent paths route ONLY through the no-op `deliverWithManualProvider` (`manual-provider.ts:13-24`) which returns `queueStatus:"sent"` / `copied:false` and sends nothing: (a) admin "Resend both" → `forwardAccountingAction` (`documents.ts:300-307`) calls only `queueAccountingHandoff`, never `sendDocumentToAccountingGroup` (`REVIEW.md:50`); (b) Sophia `request_correction` (`intent-handlers.ts:305-310`) and `resend` (`intent-handlers.ts:351-357`) both go through `correctResendAction → queueCorrectedResend → deliverWithManualProvider` while the admin equivalent uses the REAL `resendCorrectedInvoiceAction` (`documents.ts:584-617`) (`REVIEW.md:44`). The manual provider is the ONLY delivery backend wired to live actions and records "sent" for a non-send (`REVIEW.md:49`). Fix the senders AND stop the stub from claiming "sent".

**Acceptance Criteria:**
- `forwardAccountingAction` calls the real `sendDocumentToAccountingGroup(updated, caption)` (same caption rule as `notifyAccountingGroupOfInvoiceAction` — agent name when commission, else blank), keeps `queueAccountingHandoff(updated)` ONLY for the audit record, and the function still returns a `DocumentsActionResult`. The accounting group actually receives the PDF.
- Sophia `request_correction` and `resend` intents call the REAL sender (`resendCorrectedInvoiceAction(doc.id, reason)`), which already posts to the group AND Marios; their replies state the truth only when the send is attempted (the action is best-effort but real — no longer the dead `correctResendAction` queue-only path).
- `deliverWithManualProvider` no longer reports `queueStatus:"sent"` for a non-send: change `queueStatus` to `"failed"` (a valid `ACTION_QUEUE_STATUS_VALUES` member — `lib/invoices/supabase/schema.ts:69-75`) and keep `deliveryStatus:"manual-copy-ready"`, so the audit trail no longer represents an unsent item as delivered. (It is now only reached by genuinely-queue-only callers after Task 2's rewiring.)
- `npx tsc --noEmit` exits 0.

**Action:**
1. In `forwardAccountingAction` (`documents.ts:300-307`): after `const updated = forwardToAccounting(document)` and the save, compute `const caption = updated.requiresCommissionPerson && updated.commissionPersonName ? updated.commissionPersonName : "";` then `const sent = await sendDocumentToAccountingGroup(updated, caption);` BEFORE `await queueAccountingHandoff(updated);` (keep the queue for audit). Return the result as before; optionally surface `sent` on the result for the toast (Task 3 reads `forwardAccountingAction`'s success). Simplest contract: add `accountingGroupNotified?: boolean` to `DocumentsActionResult` and set it from `sent`.
2. In `intent-handlers.ts`, import `resendCorrectedInvoiceAction` from `@/lib/invoices/actions/documents` (add to the existing import block `:3-14`). In `case "request_correction"` (`:305-310`) replace `await correctResendAction(doc.id, params.correctionReason || "Correction requested")` with `await resendCorrectedInvoiceAction(doc.id, params.correctionReason || "Correction requested")`. In `case "resend"` (`:351-357`) replace `await correctResendAction(doc.id, params.correctionReason || "Resend requested")` with `await resendCorrectedInvoiceAction(doc.id, params.correctionReason || "Resend requested")`. Keep the existing replies (`"Marked … for correction & resend."`, `"Resent … PDF attached."`) — they are now truthful because the real sender ran.
3. In `manual-provider.ts:13-24` change `queueStatus: "sent"` to `queueStatus: "failed"`. Leave `deliveryStatus: "manual-copy-ready"` and `copied: false`. Add a one-line comment: `// Not a real send — recorded as failed/manual-copy-ready so the audit trail never claims delivery.`

**Validation:** (builder self-check)
- `grep -n "sendDocumentToAccountingGroup" lib/invoices/actions/documents.ts` → `forwardAccountingAction` now references it (≥ 1 match inside that function's range ~300-308).
- `grep -c "resendCorrectedInvoiceAction" lib/invoices/sophia/intent-handlers.ts` → `≥ 2` (request_correction + resend).
- `grep -n "queueStatus: \"sent\"" lib/invoices/integrations/manual-provider.ts` → `0`.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

**Context:** Read @lib/invoices/actions/documents.ts @lib/invoices/sophia/intent-handlers.ts @lib/invoices/integrations/manual-provider.ts @lib/invoices/supabase/schema.ts @.planning/reports/review/REVIEW.md

---

## Task 3 — Gate every admin toast and the Sophia approve reply on the real send results
**Wave:** 3
**Persona:** frontend
**Files:** `components/invoices/redesign/App.tsx`, `lib/invoices/sophia/intent-handlers.ts`
**Depends on:** Task 1, Task 2

**Why:** Four admin toasts fire unconditionally regardless of send outcome — approve-from-draft (`App.tsx:270-278`), auto-approve-on-create (`App.tsx:627-636`), "Resend both" / accounting-resend (`App.tsx:566-571`, claims "WhatsApp + Email" though no email is queued), and `sent-to-marios` (`App.tsx:287-292`, claims "bumped in CSC Review group" while sending to Marios's personal number) — and the Sophia approve reply (`intent-handlers.ts:216-224`) claims "sent a copy to Marios" based ONLY on the group boolean while discarding the Marios result. With Tasks 1–2 threading real booleans, this task makes the operator-facing copy match reality and name exactly who was reached.

**Acceptance Criteria:**
- Approve-from-draft (`App.tsx:262-285`): capture `notifyAccountingGroupOfInvoiceAction` (already returns `boolean`) and `notifyMariosApprovedAction` (now returns `mariosNotified`); the toast names each channel that actually succeeded and says delivery "could not be confirmed" for any that returned false. Never an unconditional "sent to Marios and the accounting group".
- Auto-approve-on-create (`App.tsx:627-636`): collect the three booleans (`notifyAccountingGroupOfInvoiceAction`, `notifyMariosApprovedAction.mariosNotified`, `autoEmailApprovedInvoiceAction` already returns `boolean`); the toast claims only the channels that returned true.
- Accounting-resend (`App.tsx:566-571`): gate the toast on `forwardAccountingAction`'s real result (Task 2 added `accountingGroupNotified`); drop the false "Email" claim — copy reflects WhatsApp only, and says it couldn't be confirmed when false.
- `sent-to-marios` (`App.tsx:287-292`): `sendToMariosAction` returns a Marios-notified signal (thread the boolean through it the same way as `notifyMariosApprovedAction`); gate the toast on it and correct the copy to "Sent to Marios" (not "bumped in CSC Review group").
- Sophia approve reply (`intent-handlers.ts:216-224`): capture the Marios result from `notifyMariosApprovedAction` and word the reply from BOTH `sentToGroup` AND the Marios flag, naming who was reached.
- `npx tsc --noEmit` exits 0.

**Action:**
1. `sendToMariosAction` (`documents.ts:100-111`) — thread the boolean: capture `const mariosNotified = await notifyMariosOverWhatsApp(updated, { override: messageOverride });` and add `mariosNotified` to its returned result. (This file is also touched by Tasks 1/2, all in the same `documents.ts` — sequence them; Task 3 owns this specific edit if not already added.)
2. `App.tsx` approve-from-draft branch (`:262-285`): `const groupOk = await notifyAccountingGroupOfInvoiceAction(selected.id); const mResult = await notifyMariosApprovedAction(selected.id); const mariosOk = mResult.mariosNotified ?? false;` Build the toast from `groupOk`/`mariosOk` (e.g. `"Approved. " + [mariosOk ? "Sent to Marios" : "Marios delivery NOT confirmed", groupOk ? "posted to accounting group" : "accounting group NOT confirmed"].join("; ") + "."`).
3. `App.tsx` auto-approve-on-create branch (`:627-636`): `const groupOk = await notifyAccountingGroupOfInvoiceAction(createdId); const mResult = await notifyMariosApprovedAction(createdId); const mariosOk = mResult.mariosNotified ?? false; const emailOk = await autoEmailApprovedInvoiceAction(createdId);` Build the toast naming only true channels; if none, say "created — delivery could not be confirmed on any channel."
4. `App.tsx` accounting-resend branch (`:566-571`): `const result = await forwardAccountingAction(selected.id);` then toast on `result.accountingGroupNotified` — `result.accountingGroupNotified ? "Accounting copy resent over WhatsApp." : "Couldn't confirm the accounting resend — try again."`. Remove "(WhatsApp + Email)".
5. `App.tsx` sent-to-marios branch (`:287-292`): `const result = await sendToMariosAction(selected.id);` toast on `result.mariosNotified` — `"Sent to Marios."` vs `"Couldn't confirm the send to Marios — try again."`.
6. `intent-handlers.ts` approve (`:216-224`): `const sentToGroup = await sendDocumentToAccountingGroup(updated, caption); const mResult = await notifyMariosApprovedAction(updated.id); const mariosOk = mResult.mariosNotified ?? false;` Reply naming both, e.g. `Approved ${updated.clientName} — № ${num}. ${mariosOk ? "Sent Marios his copy" : "Couldn't reach Marios"}; ${sentToGroup ? "posted to the accounting group" : "couldn't reach the group"}.`

**Validation:** (builder self-check)
- `grep -n "sent to Marios and the accounting group" components/invoices/redesign/App.tsx` → `0` (the unconditional string is gone).
- `grep -n "WhatsApp + Email" components/invoices/redesign/App.tsx` → `0`.
- `grep -cn "mariosNotified\|accountingGroupNotified\|groupOk\|mariosOk\|emailOk" components/invoices/redesign/App.tsx` → `≥ 5` (toasts now reference real result vars).
- `grep -n "mariosNotified\|mariosOk" lib/invoices/sophia/intent-handlers.ts` → `≥ 1`.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

**Context:** Read @components/invoices/redesign/App.tsx @lib/invoices/sophia/intent-handlers.ts @lib/invoices/actions/documents.ts @.planning/reports/review/REVIEW.md

**Design:**
- Register: product
- Tokens used: none (no visual change — only string literals inside existing toast calls are made conditional; no new markup, components, layout, or styles)
- Scope: component
- Anti-pattern guard: builder runs `node bin/slop-detect.mjs components/invoices/redesign/App.tsx` pre-commit; expected zero hits (no new markup introduced)

---

## Task 4 — Fix the edge `documentSent` bug: set it from the real send result, only save last-document on success
**Wave:** 1
**Persona:** backend
**Files:** `supabase/functions/sophia-bot/tools/handlers/invoice.ts`
**Depends on:** none

**Why:** `sendDocumentByUrl` (`utils/wasend.ts:578-624`, `Promise<Response>`) NEVER throws — it returns a `Response` with status 503 on breaker-open, 500 on fetch error, or the WaSend status. The handler (`invoice.ts:111-134`) ignores the returned `Response`, sets `documentSent = true` unconditionally (`:118`), and the only failure handling is a `catch` that can never fire for a non-ok HTTP status. `webhook.ts` then suppresses the text reply when `documentSent` is true, so on ANY WaSend failure the agent who created/approved/receipted gets NEITHER the PDF NOR the confirmation text (`REVIEW.md:41-42`). Additionally `saveLastDocument` (`:125-130`) runs without checking the result, registering an undelivered PDF as the user's "last document" (`REVIEW.md:42`). This is the single silent-total-failure on the Sophia receipt path.

**Acceptance Criteria:**
- The handler captures the `Response` from `sendDocumentByUrl` and sets `documentSent = res.ok` (not `true`).
- `saveLastDocument` is only called when `res.ok` is true.
- On a non-ok response, `documentSent` stays `false` (so `webhook.ts` falls through to the text reply) and the non-ok status is logged.
- `deno check` passes on the touched file (tsc does NOT cover edge functions — do not rely on tsc here).
- No behavior change on the success path (res.ok === true → documentSent true, last document saved) — backwards compatible.

**Action:**
1. In `invoice.ts:111-134` replace `await sendDocumentByUrl(...)` with `const res = await sendDocumentByUrl(phoneNumber || agent?.mobile || "", result.pdfUrl, result.filename || docMeta.filename, result.reply);`.
2. Replace the unconditional `documentSent = true;` (`:118`) with `documentSent = res.ok;`.
3. Wrap the `saveLastDocument` block (`:123-131`) in `if (res.ok) { ... }`.
4. Add a log line in an `else`/after for `!res.ok`: e.g. `console.error("sendDocumentByUrl non-ok", res.status);` so a drop is visible. Keep the existing `try/catch` (it now only guards genuine throws); remove the misleading `// Non-fatal — the text reply still goes out` comment (`:133`) since the whole point is the text reply now DOES go out on failure.

**Validation:** (builder self-check)
- `grep -n "documentSent = res.ok" supabase/functions/sophia-bot/tools/handlers/invoice.ts` → `1`.
- `grep -n "documentSent = true" supabase/functions/sophia-bot/tools/handlers/invoice.ts` → `0`.
- `grep -n "if (res.ok)" supabase/functions/sophia-bot/tools/handlers/invoice.ts` → `≥ 1` (guards saveLastDocument).
- `deno check supabase/functions/sophia-bot/tools/handlers/invoice.ts` → exits 0 (run from repo root; if deno resolves the import map, use `deno check --import-map=supabase/functions/import_map.json` if one exists). DO NOT use tsc for this file.

**Context:** Read @supabase/functions/sophia-bot/tools/handlers/invoice.ts @supabase/functions/sophia-bot/utils/wasend.ts @.planning/reports/review/REVIEW.md

---

## Task 5 — Official-number integrity (DB unique index + transactional allocation + 23505 retry) and durable approval audit trail
**Wave:** 1
**Persona:** architect
**Files:** `supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql` (NEW), `lib/invoices/supabase/document-repository.ts`, `lib/invoices/supabase/document-mappers.ts`
**Depends on:** none

**Why:** **CRITICAL** (`REVIEW.md:31`): official numbers are computed in app code via `Math.max(...)+1` over a stale in-app list (`numbering.ts:53-65`, `documents.ts:198-208`) with no transaction/lock, and the live DB has NO unique on `(kind, official_number)` — four concurrent writers (admin actions, Sophia bridge, the ✓-approval webhook `webhook-repository.ts:86-89`, create flow) can read the same max and assign the same legal number to two distinct tax documents, both succeeding silently. **HIGH** (`REVIEW.md:51`): the approval audit trail is destroyed every round-trip — `writeRelatedRows` (`document-repository.ts:202-241`) NEVER inserts into `invoice_approvals` (live table has 0 rows vs 59 documents), and `fromDocumentRow` (`document-mappers.ts:205-211`) fabricates a single synthetic timeline entry (`"Loaded from Supabase document row" / "Sophia"`) instead of rebuilding from the DB. For a financial system there is no durable record of who approved each invoice.

**Acceptance Criteria:**
- A new migration file creates a partial unique index: `CREATE UNIQUE INDEX ... ON invoice_documents (kind, official_number) WHERE official_number IS NOT NULL AND deleted_at IS NULL;` Two distinct live documents of the same kind can never share an official number at the DB level.
- The official-number allocation is transactional: a Postgres RPC (`allocate_official_number(p_kind text)`) selects the current max trailing-numeric per kind under a lock and returns the next, callable from the save path; OR `saveInvoiceDocument` retries the upsert on a `23505` unique-violation by re-allocating the next number (the index makes the race fail loudly instead of silently colliding). Either way, a concurrent collision results in distinct numbers, never a duplicate.
- `writeRelatedRows` inserts the document's approval events into `invoice_approvals` (using `toApprovalRows` mapped to the resolved internal `document_id` FK, mirroring how `revisions`/`payments` write `document_id: documentId` at `document-repository.ts:192,224,234`).
- `fromDocumentRow` no longer hardcodes `"Loaded from Supabase document row"`; `approvalTimeline` is rebuilt from the document's `invoice_approvals` rows (and/or `invoice_document_revisions`) so the timeline reflects real history.
- The migration applies cleanly. **Known issue:** local/remote migration history can mismatch and block `supabase db push` — if push fails, apply this migration's SQL via the Supabase dashboard SQL editor (project `vceeheaxcrhmpqueudqx`) and note it. The DDL must be idempotent (`CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- `npx tsc --noEmit` exits 0 (the `lib/` changes); the migration is SQL (not tsc-covered).

**Action:**
1. **Migration** `supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql`:
   - Pre-flight comment noting the dashboard-fallback if `db push` history mismatches.
   - `CREATE UNIQUE INDEX IF NOT EXISTS invoice_documents_kind_official_number_key ON invoice_documents (kind, official_number) WHERE official_number IS NOT NULL AND deleted_at IS NULL;`
   - A `CREATE OR REPLACE FUNCTION public.allocate_official_number(p_kind text) RETURNS bigint LANGUAGE plpgsql AS $$ ...$$;` that, inside the function, locks the relevant rows (e.g. `SELECT ... FROM invoice_documents WHERE kind = p_kind AND official_number IS NOT NULL AND deleted_at IS NULL FOR UPDATE`), computes the max of the trailing numeric group of `official_number` (mirror `extractSequence` from `numbering.ts:11-15` — trailing `\d+` group, NOT `replace(/\D/g,'')`), applies the same per-kind fallback floors as `numbering.ts:61` (`credit-note`→10096, `receipt`→10386, else 11424), and returns `max+1` (or `floor+1` when none). `SECURITY DEFINER` is acceptable since it is called via service role; set `search_path = public`.
   - Grant execute to the roles the service client uses if needed (`GRANT EXECUTE ON FUNCTION public.allocate_official_number(text) TO service_role;`).
2. **Repository — durable approvals.** In `writeRelatedRows` (`document-repository.ts:202-241`) after the existing inserts, add: build rows via `toApprovalRows(document)` (imported from `./document-mappers`) and `await supabase.from(SUPABASE_TABLES.approvals).insert(rows.map((r) => ({ document_id: documentId, event_label: r.event_label, event_status: r.event_status, official_number: r.official_number ?? null, event_at: r.event_at })));` — map `document_external_id` → the resolved internal `document_id`. **Builder MUST first confirm the live `invoice_approvals` column names** (run `select column_name from information_schema.columns where table_name='invoice_approvals'` via supabase MCP or `npx supabase`); the `ApprovalRowPayload` shape (`document-mappers.ts:65-71`: `event_label`, `event_status`, `official_number`, `event_at`) is the intended column set but the FK column is `document_id` (matching `revisions`). If a column name differs, use the live name and note the deviation. Guard against duplicate inserts on re-save: either insert only the LATEST approval event (mirroring how `latestMessage` is handled at `:231-239`) OR upsert on a natural key — pick latest-event insert to match the existing single-event pattern and avoid unbounded growth.
3. **Mapper — rebuild timeline.** `fromDocumentRow` (`document-mappers.ts:205-211`) currently fabricates one entry. Since `fromDocumentRow` maps a single row (no joined approvals), add an exported helper `buildApprovalTimeline(approvalRows)` and call the read path so the timeline is hydrated from `invoice_approvals` when available; at minimum, replace the hardcoded `"Loaded from Supabase document row"` label/`"Sophia"` actor with a faithful derivation from the row's own status + `updated_at` (e.g. label = `${status} (loaded)`), and have `listInvoiceDocuments` JOIN/fetch `invoice_approvals` for the listed documents and merge real events into each `approvalTimeline`. The hard requirement (verified by grep) is: the literal string `"Loaded from Supabase document row"` is GONE.
4. **Wire the RPC** (if using the function approach): in the official-number assignment sites (`approveDocumentAction` `documents.ts:198-208`, `markPaidAndIssueReceiptAction` `:396-399`, `cancelWithCreditNoteAction` `:431-434`, and `officialNumberOnApproval`), prefer the RPC result over the in-app `getNextOfficialNumber`. If a full RPC swap is too large for one task's context, the MINIMUM acceptable is: keep the in-app computation BUT add the unique index (step 1) AND a 23505 retry in `saveInvoiceDocument` (`document-repository.ts:66-78`) that, on a `23505` error whose constraint is `invoice_documents_kind_official_number_key`, re-allocates via `allocate_official_number` (or re-reads max) and retries the upsert once. The index + retry alone closes the CRITICAL race; document which approach was taken in the deviations file.

**Validation:** (builder self-check)
- `test -f supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql && echo EXISTS` → `EXISTS`.
- `grep -c "CREATE UNIQUE INDEX" supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql` → `≥ 1`.
- `grep -c "kind, official_number" supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql` → `≥ 1`.
- `grep -c "23505\|allocate_official_number" lib/invoices/supabase/document-repository.ts lib/invoices/actions/documents.ts` → `≥ 1` (transactional allocation OR retry is wired).
- `grep -c "SUPABASE_TABLES.approvals\|invoice_approvals" lib/invoices/supabase/document-repository.ts` → `≥ 1` (approvals now written).
- `grep -c "Loaded from Supabase document row" lib/invoices/supabase/document-mappers.ts` → `0`.
- `npx tsc --noEmit 2>&1 | grep -c "error TS"` → `0`.

**Context:** Read @lib/invoices/supabase/document-repository.ts @lib/invoices/supabase/document-mappers.ts @lib/invoices/numbering.ts @lib/invoices/actions/documents.ts @supabase/migrations/20260623120000_invoice_soft_delete.sql @.planning/reports/review/REVIEW.md

---

## Success Criteria
- [ ] `npx tsc --noEmit` exits 0 (Next.js/Vercel code: `lib/`, `components/`, `app/`).
- [ ] Edge fn change (Task 4) passes `deno check` on `supabase/functions/sophia-bot/tools/handlers/invoice.ts` (tsc does not cover it).
- [ ] Grep proves every named toast/reply references a real send-result variable — no unconditional success string remains (`"sent to Marios and the accounting group"`, `"WhatsApp + Email"`, `"bumped in CSC Review group"` all gone).
- [ ] `notifyMariosOverWhatsApp` returns a boolean; the blank-caption empty-text fallback is removed in both the Marios and accounting-group senders.
- [ ] `forwardAccountingAction` calls `sendDocumentToAccountingGroup`; Sophia `request_correction`/`resend` call `resendCorrectedInvoiceAction`; `deliverWithManualProvider` no longer records `queueStatus:"sent"`.
- [ ] Edge `documentSent = res.ok`; `saveLastDocument` only on `res.ok`.
- [ ] Migration file exists and creates the partial unique index on `(kind, official_number)`; numbering allocation is transactional with a 23505 retry (or RPC).
- [ ] `writeRelatedRows` inserts into `invoice_approvals`; `fromDocumentRow` no longer hardcodes `"Loaded from Supabase document row"`.
- [ ] Existing passing flows unbroken: normal invoice create/approve delivery, credit-note caption, receipt→Marios-only routing, admin Send-email.

---

## Verification Contract

### Contract for Task 1 — Marios action layer returns boolean
**Check type:** grep-match
**Command:** `grep -c "sendMessage({ to: marios.msisdn, text: caption })" lib/invoices/actions/documents.ts`
**Expected:** `0`
**Fail if:** Non-zero — the unconditional empty-text fallback that WaSender rejects is still present.

### Contract for Task 1 — boolean signature
**Check type:** grep-match
**Command:** `grep -c "mariosNotified" lib/invoices/actions/documents.ts`
**Expected:** Non-zero (≥ 1)
**Fail if:** Returns 0 — the Marios send result is still not surfaced to callers.

### Contract for Task 2 — forwardAccountingAction wired to real sender
**Check type:** grep-match
**Command:** `awk '/export async function forwardAccountingAction/,/^}/' lib/invoices/actions/documents.ts | grep -c "sendDocumentToAccountingGroup"`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — accounting forward still only queues the no-op provider.

### Contract for Task 2 — Sophia intents use the real resend sender
**Check type:** grep-match
**Command:** `grep -c "resendCorrectedInvoiceAction" lib/invoices/sophia/intent-handlers.ts`
**Expected:** `≥ 2`
**Fail if:** < 2 — request_correction and/or resend still route through the dead `correctResendAction` queue path.

### Contract for Task 2 — manual provider no longer claims "sent"
**Check type:** grep-match
**Command:** `grep -c 'queueStatus: "sent"' lib/invoices/integrations/manual-provider.ts`
**Expected:** `0`
**Fail if:** Non-zero — the no-op stub still records a non-send as delivered.

### Contract for Task 3 — no unconditional success toasts
**Check type:** command-exit
**Command:** `grep -E "sent to Marios and the accounting group|WhatsApp \+ Email|bumped in CSC Review group" components/invoices/redesign/App.tsx | wc -l`
**Expected:** `0`
**Fail if:** Non-zero — at least one toast still claims delivery unconditionally.

### Contract for Task 3 — toasts reference real result variables
**Check type:** grep-match
**Command:** `grep -cE "mariosNotified|accountingGroupNotified|groupOk|mariosOk|emailOk" components/invoices/redesign/App.tsx`
**Expected:** `≥ 5`
**Fail if:** < 5 — toasts are not gated on the threaded send booleans.

### Contract for Task 3 — Sophia approve reply gated on Marios result
**Check type:** grep-match
**Command:** `grep -cE "mariosNotified|mariosOk" lib/invoices/sophia/intent-handlers.ts`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — the approve reply still branches solely on the group boolean.

### Contract for Task 4 — edge documentSent from real result
**Check type:** grep-match
**Command:** `grep -c "documentSent = res.ok" supabase/functions/sophia-bot/tools/handlers/invoice.ts`
**Expected:** `1`
**Fail if:** Returns 0 — `documentSent` is still set unconditionally.

### Contract for Task 4 — no unconditional documentSent=true
**Check type:** grep-match
**Command:** `grep -c "documentSent = true" supabase/functions/sophia-bot/tools/handlers/invoice.ts`
**Expected:** `0`
**Fail if:** Non-zero — the silent-total-failure bug remains.

### Contract for Task 4 — edge file type-checks under Deno (NOT tsc)
**Check type:** command-exit
**Command:** `deno check supabase/functions/sophia-bot/tools/handlers/invoice.ts`
**Expected:** exit 0
**Fail if:** Non-zero exit — edge change has a type/syntax error tsc cannot catch.

### Contract for Task 5 — migration creates the partial unique index
**Check type:** grep-match
**Command:** `grep -c "CREATE UNIQUE INDEX" supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — no DB-level uniqueness on official numbers.

### Contract for Task 5 — index targets (kind, official_number)
**Check type:** grep-match
**Command:** `grep -c "kind, official_number" supabase/migrations/20260625120000_invoice_number_integrity_and_approvals.sql`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — the unique constraint is on the wrong columns.

### Contract for Task 5 — transactional allocation / 23505 retry wired
**Check type:** command-exit
**Command:** `grep -E "23505|allocate_official_number" lib/invoices/supabase/document-repository.ts lib/invoices/actions/documents.ts | wc -l`
**Expected:** `≥ 1`
**Fail if:** `0` — the read-modify-write race is not closed in app code.

### Contract for Task 5 — approvals are written
**Check type:** grep-match
**Command:** `awk '/async function writeRelatedRows/,/^}/' lib/invoices/supabase/document-repository.ts | grep -cE "approvals|invoice_approvals|toApprovalRows"`
**Expected:** `≥ 1`
**Fail if:** Returns 0 — `invoice_approvals` is still never written.

### Contract for Task 5 — fabricated timeline removed
**Check type:** grep-match
**Command:** `grep -c "Loaded from Supabase document row" lib/invoices/supabase/document-mappers.ts`
**Expected:** `0`
**Fail if:** Non-zero — the synthetic single-entry timeline still overwrites real history.

### Contract for full plan — Next.js code compiles
**Check type:** command-exit
**Command:** `npx tsc --noEmit 2>&1 | grep -c "error TS"`
**Expected:** `0`
**Fail if:** Any TypeScript compilation errors in `lib/`, `components/`, `app/`.
