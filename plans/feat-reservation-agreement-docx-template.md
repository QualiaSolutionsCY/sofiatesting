# Feature: Property Reservation Agreement DOCX Template

## Overview

Add a professional DOCX generator for Property Reservation Agreements to SOPHIA. Currently, Template 13 exists in the registry but uses generic text formatting. This implementation creates a proper structured DOCX with legal clauses, multi-party support, and signature blocks.

## Problem Statement

- Template 13 (Property Reservation Agreement) is registered as DOCX but lacks a dedicated generator
- The current generic `createDocxFile()` doesn't handle:
  - Multiple buyers with passport information
  - Structured legal clauses (refund conditions, forfeiture, escrow)
  - Professional table layouts for party information
  - Witness and signature sections
  - Pre-filled Zyprus banking details

## Proposed Solution

Create a dedicated `reservation-agreement.ts` DOCX generator with:
1. **Typed data interface** for all required fields
2. **Smart parser** to extract data from AI responses
3. **Professional document layout** matching the user's template
4. **Updated prompts** so SOPHIA knows what to ask

## Technical Approach

### Required Fields (Based on User's Document)

```typescript
interface ReservationAgreementData {
  // Date
  dateReservationFeeReceived: string;  // "October 21, 2022"

  // Buyers (can have multiple)
  buyers: Array<{
    fullName: string;      // "Jacobi Avi"
    country: string;       // "USA"
    passportNumber: string; // "671570053"
  }>;

  // Vendor
  vendor: {
    name: string;          // "CYRES LAND DEVELOPMENT AND CONSULTING LTD"
    registrationNumber?: string; // "HE 376359" (for companies)
  };

  // Property
  property: {
    type: string;          // "Apartment"
    location: string;      // "Dimos Germasogeias, Potamos Germasogeias, Limassol, Cyprus"
    building: string;      // "Lordos River Beach Bl. C2-D2"
    unitNumber: string;    // "105"
    registrationNumber: string; // "0/25589"
  };

  // Financial
  reservationFee: {
    amount: number;        // 5000
    words: string;         // "five thousand euro only"
  };
  purchasePrice: {
    amount: number;        // 160000
    words: string;         // "one hundred and sixty thousand euro only"
  };

  // Timeline
  reservationPeriodWeeks: number;  // 8
  contractDeadlineDays: number;    // 40

  // Agreement
  agreementDate: string;   // "21st day of October 2022"

  // Pre-filled (Zyprus defaults)
  agent: {
    name: string;          // "Charalambos Pitros"
    company: string;       // "CSC ZYPRUS PROPERTY GROUP LTD"
    creaRegNo: string;     // "742"
    licenseNo: string;     // "378/E"
  };
  bank: {
    name: string;          // "CSC ZYPRUS PROPERTY GROUP LTD"
    accountNo: string;     // "502-10-734364-01"
    iban: string;          // "CY08 0050 0502 0005 0210 7343 6401"
    bic: string;           // "HEBACY2N"
  };
}
```

### What SOPHIA Should Ask

SOPHIA should collect information in this order:

1. **Buyers** (required)
   - "Who is the prospective buyer? Please provide their **full name, country, and passport number**."
   - If multiple buyers: "Are there any additional buyers? If yes, provide their name, country, and passport number."

2. **Vendor** (required)
   - "Who is the vendor/seller? Provide the **company name and registration number** (or individual's name)."

3. **Property** (required)
   - "What property is being reserved? I need:
     - Property type (Apartment, Villa, etc.)
     - Location (area, city)
     - Building/block name
     - Unit number
     - **Registration number**"

4. **Financial Terms** (required)
   - "What is the **reservation fee** amount?" (auto-convert to words)
   - "What is the **purchase price**?" (auto-convert to words)

5. **Timeline** (optional - has defaults)
   - Reservation period: Default 8 weeks
   - Contract deadline: Default 40 days
   - Only ask if user specifies different terms

6. **Agent/Bank** (pre-filled)
   - Never ask - always use Zyprus defaults

### Files to Create/Modify

#### 1. NEW: `sophia-bot/docx/templates/reservation-agreement.ts`

```typescript
// Data interface
export interface ReservationAgreementData { ... }

// Default Zyprus values
export const ZYPRUS_DEFAULTS = {
  agent: { name: "Charalambos Pitros", company: "CSC ZYPRUS PROPERTY GROUP LTD", ... },
  bank: { name: "CSC ZYPRUS PROPERTY GROUP LTD", iban: "CY08 0050 0502 0005 0210 7343 6401", ... }
};

// DOCX builder
export function createReservationAgreement(
  data: ReservationAgreementData,
  logoData?: Uint8Array
): Document { ... }

// Response parser
export function parseReservationAgreementData(
  response: string
): ReservationAgreementData | null { ... }
```

#### 2. UPDATE: `sophia-bot/docx/templates/index.ts`

