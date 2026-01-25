# SOPHIA Prompt Architecture

## Overview

This directory contains the modular prompt architecture for SOPHIA, extracted from the monolithic `prompts.ts` file (4,752 lines).

**Goal:** Make prompts easier to edit, reduce errors from repeated/conflicting rules, and enable targeted updates without touching the entire prompt.

---

## Phase 1: Modularization ✅ COMPLETE

### Directory Structure

```
prompts/
├── index.ts                        # Prompt builder & exports
├── core/
│   ├── identity.ts                 # Who SOPHIA is, capabilities, personality
│   └── safety-rules.ts             # 7 consolidated anti-hallucination rules
├── behaviors/
│   ├── document-routing.ts         # DOCX vs TEXT routing, field collection
│   ├── property-upload.ts          # Property workflow, agent restrictions
│   └── response-format.ts          # Formatting, extraction, grammar rules
├── knowledge/
│   ├── cyprus-real-estate.ts       # Full knowledge base (PR, tax, zones, etc.)
│   └── calculators.ts              # VAT, transfer fees, capital gains formulas
└── templates/
    └── registry.ts                 # (Existing) Template type detection
```

### Module Contents

| Module | Purpose | Lines Extracted From |
|--------|---------|---------------------|
| `core/identity.ts` | SOPHIA's identity, capabilities, personality | Lines 86-125 |
| `core/safety-rules.ts` | 7 consolidated critical rules (anti-hallucination, routing, verification) | Lines 6-103 |
| `behaviors/document-routing.ts` | DOCX vs TEXT routing, field collection workflow | Lines 240-428 |
| `behaviors/property-upload.ts` | Property listing workflow, agent restrictions, reviewer rules | Lines 430-675 |
| `behaviors/response-format.ts` | Output formatting, grammar, field extraction, tool output handling | Lines 677-912, 1200-1596 |
| `knowledge/cyprus-real-estate.ts` | Full Cyprus real estate knowledge base | Lines 4217-4645 |
| `knowledge/calculators.ts` | Calculator capabilities, VAT formulas, yield calculations | Lines 1116-1200, 4646-4750 |

### Key Improvements

1. **Removed emoji walls** - `🚨🚨🚨` replaced with clean markdown headers
2. **Consolidated duplicate rules** - Same rules appeared 3-4 times in original
3. **Numbered rule format** - Safety rules now numbered 1-7 for clarity
4. **Separated concerns** - Each file handles one responsibility
5. **Created prompt builder** - `buildSystemPrompt()` assembles modules dynamically

### Prompt Builder Usage

```typescript
import { buildSystemPrompt } from "./prompts/index.ts";

const systemPrompt = buildSystemPrompt({
  agentName: "Charalambos Pitros",
  agentPhone: "+357 99123456",
  currentDate: "January 23, 2026",
  tomorrowDate: "January 24, 2026",
  templates: TEMPLATES_STRING, // From legacy prompts.ts
});
```

---

## Phase 2: Integration (PENDING)

### Current State

Two prompt files exist:
- `supabase/functions/_shared/prompts.ts` (4,479 lines) - **CURRENTLY USED by index.ts**
- `supabase/functions/sophia-bot/prompts.ts` (4,752 lines) - **ANALYZED & MODULARIZED**

The index.ts imports from `_shared/prompts.ts`:
```typescript
import { SYSTEM_PROMPT, ZYPRUS_LOGO_BASE64 } from "../_shared/prompts.ts";
```

### Integration Steps

1. **Extract templates section** from legacy `prompts.ts`
   - Templates 01-43 are still embedded in the monolithic file
   - Need to create `prompts/templates/content.ts` with all template text

2. **Update `_shared/prompts.ts`** to use modular builder:
   ```typescript
   import { buildSystemPrompt } from "../sophia-bot/prompts/index.ts";

   export const SYSTEM_PROMPT = buildSystemPrompt({
     agentName: "{{AGENT_NAME}}",
     agentPhone: "{{AGENT_PHONE}}",
     currentDate: "{{CURRENT_DATE}}",
     tomorrowDate: "{{TOMORROW_DATE}}",
     templates: TEMPLATES,
   });
   ```

3. **Test in staging** before deploying to production
   - Compare outputs between old and new prompts
   - Verify all templates generate correctly
   - Test property upload workflow
   - Test calculator responses

4. **Deploy and monitor**
   ```bash
   supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
   ```

### Files to Modify in Phase 2

| File | Action |
|------|--------|
| `prompts/templates/content.ts` | CREATE - Extract all 43 templates |
| `prompts/index.ts` | UPDATE - Import templates module |
| `_shared/prompts.ts` | UPDATE - Use modular builder |
| `sophia-bot/index.ts` | VERIFY - No changes needed if _shared works |

---

## Testing Checklist

Before deploying Phase 2:

- [ ] Generate Standard Viewing Form - verify DOCX output
- [ ] Generate Email Marketing Agreement - verify TEXT output
- [ ] Ask Cyprus PR question - verify knowledge response
- [ ] Calculate VAT - verify calculator tool usage
- [ ] Upload property listing - verify tool anti-hallucination
- [ ] Test agent recognition - verify auto-fill works
- [ ] Test regional restrictions - verify upload blocks

---

## Maintenance Guide

### Adding New Rules

1. Identify the appropriate module:
   - Safety/anti-hallucination → `core/safety-rules.ts`
   - Document routing → `behaviors/document-routing.ts`
   - Property workflow → `behaviors/property-upload.ts`
   - Formatting → `behaviors/response-format.ts`

2. Add rule to the module's exported string

3. Rules are assembled in priority order by `buildSystemPrompt()`

### Updating Knowledge Base

Edit `knowledge/cyprus-real-estate.ts` for:
- Tax rates, thresholds
- PR requirements
- Planning zone rules
- Any Cyprus real estate facts

Edit `knowledge/calculators.ts` for:
- Calculator formulas
- Tool usage instructions
- Output formatting rules

### Adding New Templates

1. Add template text to `templates/content.ts` (Phase 2)
2. Update `templates/registry.ts` if DOCX routing needed
3. No changes needed to other modules

---

## Notes

- Deno runtime requires `.ts` extensions in imports (TypeScript LSP warnings can be ignored)
- The modular system is backward compatible - can run alongside legacy prompts
- Each module exports a single template literal string for easy editing
