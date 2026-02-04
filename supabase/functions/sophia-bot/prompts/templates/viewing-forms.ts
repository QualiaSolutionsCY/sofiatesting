/**
 * SOPHIA Document Templates - Viewing Forms & Reservation Agreement
 *
 * Contains:
 * - Standard Viewing Form (DOCX)
 * - Advanced Viewing Form (DOCX)
 * - Property Reservation Agreement (DOCX)
 */

export const VIEWING_FORMS = `
## Viewing Form & Reservation Templates (3 Types: Standard Viewing, Advanced Viewing, Reservation Agreement)

*CRITICAL FORMAT RULE: ALL VIEWING FORMS AND RESERVATION TEMPLATES MUST BE SENT AS DOC FORMAT WITH ZYPRUS LOGO ON TOP LEFT*

### Standard Viewing Form

*CRITICAL FORMAT RULE: THIS DOCUMENT MUST BE SENT AS DOC FORMAT WITH ZYPRUS LOGO ON TOP LEFT*

*MANDATORY FIELDS - MUST COLLECT BEFORE GENERATING:*
You MUST collect ALL of these fields before generating the viewing form:

*For Single Person:*
1. Date (viewing date in DD/MM/YYYY format)
2. Full Name (client's complete name)
3. ID Number (passport or ID card number)
4. Issued By (country that issued the ID)
5. Property Registration Number (e.g., 0/1234)
6. District (e.g., Paphos, Limassol)
7. Municipality (e.g., Paphos, Germasogeia)
8. Locality (e.g., Universal, Tala)

*For Multiple People (2+ persons):*
All above PLUS for each additional person:
- Full Name
- ID Number
- Issued By

*Field collection prompts are in document_routing - this section only defines output format.*

*DO NOT GENERATE until you have ALL mandatory fields!*
*NEVER use XXXXXXXX or [PLACEHOLDER] - always use real data!*

*STRUCTURED DATA FORMAT FOR DOCX GENERATION:*
When outputting viewing forms, include these fields clearly:
- *Date:* [Actual date provided]
- *Name:* [Actual name provided]
- *ID:* [Actual ID provided]
- *Issued By:* [Actual country provided]
- *Property Registration:* [Actual reg number provided]
- *District:* [Actual district provided]
- *Municipality:* [Actual municipality provided]
- *Locality:* [Actual locality provided]

For multiple people, clearly label each person:
- *Person 1 Name:* [First Person's Full Name]
- *Person 1 ID:* [First Person's ID]
- *Person 1 Issued By:* [First Person's Issuer]
- *Person 2 Name:* [Second Person's Full Name]
- *Person 2 ID:* [Second Person's ID]
- *Person 2 Issued By:* [Second Person's Issuer]

*Single Person Format:*

**Viewing Form**

Date: [DATE]

Herein, I…………………………………………………………… with ID……………………. Issued By: confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing the property with the following Registry details

Registration No.: [REGISTRATION_NO]

District: [DISTRICT]

Municipality: [MUNICIPALITY]

Locality: [LOCALITY]

Name: _________________________

Signature: _________________________

*Multiple People Format (2+ people) - just add extra name/ID lines and signature lines:*

**Viewing Form**

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

[Add more Name/Signature lines for additional people]

---

### Advanced Viewing Form

*CRITICAL FORMAT RULE: THIS DOCUMENT MUST BE SENT AS DOC FORMAT WITH ZYPRUS LOGO ON TOP LEFT*

*MANDATORY FIELDS - MUST COLLECT BEFORE GENERATING:*
Same as Standard Viewing Form (Standard Viewing Form):
1. Date (viewing date in DD/MM/YYYY format)
2. Full Name (client's complete name)
3. ID Number (passport or ID card number)
4. Issued By (country that issued the ID)
5. Property Registration Number (e.g., 0/1234)
6. District (e.g., Paphos, Limassol)
7. Municipality (e.g., Paphos, Germasogeia)
8. Locality (e.g., Universal, Tala)

*DO NOT GENERATE until you have ALL mandatory fields!*
*NEVER use XXXXXXXX or [PLACEHOLDER] - always use real data!*

**Viewing Form**

Date: [Actual date provided]

Herein, I…………………………………………………………… with ID……………………., Issued By: ……………………………… .confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing and/or digitally the property with the following Registry details:

Registration No.: [REGISTRATION_NO]

District: [DISTRICT]

Municipality: [MUNICIPALITY]

Locality: [LOCALITY]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.

Name: _________________________

Signature: _________________________

---

### Property Reservation Agreement

*CRITICAL FORMAT RULE: THIS DOCUMENT MUST BE SENT AS DOC FORMAT WITH ZYPRUS LOGO ON TOP LEFT*

*4 VARIANTS BASED ON LOAN/VAT CLAUSES:*
The reservation agreement has 4 variants depending on whether the buyer:
1. **No Loan, No VAT** - Standard (no special clauses)
2. **No Loan, Yes VAT** - VAT clause added (new property may be subject to VAT)
3. **Yes Loan, No VAT** - Loan clause added (buyer is getting a bank loan/mortgage)
4. **Yes Loan, Yes VAT** - Both clauses added

*MANDATORY FIELDS - MUST COLLECT BEFORE GENERATING:*
You MUST collect ALL of these fields before generating the reservation agreement:

1. *Prospective Buyer(s)* - For EACH buyer you need:
   - Full legal name (e.g., "Moshe Rajczyk")
   - ID type: "Cyprus ID" or country name for passport (e.g., "UK Passport", "USA Passport")
   - ID number (e.g., "945119")
   - If multiple buyers, ask: "Are there additional buyers?"

2. *Vendor* - The seller:
   - Full legal name (e.g., "Papapetrou Filitsa")
   - ID type: "Cyprus ID" or company registration
   - ID number (e.g., "945119" or "HE 376359")

3. *Property Details*:
   - FULL PROPERTY DESCRIPTION as a single sentence
   - *IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info
   - WITH registration: "Registration No. 0/9029, Mouttayiaka, Limassol" or "Registration No. 0/1456, Souni-Zanakia, Limassol, Pertridio Building Apartment No. 105"
   - WITHOUT registration (description only): "Arion Court, Flat No. 105, Mesa Geitonia, Limassol" — still put location AFTER building
   - NEVER put building/flat info before location!
   - Include: property type, registration number, plot/unit number, sheet/plan if applicable, location

4. *Reservation Fee* - Amount in EUR (auto-convert to words)
5. *Purchase Price* - Amount in EUR (auto-convert to words)

6. *Loan/VAT Clauses* (ALWAYS ASK):
   - **Loan clause**: "Is the buyer getting a bank loan/mortgage?" (Yes/No)
   - **VAT clause**: "Is VAT applicable to this property?" (Yes/No - typically Yes for new builds)

*PRE-FILLED VALUES (DO NOT ASK - USE THESE AUTOMATICALLY):*
- Agent: Charalambos Pitros
- Company: CSC ZYPRUS PROPERTY GROUP LTD
- CREA Reg. No.: 742
- License No.: 378/E
- Bank: CSC ZYPRUS PROPERTY GROUP LTD
- Account No: 502-10-734364-01
- IBAN: CY08 0050 0502 0005 0210 7343 6401
- BIC: HEBACY2N
- Reservation Period: 40 days (unless specified otherwise)
- Contract Deadline: 40 days (unless specified otherwise)

*Field collection prompts are in document_routing - this section only defines output format.*

*CRITICAL FORMAT FOR LOAN/VAT FLAGS:*
Include the Loan/VAT flags strictly as an HTML comment at the very beginning, BEFORE the document title.
Format: <!-- Loan: Yes/No, VAT: Yes/No -->

**NEVER include "Loan: Yes" or "VAT: Yes" as visible text in the response.**
These flags are for the parser only and MUST be hidden in a comment. If they appear in visible text, the document will look unprofessional.

Example output when generating:
<!-- Loan: Yes, VAT: No -->

**PROPERTY RESERVATION AGREEMENT**

Date Reservation Fee Received: ...

*DO NOT GENERATE until you have ALL mandatory fields!*
*NEVER use placeholder text like [BUYER_NAME] - always use real collected data!*
*The document will be generated as a DOCX file with the Zyprus logo automatically!*

Template (the legal clauses vary based on Loan/VAT - system handles this automatically):

**PROPERTY RESERVATION AGREEMENT**

Date Reservation Fee Received: ……..……………………………………….

Prospective Buyer: [BUYER_FULL_NAME] [ID_TYPE]: [ID_NUMBER]
(Example: Moshe Rajczyk Cyprus ID: 945119)

Vendor: [VENDOR_FULL_NAME] [VENDOR_ID_TYPE]: [VENDOR_ID_NUMBER]
(Example: Papapetrou Filitsa Cyprus ID: 945119)

Property Details: [FULL_PROPERTY_DESCRIPTION]
(Example: Apartment with Registration Number 0/9029, situated in Mouttayiaka, Limassol OR Flat No. 103, Cynthiana Complex, Tala, Paphos)

Reservation Fee: €[AMOUNT] (In words [WORDS] only)
Purchase Price: €[AMOUNT] (In words [WORDS] only)

[Legal clauses are automatically inserted based on Loan/VAT selections]

Details of the Estate Agent:
Name: Charalambos Pitros
On behalf of CSC ZYPRUS PROPERTY GROUP LTD
CREA Reg. No. 742 & Lic. No. 378/E (called the "Estate Agent")

Bank details of the Estate Agent, as escrow agent, where the Reservation Fee must be transferred/paid by the Prospective Buyer:
Banking Details
Name: CSC ZYPRUS PROPERTY GROUP LTD
Account No: 502-10-734364-01
IBAN: CY08 0050 0502 0005 0210 7343 6401
BIC: HEBACY2N

[Signature sections for Buyer, Vendor, and Estate Agent with Witnesses]

---`;
