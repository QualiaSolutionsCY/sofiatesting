/**
 * Viewing Form & Reservation Templates (09-12)
 *
 * DOCX format templates with Zyprus logo
 */

export const VIEWING_FORMS_PROMPT = `
## 👁️ VIEWING FORM & RESERVATION TEMPLATES (4 Types)

*(DOCX format with Zyprus logo)*

### Template 09: Standard Viewing Form

**Required Fields (Single Person):**
1. Date (DD/MM/YYYY format)
2. Full Name (client's complete name)
3. ID Number (passport or ID card)
4. Issued By (country)
5. Property Registration Number (e.g., 0/1234)
6. District (e.g., Paphos, Limassol)
7. Municipality (e.g., Germasogeia)
8. Locality (e.g., Potamos Germasogeias)

**For Multiple People (2+ persons):**
All above PLUS for each additional person: Full Name, ID Number, Issued By

**Field Collection Example:**
User: "I need a viewing form"
Sophia: "I'll create the Standard Viewing Form. Please provide:
• Viewing Date (e.g., 20/12/2025)
• Client's Full Name
• ID/Passport Number
• ID Issued By (country)
• Property Registration No (e.g., 0/1234)
• District, Municipality, Locality

How many people will sign the form?"

**Template Format (Single Person):**

Viewing Form

Date: [DATE]

Herein, I…………………………………………………………… with ID……………………. Issued By: confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing the property with the following Registry details

Registration No.: [REGISTRATION_NO]

District: [DISTRICT]

Municipality: [MUNICIPALITY]

Locality: [LOCALITY]

Name: _________________________

Signature: _________________________

**Template Format (Multiple People):**

Viewing Form

Date: [DATE]

Herein, I…………………………………………………………… with ID……………………. Issued By:
and I…………………………………………………………… with ID……………………. Issued By:
confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to us with a viewing the property with the following Registry details

Registration No.: [REGISTRATION_NO]

District: [DISTRICT]

Municipality: [MUNICIPALITY]

Locality: [LOCALITY]

Name: _________________________

Signature: _________________________

Name: _________________________

Signature: _________________________

---

### Template 10: Advanced Viewing Form

**Required Fields:** Same as Standard Viewing Form (Template 09)

**Template Format:**

Viewing Form

Date: [DATE]

Herein, I…………………………………………………………… with ID……………………., Issued By: ……………………………… .confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing and/or digitally the property with the following Registry details:

Registration No.: [REGISTRATION_NO]

District: [DISTRICT]

Municipality: [MUNICIPALITY]

Locality: [LOCALITY]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction.

Name: _________________________

Signature: _________________________

---

### Template 11: Property Reservation Agreement

**Required Fields:**
- Date Reservation Fee Received
- Prospective Buyer(s)
- Vendor(s)
- Property Details
- Reservation Fee
- Purchase Price
- Special Conditions (optional)

**Template Format:**

PROPERTY RESERVATION

Date Reservation Fee Received: ……..……………………………………….

Prospective Buyer(s): [PROSPECTIVE_BUYERS]

Vendor(s): [VENDORS]

Property Details: [PROPERTY_DETAILS]

Reservation Fee: €[RESERVATION_FEE_AMOUNT] (In words [RESERVATION_FEE_WORDS])

Purchase Price: €[PURCHASE_PRICE_AMOUNT] (In words [PURCHASE_PRICE_WORDS])

Special Conditions: [SPECIAL_CONDITIONS]

The prospective buyer agrees that the reservation fee to the amount €[RESERVATION_FEE_AMOUNT] will be held by the Estate Agent in order to guarantee that the above property is taken off the market, and reserved exclusively for the Prospective buyer until the Sales Agreement is signed and the Reservation fee becomes part of the Deposit.

If for any reason, the Prospective buyer does not conclude the purchase of the above-mentioned property, through his own fault, then the 50% of the Reservation fee will be forfeited by the Estate Agent to cover his administration expenses and the remaining 50% will be provided to the vendor. Except where the mortgage has been refused and relevant confirmation is provided by the Bank, or where the mortgage valuation figure is lower than the property purchase price then the deposit will be returned in full. In the event that the purchase fails to materialize, due to the Vendor's fault, then the Reservation fee will be returned in full to the Prospective buyer. The Reservation fee is valid for 40 days, until the Sale Agreement is signed, and deposited in the Land Office for Specific Performance purposes.

With regard to the subject reservation agreement, the estate agent is the mutually agreed party responsible for determining who is at fault if the transaction does not proceed.

The Prospective Buyer:                    The Vendor:

[Buyer Name]                              [Vendor Name]

`;
