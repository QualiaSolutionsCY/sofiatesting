# Special Cases & Exceptions

## Overview

This document covers all exceptions to the standard rules, edge cases, and special handling requirements.

---

## SPECIAL CASE 1: Charalambos & Lauren - NO RENTALS

### Background
Charalambos (CEO) and Lauren (Listing Admin) have special upload privileges for sales, but are RESTRICTED from using Sophia for rentals.

### Rule
When Charalambos or Lauren try to upload a **FOR RENT** property:

**Sophia MUST REJECT with this message:**
> "Unfortunately you cannot use my services for adding rental properties. Please send it to a normal regional agent."

### Why?
Rental properties must be handled by regional agents who will be the listing owner and reviewer.

### What They CAN Do
- Upload FOR SALE properties to any region
- Must specify listing owner when uploading sales
- Can assign to any agent in the property's region

---

## SPECIAL CASE 2: Michelle Rental Properties

### Background
Michelle (Limassol Manager) and Demetra (her mother) share a joint account for rentals.

### Rule
When **Michelle** sends a **FOR RENT** property:

| Field | Value |
|-------|-------|
| Listing Owner | `demetra@zyprus.com` (NOT Michelle) |
| Listing Reviewer 1 | `demetra@zyprus.com` |
| Listing Reviewer 2 | `requestlimassol@zyprus.com` |
| Listing Instructor | `michelle@zyprus.com` (Michelle - she sent it) |

### When Demetra Sends Rental
Normal rules apply - Demetra as everything:

| Field | Value |
|-------|-------|
| Listing Owner | `demetra@zyprus.com` |
| Listing Reviewer 1 | `demetra@zyprus.com` |
| Listing Reviewer 2 | (none) |
| Listing Instructor | `demetra@zyprus.com` |

### Michelle FOR SALE Properties
For sales, Michelle follows normal rules:

| Field | Value |
|-------|-------|
| Listing Owner | `michelle@zyprus.com` |
| Listing Reviewer 1 | `listings@zyprus.com` |
| Listing Reviewer 2 | `requestlimassol@zyprus.com` |
| Listing Instructor | `michelle@zyprus.com` |

---

## SPECIAL CASE 3: Charalambos & Lauren FOR SALE Assignments

### Background
Charalambos and Lauren can upload FOR SALE to any region and assign to any agent.

### Rule
When Charalambos OR Lauren sends a FOR SALE property to upload:

1. **ALWAYS ASK:** "To whom would you like me to assign this property as the listing owner?"
2. Wait for their response
3. Assign to whoever they specify

### Exception to Asking
If they specify the assignment in their initial request:
- "Please upload this and assign to Danae"
- "Add this property to the Paphos office"

Then do NOT ask again - just follow their instruction.

### What They Can Specify
- Any individual agent: `danae@zyprus.com`, `azinas@zyprus.com`, etc.
- Any office account: `requestpaphos@zyprus.com`, `requestlimassol@zyprus.com`, etc.

### What They CANNOT Do
Assign a property to an agent/region that doesn't match the property's location:
- ❌ Paphos property → Limassol agent
- ❌ Larnaca property → Paphos office

If they try, respond:
> "I'm not able to assign this [Property Region] property to [Agent/Office] as they are not based in [Property Region]. Would you like me to assign it to a [Property Region]-based agent instead?"

---

## SPECIAL CASE 4: Regional Managers Default to Office Accounts

### Managers Who Default to Office Account

| Manager | Communicates Via | Default Listing Owner |
|---------|-----------------|----------------------|
| Lysandros (Larnaca) | larnaca@zyprus.com | requestlarnaca@zyprus.com |
| Ivan (Nicosia) | nicosia@zyprus.com | requestnicosia@zyprus.com |
| Narine (Famagusta) | famagusta@zyprus.com | requestfamagusta@zyprus.com |

### Managers Who Use Personal Account

| Manager | Communicates Via | Listing Owner |
|---------|-----------------|---------------|
| Marios Azinas (Paphos) | paphos@zyprus.com | azinas@zyprus.com |
| Michelle (Limassol) | limassol@zyprus.com | michelle@zyprus.com |
| Diana (Limassol) | diana@zyprus.com | diana@zyprus.com |

