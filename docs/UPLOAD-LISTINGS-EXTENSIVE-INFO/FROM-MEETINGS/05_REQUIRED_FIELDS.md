# Required Listing Fields

## Overview

This document lists ALL fields that Sophia must populate when uploading a property, organized by section.

---

## BASIC INFORMATION

### Price
- **Field:** Price (EUR)
- **Required:** YES
- **Format:** Number only, no currency symbol
- **Example:** `344000`

### Negotiable
- **Field:** Negotiable checkbox
- **Required:** YES
- **Default:** **ALWAYS YES (ticked)** unless agent specifically says "not negotiable"
- **Rule:** Agents are trained to inform if NOT negotiable. Assume negotiable unless told otherwise.

### Listing Status
- **Field:** For Sale / For Rent
- **Required:** YES
- **Options:** `For Sale` or `For Rent`

### Property Type
- **Field:** Property Type
- **Required:** YES
- **Options:**
  - Apartment
  - House
  - Villa
  - Land
  - Commercial
  - Office
  - Other

### Location
- **Field:** Location/Area
- **Required:** YES
- **Format:** Area name (e.g., "Kato Paphos", "Universal", "Tala")
- **Note:** This determines the region for reviewer assignment

### Map Pin Location
- **Field:** Google Map coordinates
- **Required:** YES
- **CRITICAL RULE:** NEVER place pin at exact property address
- **Rule:** Place pin 2-3 streets away in a **neutral location**
- **Neutral locations:** Kiosk, school, supermarket, church, public landmark
- **Reason:** Privacy and security - we don't want to reveal exact property location

---

## PROPERTY DETAILS

### Bedrooms
- **Field:** Number of Bedrooms
- **Required:** YES for residential properties
- **Format:** Integer (e.g., `2`, `3`, `4`)

### Bathrooms
- **Field:** Number of Bathrooms
- **Required:** YES for residential properties
- **Format:** Integer

### Covered Area
- **Field:** Covered Area (sqm)
- **Required:** YES
- **Format:** Number in square meters
- **Note:** May include indoor area + covered veranda if not specified separately

### Plot Size (for houses/land)
- **Field:** Plot Size (sqm)
- **Required:** For houses, villas, land
- **Format:** Number in square meters

### Floor (for apartments)
- **Field:** Floor Number
- **Required:** For apartments
- **Example:** `Ground`, `1st`, `2nd`, `Penthouse`

---

## FEATURES (Tick boxes)

Sophia should tick relevant features based on:
1. What the agent explicitly mentions
2. What can be seen in photos (if image scanning enabled)

### Common Features to Look For:
- [ ] Air Conditioning (AC)
- [ ] Central Heating
- [ ] Underfloor Heating
- [ ] Solar Panels
- [ ] Pressurized Water System
- [ ] Pool (private or communal)
- [ ] Garden
- [ ] Covered Parking
- [ ] Storage Room
- [ ] Elevator (for apartments)
- [ ] Security/Alarm System
- [ ] Video Entry Phone
- [ ] Furnished
- [ ] Part Furnished
- [ ] White Goods Included
- [ ] Fitted Wardrobes
- [ ] Fireplace
- [ ] BBQ Area
- [ ] Sea View
- [ ] Mountain View
- [ ] Gated Complex
- [ ] Double Glazing
- [ ] Electric Shutters

---

## TITLE DEED INFORMATION

### Title Deed Status
- **Field:** Title Deed Status
- **Required:** YES - Sophia must clarify with agent if not provided
- **Options:**
  - Separate Title Deeds
  - Final Approval
  - Pending (no title yet)
  
**Important:** If agent doesn't specify, Sophia must ask:
> "Could you please inform me of the title deed situation for this property?"

### Registration Number
- **Field:** Registration Number (from title deed)
- **Required:** If available
- **Where:** Goes in My Notes, NOT public description
- **Format:** As shown on title deed

---

## SYSTEM/ADMINISTRATIVE FIELDS

### Listing Reviewer 1
- **Required:** YES
- **See:** `02_REVIEWER_ASSIGNMENTS.md` for rules

### Listing Reviewer 2
- **Required:** Depends on property type/region
- **See:** `02_REVIEWER_ASSIGNMENTS.md` for rules

### Listing Owner
- **Required:** YES
- **See:** `03_AGENT_ACCOUNTS.md` for email mapping

### Listing Instructor
- **Required:** YES
- **Value:** Person who sent upload instructions to Sophia

### AI Generated
- **Required:** YES - ALWAYS TICK when Sophia uploads
- **Purpose:** Lets reviewers know this was AI-uploaded

### AI Message
- **Required:** Only if there are notes to add
- **Use Cases:**
  - Duplicate warning
  - Missing information notes
  - Any concerns

### Draft Own Reference
- **Required:** YES if Sophia knows the reference logic
- **Note:** Same logic as Own Reference - Loren explains the specific format
- **Purpose:** Quick reviewer reference

### Potential Duplicate
- **Required:** Tick if duplicate suspected
- **Effect:** Property shows in RED to alert reviewer

---

## MY NOTES (Back Office Only)

### Owner Name
- **Required:** YES
- **Privacy:** Back office ONLY - never in public description
- **Example:** `Owner: John Smith`

### Owner Telephone
- **Required:** YES
- **Privacy:** Back office ONLY - never in public description
- **Format:** Full number with country code if provided
- **Example:** `Tel: +357 99 123456`

### Agent Name
- **Required:** YES
- **Rule:** MUST match the Listing Owner
- **Example:** `Agent: Danai`

### Registration Number
- **Required:** If available from title deed
- **Example:** `Reg: 12345`

### Special Notes
- **Required:** Only if agent provides additional info
- **Examples:**
  - "Owner only available after 5pm"
  - "Keys with neighbor at #42"
  - "Tenant until March 2026"

---

## DESCRIPTION FIELD

### Heading/Title
- **Required:** YES
- **Format:** `[Adjective] [Beds] Bedroom [Type] in [Area] with Title Deeds`
- **Example:** `Spacious 2 Bedroom Apartment in Kato Paphos with Title Deeds`
- **Rule:** Every word capitalized, don't repeat "Paphos" twice

### Main Description
- **Required:** YES
- **See:** `07_DESCRIPTION_TEMPLATE.md` for full template
- **Important:** Generate from template, do NOT copy-paste from chat

---

## IMAGES/PHOTOS

- **Required:** At least 1 photo, ideally multiple
- **See:** `08_IMAGE_HANDLING.md` for ordering and processing rules

---

## VALIDATION CHECKLIST

Before submitting, Sophia should verify:

- [ ] Price entered correctly
- [ ] Negotiable defaulted to YES (unless specified otherwise)
- [ ] Property type selected
- [ ] Location/area specified
- [ ] Map pin placed 2-3 streets away (NOT exact address)
- [ ] Bedrooms/bathrooms entered
- [ ] Covered area in sqm
- [ ] Title deed status confirmed or asked about
- [ ] Listing Reviewer 1 assigned correctly
- [ ] Listing Reviewer 2 assigned (if applicable)
- [ ] Listing Owner matches agent mapping
- [ ] Listing Instructor is the person who sent request
- [ ] AI Generated checkbox TICKED
- [ ] Owner details in My Notes (NOT public description)
- [ ] Description generated from template
- [ ] Photos uploaded in correct order
- [ ] Duplicate check performed
