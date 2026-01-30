# Task: Consolidate SOPHIA Prompt System

## Problem

SOPHIA's prompts have **duplicate content in multiple places**, causing:
1. Updates failing silently (only 1 of 3 places updated)
2. DB and files getting out of sync
3. Conflicting instructions (lower priority number wins)

## Current Architecture

```
sophia_prompts table (DB - TAKES PRECEDENCE)
├── identity (priority 10)
├── safety_rules (priority 20)
├── document_routing (priority 30)    ← HAS field collection prompts
├── property_upload (priority 40)
├── response_format (priority 50)
├── calculators (priority 60)
├── cyprus_knowledge (priority 70)
└── templates (priority 80)           ← ALSO HAS field collection prompts (DUPLICATE!)

File fallbacks (used only if DB key missing):
supabase/functions/sophia-bot/prompts/
├── core/
│   ├── identity.ts
│   └── safety-rules.ts
├── behaviors/
│   ├── document-routing.ts           ← HAS field collection prompts
│   ├── property-upload.ts
│   └── response-format.ts
├── knowledge/
│   ├── calculators.ts
│   └── cyprus-real-estate.ts
└── templates/
    ├── content.ts                    ← ALSO HAS field collection prompts (DUPLICATE!)
    └── registry.ts
```

## Specific Duplications Found

### 1. Reservation Agreement Field Collection
**Exists in:**
- `document_routing` (DB + file) - lines 183-200 in document-routing.ts
- `templates` (DB + file) - lines ~693-711 in content.ts (FIELD COLLECTION section)
- `templates` (DB + file) - lines ~748 in content.ts (template example)

### 2. Viewing Form Field Collection
**Exists in:**
- `document_routing` (DB + file) - lines 76-86
- `templates` (DB + file) - similar content in viewing form sections

### 3. Marketing Agreement Field Collection
**Exists in:**
- `document_routing` (DB + file) - lines 202-215
- `templates` (DB + file) - in marketing agreement section

### 4. Plot Calculation Format
**Exists in:**
- `cyprus_knowledge` (DB + file) - the example calculation format

## Goal

Each piece of content should exist in **exactly ONE place**:

| Content Type | Should Live In | Remove From |
|--------------|----------------|-------------|
| Field collection prompts (what to ask for) | `document_routing` | `templates` |
| Template output format (what to generate) | `templates` | - |
| Calculator formats | `calculators` | - |
| Cyprus knowledge/facts | `cyprus_knowledge` | - |

## Step-by-Step Instructions

### Step 1: Audit All Duplicates

Run these searches to find ALL duplicates:

```bash
# Find field collection prompts
grep -rn "Please provide:" supabase/functions/sophia-bot/prompts/
grep -rn "I'll create the" supabase/functions/sophia-bot/prompts/

# Find reservation agreement mentions
grep -rn "reservation agreement" supabase/functions/sophia-bot/prompts/
grep -rn "Prospective buyer" supabase/functions/sophia-bot/prompts/

# Find viewing form mentions
grep -rn "viewing form" supabase/functions/sophia-bot/prompts/

# Find marketing agreement mentions
grep -rn "marketing agreement" supabase/functions/sophia-bot/prompts/
```

Also check DB:
```sql
SELECT key,
  CASE WHEN content LIKE '%Please provide:%' THEN 'YES' ELSE 'NO' END as has_field_collection
FROM sophia_prompts WHERE is_active = true;
```

### Step 2: Define Single Source of Truth

**`document_routing`** = HOW to collect fields for DOCX templates
- All "I'll create X. Please provide:" prompts
- Field examples and formats
- Workflow for collecting missing info

**`templates`** = WHAT to generate (output format only)
- Template content structure
- What each template looks like when complete
- NO field collection prompts

### Step 3: Remove Duplicates from `templates`

In `content.ts`, remove these sections that duplicate `document_routing`:
1. `*FIELD COLLECTION:*` blocks for Reservation Agreement
2. `*FIELD COLLECTION:*` blocks for Viewing Forms
3. `*FIELD COLLECTION:*` blocks for Marketing Agreement
4. Any "Please provide:" examples

Keep ONLY:
- Template output format examples
- What the final document looks like
- Template numbering reference (internal only)

### Step 4: Update Database

After updating files, sync the DB:

```sql
-- Get current content to edit
SELECT key, content FROM sophia_prompts WHERE key = 'templates' AND is_active = true;

-- Update with new content (remove field collection sections)
UPDATE sophia_prompts
SET content = '[NEW CONTENT WITHOUT DUPLICATES]',
    updated_at = NOW()
WHERE key = 'templates' AND is_active = true;
```

### Step 5: Verify No Duplicates

```bash
# Should only find matches in document-routing.ts
grep -rn "I'll create the Property Reservation Agreement" supabase/functions/sophia-bot/prompts/

# Should return only 1 file
grep -l "Please provide:" supabase/functions/sophia-bot/prompts/behaviors/
```

### Step 6: Deploy and Test

```bash
supabase functions deploy sophia-bot --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
```

Test each template type on WhatsApp:
1. "I need a reservation agreement" → Should ask for 7 fields
2. "viewing form" → Should ask for viewing form fields
3. "marketing agreement" → Should ask for marketing fields

## Important Rules Going Forward

### When Adding/Editing Field Collection Prompts
1. ONLY edit `document_routing` (DB key + document-routing.ts file)
2. NEVER add field collection to `templates`

### When Adding/Editing Template Output Format
1. ONLY edit `templates` (DB key + content.ts file)
2. This is what the generated document looks like, NOT how to ask for fields

### Before ANY Prompt Update
```bash
# ALWAYS search first
grep -rn "text you want to change" supabase/functions/sophia-bot/prompts/
```

```sql
-- ALWAYS check DB too
SELECT key FROM sophia_prompts
WHERE content LIKE '%text you want to change%' AND is_active = true;
```

## Files to Modify

1. `supabase/functions/sophia-bot/prompts/templates/content.ts`
   - Remove all `*FIELD COLLECTION:*` sections
   - Keep only template output examples

2. `sophia_prompts` table, key = `templates`
   - Same changes as above

3. `CLAUDE.md` - Add rule:
   ```
   ### Prompt Update Rule
   ALWAYS grep ALL prompt files + query ALL DB keys before updating any prompt content.
   Field collection prompts → document_routing ONLY
   Template output format → templates ONLY
   ```

## Verification Checklist

After consolidation:
- [ ] `grep "Please provide:" prompts/` returns ONLY `document-routing.ts`
- [ ] `grep "I'll create the" prompts/` returns ONLY `document-routing.ts`
- [ ] DB query for field collection returns ONLY `document_routing` key
- [ ] All 4 DOCX templates tested on WhatsApp
- [ ] CLAUDE.md updated with prevention rule
