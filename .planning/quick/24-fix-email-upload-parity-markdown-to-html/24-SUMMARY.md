# Summary: 24 — Fix email upload parity

**Status:** Complete
**Commit:** 5b9ef56
**Date:** 2026-03-12

## Changes

### 1. Markdown-to-HTML in email replies (CRITICAL fix)
- **File:** `services/email-router/src/gmail.ts`
- Added `markdownToHtml()` function that converts `**bold**` to `<strong>`, `*italic*` to `<em>`, URLs to `<a>` links, bullet points to `<ul>/<li>`, and newlines to `<br/>`
- Email replies now render properly instead of showing raw asterisks

### 2. Unknown sender guard
- **File:** `supabase/functions/sophia-bot/handlers/email-webhook.ts`
- Unknown senders are rejected early with a polite message instead of reaching the AI pipeline + tools
- Removed unnecessary optional chaining since `identifiedAgent` is now guaranteed non-null

### 3. Image validation on email path
- **File:** `supabase/functions/sophia-bot/handlers/email-webhook.ts`
- Added `validateImagesAtIngress()` call matching WhatsApp image validation pipeline
- Invalid images are logged and excluded before storage

### 4. Rate limiting
- **File:** `supabase/functions/sophia-bot/handlers/email-webhook.ts`
- Added `checkRateLimit()` call keyed by sender email address

### 5. Correlation ID tracking
- **File:** `supabase/functions/sophia-bot/index.ts`
- Wrapped email endpoint in `withContext()` for correlation ID in logs (parity with WhatsApp)

## Deployment
- sophia-bot edge function: deployed and verified (health 200)
- email-router: pushed to GitHub for Railway auto-deploy
