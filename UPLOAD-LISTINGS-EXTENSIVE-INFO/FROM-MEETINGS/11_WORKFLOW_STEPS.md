# Property Upload Workflow - Step by Step

## Overview

This document provides the complete step-by-step workflow Sophia follows when uploading a property.

---

## PHASE 1: RECEIVE & VALIDATE REQUEST

### Step 1.1: Identify the Sender
- Who sent the upload request?
- Match to agent list (see `03_AGENT_ACCOUNTS.md`)
- If unknown sender → Ask for identification or reject

### Step 1.2: Determine Property Type
- Is it FOR SALE or FOR RENT?
- This determines reviewer assignment rules

### Step 1.3: Identify Property Region
- Where is the property located?
- Match location to one of: Paphos, Limassol, Larnaca, Nicosia, Famagusta

### Step 1.4: Validate Regional Authorization
- Is the agent authorized for this region?
- If NO → Reject with message:
  > "Unfortunately, you are not allowed to market a property outside your region. Please contact the relevant regional manager for assistance."
- If YES → Proceed

### Step 1.5: Check if Special Sender
- Is sender Charalambos or Loren?
- If YES and no assignment specified → Ask: "To whom would you like me to assign this property as the listing owner?"

---

## PHASE 2: GATHER INFORMATION

### Step 2.1: Collect Required Details

**From Agent Message - Essential:**
- [ ] Price
- [ ] Property type (apartment, house, villa, land)
- [ ] Location/Area
- [ ] Number of bedrooms
- [ ] Number of bathrooms
- [ ] Covered area (sqm)
- [ ] Owner name
- [ ] Owner phone number
- [ ] Title deed status

**From Agent Message - If Available:**
- [ ] Plot size (for houses/land)
- [ ] Year built
- [ ] Floor number (apartments)
- [ ] Features list
- [ ] Own reference number
- [ ] Registration number

### Step 2.2: Request Missing Information

If any essential information is missing, ask:

> "Thank you for the property details. To complete the listing, I need:
> [List missing items]
> Could you please provide this information?"

### Step 2.3: Process Attachments

**Images:**
- Save all images
- Check for privacy issues (addresses, plates, etc.)
- Crop Bazaraki logos if present
- Note image order for later

**Documents:**
- Read title deeds if provided
- Extract registration number
- Extract any additional property details

### Step 2.4: Extract from External Links

**If Bazaraki link provided:**
- Navigate to link
- Extract: price, bedrooms, bathrooms, size, features, description
- Download images (crop logos)
- Note: Still need owner details and title deed status from agent

---

## PHASE 3: DUPLICATE CHECK

### Step 3.1: Search Dashboard

Search the Zypress dashboard using:
1. **Primary:** Owner phone number
2. **Secondary:** Owner name
3. **Tertiary:** Property address/location

### Step 3.2: Evaluate Results

**No matches found:**
- Proceed to Phase 4

**Potential matches found:**
- Compare: Location, size, price, photos
- If likely duplicate → Flag for review (but still upload)

### Step 3.3: Flag Duplicate (if applicable)

If potential duplicate identified:
- Note the duplicate property ID(s)
- Prepare AI Message with duplicate warning
- Will tick "Potential Duplicate" checkbox during upload

---

## PHASE 4: DETERMINE ASSIGNMENTS

### Step 4.1: Determine Listing Owner

**Standard Agent:**
- Use Listing Owner Email from `03_AGENT_ACCOUNTS.md`

**Special Cases:**
- Michelle rental → Dimitra
- Lysandros → request.larnaca office
- Charalambos/Loren → As specified by them

### Step 4.2: Determine Listing Instructor
- Always the person who sent the upload request
- Use their email address

### Step 4.3: Determine Listing Reviewer 1

**FOR SALE (Paphos/Limassol/Larnaca/Nicosia):**
- `listings@zypress.com`

**FOR SALE (Famagusta):**
- `request.famagusta@zypress.com`

**FOR RENT (All regions):**
- Same as Listing Owner (agent reviews their own)

### Step 4.4: Determine Listing Reviewer 2

**FOR SALE (Paphos/Limassol/Larnaca/Nicosia):**
- Regional office account (request.[region]@zypress.com)

**FOR SALE (Famagusta):**
- None (leave empty)

**FOR RENT (All regions):**
- None (leave empty)

**Special: Michelle Rental:**
- `request.limassol@zypress.com`

---

## PHASE 5: PREPARE LISTING CONTENT

### Step 5.1: Generate Description

Using the template from `07_DESCRIPTION_TEMPLATE.md`:
1. Create headline with property type, beds, area, title status
2. Write location paragraph
3. Write property overview
4. Detail interior spaces
5. List size specifications
6. List features and amenities
7. Note building/complex info
8. State title deed status
9. Add closing statement

