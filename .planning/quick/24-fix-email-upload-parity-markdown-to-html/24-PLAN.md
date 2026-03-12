# Plan: 24 — Fix email upload parity

**Mode:** quick (no-plan)
**Created:** 2026-03-12

## Task 1: Markdown-to-HTML in email replies (CRITICAL)

**What:** Fix `sendSophiaReply` in `services/email-router/src/gmail.ts` to convert markdown `**bold**` to `<strong>` before sending HTML email. Also convert bullet points and URLs to proper HTML.
**Files:** `services/email-router/src/gmail.ts`
**Done when:** Email replies have proper HTML formatting

## Task 2: Add withContext wrapper + rate limiting to email webhook

**What:** Wrap email webhook in `withContext()` for correlation IDs. Add basic rate limiting check.
**Files:** `supabase/functions/sophia-bot/index.ts`, `supabase/functions/sophia-bot/handlers/email-webhook.ts`
**Done when:** Email requests have correlation IDs in logs

## Task 3: Unknown sender guard + image validation on email path

**What:** Return early with a polite rejection if agent not found. Add image validation for email-attached images.
**Files:** `supabase/functions/sophia-bot/handlers/email-webhook.ts`
**Done when:** Unknown senders get rejected, images are validated

## Task 4: Deploy sophia-bot + email-router

**What:** Deploy updated edge function and push email-router changes
**Done when:** Both services deployed and verified
