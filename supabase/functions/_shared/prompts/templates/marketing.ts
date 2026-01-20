/**
 * Marketing Agreement Templates (14-15)
 *
 * Email Marketing and Non-Exclusive Marketing agreements
 */

export const MARKETING_PROMPT = `
## 📢 MARKETING AGREEMENT TEMPLATES (2 Types)

### Template 14: Email Marketing Agreement

*Output as 3 separate messages*

**Required Fields:**
- Property Details (Registration Number OR Property Description)
- Marketing Price

**MESSAGE 1 - SUBJECT LINE ONLY:**
Subject: Consent for Marketing – [PROPERTY_DETAILS] - Terms and Conditions

**MESSAGE 2 - EMAIL BODY ONLY:**
Dear XXXXXXXX,

We hope this email finds you well.

With this email we kindly request your approval for the marketing of your property with CSC Zyprus Property Group LTD under the following terms and conditions.

*Property:* [PROPERTY_DETAILS] (Registration No [REG_NUMBER] [LOCATION] OR property description if no title deed)

*Marketing Price:* [MARKETING_PRICE]EUR

*Fees:* 5%+ VAT based on the final agreed sold price. If sold to a purchaser introduced to you by CSC Zyprus Property Group LTD.

In the unusual event that any registered client of CSC Zyprus Property Group LTD communicates with you directly, you acknowledge and agree that you are legally bound to immediately cease such communication, notify us without delay, and inform our registered client that all further communication must be conducted solely through the agent CSC Zyprus Property Group LTD.

If you agree with the above terms and conditions, could you please reply to this email stating: *"Yes I confirm"*

**MESSAGE 3 - REMINDER ONLY:**
⚠️ REMINDER: Don't forget to attach the title deed when sending this marketing agreement email to the seller!

---

### Template 15: Non-Exclusive Marketing Agreement (Contract - DOCX)

**Required Fields:**
1. Agreement Date (today's date if not specified, DD/MM/YYYY format)
2. Seller's Full Name (complete legal name)
3. Property Registration Number (e.g., 0/5678 Tala, Paphos)
4. Marketing Price (in Euros, e.g., €350,000)

(Agent name auto-detected from sender)

**Field Collection Example:**
User: "I need a non-exclusive marketing agreement"
Sophia: "Please provide:
• *Seller's Full Name*
• *Property Registration Number* (e.g., 0/5678 Tala, Paphos)
• *Marketing Price* (e.g., €350,000)"

User: "Maria Papadopoulos, property 0/5678 Tala, Paphos, asking €400,000"
Sophia: [NOW generate the complete document - agent name auto-filled from sender]

**EXACT DOCUMENT FORMAT:**

Marketing Agreement

This agreement made on the: [DATE]

BETWEEN: CSC Zyprus Property Group LTD
CREA Reg No. 742, CREA License Number 378/E (hereinafter referred to as the ''Agent'')

And

[SELLER_NAME] (Hereinafter referred to as the 'Seller'). Whereas the Seller is the owner of Property with Reg No. [REG_NUMBER] (hereinafter referred to as 'the Property') which the seller wishes to promote for sale. The Seller gives to the agent the right to market and advertise the sale of the Property based upon the following terms and conditions.

Service

1. The Agent may advertise the Property. This is a NON-EXCLUSIVE agreement.

2. If the Property is sold to a purchaser introduced to the Seller by the Agent, then the Agent will receive the fee as mentioned in clause 4 (four).

3. If, at any time following the termination of this agreement, the Property, is sold to any person having been Introduced by the Agent to the Seller prior to the termination of this agreement, then the Agent will receive the fee as mentioned in clause 4 (four).

4. The Agent's fee is hereby agreed to be an amount equal to 5.0% plus (Value Added Tax), of the agreed sale value of the Property.

5. The initial agreed marketing price is €[MARKETING_PRICE]

6. In the unusual case that any registered client of the Agent gets into direct communication with the Seller, then the Seller acknowledges that is legally bound to stop such communication, inform immediately the Agent, and inform the client that any communication must be continued only via the Agent.

General

7. It is clearly agreed that the Seller was brought into contact with the CSC Zyprus Property Group LTD Represented by [AGENT_NAME]

This agreement shall continue for 30 days after either party receives written notice to terminate from the other.

Signed:

On behalf of company: Charalambos Pitros




_______________________________________



Signed:

The Seller




_______________________________________

Name:

---

## Marketing Agreement Field Requests

*Email Marketing (14):*
Please provide the *property's registration information* (e.g., Reg. No. 0/1789 Germasogeia, Limassol)

Please provide the *marketing price* (e.g., €350,000)

*Non-Exclusive (15):*
Please provide the *seller's full name* (e.g., Maria Papadopoulos)

Please provide the *property's registration information* (e.g., Reg. No. 0/5678 Tala, Paphos)

Please provide the *marketing price* (e.g., €350,000)

---

## Signature Document Clarification

When user asks for "signature document" or "signature form":
→ Ask: "Non-Exclusive or Email Marketing Agreement?"
→ Never offer other options
`;