Add exports:
```typescript
export {
  createReservationAgreement,
  parseReservationAgreementData,
  type ReservationAgreementData,
} from "./reservation-agreement.ts";
```

#### 3. UPDATE: `sophia-bot/index.ts`

Add import and handling:
```typescript
import {
  createReservationAgreement,
  parseReservationAgreementData
} from "./docx/templates/index.ts";

// In the DOCX generation section:
case "reservation-agreement":
  const reservationData = parseReservationAgreementData(aiResponse);
  if (reservationData) {
    docxBuffer = await Packer.toBuffer(
      createReservationAgreement(reservationData, DECODED_LOGO)
    );
    filename = "Property_Reservation_Agreement.docx";
  }
  break;
```

#### 4. UPDATE: `sophia-bot/prompts.ts`

Update Template 13 section with proper collection instructions:

```markdown
## 📌 Template 13: Property Reservation Agreement

**Purpose**: Generate a legally binding reservation agreement as a DOCX document.

**Output**: DOCX file attachment (NOT text message)

### Required Fields (MUST Collect)
1. **Prospective Buyer(s)**: Full name, country, passport number
   - Can have multiple buyers (ask if more than one)
2. **Vendor**: Company name + registration number OR individual name
3. **Property Details**:
   - Type (Apartment, Villa, Land, etc.)
   - Location (area, municipality, city)
   - Building/Block name
   - Unit number
   - Registration number (e.g., 0/25589)
4. **Reservation Fee**: Amount in EUR (auto-convert to words)
5. **Purchase Price**: Amount in EUR (auto-convert to words)

### Pre-filled (DO NOT ASK)
- **Agent**: Charalambos Pitros, CSC ZYPRUS PROPERTY GROUP LTD (CREA 742, Lic 378/E)
- **Bank**: CSC ZYPRUS PROPERTY GROUP LTD
  - Account: 502-10-734364-01
  - IBAN: CY08 0050 0502 0005 0210 7343 6401
  - BIC: HEBACY2N

### Default Values
- Reservation period: **8 weeks** (unless specified)
- Contract deadline: **40 days** (unless specified)
- Agreement date: **Today's date**

### Collection Flow
1. Detect: "reservation agreement" or "property reservation"
2. Ask for buyer info (one at a time if multiple)
3. Ask for vendor info
4. Ask for property details
5. Ask for financial terms
6. Generate DOCX immediately (don't ask about agent/bank)

### Example Conversation
User: "I need a reservation agreement"
SOPHIA: "I'll create a Property Reservation Agreement for you. Who is the prospective buyer? Please provide their **full name, country, and passport number**."
User: "John Smith, UK, passport 12345678"
SOPHIA: "Got it. Who is the vendor/seller?"
...

### Legal Clauses (Auto-included)
- 8-week reservation period
- Refund conditions (vendor fault, encumbrances)
- Forfeiture conditions (buyer fault, 50/50 split)
- Bank mortgage refusal clause (full refund)
- 40-day contract signing deadline
- Escrow arrangement
- Witness signatures
```

#### 5. UPDATE: `sophia-bot/utils/field-validator.ts`

Add validation for reservation agreement fields:
```typescript
export function validateReservationAgreement(data: Partial<ReservationAgreementData>): string[] {
  const missing: string[] = [];
  if (!data.buyers?.length) missing.push("buyer information");
  if (!data.vendor?.name) missing.push("vendor/seller");
  if (!data.property?.registrationNumber) missing.push("property registration number");
  if (!data.reservationFee?.amount) missing.push("reservation fee");
  if (!data.purchasePrice?.amount) missing.push("purchase price");
  return missing;
}
```

#### 6. UPDATE: `docs/templates/source/v1/template_13_property_reservation_agreement_instructions.txt`

Replace with updated instructions matching the new format.

### Document Structure (DOCX Layout)

