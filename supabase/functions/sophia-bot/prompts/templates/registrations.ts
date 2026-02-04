/**
 * SOPHIA Document Templates - Registration Templates
 *
 * Contains 8 registration templates:
 * - Standard Seller Registration
 * - Seller with Marketing Agreement
 * - Rental Property Registration
 * - Advanced Seller Registration
 * - Bank Property Registration
 * - Bank Land Registration
 * - Developer Registration (with Viewing)
 * - Developer Registration (no Viewing)
 */

export const REGISTRATIONS = `
## Registration Templates (8 Types)

### Standard Seller Registration

Subject: Registration - [BUYER_NAMES]

**PROPERTY INTRODUCED FORMAT:**
- If registration number given (e.g., "0/1234"): "Your Property with Registration No. [REG_NUMBER], [LOCATION], [BUILDING/FLAT_INFO]"
- If NO registration number (e.g., "Limas Building 105 Strovolos"): "Your Property: [PROPERTY_DESCRIPTION]" (do NOT write "with Registration No." followed by a building name - that's invalid)

*IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info
Example: "Your Property with Registration No. 0/1456, Souni-Zanakia, Limassol, Pertridio Building Apartment No. 105"
NEVER put building/flat info before location!

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX, (Seller)

This email is to provide you with a registration.

*Client Information:* [BUYER_NAMES]

*Property Introduced:* Your Property with Registration No. [REG_NUMBER], [LOCATION], [BUILDING/FLAT_INFO] OR Your Property: [PROPERTY_DESCRIPTION]

*Property Link:* [PROPERTY_LINK] (optional - omit if not provided)

*Viewing Arranged for:* [VIEWING_DATETIME]

*Please confirm Registration and Viewing.*

For the confirmation, Could you please reply *"Yes I confirm"*

Looking forward to your prompt confirmation.

---

### Seller with Marketing Agreement

Subject: Registration - [BUYER_NAMES]

**PROPERTY INTRODUCED FORMAT:**
- If registration number given (e.g., "0/1234"): "Your property with Registration No. [REG_NUMBER], [LOCATION], [BUILDING/FLAT_INFO]"
- If project/unit given: "Your property within the project [PROJECT_NAME] with Unit No. [UNIT_NUMBER] at [LOCATION]"
- If NO registration number (e.g., "Limas Building 105 Strovolos"): "Your property: [PROPERTY_DESCRIPTION]" (do NOT write "with Registration No." followed by a building name)

*IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info
Example: "Your property with Registration No. 0/1456, Souni-Zanakia, Limassol, Pertridio Building Apartment No. 105"
NEVER put building/flat info before location!

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX, (Seller)

Following our communication,

With this email, we kindly ask for your approval for the below registration and viewing.

*Client Information:* [BUYER_NAMES]

*Property Introduced:* (use appropriate format from above based on what info was provided)

*Property Link:* [PROPERTY_LINK] (optional - omit if not provided)

*Viewing arranged for:* [VIEWING_DATETIME].

*Fees:* 5% + VAT based on the final agreed sold price. If sold to the above-mentioned purchaser introduced to you by CSC Zyprus Property Group LTD.

In the unusual event that the above registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

If you agree with the above terms and conditions, could you please reply to this email stating: *"Yes I confirm"*

*REMINDER:* Add the copy of the title deed as well when sending this registration email to the seller!

---

### Rental Property Registration

Subject: Registration - [TENANT_NAMES]

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX, (landlord)

This email is to provide you with a registration.

*Client Information:* [TENANT_NAMES]

*Property Introduced:* Your Property: [PROPERTY_DESCRIPTION] (OR "Your Property with Registration No. [REG_NUMBER], [LOCATION], [BUILDING/FLAT_INFO]" if registration number provided)

*IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info. NEVER put building/flat info before location!

*Viewing Arranged for:* [VIEWING_DATETIME]

*Fees:* The first agreed monthly rental amount of the property. In the event that the property is rented to the above-mentioned client(s) introduced by our company.

In the unusual event that the above registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

*Please confirm Registration and Viewing.*

For the confirmation, Could you please reply *"Yes I confirm"*

Looking forward to your prompt confirmation.

---

### Advanced Seller Registration

*Defaults & Rules for Advanced Seller:*
- *Agency Fee*: If NOT provided by the user, ALWAYS use *5%*.
- *Initial Payment Percentage*: If NOT provided by the user, ALWAYS use *50%*.
- *CRITICAL*: DO NOT ask the user for these two fields if they are missing. Use the defaults above and generate the document IMMEDIATELY.
- *NEVER ask for "owner entities"* - this field has been removed from the template.

Subject: Registration - [BUYER_NAMES]

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX,

This email is to provide you with the full registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Client Information:* [BUYER_NAMES] and any directly related company in which [he/she/they] is/are a sole shareholder or co-shareholder.

*Property Introduced:* Your property with Registration No. [REG_NUMBERS], [LOCATION], [BUILDING/FLAT_INFO] ([PROPERTY_DESCRIPTION])

*IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info. NEVER put building/flat info before location!

*Our Agency Fees:* [AGENCY_FEE]%+ VAT based on the final agreed sold price. If sold to the above-mentioned purchaser introduced to you by CSC Zyprus Property Group LTD.

Our fee becomes payable in full upon your receipt of the initial [PAYMENT_PERCENTAGE]% payment of the agreed purchase price. This ensures that, in cases where the remaining balance may be delayed due to the issuance of title deeds, licenses, or any other special agreement reached with the buyer/client, our agency is not required to wait indefinitely for settlement. This method of payment is consistent with standard market practice in similar transactions.

Acceptance of registration implies a full registration under our agency regardless of viewing arrangement(s) by our firm, since your property details will be fully provided for enhanced and transparent review by our client. Acceptance of registration also implies acceptance of the above fees and terms.

Please confirm registration.

For the confirmation, please reply *"Yes I confirm"*

Looking forward to your prompt reply.

---

### Bank Registration Pre-Question (Templates 05 & 06)

Before collecting any other details, ALWAYS ask ONLY: "Land or Property?" (nothing else). After they answer, then ask for the remaining fields.

---

### Bank Property Registration

*Required Fields (MUST Collect Before Generating):*
- Bank Name (detect from property link OR ask: e.g., REMU, Altamira, Gordian, Bank of Cyprus, Hellenic Bank)
- Client Name (e.g., Andreas Andreou)
- Client Phone - full format (e.g., +357 99 123456)
- Property Link (MANDATORY - e.g., https://www.remuproperties.com/Cyprus/listing-29190)

Agent Mobile: AUTO-DETECTED from sender's WhatsApp number - DO NOT ASK! Use the phone number the message came from.

*Phone Masking Rule (CRITICAL):*

MASKED PHONE FORMAT: +357 XX**YYYY

Where:
- XX = first 2 digits (keep as-is)
- ** = TWO ASTERISK CHARACTERS (the * symbol, typed twice)
- YYYY = last 4 digits (keep as-is)

CONSTRUCTION: Take 99123456, split into: 99 | 12 | 3456, output: 99 + * + * + 3456 = 99**3456

EXAMPLES:
- +357 99123456 → +357 99**3456 (nine nine STAR STAR three four five six)
- +357 99111668 → +357 99**1668 (nine nine STAR STAR one six six eight)
- +357 96555444 → +357 96**5444 (nine six STAR STAR five four four four)

COMMON MISTAKE: Writing 99*123456 (9 characters) instead of 99**3456 (8 characters)
The middle two digits DISAPPEAR and are REPLACED by two * symbols.

*Bank Detection from Link:*
- remuproperties.com → REMU
- altamira-amc.com → Altamira
- gogordian.com → Gordian
- If no link match, ask: "Which bank is this property with?"

*EXACT TEMPLATE - COPY VERBATIM:*

Subject: Registration - [CLIENT_NAME]

Dear [BANK_NAME] Team,

This email is to provide you with a registration.

Please register the following client under CSC Zyprus Property Group LTD and send me a confirmation.

*My Mobile:* [AGENT_MOBILE] (please call me to arrange a viewing)

*Registration Details:*
[CLIENT_NAME]
[CLIENT_PHONE_MASKED]

*Property:* [PROPERTY_LINK]

Looking forward to your prompt reply.

*END OF TEMPLATE 05*

---

### Bank Land Registration

*Required Fields (MUST Collect Before Generating):*
- Bank Name (detect from property link OR ask: e.g., REMU, Altamira, Gordian, Bank of Cyprus, Hellenic Bank)
- Client Name (e.g., Elena Petrou)
- Client Phone - full format (e.g., +357 96 111222)
- Property Link (MANDATORY - e.g., https://www.gogordian.com/listing/12345)

Agent Mobile: AUTO-DETECTED from sender's WhatsApp number - DO NOT ASK! Use the phone number the message came from.

*Phone Masking Rule (CRITICAL):*

MASKED PHONE FORMAT: +357 XX**YYYY

Where:
- XX = first 2 digits (keep as-is)
- ** = TWO ASTERISK CHARACTERS (the * symbol, typed twice)
- YYYY = last 4 digits (keep as-is)

CONSTRUCTION: Take 96111222, split into: 96 | - | 1222, output: 96 + * + * + 1222 = 96**1222

EXAMPLES:
- +357 96111222 → +357 96**1222 (nine six STAR STAR one two two two)
- +357 99123456 → +357 99**3456 (nine nine STAR STAR three four five six)

COMMON MISTAKE: Writing 96*111222 (9 characters) instead of 96**1222 (8 characters)
The middle two digits DISAPPEAR and are REPLACED by two * symbols.

*CRITICAL DIFFERENCE FROM TEMPLATE 05:*
- Bank Land is for LAND only
- Includes "Please find attached the viewing form for the below Land." line
- Says "(please call me for any further information)" NOT "(please call me to arrange a viewing)"
- MUST include viewing form reminder at end

*EXACT TEMPLATE - COPY VERBATIM:*

Subject: Registration - [CLIENT_NAME]

Dear [BANK_NAME] Team,

This email is to provide you with a registration.

Please find attached the viewing form for the below Land.

Please register the following client under CSC Zyprus Property Group LTD and send me a confirmation.

*My Mobile:* [AGENT_MOBILE] (please call me for any further information)

*Registration Details:*
[CLIENT_NAME]
[CLIENT_PHONE_MASKED]

*Property:* [PROPERTY_LINK]

Looking forward to your prompt reply.

*REMINDER:* Don't forget to attach the viewing form when sending this registration email to the bank! (Banks don't attend viewings WHEN IT IS A LAND, so they require the viewing form as proof of viewing.)

*END OF TEMPLATE 06*

---

### Bank Registration Rules - Non-Negotiable

1. NEVER generate bank registration without property link - ask for it if missing
2. PHONE MASKING: ONLY mask CLIENT phone (under Registration Details), NEVER mask agent phone (My Mobile). Replace digits 3-4 with TWO asterisks → 99111668 becomes 99**1668
3. ALWAYS bold the field labels: *My Mobile:*, *Registration Details:*, *Property:*
4. ALWAYS use "Dear [BANK_NAME] Team," greeting
5. Bank Property (Property): "(please call me to arrange a viewing)"
6. Bank Land (Land): "(please call me for any further information)" + viewing form reminder
7. COPY THE TEMPLATE EXACTLY - DO NOT PARAPHRASE OR SHORTEN
8. DO NOT add any extra text, greetings, or explanations before or after the template
9. NO ASTERISKS BEFORE LINKS: The *Property:* line should be exactly: *Property:* https://... (NO extra * before the URL)

---

### Email Template Output Format - 3 Separate Messages

*GLOBAL RULE: FOR ALL EMAIL TEMPLATES - OUTPUT AS 3 SEPARATE MESSAGES*

*THIS APPLIES TO ALL EMAIL TEMPLATES INCLUDING:*
- All Registration Templates (Seller, Bank, Developer)
- Email Marketing Agreement
- All Client Communication Email Templates
- ANY document that has a "Subject:" line

*MESSAGE 1 - SUBJECT LINE ONLY (FIRST MESSAGE):*
\`\`\`
Subject: Registration - [CLIENT_NAME]
\`\`\`
- Send ONLY the subject line
- NO email body
- NO reminders
- NO other text

*MESSAGE 2 - EMAIL BODY ONLY (SECOND MESSAGE):*
\`\`\`
Dear [BANK_NAME] Team,

This email is to provide you with a registration.
[... rest of template body ...]

Looking forward to your prompt reply.
\`\`\`
- Send ONLY the email body
- NO subject line
- NO reminders
- Start directly with greeting (Dear...)

*MESSAGE 3 - REMINDER/NOTE ONLY (THIRD MESSAGE - IF EXISTS):*
\`\`\`
REMINDER: Don't forget to attach the viewing form when sending this registration email to the bank!
\`\`\`
- Send ONLY if template has a reminder/note
- NO subject line
- NO email body
- Just the reminder text

*CRITICAL RULES:*
1. Subject line is ALWAYS sent as its own separate message FIRST
2. Email body is ALWAYS sent as its own separate message SECOND
3. Reminder (if exists) is ALWAYS sent as its own separate message THIRD
4. NEVER combine subject + body in one message
5. NEVER combine body + reminder in one message
6. NEVER add "Here is your email:" or any introduction
7. Each message must be completely separate with clear breaks between them

---

### Developer Registration (with Viewing)

**⚠️ CRITICAL: "Client Names" = THE PERSON VIEWING THE PROPERTY (e.g., Yousef Goussous)**
**DO NOT confuse with "Developer's name" - we don't need the developer company name!**

Required Fields:
- **Client Names** (REQUIRED) - The person viewing the property (e.g., "Thomais Leonidou", "Yousef Goussous")
- **Viewing Date & Time** (REQUIRED) - When they will view (e.g., "Wednesday 21st October 2025 at 16:00")
- Project Name (optional - only if agent mentioned it, e.g., Limas Project)
- Location (optional - only if agent mentioned it, e.g., Paphos)

**When asking for fields, say:**
"Please provide the **client's full name** and **viewing date/time**"

Subject: Registration - [CLIENT_NAMES]

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX,

This email is to provide you with the registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Registration Details:* [CLIENT_NAMES]

*Viewing Arranged for:* [VIEWING_DATETIME]

*Fees:* 5%+ VAT on the Agreed/Accepted Sold price

Payable in full on the first *30%* payment

Please confirm registration

Acceptance of registration implies the acceptance of the fees, terms and content of this email.

---

### Developer Registration (no Viewing)

**⚠️ CRITICAL: "Client Names" = THE PERSON BEING REGISTERED (e.g., Yousef Goussous)**
**DO NOT confuse with "Developer's name" - we don't need the developer company name!**

Required Fields:
- **Client Names** (REQUIRED) - The person being registered (e.g., "Yousef Goussous", "John Smith")
- Project Name (optional - only if agent mentioned it)
- Location (optional - only if agent mentioned it)

**When asking for fields, say:**
"Please provide the **client's full name** (e.g., Yousef Goussous)"

**DO NOT say:**
"Please provide the Developer's name (e.g., Aristo Developers)" ❌ WRONG!

Subject: Registration - [CLIENT_NAMES]

*EXACT EMAIL FORMAT (COPY CHARACTER BY CHARACTER):*

Dear XXXXXXXX,

This email is to provide you with the full registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Registration Details:* [CLIENT_NAMES]

*Fees:* 5%+ VAT on the Agreed/Accepted Sold price

Payable in full on the first *30%* payment

Please confirm registration

Acceptance of registration implies a full registration under our agency regardless of viewing arrangement(s) by our firm, since your Company's full details will be fully provided for enhanced and transparent review by our client. Acceptance of registration implies also acceptance of the above fees and terms.

Looking forward to your prompt reply.

---`;
