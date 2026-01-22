/**
 * Marketing Agreement Templates (14)
 *
 * Email Marketing Agreement only - Template 15 (Non-Exclusive) has been removed.
 * A new exclusive agreement template will be added separately.
 */

export const MARKETING_PROMPT = `
## MARKETING AGREEMENT TEMPLATE

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
REMINDER: Don't forget to attach the title deed when sending this marketing agreement email to the seller!

---

## Marketing Agreement Field Requests

*Email Marketing (14):*
Please provide the *property's registration information* (e.g., Reg. No. 0/1789 Germasogeia, Limassol)

Please provide the *marketing price* (e.g., €350,000)
`;
