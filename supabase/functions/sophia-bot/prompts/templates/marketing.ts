/**
 * SOPHIA Document Templates - Marketing Agreements
 *
 * Contains:
 * - Email Marketing Agreement (TEXT - sent as WhatsApp message)
 * - Non-Exclusive Marketing Agreement (DOCX - Signature Document)
 */

export const MARKETING = `
## Marketing Agreement Templates (2 Types)

### Email Marketing Agreement (TEXT - sent as WhatsApp message)

*CRITICAL: OUTPUT AS 3 SEPARATE MESSAGES*

*MESSAGE 1 - SUBJECT LINE ONLY:*
Subject: Consent for Marketing – [PROPERTY_DETAILS] - Terms and Conditions

*MESSAGE 2 - EMAIL BODY ONLY:*
Dear XXXXXXXX,

We hope this email finds you well.

With this email we kindly request your approval for the marketing of your property with CSC Zyprus Property Group LTD under the following terms and conditions.

*Property:* Registration No. [REG_NUMBER], [LOCATION], [BUILDING/FLAT_INFO] (OR property description if no title deed)

*IMPORTANT - PROPERTY ORDER*: ALWAYS use this order: Registration No. → Location (village, city) → Building/Flat info
Example: "Registration No. 0/1456, Souni-Zanakia, Limassol, Pertridio Building Apartment No. 105"
NEVER put building/flat info before location!

*IMPORTANT*: SOPHIA should generate Email Marketing Agreement when EITHER registration number OR location is provided. If one is mentioned and the other information is available, generate immediately.

*Marketing Price:* *[MARKETING_PRICE]EUR*

*Fees:* *5%*+ *VAT* based on the final agreed sold price. If sold to a purchaser introduced to you by CSC Zyprus Property Group LTD.

In the unusual event that any registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

If you agree with the above terms and conditions, could you please reply to this email stating: *"Yes I confirm"*

*MESSAGE 3 - REMINDER ONLY:*
REMINDER: Don't forget to attach the title deed when sending this marketing agreement email to the seller!

---

### Non-Exclusive Marketing Agreement (DOCX - Signature Document)

*USE THIS WHEN:*
- Agent asks for "signature document" or "signature form"
- Agent asks for "non-exclusive marketing agreement"
- Agent asks for "marketing agreement for signature"
- Agent needs a physical document for seller to sign
- Different from Email Marketing Agreement (email) - this is a DOCX file attachment

*REQUIRED FIELDS - MUST ASK FOR THESE IF NOT PROVIDED:*
- *Seller's Full Name* (e.g., Maria Papadopoulos) - MUST be a real person's name, NOT "by the Agent" or any placeholder
- *Property Registration* (e.g., Reg No. 0/12345 Tala, Paphos)
- *Marketing Price* (e.g., €350,000)

CRITICAL: If seller's name is not provided, ASK for it before generating the document. NEVER put placeholder text like "by the Agent" or "[SELLER_NAME]" in the output.

*AUTO-FILLED FIELDS:*
- Agreement Date (defaults to today's date in format: "1st March 2026")
- Agent Name (from agent record)

*OUTPUT FORMAT - DOCX DOCUMENT CONTENT:*
Replace ALL placeholders in [BRACKETS] with actual values. Do NOT output brackets in final document.

**Marketing Agreement**

This agreement made on the: [AGREEMENT_DATE]

BETWEEN: CSC Zyprus Property Group LTD
CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the ''Agent'')

And

[SELLER_FULL_NAME]……………………………………………………………………………………………………………………

(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property with [PROPERTY_REGISTRATION]
(hereinafter referred to as 'the Property') which the seller wishes to promote for sale. The Seller gives to the agent the right to market and advertise the sale of the Property based upon the following terms and conditions.

Service

1.       The Agent may advertise the Property. This is a NON-EXCLUSIVE agreement.

2.       If the Property is sold to a purchaser introduced to the Seller by the Agent, then the Agent will receive the fee as mentioned in clause 4 (four).

3.       If, at any time following the termination of this agreement, the Property, is sold to any person having been Introduced by the Agent to the Seller prior to the termination of this agreement, then the Agent will receive the fee as mentioned in clause 4 (four).

4.       The Agent's fee is hereby agreed to be an amount equal to 5.0% plus (Value Added Tax), of the agreed sale value of the Property.

5.       The initial agreed marketing price is €[MARKETING_PRICE]

6.       In the unusual case that any registered client of the Agent gets into direct communication with the Seller, then the Seller acknowledges that is legally bound to stop such communication, inform immediately the Agent, and inform the client that any communication must be continued only via the Agent.

General

It is clearly agreed that the Seller was brought into contact with the CSC Zyprus Property Group LTD
Represented by [AGENT_NAME]

This agreement shall continue for 30 days after either party receives written notice to terminate from the other.

[Signature Table with spaces for Agent and Seller signatures]

*EXAMPLE COMPLETED OUTPUT:*
If seller is "John Smith", property is "Reg No. 0/5678 Peyia, Paphos", price is €450,000:

**Marketing Agreement**

This agreement made on the: 22nd January 2026

BETWEEN: CSC Zyprus Property Group LTD
CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the ''Agent'')

And

John Smith……………………………………………………………………………………………………………………

(Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property with Reg No. 0/5678 Peyia, Paphos
...

*DETECTION KEYWORDS:*
- "signature document", "signature form", "non-exclusive", "non exclusive", "marketing agreement for signature"
- NOT "email marketing" (that's Email Marketing Agreement)

---`;
