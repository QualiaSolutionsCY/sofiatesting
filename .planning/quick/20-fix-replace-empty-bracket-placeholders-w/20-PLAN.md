# Quick Task 20: Fix Empty Bracket Placeholders

## Description
Replace empty bracket placeholders `[ ]` with descriptive field names in all blank template formats so agents know what each field expects.

## Tasks

### Task 1: Fix viewing-forms.ts blank template formats
Replace all `[ ]` with descriptive placeholders:
- `[ ]` after "Date:" → `[DATE]`
- `[ ]` after "I" → `[FULL NAME]`
- `[ ]` after "Issued By:" → `[COUNTRY]`
- `[ ]` after "Property:" → `[PROPERTY DESCRIPTION]`

Applies to 4 blank template sections: standard single, standard multi, advanced single, advanced multi.

### Task 2: Fix safety-rules.ts "leave blank" instruction
Change line 145 from "Leave the missing fields BLANK (empty)" to keep original template placeholders with descriptive names.

### Task 3: Fix document-routing.ts "left BLANK" instruction + optional field prompts
- Line 135: Change "fields left BLANK" to "fields showing original template placeholders"
- All "leave blank if not known" field prompts → "use [CLIENT'S NAME] if not known"

## Files Changed
- `supabase/functions/sophia-bot/prompts/templates/viewing-forms.ts`
- `supabase/functions/sophia-bot/prompts/core/safety-rules.ts`
- `supabase/functions/sophia-bot/prompts/behaviors/document-routing.ts`
