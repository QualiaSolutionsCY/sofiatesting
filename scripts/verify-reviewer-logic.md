# Reviewer Assignment Logic Verification

## Spec Requirements (from 02_REVIEWER_ASSIGNMENTS.md)

### FOR SALE - Standard Regions (Paphos/Limassol/Larnaca/Nicosia)
- Reviewer 1: `listings@zyprus.com` (Lauren)
- Reviewer 2: `request{region}@zyprus.com`
- Listing Owner: Agent who sent it
- Listing Instructor: Agent who sent it

### FOR SALE - Famagusta ONLY
- Reviewer 1: `requestfamagusta@zyprus.com`
- Reviewer 2: **NONE**
- Listing Owner: Agent who sent it
- Listing Instructor: Agent who sent it

### FOR RENT - All Regions
- Reviewer 1: Agent who sent it
- Reviewer 2: **NONE**
- Listing Owner: Agent who sent it
- Listing Instructor: Agent who sent it

### SPECIAL: Michelle Rentals (from 03_AGENT_ACCOUNTS.md line 147-155)
- Listing Owner: `demetra@zyprus.com`
- Listing Reviewer 1: `demetra@zyprus.com`
- Listing Reviewer 2: `requestlimassol@zyprus.com` ← **CRITICAL: Spec says YES reviewer2**
- Listing Instructor: `michelle@zyprus.com`

### SPECIAL: Charalambos/Lauren Cannot Upload Rentals
Must reject with error message.

---

## Current Code Implementation (reviewer-assignment.ts)

### Lines 62-73: Michelle Rental Special Case
```typescript
if (
  agent.communicationEmail === "limassol@zyprus.com" &&
  propertyType === "rent"
) {
  return {
    reviewer1: "demetra@zyprus.com",
    reviewer2: null,  // ❌ WRONG - spec says requestlimassol@zyprus.com
    listingOwner: "demetra@zyprus.com",
    listingInstructor: "michelle@zyprus.com",
  };
}
```

### Lines 75-83: Standard Rentals
```typescript
if (propertyType === "rent") {
  return {
    reviewer1: agent.listingOwnerEmail,
    reviewer2: null,  // ✅ CORRECT
    listingOwner: agent.listingOwnerEmail,
    listingInstructor: agent.communicationEmail,
  };
}
```

### Lines 85-96: Famagusta Sales
```typescript
if (propertyRegion === "famagusta") {
  const listingOwner =
    agent.listingOwnerEmail === "ASK" ? assignTo || agent.communicationEmail : agent.listingOwnerEmail;

  return {
    reviewer1: "requestfamagusta@zyprus.com",
    reviewer2: null,  // ✅ CORRECT
    listingOwner,
    listingInstructor: agent.communicationEmail,
  };
}
```

### Lines 98-109: Standard Sales
```typescript
const listingOwner =
  agent.listingOwnerEmail === "ASK" ? assignTo || agent.communicationEmail : agent.listingOwnerEmail;

return {
  reviewer1: "listings@zyprus.com",
  reviewer2: REGIONAL_EMAILS[propertyRegion] || null,  // ✅ CORRECT
  listingOwner,
  listingInstructor: agent.communicationEmail,
};
```

---

## Verification Result

| Rule | Spec | Code | Status |
|------|------|------|--------|
| Sale (standard regions) - Reviewer 1 | listings@ | listings@ | ✅ |
| Sale (standard regions) - Reviewer 2 | request{region}@ | request{region}@ | ✅ |
| Sale (Famagusta) - Reviewer 1 | requestfamagusta@ | requestfamagusta@ | ✅ |
| Sale (Famagusta) - Reviewer 2 | NONE | null | ✅ |
| Rent (standard) - Reviewer 1 | Agent | agent.listingOwnerEmail | ✅ |
| Rent (standard) - Reviewer 2 | NONE | null | ✅ |
| Michelle Rental - Reviewer 1 | demetra@ | demetra@ | ✅ |
| Michelle Rental - Reviewer 2 | requestlimassol@ | **null** | ❌ **MISMATCH** |
| Michelle Rental - Owner | demetra@ | demetra@ | ✅ |
| Michelle Rental - Instructor | michelle@ | michelle@ | ✅ |
| Management Rental Rejection | Reject | Reject (line 54) | ✅ |

---

## Required Fix

**File:** `supabase/functions/sophia-bot/rules/reviewer-assignment.ts`
**Line:** 69
**Change:** `reviewer2: null` → `reviewer2: "requestlimassol@zyprus.com"`

**Reason:** Spec 03_AGENT_ACCOUNTS.md line 154 explicitly states Michelle rentals must have Reviewer 2 = requestlimassol@zyprus.com

This ensures the Limassol regional office can also review Michelle's rental listings.