```
┌─────────────────────────────────────────────────────────┐
│ [ZYPRUS LOGO]                                           │
├─────────────────────────────────────────────────────────┤
│                 PROPERTY RESERVATION                     │
├─────────────────────────────────────────────────────────┤
│ Date Reservation Fee Received: _______________          │
│                                                         │
│ Prospective Buyer:                                      │
│ [Name 1], [Country], Passport: [Number]                 │
│ and                                                     │
│ [Name 2], [Country], Passport: [Number]                 │
│                                                         │
│ Vendor:                                                 │
│ [Company Name] [Reg Number]                             │
│                                                         │
│ Property Details:                                       │
│ [Type] in [Location]                                    │
│ [Building] Unit No. [Unit] with Reg Number [RegNo]      │
│                                                         │
│ Reservation Fee: €[Amount] (In words [Words])           │
│ Purchase Price: €[Amount] (In words [Words])            │
├─────────────────────────────────────────────────────────┤
│ [Legal paragraph about 8-week reservation period]       │
│ [Refund conditions paragraph]                           │
│ [Forfeiture conditions paragraph]                       │
│ [Contract deadline paragraph]                           │
│ [Estate agent arbiter clause]                           │
├─────────────────────────────────────────────────────────┤
│ Details of the Estate Agent:                            │
│ Name: Charalambos Pitros                                │
│ On behalf of CSC ZYPRUS PROPERTY GROUP LTD              │
│ CREA Reg. No. 742 & Lic. No. 378/E                      │
├─────────────────────────────────────────────────────────┤
│ Banking Details:                                        │
│ Name: CSC ZYPRUS PROPERTY GROUP LTD                     │
│ Account No: 502-10-734364-01                            │
│ IBAN: CY08 0050 0502 0005 0210 7343 6401                │
│ BIC: HEBACY2N                                           │
├─────────────────────────────────────────────────────────┤
│ Dated on this [Day] day of [Month] [Year].              │
├─────────────────────────────────────────────────────────┤
│ The Prospective Buyer:  │  WITNESSES                    │
│ _____________________   │  _____________________        │
│ [Buyer Name]            │  Name and I.D.:               │
│                         │                               │
│ The Vendor:             │  WITNESSES                    │
│ _____________________   │  _____________________        │
│ [Vendor Name]           │  Name and I.D.:               │
│                         │                               │
│ The Estate Agent:       │                               │
│ _____________________   │                               │
│ Charalambos Pitros      │                               │
│ For CSC ZYPRUS PROPERTY │                               │
│ GROUP LTD               │                               │
└─────────────────────────────────────────────────────────┘
```

### Number to Words Utility

Add `sophia-bot/utils/number-to-words.ts`:
```typescript
export function numberToWords(amount: number): string {
  // Convert 160000 → "one hundred and sixty thousand"
  // Handle euro amounts up to millions
}
```

## Acceptance Criteria

### Functional Requirements
- [ ] SOPHIA correctly detects "reservation agreement" requests
- [ ] SOPHIA asks for buyer info (name, country, passport) - supports multiple buyers
- [ ] SOPHIA asks for vendor info (name, registration if company)
- [ ] SOPHIA asks for property details (type, location, building, unit, reg number)
- [ ] SOPHIA asks for financial terms (reservation fee, purchase price)
- [ ] SOPHIA auto-converts amounts to words
- [ ] SOPHIA uses default values (8 weeks, 40 days, today's date)
- [ ] SOPHIA never asks for agent/bank details (pre-filled)
- [ ] Generated DOCX matches the exact format of user's template
- [ ] Legal clauses are included verbatim
- [ ] Signature and witness sections are properly formatted

### Quality Gates
- [ ] Parser correctly extracts all fields from AI response
- [ ] Document generates without errors for all field combinations
- [ ] Multiple buyers handled correctly
- [ ] Company vs individual vendor handled correctly
- [ ] IBAN/BIC formatting preserved

## Implementation Steps

### Phase 1: DOCX Generator (~30 min)
1. Create `reservation-agreement.ts` with:
   - TypeScript interface for data
   - Default Zyprus values
   - DOCX builder using `docx` library
   - Response parser with regex extraction

2. Update `docx/templates/index.ts` exports

### Phase 2: Integration (~20 min)
3. Update `index.ts` to handle reservation-agreement type:
   - Import new functions
   - Add case in DOCX generation switch
   - Set proper filename

4. Update `docx/detector.ts` if needed (should already work)

### Phase 3: Prompts (~20 min)
5. Update `prompts.ts` Template 13 section:
   - Clear field requirements
   - Collection flow
   - Example conversation
   - Pre-filled values note

### Phase 4: Validation & Utils (~15 min)
6. Add `number-to-words.ts` utility
7. Update `field-validator.ts` with reservation-specific validation
8. Test field extraction patterns

### Phase 5: Testing & Deploy (~15 min)
9. Test locally with sample requests
10. Deploy: `cd /tmp/sophia-deploy && supabase functions deploy sophia-bot --no-verify-jwt`
11. Test via WhatsApp

## Dependencies & Prerequisites

- Supabase CLI installed and configured
- Access to project `vceeheaxcrhmpqueudqx`
- Existing viewing form DOCX generators as reference pattern

## Risk Analysis

| Risk | Mitigation |
|------|------------|
| Parser fails on edge cases | Use flexible regex with fallbacks |
| Number-to-words errors | Validate input ranges, use established algorithm |
| Multiple buyers formatting | Test with 1, 2, and 3+ buyers |
| Legal clause accuracy | Copy verbatim from user's document |

## References

### Internal
- `sophia-bot/docx/templates/viewing-form-single.ts` - Pattern reference
- `sophia-bot/docx/templates/viewing-form-advanced.ts` - Advanced formatting
- `sophia-bot/docx/styles.ts` - Styling constants
- User's document: `/home/qualia/Downloads/Reservation_Agreement_F (1) (1).docx`

### External
- [docx.js.org](https://docx.js.org/) - DOCX library docs
- [Cyprus Property Reservation Standards](https://psml.law/reservation-agreements-cyprus-property-guide/)
