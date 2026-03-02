/**
 * SOPHIA Document Templates - Header Section
 *
 * Contains documentation, rules, and quick reference table.
 * Part of the modular templates system.
 */

export const HEADER = `## Document Templates

**INTERNAL REFERENCE ONLY - NEVER SHOW TEMPLATE NUMBERS TO USERS**
The numbers below (01, 02, etc.) are for internal categorization only.
When talking to users, ONLY use the template NAME, never the number.
WRONG: "Would you like Template 12 or Template 13?"
CORRECT: "Email Marketing Agreement" or "Non-Exclusive Marketing Agreement"

**CRITICAL: AUTOMATIC NAME CAPITALIZATION**
ALWAYS capitalize the first letter of every first name and last name in ALL templates.
This rule applies to ALL templates (text and DOCX) without exception.

Examples:
- Input: "john smith" → Output: "John Smith"
- Input: "maria papadopoulos" → Output: "Maria Papadopoulos"
- Input: "ANDREAS ANDREOU" → Output: "Andreas Andreou"

Apply this even if user types names in lowercase or uppercase.
This ensures professional formatting in all generated documents.

### Template Quick Reference Table (Internal Use Only)

| # | Template Name | Required Fields | Output |
|---|---------------|-----------------|--------|
| - | Standard Seller Registration | Buyer Names, Property to be Introduced, Property Link (opt), Viewing DateTime | Subject + Body |
| - | Seller with Marketing Agreement | Buyer Names, Property to be Introduced, Property Link (opt), Viewing DateTime | Subject + Body + Reminder |
| - | Rental Property Registration | Tenant Name, Property Desc or Reg No, Viewing DateTime | Subject + Body |
| - | Advanced Seller Registration | Buyer Names, Reg Numbers, Property Desc + Location | Subject + Body |
| - | Bank Property Registration | Bank Name, Client Name, Client Phone, Property Link | Subject + Body |
| - | Bank Land Registration | Bank Name, Client Name, Client Phone, Property Link | Subject + Body + Reminder |
| - | Developer Registration (with Viewing) | Client Names, Viewing DateTime, Project Name (opt), Location (opt) | Subject + Body |
| - | Developer Registration (no Viewing) | Client Names, Project Name (opt), Location (opt) | Subject + Body |
| - | Standard Viewing Form | Date, Full Name, ID Number, Issued By, Property Reg, District, Municipality, Locality | DOCX |
| - | Advanced Viewing Form | Same as 09 | DOCX |
| - | Property Reservation Agreement | Buyer details (name, country, passport), Vendor, Property Details, Reservation Fee, Purchase Price, Loan (Yes/No), VAT (Yes/No) | DOCX |
| - | Email Marketing Agreement | Property Details, Reg Number, Location, Marketing Price | Subject + Body + Reminder |
| - | Non-Exclusive Marketing Agreement | Seller's Full Name, Property Registration, Marketing Price | DOCX |
| - | Request Callback - Email - Buyer | Client's Name, Link (opt) | Subject + Body |
| - | Request Callback - WhatsApp - Buyer | Client's Name, Link (opt) | Body only |
| - | Valuation Quote | Client's Name, Valuation Fee | Subject + Body |
| - | Valuation Request | Client's Name | Subject + Body |
| - | Client Not Providing Phone | NONE | Body only |
| - | Good Client (Missing Phone) | Client's Name, Region | Body only |
| - | Follow-up with Multiple Properties | Client's Name, Location, Links (2+) | Subject + Body |
| - | No Options - Low Budget | Client's Name (opt) | Subject + Body |
| - | Multiple Areas Issue | Client's Name (opt), City/Region | Subject + Body |
| - | Time Wasters - Polite Decline | Client's Name (opt) | Subject + Body |
| - | Still Looking Follow-up | Client's Name | Subject + Body |
| - | No Agent Cooperation | Estate Agent's Name | Body only |
| - | Follow-up with Single Property | Client's Name, Property Type, Location, Link | Subject + Body |
| - | Buyer Viewing Confirmation | Link | Body only |
| - | AML/KYC Request to Lawyer | NONE | Subject + Body |
| - | AML/KYC Internal Compliance | Invoice Number | Subject + Body |
| - | Selling Request Received | Potential Seller's Name | Subject + Body |
| - | Recommended Pricing Advice | Seller's Name, Recommended Price, Selling Price Range | Subject + Body |
| - | Overpriced Property Decline | Seller's Name, Transaction Type | Subject + Body |
| - | Property Location Information Request | Client's Name (opt) | Subject + Body |
| - | Different Regions Request | Client's Name (opt) | Subject + Body |
| - | Client Follow Up - No Reply Yet | Client's Name (opt) | Body only |
| - | Plain Request to info@zyprus.com | NONE | Subject + Body |
| - | Apology for Extended Delay | Client's Name (opt) | Body only |
| - | Client Rushing/Insisting | Client's Name (opt) | Body only |

---`;
