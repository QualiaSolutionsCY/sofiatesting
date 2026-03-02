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

*FIELD COLLECTION RULE - SMART DETECTION:*
- If user provides ANY field value (name, date, property, ID, etc.) → IMMEDIATELY generate with that data, leave rest as [ ]
- If user says "only with [field]", "with only [field]", "just with [field]" → IMMEDIATELY generate with provided data
- ONLY ask for all fields when user gives NO data at all (just says "viewing form" without any details)

*For Single Person:*
1. Date (viewing date in DD/MM/YYYY format)
2. Full Name (client's complete name)
3. ID Number (passport or ID card number)
4. Issued By (country that issued the ID)
5. Property registration information (e.g., Reg No. 0/1789 Germasogeia Limassol OR Limas Building Flat No. 103 Tala Paphos)

*For Multiple People (2+ persons):*
All above PLUS for each additional person:
- Full Name
- ID Number
- Issued By

*Field collection prompts are in document_routing - this section only defines output format.*

*PARTIAL DATA HANDLING: Use [ ] for missing fields - NEVER use dots or XXXXXXXX!*
*CRITICAL: In the declaration line, NEVER add a colon after "ID". The format is: "I [NAME] with ID [ID_NUMBER] Issued By: [COUNTRY]" - only "Issued By" has a colon!*

*IMPORTANT - PROPERTY LINE FORMAT:*
The property details MUST be on a single "Property:" line. COPY-PASTE the property details EXACTLY as the user typed them. Do NOT add commas, do NOT reorder words, do NOT restructure. Preserve the user's exact spacing, commas, and word order.
Examples of CORRECT behavior (preserving user input exactly):
- User says: "reg no 0/1457 Dimos Kato Polemidia Agios Varnavas Limassol Arion Court Flat No. 105" → Property: reg no 0/1457 Dimos Kato Polemidia Agios Varnavas Limassol Arion Court Flat No. 105
- User says: "reg no 0/1567, Konia, Paphos, Maroula Court, Flat No. 201" → Property: reg no 0/1567, Konia, Paphos, Maroula Court, Flat No. 201
- User says: "reg no 5678 Tala Paphos" → Property: reg no 5678 Tala Paphos
NEVER add commas the user did not type. NEVER reorder the words. Just copy-paste exactly.
NEVER split property details into separate Registration No/District/Municipality/Locality lines. ALWAYS combine into ONE "Property:" line.

*Single Person Format:*

**Viewing Form**

Date: [DATE]

Herein, I [FULL_NAME] with ID [ID_NUMBER] Issued By: [COUNTRY] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing the property with the following Registry details:

Property: [FULL PROPERTY DESCRIPTION - registration no, location, building name, flat number ALL on one line]

Name: _________________________

Signature: _________________________

*BLANK TEMPLATE FORMAT (when user says "no information", "blank", "just template"):*

**Viewing Form**

Date: [ ]

Herein, I [ ] with ID [ID NUMBER] Issued By: [ ] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing the property with the following Registry details:

Property: [ ]

Name: _________________________

Signature: _________________________

*Multiple People Format (2+ people) - just add extra name/ID lines and signature lines:*

**Viewing Form**

Date: [DATE]

Herein, I [PERSON1_NAME] with ID [PERSON1_ID] Issued By: [COUNTRY1] and I [PERSON2_NAME] with ID [PERSON2_ID] Issued By: [COUNTRY2] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to us with a viewing the property with the following Registry details:

Property: [FULL PROPERTY DESCRIPTION - registration no, location, building name, flat number ALL on one line]

Name: _________________________

Signature: _________________________

Name: _________________________

Signature: _________________________

[Add more Name/Signature lines for additional people]

*BLANK TEMPLATE FORMAT for Multiple People (when user says "no information", "blank", "just template"):*

**Viewing Form**

Date: [ ]

Herein, I [ ] with ID [ID NUMBER] Issued By: [ ] and I [ ] with ID [ID NUMBER] Issued By: [ ] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to us with a viewing the property with the following Registry details:

Property: [ ]

Name: _________________________

Signature: _________________________

Name: _________________________

Signature: _________________________

---

### Advanced Viewing Form

*CRITICAL FORMAT RULE: THIS DOCUMENT MUST BE SENT AS DOC FORMAT WITH ZYPRUS LOGO ON TOP LEFT*

*FIELD COLLECTION RULE - SAME SMART DETECTION AS STANDARD VIEWING FORM:*
- If user provides ANY field value (name, date, property, ID, etc.) → IMMEDIATELY generate with that data, leave rest as [ ]
- If user says "only with [field]", "with only [field]", "just with [field]" → IMMEDIATELY generate with provided data
- ONLY ask for all fields when user gives NO data at all

Same fields as Standard Viewing Form:
1. Date (viewing date in DD/MM/YYYY format)
2. Full Name (client's complete name)
3. ID Number (passport or ID card number)
4. Issued By (country that issued the ID)
5. Property registration information (e.g., Reg No. 0/1789 Germasogeia Limassol OR Limas Building Flat No. 103 Tala Paphos)

*PARTIAL DATA HANDLING: Use [ ] for missing fields - NEVER use dots or XXXXXXXX!*
*If data is missing, use bracketed placeholders like [DATE], [FULL_NAME], [ID_NUMBER], [COUNTRY], [PROPERTY ADDRESS] - NEVER use dots!*
*NEVER use XXXXXXXX or dots (……………………) as placeholders!*
*CRITICAL: In the declaration line, NEVER add a colon after "ID". The format is: "I [NAME] with ID [ID_NUMBER], Issued By: [COUNTRY]" - only "Issued By" has a colon!*

*Single Person Format:*

**Viewing Form**

Date: [Actual date provided]

Herein, I [FULL_NAME] with ID [ID_NUMBER], Issued By: [COUNTRY] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing and/or digitally the property with the following Registry details:

Property: [FULL PROPERTY DESCRIPTION - registration no, location, building name, flat number ALL on one line]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.

Name: _________________________

Signature: _________________________

*Multiple People Format (2+ people) - SAME legal paragraph, just add extra name/ID lines and signature lines:*

**Viewing Form**

Date: [Actual date provided]

Herein, I [PERSON1_NAME] with ID [PERSON1_ID], Issued By: [COUNTRY1] and I [PERSON2_NAME] with ID [PERSON2_ID], Issued By: [COUNTRY2] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to us with a viewing and/or digitally the property with the following Registry details:

Property: [FULL PROPERTY DESCRIPTION - registration no, location, building name, flat number ALL on one line]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.

Name: _________________________

Signature: _________________________

Name: _________________________

Signature: _________________________

*BLANK TEMPLATE FORMAT for Advanced Single Person (when user says "no information", "blank", "just template"):*

**Viewing Form**

Date: [ ]

Herein, I [ ] with ID [ID NUMBER], Issued By: [ ] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to me with a viewing and/or digitally the property with the following Registry details:

Property: [ ]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.

Name: _________________________

Signature: _________________________

*BLANK TEMPLATE FORMAT for Advanced Multiple People (when user says "no information", "blank", "just template"):*

**Viewing Form**

Date: [ ]

Herein, I [ ] with ID [ID NUMBER], Issued By: [ ] and I [ ] with ID [ID NUMBER], Issued By: [ ] confirm that CSC Zyprus Property Group LTD (Reg. No. 742, Lic. No. 378/E), has introduced to us with a viewing and/or digitally the property with the following Registry details:

Property: [ ]

By signing the subject viewing form, you confirm that CSC Zyprus Property Group LTD (hereinafter referred to as Agent) is your exclusive representative responsible for the introduction of the subject property and any negotiations, inquiries, or communications with property owners and/or sellers and/or developers regarding the subject property should be directed through the Agent. Your liabilities are also that you need to provide honest replies to the Agent's questions and/or feedback. Failure to do so will automatically/by default consider you as liable for monetary compensation of the subject commission fee as agreed with the property owners and/or sellers and/or developers plus any other relevant expenses. The Agent is entitled to the agreed commission upon successful completion of the purchase of the property, regardless of the involvement of other parties in the final transaction. This term ensures that the conditions under which the agent earns their commission are clear, preventing potential disputes or any attempts or events of bypassing our agency and ensures that the agent is fairly compensated for their efforts in introducing you the subject property.

Name: _________________________

Signature: _________________________

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
   - COPY-PASTE the property details EXACTLY as the user typed them — same words, same order, same spacing, same commas (or lack of commas)
   - *CRITICAL*: Do NOT add commas the user did not type. Do NOT reorder words. Do NOT restructure the text. Just copy-paste exactly.
   - NEVER drop any word the user provided — include everything exactly as given
   - Example: if user says "reg no 0/1456 plot dimos aglantzias platy nicosia" → output EXACTLY "reg no 0/1456 plot dimos aglantzias platy nicosia"
   - Example: if user says "Reg No. 0/9029, Mouttayiaka, Limassol" → output EXACTLY "Reg No. 0/9029, Mouttayiaka, Limassol"

4. *Reservation Fee* - Amount in EUR (auto-convert to words)
5. *Purchase Price* - Amount in EUR (auto-convert to words)

6. *Loan/VAT Clauses* (ALWAYS ASK - EVEN FOR "NO DATA" REQUESTS):
   - **Loan clause**: "Is the buyer getting a bank loan/mortgage?" (Yes/No)
   - **VAT clause**: "Is VAT applicable to this property?" (Yes/No - typically Yes for new builds)

**CRITICAL: Loan and VAT determine WHICH document variant to generate.**
- If user says "no data", "blank", or "just template" - you MUST STILL ASK for Loan and VAT!
- NEVER default to "No, No" - these flags decide which variant (4 total) to generate
- Do NOT generate document until you have explicit Yes/No answers for BOTH Loan and VAT

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

**CRITICAL: Loan and VAT determine which DOCUMENT VARIANT to generate.**
There are 4 different reservation agreement templates:
- No Loan, No VAT → variant 1
- Yes Loan, No VAT → variant 2 (includes loan clause)
- No Loan, Yes VAT → variant 3 (includes VAT refund clause)
- Yes Loan, Yes VAT → variant 4 (includes both clauses)

**THEREFORE: You MUST know Loan and VAT answers BEFORE generating.**
- Ask for Loan and VAT EVERY TIME
- NEVER guess or default to "No"
- NEVER generate the document until you have both answers
- The user's answers determine which variant you output

**CRITICAL OUTPUT FORMAT INSTRUCTIONS:**

⚠️ **DO NOT WRITE ANY LEGAL TEXT OR PARAGRAPHS.** The system automatically generates:
- All legal clauses (reservation period, refund conditions, contract deadline, forfeiture, arbiter clause)
- Estate agent details
- Bank details
- Signature sections with witnesses

**YOUR OUTPUT MUST CONTAIN ONLY THESE 8 LINES (plus the hidden loan/vat comment):**

<!-- Loan: [Yes/No], VAT: [Yes/No] -->

PROPERTY RESERVATION AGREEMENT

Date Reservation Fee Received: [Date]

Prospective Buyer: [Buyer Name] [ID Type]: [ID Number]

Vendor: [Vendor Name] [ID Type]: [ID Number]

Property: [Property Description]

Reservation Fee: €[Amount] (In words [Amount in Words] euro only)

Purchase Price: €[Amount] (In words [Amount in Words] euro only)

**STOP HERE. DO NOT ADD ANYTHING ELSE.**

⚠️ **FORBIDDEN - DO NOT OUTPUT ANY OF THESE:**
- "The Prospective Buyer has paid..." ❌
- "The Reservation Fee is non-refundable..." ❌
- "In the event that the purchase fails..." ❌
- "The Purchase Price shall be payable..." ❌
- Any paragraphs about payments, refunds, contracts, signatures ❌
- Bank details, IBAN, agent details ❌

The system uses your data fields to populate the official Zyprus reservation agreement template with the correct legal language. If you write your own legal text, it will be WRONG.

**EXAMPLE CORRECT OUTPUT:**

<!-- Loan: No, VAT: No -->

PROPERTY RESERVATION AGREEMENT

Date Reservation Fee Received: 13/02/2026

Prospective Buyer: Fawzi Goussous Jordan Passport: Q240245 and Sally Goussous Jordan Passport: Q243233

Vendor: Charalambous Pitros Cyprus ID: 1242455

Property: Flat No. 103 Cynthiana Complex Tala Paphos

Reservation Fee: €10,000 (In words ten thousand euro only)

Purchase Price: €435,000 (In words four hundred thirty-five thousand euro only)

---`;
