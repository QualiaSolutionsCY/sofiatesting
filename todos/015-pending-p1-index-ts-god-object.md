# P1 CRITICAL: index.ts Remains God Object (1884 lines)

---
status: pending
priority: p1
issue_id: "015"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

**What's broken:** Despite previous module extraction, index.ts still contains 15+ distinct responsibilities in 1884 lines, violating Single Responsibility Principle.

**Why it matters:**
- High maintenance burden
- Difficult to test individual components
- Changes risk affecting unrelated features
- Hard to onboard new developers

## Findings

**Location:** `supabase/functions/sophia-bot/index.ts`

**Current responsibilities (LOC estimates):**
- Email sending (lines 73-311, ~238 lines)
- WhatsApp formatting (lines 313-348, ~35 lines)
- Response detection (lines 350-477, ~127 lines)
- Template parsing (lines 479-604, ~125 lines)
- Message deduplication (lines 606-638, ~32 lines)
- Storage upload (lines 640-672, ~32 lines)
- DOCX sending (lines 674-745, ~71 lines)
- Phone formatting (lines 747-788, ~41 lines)
- WaSend extraction (lines 790-902, ~112 lines)
- Text sending (lines 904-984, ~80 lines)
- Agent lookup (lines 986-1008, ~22 lines)
- **processRequest** (lines 1010-1688, ~678 lines)
- Main handler (lines 1690-1857, ~167 lines)

## Proposed Solutions

### Option 1: Extract to Focused Modules (Recommended)
**Pros:** Clean architecture, testable
**Cons:** Significant refactoring effort
**Effort:** Large (2-3 days)
**Risk:** Medium (requires careful testing)

Target structure:
```
sophia-bot/
├── index.ts                  (~150 lines - entry point only)
├── handlers/
│   ├── webhook.ts            (signature verification, routing)
│   ├── request-processor.ts  (AI orchestration, tool calling)
│   └── conversation.ts       (message history, dedup)
├── messaging/
│   ├── email-sender.ts       (Resend integration)
│   ├── wasend-client.ts      (WaSend API)
│   └── formatter.ts          (response formatting)
├── ai/
│   └── response-classifier.ts (clarification/informational)
└── storage/
    └── document-uploader.ts  (Supabase storage)
```

### Option 2: Incremental Extraction
**Pros:** Lower risk, can be done piece by piece
**Cons:** Takes longer, intermediate state is messy
**Effort:** Medium (spread over 1-2 weeks)

## Recommended Action

(To be filled during triage)

## Technical Details

**Affected files:** `supabase/functions/sophia-bot/index.ts`
**New files to create:** 8-10 focused modules
**Target:** index.ts < 200 lines

## Acceptance Criteria

- [ ] index.ts reduced to entry point only
- [ ] Each extracted module has single responsibility
- [ ] All functionality preserved
- [ ] Unit tests for extracted modules
- [ ] Deployed and verified

## Work Log

| Date | Author | Action | Learnings |
|------|--------|--------|-----------|
| 2026-01-11 | architecture-strategist | Identified issue | 15+ responsibilities |

## Resources

- P2-architecture-sophia-bot.md (previous analysis)
