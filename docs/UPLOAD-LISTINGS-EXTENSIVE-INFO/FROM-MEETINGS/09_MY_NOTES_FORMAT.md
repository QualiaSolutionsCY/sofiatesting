# My Notes (Back Office) Format

## Overview

"My Notes" is a **private, back-office only** field that contains sensitive information about the property owner and other internal details. This information is **NEVER** visible to the public on the website.

## Critical Rule

**NEVER put owner details in the public description.** All owner information goes ONLY in My Notes.

## What Goes in My Notes vs. Public Description

| Information | My Notes | Public Description |
|-------------|----------|-------------------|
| Owner name | ✅ YES | ❌ NEVER |
| Owner phone | ✅ YES | ❌ NEVER |
| Owner email | ✅ YES | ❌ NEVER |
| Agent name | ✅ YES | ❌ NO |
| Registration number | ✅ YES | ❌ NO |
| Internal notes | ✅ YES | ❌ NO |
| Property features | ❌ NO | ✅ YES |
| Location benefits | ❌ NO | ✅ YES |
| Price | ❌ NO | ✅ YES |

## Standard My Notes Format

```
Owner: [Full Name]
Tel: [Phone Number]
Agent: [Agent Name]
Reg: [Registration Number if available]

Notes:
[Any special instructions or information]
```

## Field-by-Field Details

### Owner Name
- **Label:** `Owner:`
- **Format:** Full name as provided by agent
- **Examples:**
  - `Owner: John Smith`
  - `Owner: Maria Papadopoulos`
  - `Owner: Mr. and Mrs. Georgiou`

### Owner Telephone
- **Label:** `Tel:`
- **Format:** Include country code if provided
- **Examples:**
  - `Tel: 99 123456`
  - `Tel: +357 99 123456`
  - `Tel: 99123456 / 96987654` (if multiple numbers)

### Agent Name
- **Label:** `Agent:`
- **Format:** Agent's name
- **IMPORTANT:** Must match the Listing Owner field
- **Examples:**
  - `Agent: Danai`
  - `Agent: Michelle`
  - `Agent: Azinas`

### Registration Number
- **Label:** `Reg:`
- **Format:** As shown on title deed
- **Only if:** Agent provides this or it's extracted from title deed document
- **Examples:**
  - `Reg: 12345`
  - `Reg: A/12345/2020`

### Additional Notes
- **Label:** `Notes:`
- **Format:** Free text for any special information
- **Examples:**
  - `Notes: Owner only available for viewings after 5pm weekdays`
  - `Notes: Keys held by neighbor at house #42`
  - `Notes: Property currently tenanted until March 2026`
  - `Notes: Owner is based abroad, contact via WhatsApp only`
  - `Notes: Urgent sale - owner motivated`

## Complete Examples

### Example 1: Standard Property
```
Owner: John Smith
Tel: 99 876543
Agent: Danai
Reg: 45678

Notes:
Owner prefers afternoon viewings. Speaks English only.
```

### Example 2: Multiple Owners
```
Owner: George & Maria Constantinou
Tel: 99 111222 (George) / 96 333444 (Maria)
Agent: Michelle
Reg: A/2021/56789

Notes:
Joint ownership - both must sign any agreement.
```

### Example 3: Overseas Owner
```
Owner: Michael Brown
Tel: +44 7700 900123 (UK mobile)
Agent: Evelina
Reg: 78901

Notes:
Owner based in UK. Contact via WhatsApp preferred.
Available for calls Mon-Fri 6pm-9pm Cyprus time.
Property managed by local caretaker.
```

### Example 4: Tenanted Property
```
Owner: Andreas Pavlou
Tel: 99 567890
Agent: Lysandros
Reg: 34567

Notes:
Property has sitting tenant until June 2026.
Tenant pays €800/month.
24 hours notice required for viewings.
Sold with tenant in place - investor property.
```

### Example 5: No Registration Number
```
Owner: Anna Nikolaou
Tel: 97 234567
Agent: Olesya

Notes:
Title deeds pending - final approval issued.
Expected within 6 months.
```

## Information from Title Deeds

When agent sends title deed document, extract:
- Registration number → `Reg:` field
- Owner name (verify matches what agent provided)
- Plot/parcel details (can add to notes if relevant)

## What NOT to Include

❌ Property price (this goes in the Price field)
❌ Property features (these go in public description)
❌ Location details (public description)
❌ Marketing text (public description)
❌ Viewing instructions for buyers (those go in description if appropriate)

## My Notes vs. AI Message

| My Notes | AI Message |
|----------|------------|
| Owner/agent information | Sophia's flags and warnings |
| Registration details | Duplicate alerts |
| Special instructions | Missing information notes |
| Permanent information | Review-related notes |
| Stays after publishing | Can be cleared after review |

## Privacy Reminder

My Notes information:
- Is visible to Zypress staff in back office
- Is visible to listing reviewers
- Is NOT visible to website visitors
- Is NOT visible in public property listings
- Should be treated as confidential client data
