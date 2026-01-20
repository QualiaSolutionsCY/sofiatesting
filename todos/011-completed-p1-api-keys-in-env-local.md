# P1 CRITICAL: API Keys in .env.local

---
status: pending
priority: p1
issue_id: "011"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

**What's broken:** Real, production API keys are stored in `.env.local` file. While this file is gitignored, the file exists locally with plaintext secrets.

**Why it matters:** If this file is ever accidentally committed or exposed, attackers can:
- Access OpenRouter API and run up costs
- Send spam via WaSender on your account
- Send emails impersonating your domain via Resend

## Findings

**Location:** `/home/qualia/Desktop/Projects/aiagents/sofiatesting/.env.local`

```
OPENROUTER_API_KEY=sk-or-v1-5738...
WASENDER_API_KEY=e849429...
RESEND_API_KEY=re_GxAmgD24...
```

**Evidence:** Security-sentinel identified real API keys in local environment file.

## Proposed Solutions

### Option 1: Rotate All Keys (Recommended)
**Pros:** Maximum security, eliminates risk
**Cons:** Brief service interruption during rotation
**Effort:** Small (30 min)
**Risk:** Low

Steps:
1. Rotate OpenRouter API key in dashboard
2. Rotate WaSender API key
3. Rotate Resend API key
4. Update Supabase Edge Function secrets
5. Verify services still work

### Option 2: Verify Git History is Clean
**Pros:** Less disruptive
**Cons:** Doesn't eliminate future risk
**Effort:** Small (15 min)

Run: `git log --all --full-history -- .env.local`

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `.env.local`
**Components:** OpenRouter, WaSender, Resend integrations
**Database changes:** None

## Acceptance Criteria

- [ ] API keys rotated in all provider dashboards
- [ ] Supabase secrets updated with new keys
- [ ] `.env.local` confirmed not in git history
- [ ] Services verified working with new keys

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | security-sentinel | Identified issue | Keys visible in local file |

## Resources

- [OpenRouter Dashboard](https://openrouter.ai/keys)
- [Supabase Secrets](https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/settings/functions)
