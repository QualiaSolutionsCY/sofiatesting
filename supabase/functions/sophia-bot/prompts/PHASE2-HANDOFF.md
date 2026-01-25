# Phase 2 Handoff: SOPHIA Prompt Integration

## Context

Phase 1 of SOPHIA's prompt modularization is COMPLETE. The monolithic 4,752-line `prompts.ts` has been analyzed and extracted into modular files in `supabase/functions/sophia-bot/prompts/`.

**Your task:** Integrate the modular prompt system with the live SOPHIA Edge Function.

---

## Current State

### What Exists (Phase 1 - DONE)
```
prompts/
├── index.ts                    # buildSystemPrompt() function
├── ARCHITECTURE.md             # Full documentation
├── core/
│   ├── identity.ts             # SOPHIA identity, capabilities
│   └── safety-rules.ts         # 7 consolidated anti-hallucination rules
├── behaviors/
│   ├── document-routing.ts     # DOCX vs TEXT routing logic
│   ├── property-upload.ts      # Property workflow, agent restrictions
│   └── response-format.ts      # Formatting, grammar, field extraction
└── knowledge/
    ├── cyprus-real-estate.ts   # Cyprus PR, tax, zones knowledge
    └── calculators.ts          # VAT, transfer fees, yield formulas
```

### What's Missing
- **Templates**: 43 document templates are still embedded in the legacy `prompts.ts`
- **Integration**: Live SOPHIA still uses `_shared/prompts.ts`, not the modular system

---

## Your Tasks

### Task 1: Extract Templates

Create `prompts/templates/content.ts` with all 43 templates from the legacy file.

**Source:** `supabase/functions/_shared/prompts.ts` (lines ~1600-4200)

**Format:**
```typescript
export const TEMPLATES = `## Document Templates

### Template 01: Standard Viewing Form
[Full template text...]

### Template 02: Advanced Viewing Form
[Full template text...]

// ... templates 03-43
`;
```

**Tip:** Search for `### Template` or `TEMPLATE` markers in the legacy file to find boundaries.

### Task 2: Update _shared/prompts.ts

Replace the monolithic prompt with the modular builder:

```typescript
// supabase/functions/_shared/prompts.ts

import { buildSystemPrompt } from "../sophia-bot/prompts/index.ts";
import { TEMPLATES } from "../sophia-bot/prompts/templates/content.ts";

// Keep existing exports
export { ZYPRUS_LOGO_BASE64 } from "./logo.ts"; // or wherever it's defined

// Build prompt dynamically
export function getSystemPrompt(options: {
  agentName: string;
  agentPhone: string;
  currentDate: string;
  tomorrowDate: string;
}): string {
  return buildSystemPrompt({
    ...options,
    templates: TEMPLATES,
  });
}

// For backward compatibility (if static export is needed)
export const SYSTEM_PROMPT = buildSystemPrompt({
  agentName: "{{AGENT_NAME}}",
  agentPhone: "{{AGENT_PHONE}}",
  currentDate: "{{CURRENT_DATE}}",
  tomorrowDate: "{{TOMORROW_DATE}}",
  templates: TEMPLATES,
});
```

### Task 3: Update sophia-bot/index.ts

Check how `SYSTEM_PROMPT` is used and update if needed:

```typescript
// Current (static):
import { SYSTEM_PROMPT } from "../_shared/prompts.ts";

// May need to change to (dynamic):
import { getSystemPrompt } from "../_shared/prompts.ts";

const systemPrompt = getSystemPrompt({
  agentName: agent.full_name,
  agentPhone: agent.mobile,
  currentDate: formatDate(new Date()),
  tomorrowDate: formatDate(addDays(new Date(), 1)),
});
```

### Task 4: Test Before Deploying

**Local verification:**
```bash
# Check TypeScript compiles (warnings about .ts extensions are OK for Deno)
cd supabase/functions/sophia-bot
deno check index.ts
```

**Test scenarios:**
- [ ] Generate Standard Viewing Form → verify DOCX output
- [ ] Generate Email Marketing Agreement → verify TEXT output
- [ ] Ask Cyprus PR question → verify knowledge response
- [ ] Calculate VAT → verify calculator tool usage
- [ ] Upload property listing → verify tool anti-hallucination
- [ ] Test agent recognition → verify auto-fill works

### Task 5: Deploy

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

**Monitor logs:**
```bash
supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx
```

---

## Key Files Reference

| File | Purpose | Action |
|------|---------|--------|
| `_shared/prompts.ts` | Legacy monolithic prompt (4,479 lines) | UPDATE to use modular builder |
| `sophia-bot/prompts.ts` | Analyzed source (4,752 lines) | REFERENCE ONLY (delete after migration) |
| `sophia-bot/prompts/index.ts` | Prompt builder | NO CHANGES |
| `sophia-bot/prompts/templates/content.ts` | All 43 templates | CREATE |
| `sophia-bot/index.ts` | Edge Function entry | VERIFY imports work |

---

## Important Notes

1. **Deno Runtime**: Supabase Edge Functions use Deno. The `.ts` extensions in imports are REQUIRED (ignore TypeScript LSP warnings).

2. **Two Legacy Files**: There are TWO old prompt files:
   - `_shared/prompts.ts` (4,479 lines) - CURRENTLY USED by live SOPHIA
   - `sophia-bot/prompts.ts` (4,752 lines) - Analyzed but NOT used

   Use `_shared/prompts.ts` as the source for template extraction.

3. **Template Numbers**: Templates are numbered 01-43. Some may be deprecated. Check `prompts/templates/registry.ts` for DOCX routing logic.

4. **Backward Compatibility**: The modular system should produce the SAME output as the legacy system. Compare outputs if issues arise.

5. **Rollback Plan**: Keep `_shared/prompts.ts` backup before modifying. If issues occur, revert and redeploy.

---

## Success Criteria

- [ ] All 43 templates extracted to `templates/content.ts`
- [ ] `_shared/prompts.ts` uses `buildSystemPrompt()`
- [ ] Edge Function deploys without errors
- [ ] All test scenarios pass
- [ ] No regression in SOPHIA's responses

---

## Resources

- Full architecture docs: `prompts/ARCHITECTURE.md`
- Template registry: `prompts/templates/registry.ts`
- Deploy command: `supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx`
- Logs: `supabase functions logs sophia-bot --project-ref vceeheaxcrhmpqueudqx`
