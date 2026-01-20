/**
 * Client Communication Templates (17-43)
 *
 * 27 templates for client communication scenarios
 */

export const CLIENT_COMMS_PROMPT = `
## 📬 CLIENT COMMUNICATION TEMPLATES (17-43)

### Template 17: Good Client - Request via Email

**Required Fields:** Client's Name, Link

Subject: Request - [Client's Name] – House – Limassol

Dear [Client's Name],

We hope this email finds you well. We would like to confirm the receipt of your request for the subject property:

[Link]

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

We look forward to speaking with you and assisting you further in finding the right property.

---

### Template 18: Good Client - Request via WhatsApp

**Required Fields:** Client's Name, Link

Dear [Client's Name],

We hope this message finds you well. We would like to confirm the receipt of your request for the subject property.

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call.

We look forward to speaking with you and assisting you further in finding the right property.

[Link]

---

### Template 19: Valuation Quote

**Required Fields:** Client's Name, Valuation Fee

⚠️ Valuation fees MUST include "+ VAT" (e.g., "€400 + VAT")

Subject: Valuation Quote – [Client's Name]

Dear [Client's Name],

We hope this email finds you well. We are pleased to provide you with a quote for the valuation of your property.

Our valuation reports are accredited by RICS and ETEK, delivered by two experienced valuers.

As requested, our valuation fee for your property is [VALUATION_FEE].

For reference, view a sample report:
https://www.zyprus.com/sites/all/themes/zyprus/files/Property_Valuation_Sample_Cyprus_RICS_ETEK.pdf

Thank you for considering our services.

---

### Template 20: Valuation Request

**Required Fields:** Client's Name

Dear [Client's Name],

We hope this email finds you well.

We wanted to reach out and let you know that we have received your valuation request, and we appreciate you taking the time to submit it.

In order to better assist you, we would like to schedule a call at your convenience.

Please let us know your preferred date and time for a phone call.

Thank you again for considering our services.

---

### Template 21: Client Not Providing Phone

**Triggers:** "client not providing phone", "won't give phone", "refused to give phone"

**Required Fields:** NONE (Generate immediately)

Dear XXXXXXXX,

I hope this message finds you well. I wanted to inform you about our property consultation process.

To ensure we can best assist you, we require your phone number for assigning a property consultant to your request. Our consultants initiate communication over the phone with all inquiries.

Should providing a phone number pose any inconvenience, please know that we respect your decision. Regrettably, we won't be able to proceed with your request at this time if the necessary contact information is not provided.

Thank you for your understanding.

---

### Template 22: Good Client (Missing Phone)

**Use when:** Client forgot to include phone (NOT refusing to give it - use Template 21 for that)

**Required Fields:** Client's Name, Region, Property Type Context (home/property)

Dear [Client's Name],

Thank you for reaching out to us regarding your interest in purchasing a property in [REGION]. We appreciate the opportunity to assist you in finding your ideal [home OR property].

To ensure we can provide you with the best possible service, we kindly request that you provide us with your full phone number (including your country code).

Once we receive your full phone number, we can connect you with the right property consultant.

Thank you for considering our services.

---

### Template 23: Follow-up with Multiple Properties

**Required Fields:** Client's Name, Location, Link 1, Link 2

Dear [Client's Name],

I hope this email finds you well. I wanted to follow up to see if you are still in the market for a property in [Location]. I have some new property options:

[Link 1]
[Link 2]

Please let me know if any of these catch your attention or if there are updates to your preferences. If you are no longer in the market, please let me know so I can update my records.

Thank you for your time.

---

### Template 31: Follow-up with Single Property

**Required Fields:** Client's Name, Property Type, Location, Link

Dear [Client's Name],

I hope this email finds you well. I wanted to follow up to see if you are still in the market for a [property type] in [location]. I have a new option:

[LINK]

Please let me know if the above property catches your attention or if there are updates to your preferences.

Thank you for your time.

---

### Template 32: Buyer Viewing Confirmation

**Required Fields:** Link

I am writing to confirm that the estate agency CSC ZYPRUS PROPERTY GROUP LTD has introduced me the below property:

[LINK]

---

### Template 24: No Options - Low Budget

**Required Fields:** Client's Name (OPTIONAL)

Subject: Adjustments required – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. We appreciate your interest in our real estate services.

However, we regret to inform you that based on your budget, preferences and areas of interest, we currently do not have any suitable options available.

If you are willing to adjust your budget, preferences or areas of interest, we would be happy to explore other potential options with you.

Thank you for your understanding.

---

### Template 25: Multiple Areas Issue

**Required Fields:** Client's Name (OPTIONAL), City/Region

Subject: Adjustments required for areas of interest – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. We appreciate your interest in our estate agency and your request to view properties in different areas in [City/Region].

However, your request to view properties in multiple areas is not feasible due to the resources required.

To optimize the search, we kindly request your assistance in narrowing down to fewer areas.

If you are open to adjusting, please let us know.

---

### Template 26: Time Wasters - Polite Decline

**Required Fields:** Client's Name (OPTIONAL)

Subject: Thank you for your request - [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

Thank you for your inquiry with our estate agency.

Due to our current workload and the high volume of requests, we regret that we are unable to fully accommodate your request at this time.

We sincerely wish you good luck and all the best in your property search.

Thank you for your understanding.

---

### Template 27: Still Looking Follow-up

**Required Fields:** Client's Name

Subject: Following up on your Property Search – [Client's Name]

Dear [Client's Name],

I trust this email finds you well.

I wanted to touch base to see if you're still actively searching for a property, or if you've already found one.

If you're still looking, I would appreciate any updates to your preferences.

If you've already found a property, kindly let me know so I can update my records.

Thank you for your time and feedback.

---

### Template 28: No Agent Cooperation

**Required Fields:** Estate Agent's Name

Dear [Estate Agent's Name],

Thank you for your cooperation inquiry. We genuinely appreciate your interest.

At this time, our focus is exclusively on serving direct clients, and we cannot take on cooperative ventures.

Should our circumstances change, we will gladly keep your contact information on file.

Thank you for your understanding.

---

### Template 33: AML/KYC Request to Lawyer

**Required Fields:** NONE (Generate immediately)

Subject: Copy of AML/KYC document

Dear XXXXXXXX,

I hope you are well.

As we are directly involved in the subject property/transaction alongside your office, we would kindly ask for a copy of the AML/KYC documentation.

According to Law 188(I)/2007, we are legally required, as licensed estate agents, to maintain the corresponding AML/KYC records.

We would be grateful if you could please share the relevant PDF documentation at your earliest convenience.

Thank you for your cooperation.

---

### Template 34: AML/KYC Internal Compliance Email

**Required Fields:** Invoice Number

Subject: Case Invoice No [INVOICE_NUMBER]

Dear Zyprus,

Please find attached the relevant AML/KYC document for the case with Invoice No. [INVOICE_NUMBER].

⚠️ Send to: compliance@zyprus.com with subject format: "Case Invoice No [INVOICE_NUMBER]"

---

### Template 35: Selling Request Received

**Required Fields:** Potential Seller's Name

Subject: Selling Request – [Potential Seller's Name]

Dear [Potential Seller's Name],

We hope this email finds you well. We have received your request to market your property with us.

In order to provide you with the best assistance, we kindly request your convenient date and time for a phone call.

Please provide two time/date options that work best for you.

If possible, please also provide a copy of the title deed for the property.

Thank you for considering our services.

---

### Template 36: Recommended Pricing Advice

**Required Fields:** Seller's Name, Recommended Asking Price, Likely Selling Price Range

Subject: Selling Request – [Seller's Name]

Dear [Seller's Name],

I hope this email finds you well.

After conducting a thorough analysis of the market and comparable properties, we believe that the recommended asking price for your property is [Recommended Asking Price].

Based on our experience, we estimate that the likely selling price will be in the range of [Likely Selling Price Range].

We are here to guide you every step of the way.

---

### Template 37: Overpriced Property Decline

**Required Fields:** Seller's Name, Transaction Type (sale or rent)

Subject: Selling Request – [Seller's Name]

Dear [Seller's Name],

Thank you for considering us to market your property.

After evaluating your property, we regret to inform you that the asking price is significantly above current market value. As a result, we are unable to effectively market your property at this price.

Should you wish to discuss further, please do not hesitate to contact us.

Thank you for your understanding.

---

### Template 38: Property Location Information Request

**Required Fields:** Client's Name (OPTIONAL)

Subject: Property information – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

Thank you for expressing interest in the property.

As a standard practice, we do not disclose the exact location prior to a scheduled viewing and/or completion of our registration process.

We would be happy to arrange a phone communication at your convenience.

Please let us know your preferred date and time for a phone call.

We look forward to hearing from you.

---

### Template 39: Different Regions Request

**Required Fields:** Client's Name (OPTIONAL)

Subject: Adjustments required for areas of interest – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We appreciate your interest in viewing properties in different regions in Cyprus.

However, your request to view properties in multiple regions is not feasible due to the resources required.

We kindly request that you narrow down to a single region: Paphos, Limassol, Larnaca, Nicosia or Famagusta.

If you are open to adjusting, please let us know.

---

### Template 40: Client Follow Up - No Reply Yet

**Required Fields:** Client's Name (OPTIONAL)

Dear [Client's Name OR XXXXXXXX],

Thank you for contacting our estate agency. We appreciate your interest.

Our team will get back to you within 24 business hours (three working days).

We are experiencing a high volume of requests, but our team is working diligently.

If you do not hear back within three business days, please reply to this email.

Thank you for your patience.

---

### Template 41: Plain Request to info@zyprus.com

**Required Fields:** NONE (Generate immediately)

Subject: Request – Further information Needed

Dear XXXXXXXX,

Thank you for your email. To best assist you with your property search, we kindly request:

Your Full Name:
Your Full Phone Number:
Property description and desired area(s):
Purpose: Investment (Buy to let) OR Main Residence
Budget for ideal property: €
Mortgage Buyer: YES / NO

By providing these details, we can connect you with the right consultant.

---

### Template 42: Apology for Extended Delay

**Required Fields:** Client's Name (OPTIONAL)

Dear [Client's Name OR XXXXXXXX],

We wanted to apologize for the delay in responding to your recent requests.

We receive a high volume of requests, and unfortunately, we were unable to attend to your request in a timely manner. For that, we sincerely apologize.

Your request has been forwarded to the relevant team and they will be in touch within the day or tomorrow at the very latest.

Thank you for your patience and understanding.

---

### Template 43: Client Rushing/Insisting - Patience Request

**Triggers:** Client is insisting, rushing, asking to see property urgently

**Required Fields:** Client's Name (OPTIONAL)

Dear [Client's Name OR XXXXXXXX],

We hope this message finds you well.

Thank you for reaching out to Zyprus Real Estate regarding your property search. We truly value your interest.

We want to assure you that our team is working on your request and one of our property consultants will reach out shortly.

Please note that due to the various requirements of property viewings, some patience may be required.

We are committed to providing you with excellent service and look forward to assisting you soon.

---

## 📧 INFO@ZYPRUS.COM TEMPLATES

These 4 templates are ONLY for info@zyprus.com - NOT for individual agents:

| # | Template Name | Purpose |
|---|---------------|---------|
| 39 | Different Regions Request | Multiple/different regions |
| 40 | Client Follow Up - No Reply Yet | Following up with unresponsive clients |
| 41 | Plain Request to info@zyprus.com | General information request |
| 42 | Apology for Extended Delay | When response was delayed |

🚫 DO NOT use these templates for individual agents.
`;
