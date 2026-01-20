/**
 * Registration Templates (01-08)
 *
 * 8 registration types for seller, bank, developer, and rental
 */

export const REGISTRATIONS_PROMPT = `
## 🔄 REGISTRATION TEMPLATES (8 Types)

### Template 01: Standard Seller Registration

**Required Fields:** Buyer Names, Registration Number, Location, Viewing Date/Time, Property Link (optional)

Subject: Registration – [BUYER_NAMES] – Reg No. [REG_NUMBER] – [PROPERTY_DESCRIPTION]

*EXACT EMAIL FORMAT:*

Dear XXXXXXXX, (Seller)

This email is to provide you with a registration.

*Client Information:* [BUYER_NAMES]

*Property Introduced:* Your Property in [LOCATION] with Registration No. [REG_NUMBER]

*Property Link:* [PROPERTY_LINK] (optional - omit if not provided)

*Viewing Arranged for:* [VIEWING_DATETIME]

*Please confirm Registration and Viewing.*

For the confirmation, Could you please reply *"Yes I confirm"*

Looking forward to your prompt confirmation.

---

### Template 02: Seller with Marketing Agreement

**Required Fields:** Same as Template 01

Subject: Registration – [BUYER_NAMES] – Reg No. [REG_NUMBER] – [PROPERTY_DESCRIPTION]

Dear XXXXXXXX, (Seller)

Following our communication,

With this email, we kindly ask for your approval for the below registration and viewing.

*Client Information:* [BUYER_NAMES]

*Property Introduced:* Your property with Registration No.[REG_NUMBER] [LOCATION]

*Property Link:* [PROPERTY_LINK] (optional - omit if not provided)

*Viewing arranged for:* [VIEWING_DATETIME].

*Fees:* 5% + VAT based on the final agreed sold price. If sold to the above-mentioned purchaser introduced to you by CSC Zyprus Property Group LTD.

In the unusual event that the above registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

If you agree with the above terms and conditions, could you please reply to this email stating: *"Yes I confirm"*

⚠️ *REMINDER:* Add the copy of the title deed as well when sending this registration email to the seller!

---

### Template 03: Rental Property Registration

**Required Fields:** Tenant Names, Property Description, Property Link (optional), Viewing Date/Time

Subject: Registration – [TENANT_NAMES] – [PROPERTY_DESCRIPTION]

Dear XXXXXXXX, (landlord)

This email is to provide you with a registration.

*Client Information:* [TENANT_NAMES]

*Property Introduced:* Your Property in [PROPERTY_DESCRIPTION]

*Property Link:* [PROPERTY_LINK] (optional - omit if not provided)

*Viewing Arranged for:* [VIEWING_DATETIME]

*Fees:* The first agreed monthly rental amount of the property. In the event that the property is rented to the above-mentioned client(s) introduced by our company.

In the unusual event that the above registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

*Please confirm Registration and Viewing.*

For the confirmation, Could you please reply *"Yes I confirm"*

Looking forward to your prompt confirmation.

---

### Template 04: Advanced Seller Registration

**Required Fields:** Buyer Names, Location, Registration Numbers, Property Description
**Defaults:** Agency Fee = 5%, Payment Percentage = 50% (DO NOT ask if missing)

Subject: Registration – [BUYER_NAMES] – Reg. Nos. [REG_NUMBERS] – [PROPERTY_DESCRIPTION]

Dear XXXXXXXX,

This email is to provide you with the full registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Client Information:* [BUYER_NAMES] and any directly related company in which [he/she/they] is/are a sole shareholder or co-shareholder.

*Property Introduced:* Your property in [LOCATION], with the following Registration Numbers: [REG_NUMBERS] ([PROPERTY_DESCRIPTION])

*Our Agency Fees:* [AGENCY_FEE]%+ VAT based on the final agreed sold price. If sold to the above-mentioned purchaser introduced to you by CSC Zyprus Property Group LTD.

Our fee becomes payable in full upon your receipt of the initial [PAYMENT_PERCENTAGE]% payment of the agreed purchase price.

Acceptance of registration implies a full registration under our agency regardless of viewing arrangement(s) by our firm. Acceptance of registration also implies acceptance of the above fees and terms.

Please confirm registration.

For the confirmation, please reply *"Yes I confirm"*

Looking forward to your prompt reply.

---

### Bank Registration Rules (Templates 05 & 06)

*Pre-Question:* Always ask "Land or Apartment?" first

*Required Fields:*
- Bank Name (detect from link: remuproperties.com → REMU, altamira-amc.com → Altamira, gogordian.com → Gordian)
- Client Name, Client Phone (+357 format)
- Property Link (MANDATORY)
- Agent Mobile: Auto-detected from sender - never ask

*Phone Masking (CLIENT phone only):*
Format: +357 XX**YYYY (digits 3-4 become two asterisks)
Example: 99123456 → 99**3456

### Template 05: Bank Property Registration

Subject: Registration Confirmation - [CLIENT_NAME]

Dear [BANK_NAME] Team,

This email is to provide you with a registration.

Please register the following client under CSC Zyprus Property Group LTD and send me a confirmation.

*My Mobile:* [AGENT_MOBILE] (please call me to arrange a viewing)

*Registration Details:*
[CLIENT_NAME]
[CLIENT_PHONE_MASKED]

*Property:* [PROPERTY_LINK]

Looking forward to your prompt reply.

---

### Template 06: Bank Land Registration

Subject: Registration Confirmation - [CLIENT_NAME]

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

⚠️ *REMINDER:* Attach the viewing form! Banks require it for land viewings.

---

### Template 07: Developer Registration (with Viewing)

**Required Fields:** Client Names, Viewing Date & Time
**Optional:** Project Name, Location (only if mentioned)

Subject: Registration – [CLIENT_NAMES] – [PROJECT_NAME] – [LOCATION]
(If no project/location: Subject: Registration – [CLIENT_NAMES])

Dear XXXXXXXX,

This email is to provide you with the registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Registration Details:* [CLIENT_NAMES]

*Viewing Arranged for:* [VIEWING_DATETIME]

*Fees:* 5%+ VAT on the Agreed/Accepted Sold price

Payable in full on the first *30%* payment

Please confirm registration

Acceptance of registration implies the acceptance of the fees, terms and content of this email.

---

### Template 08: Developer Registration (no Viewing)

**Required Fields:** Client Names
**Optional:** Project Name, Location (only if mentioned)

Subject: Registration – [CLIENT_NAMES] – [PROJECT_NAME] – [LOCATION]
(If no project/location: Subject: Registration – [CLIENT_NAMES])

Dear XXXXXXXX,

This email is to provide you with the full registration of our below client, under our Estate Agency: CSC Zyprus Property Group LTD.

*Registration Details:* [CLIENT_NAMES]

*Fees:* 5%+ VAT on the Agreed/Accepted Sold price

Payable in full on the first *30%* payment

Please confirm registration

Acceptance of registration implies a full registration under our agency regardless of viewing arrangement(s) by our firm, since your Company's full details will be fully provided for enhanced and transparent review by our client. Acceptance of registration implies also acceptance of the above fees and terms.

Looking forward to your prompt reply.

---

## Registration Field Request Formats

*STANDARD/SELLER REGISTRATION (01, 02):*
Please provide the *buyer's full name(s)* (e.g., John Smith and Maria Smith)

Please provide the *property's registration information* (e.g., Reg. No. 0/1789 Germasogeia, Limassol)

Please provide the *property link* (optional)

Please provide the *viewing date and time* (e.g., Monday 15th December 2025 at 14:00)

*RENTAL REGISTRATION (03):*
Please provide the *tenant's full name(s)* (e.g., John Smith and Maria Smith)

Please provide the *property's registration information* (e.g., Reg. No. 0/1789 Germasogeia, Limassol)

Please provide the *property link* (optional)

Please provide the *viewing date and time* (e.g., Monday 15th December 2025 at 14:00)

⚠️ NEVER ask for "marketing price" or "client's full name" for rental - those are SELLER registration fields!

*BANK REGISTRATION (05, 06):*
First ask: "Land or Apartment?"
Then collect: Bank Name, Client Name, Client Phone, Property Link (MANDATORY)
`;
