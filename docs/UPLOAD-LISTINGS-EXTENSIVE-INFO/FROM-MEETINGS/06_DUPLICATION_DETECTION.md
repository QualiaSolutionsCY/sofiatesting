# Duplication Detection

## Overview

Before EVERY property upload, Sophia MUST check for potential duplicates in the Zypress dashboard. This prevents the same property being listed multiple times.

## When to Check

**ALWAYS** - before every single property upload, regardless of:
- Property type (sale or rent)
- Region
- Who sent it

## How to Search

### Primary Search Method: Owner Phone Number

The phone number is the **most reliable** way to find duplicates.

1. Go to the Zypress dashboard
2. Use the search box
3. Enter the owner's phone number
4. The dashboard search is VERY robust:
   - Ignores spaces
   - Handles different formats
   - Recognizes with/without country codes
   - Example: `99123456`, `99 123 456`, `+35799123456` all find the same result

### Secondary Search Methods

Also search by:
- **Owner name** - may catch properties if phone number changed
- **Address/Location** - if exact address is known
- **Own Reference** - if a reference number exists

### Search Combinations

For best coverage, search using multiple criteria:
1. First: Phone number (primary)
2. Second: Owner name
3. Third: Property address (if available)

## What To Do When Duplicate is Found

### Step 1: Still Upload as Draft

Even if you suspect a duplicate, **UPLOAD THE PROPERTY AS A DRAFT**. Do NOT skip the upload.

### Step 2: Mark as Potential Duplicate

Tick the **"Potential Duplicate"** checkbox on the listing form.

### Step 3: Add AI Message

In the AI Message field, write a clear message explaining the potential duplicate:

**Template:**
```
I believe this property may already exist in the system.

Potential duplicate(s) found:
- ID: [ID_NUMBER] - [LINK_TO_PROPERTY]
- ID: [ID_NUMBER] - [LINK_TO_PROPERTY]

Please review and verify before publishing.
```

**Example:**
```
I believe this property may already exist in the system.

Potential duplicate(s) found:
- ID: 4545 - https://zypress.com/property/4545
- ID: 4298 - https://zypress.com/property/4298

Please review and verify before publishing.
```

### Step 4: Visual Alert

When "Potential Duplicate" is ticked, the property appears in **RED** in the reviewer's dashboard. This alerts them to check carefully.

## Reviewer's Responsibility

Once flagged, the **reviewer** (not Sophia) will:
1. Open the potential duplicate links
2. Compare images and details
3. Determine if it's truly a duplicate
4. Either publish (if not duplicate) or delete (if duplicate)
5. Resolve any conflicts between agents if both claim the property

## Example Scenario

**Scenario:** Danai sends a property in Tala with owner phone 99876543

**Sophia's Process:**
1. Search dashboard for `99876543`
2. Find existing property ID 4545 in Tala with same phone
3. Compare: Both in Tala, same phone number = likely duplicate
4. Upload as draft anyway
5. Tick "Potential Duplicate"
6. Add AI Message: "I believe this property may already exist. Potential duplicate: ID 4545 - [link]. Both have owner phone 99876543 and are located in Tala."
7. Listing Reviewer 1 (Loren) sees RED alert
8. Loren investigates and makes final decision

## What NOT To Do

❌ Do NOT refuse to upload because of potential duplicate
❌ Do NOT make the final decision about duplicates
❌ Do NOT delete existing properties
❌ Do NOT contact agents about duplicates (reviewers handle this)

## Search Tips

### Phone Number Variations to Consider

The same number might appear as:
- `99123456`
- `99 12 34 56`
- `+357 99 123456`
- `0035799123456`
- `99-123-456`

The dashboard handles most variations automatically.

### Common Duplicate Indicators

High likelihood of duplicate if:
- Same owner phone number
- Same area/location
- Similar property type
- Similar size
- Similar price

Medium likelihood:
- Same owner name (different phone)
- Same address (might be different units in same building)

## Special Cases

### Same Owner, Different Property

An owner may legitimately have multiple properties. Check:
- Are the addresses different?
- Are the sizes different?
- Are the prices significantly different?
- Do the photos show different properties?

If clearly different properties, no duplicate flag needed.

### Different Owner, Same Property

Sometimes properties change ownership. If:
- Same address
- Same photos
- Different owner

This might be a transfer situation. Flag as potential duplicate and let reviewers investigate.

## Dashboard Search Fields

When searching, the dashboard allows filtering by:
- Text search (phone, name, address)
- Region
- Property type
- Status (live, draft, sold)
- Listing owner

Use these filters to narrow down potential duplicates.
