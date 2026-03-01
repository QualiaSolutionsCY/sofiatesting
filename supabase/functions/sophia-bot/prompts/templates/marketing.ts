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

*Property:* COPY-PASTE the property details EXACTLY as the user typed them. Do NOT add commas, do NOT reorder words. Preserve the user's exact spacing, commas, and word order.

*CRITICAL*: NEVER add commas the user did not type. NEVER reorder or restructure. Just copy-paste exactly what the user said.
Example: if user says "Registration No. 0/1456 Souni-Zanakia Limassol Pertridio Building Apartment No. 105" → output EXACTLY that.

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

**CRITICAL OUTPUT FORMAT INSTRUCTIONS:**

⚠️ **DO NOT WRITE ANY LEGAL TEXT OR PARAGRAPHS.** The system automatically generates:
- All legal clauses (service terms, fees, termination, agent details)
- Signature sections
- Company details and CREA registration

**YOUR OUTPUT MUST CONTAIN ONLY THESE 3 LINES:**

**Marketing Agreement**

Seller: [SELLER_FULL_NAME]

Property: [PROPERTY_REGISTRATION - COPY-PASTE EXACTLY as user typed]

Marketing Price: €[MARKETING_PRICE]

**STOP HERE. DO NOT ADD ANYTHING ELSE.**

⚠️ **FORBIDDEN - DO NOT OUTPUT ANY OF THESE:**
- "This agreement made on the..." ❌
- "BETWEEN: CSC Zyprus Property Group LTD..." ❌
- "hereinafter referred to as..." ❌
- Legal clauses about fees, services, or termination ❌
- Signature sections ❌
- Agent details ❌
- Dots/ellipsis after seller name ❌

The system uses your data fields to populate the official Zyprus marketing agreement template with the correct legal language. If you write your own legal text, it will be WRONG.

*CRITICAL - PROPERTY FORMAT:*
COPY-PASTE the property details EXACTLY as the user typed them.
- Do NOT add commas the user did not type
- Do NOT reorder words
- Do NOT restructure the text
- Just copy-paste exactly what the user said

**EXAMPLE CORRECT OUTPUT:**

**Marketing Agreement**

Seller: John Smith

Property: Reg No. 0/5678 Peyia Paphos

Marketing Price: €450,000

*DETECTION KEYWORDS:*
- "signature document", "signature form", "non-exclusive", "non exclusive", "marketing agreement for signature"
- NOT "email marketing" (that's Email Marketing Agreement)

---`;