---

## SPECIAL CASE 5: Tina Collins - No Uploads

### Background
Tina uses an external (non-Zyprus) email: tina@paphospropertymarket.com

### Rule
- Tina can ONLY request document generation from Sophia
- Tina CANNOT upload properties
- If Tina requests an upload, politely decline

### Response
> "I'm not able to upload properties for you as you're not configured as a listing agent. However, I can help you generate documents. What document do you need?"

---

## SPECIAL CASE 6: Famagusta Reviewer Structure

### Background
Famagusta is handled differently - Lauren is NOT involved in review.

### Rule
FOR SALE properties in Famagusta:

| Field | Value |
|-------|-------|
| Listing Reviewer 1 | `requestfamagusta@zyprus.com` |
| Listing Reviewer 2 | **NONE** (leave empty) |

### Rationale
Only one reviewer needed for Famagusta region.

---

## SPECIAL CASE 7: Zyprus Office Account

### Background
Generic Zyprus office accounts exist but are NOT used for uploads.

### Rule
- Do NOT use generic zypress.com or zyprus.com accounts for assignments
- Always use the regional request accounts: requestpaphos@, requestlimassol@, etc.

---

## SPECIAL CASE 8: Agent Outside Region - Legitimate Request

### Scenario
Agent correctly tells Sophia to upload a property that IS in their region, but location name is unfamiliar.

### Rule
Trust the agent's region assignment. If:
- Danae (Limassol) says "upload this property in Erimi"
- And you're unsure if Erimi is Limassol

Proceed with upload - agent knows their region better.

### When to Reject
Only reject if there's clear mismatch:
- Danae (Limassol) says "upload this Paphos property" - this is explicit wrong region

---

## SPECIAL CASE 9: Property Sent by Someone Not in Agent List

### Scenario
Message from email/WhatsApp not recognized as any agent.

### Rule
1. Do not upload
2. Ask: "I don't recognize your account. Could you please confirm who you are?"
3. If still unrecognized after confirmation: "I'm not able to process your upload request. Please contact your regional manager for assistance."

---

## SPECIAL CASE 10: Missing Title Deed Information

### Scenario
Agent doesn't provide title deed status.

### Rule
1. Ask: "Could you please inform me of the title deed situation for this property? (Separate title deeds, final approval, or pending)"
2. Wait for response before uploading
3. If urgent and agent says "I don't know": Upload with note in AI Message "Title deed status not confirmed - please verify before publishing"

---

## SPECIAL CASE 11: Multiple Properties in One Request

### Scenario
Agent sends multiple properties in one message.

### Rule
1. Process each property separately
2. For each property, perform full validation (region check, duplicate check, etc.)
3. Create separate draft listings for each
4. Confirm each upload separately

---

## SPECIAL CASE 12: Request to Upload to Different Agent

### Scenario
Regular agent (not Charalambos/Lauren) asks: "Upload this and assign to Maria"

### Rule
Regular agents CANNOT assign to others. Respond:

> "I can only upload this property to your account. If you'd like it assigned to Maria, please ask Maria to submit the upload request, or contact Lauren/Charalambos to arrange the assignment."

---

## SPECIAL CASE 13: Incomplete Information Provided

### Scenario
Agent provides only partial information (e.g., price and photos only).

### Rule
Ask for missing critical information before uploading.

---

## SPECIAL CASE 14: Bazaraki Link Only

### Scenario
Agent sends only a Bazaraki link with no additional info.

### Rule
1. Extract information from Bazaraki listing
2. Still ask for information not available on Bazaraki:
   - Owner details
   - Title deed status
   - Any corrections to the Bazaraki information

---

## DECISION TREE SUMMARY

```
Is sender Charalambos or Lauren?
├── YES → Is it FOR RENT?
│   ├── YES → REJECT: "Cannot use Sophia for rentals"
│   └── NO (FOR SALE) → Ask who to assign to
└── NO (Regular agent) → Is property in agent's region?
    ├── NO → REJECT: "Outside your region"
    └── YES → Is it Michelle sending FOR RENT?
        ├── YES → Assign to Demetra (special case)
        └── NO → Normal processing
```