**Important:** Generate fresh description, do NOT copy-paste from chat.

### Step 5.2: Prepare My Notes

Format according to `09_MY_NOTES_FORMAT.md`:
```
Owner: [Name]
Tel: [Phone]
Agent: [Agent Name]
Reg: [Registration if available]

Notes:
[Any special instructions]
```

### Step 5.3: Order Images

Arrange in order per `08_IMAGE_HANDLING.md`:
1. Best external
2. Other externals
3. Pool/garden
4. Spacious interiors
5. Kitchen
6. Bedrooms
7. Bathrooms
8. Other rooms
9. Building amenities

### Step 5.4: Prepare AI Message (if needed)

If duplicate flagged:
```
I believe this property may already exist in the system.
Potential duplicate(s) found:
- ID: [X] - [Link]
Please review and verify before publishing.
```

---

## PHASE 6: CREATE DRAFT LISTING

### Step 6.1: Access Upload Form
- Navigate to Zypress dashboard
- Go to Add Property

### Step 6.2: Fill Basic Information
- [ ] Price
- [ ] Negotiable: YES (default)
- [ ] Listing Status: For Sale / For Rent
- [ ] Property Type
- [ ] Location/Area

### Step 6.3: Fill Property Details
- [ ] Bedrooms
- [ ] Bathrooms
- [ ] Covered Area
- [ ] Plot Size (if applicable)
- [ ] Floor (if apartment)

### Step 6.4: Set Map Location
- Find general area on map
- Place pin 2-3 streets away from actual property
- Use neutral location (near kiosk, school, etc.)
- **NEVER place at exact address**

### Step 6.5: Select Features
- Tick all applicable feature checkboxes
- Based on agent info and image scanning

### Step 6.6: Enter Description
- Paste generated description into heading and main description fields

### Step 6.7: Upload Images
- Drag and drop in correct order
- First image = thumbnail

### Step 6.8: Fill My Notes
- Enter owner details, agent name, registration number, notes

### Step 6.9: Fill Administrative Fields
- [ ] Listing Reviewer 1
- [ ] Listing Reviewer 2 (if applicable)
- [ ] Listing Owner
- [ ] Listing Instructor
- [ ] Draft Own Reference (if known)

### Step 6.10: Mark AI Fields
- [ ] Tick "AI Generated" checkbox
- [ ] Enter AI Message (if duplicate or notes)
- [ ] Tick "Potential Duplicate" (if applicable)

### Step 6.11: Save as Draft
- Click "Save Draft" or equivalent
- Property goes to draft status
- Appears in reviewer's "My Draft Properties"

---

## PHASE 7: CONFIRM & COMMUNICATE

### Step 7.1: Verify Upload Success
- Confirm draft was created successfully
- Note the draft property ID

### Step 7.2: Notify Agent

Send confirmation message:

> "I've uploaded the property as a draft listing. The listing reviewer will review and publish it shortly.
> 
> Summary:
> - Property: [Type] in [Area]
> - Price: €[Price]
> - Bedrooms: [X] | Bathrooms: [X]
> - Assigned to: [Listing Owner]
> 
> Is there anything else you need?"

### Step 7.3: Flag Any Issues

If there were any issues during upload:
- Missing images
- Unclear information
- Potential duplicate

Mention in confirmation:
> "Note: I've flagged this as a potential duplicate of ID [X]. The reviewer will verify before publishing."

---

## WORKFLOW DIAGRAM

```
[Agent Request] 
       ↓
[Identify Sender] → [Unknown?] → Ask/Reject
       ↓
[Validate Region] → [Unauthorized?] → Reject
       ↓
[Gather Information] → [Missing?] → Ask
       ↓
[Check Duplicates] → [Found?] → Flag (but continue)
       ↓
[Determine Assignments]
       ↓
[Generate Description]
       ↓
[Prepare My Notes]
       ↓
[Order Images]
       ↓
[Fill Upload Form]
       ↓
[Save as Draft]
       ↓
[Confirm to Agent]
```

---

## TIME ESTIMATES

| Phase | Estimated Time |
|-------|---------------|
| Receive & Validate | 30 seconds |
| Gather Information | 1-3 minutes (depends on completeness) |
| Duplicate Check | 30-60 seconds |
| Determine Assignments | 15 seconds |
| Prepare Content | 2-3 minutes |
| Create Draft | 2-3 minutes |
| Confirm | 15 seconds |
| **Total** | **6-10 minutes** |

If information is complete and no duplicates, faster. If missing info or issues, longer due to back-and-forth.
