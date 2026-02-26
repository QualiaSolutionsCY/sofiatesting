/**
 * SOPHIA Document Templates - Client Communications
 *
 * Contains 27+ client communication templates including:
 * - Request Callback (Email/WhatsApp)
 * - Valuation Quote/Request
 * - Client Not Providing Phone
 * - Good Client (Missing Phone)
 * - Follow-ups (Single/Multiple Properties)
 * - No Options - Low Budget
 * - Multiple Areas Issue
 * - Time Wasters - Polite Decline
 * - Still Looking Follow-up
 * - No Agent Cooperation
 * - Buyer Viewing Confirmation
 * - AML/KYC templates
 * - Selling Request Received
 * - Recommended Pricing Advice
 * - Overpriced Property Decline
 * - Property Location Information Request
 * - Different Regions Request
 * - Client Follow Up - No Reply Yet
 * - Plain Request to info@zyprus.com
 * - Apology for Extended Delay
 * - Client Rushing/Insisting
 */

export const CLIENT_COMMS = `
## Client Communication Templates

### Request Callback - Email or WhatsApp (arrange a call)

*Field collection prompts are in document_routing - this section only defines output format.*

Required Fields:
- **Client's Name** (REQUIRED)
- **Property Link** (OPTIONAL - do NOT ask again if not provided initially)

**SUBJECT LINE RULES:**
- **WITH link:** Extract [TYPE] and [REGION] from the property link URL and use: "Request – [Client's Name] – [Type] – [Region]"
  - URL pattern: /property/ID/X-bedrooms-TYPE-subtype-in-location-REGION
  - Extract the FIRST property type word (house, apartment, villa, land) - ignore subtypes like townhouse, penthouse, etc.
  - Example: Marios Stavraki + https://www.zyprus.com/property/41696/3-bedrooms-house-townhouse-in-tersefanou-larnaca → "Request – Marios Stavraki – House – Larnaca"
  - Example: Maria Jones + https://www.zyprus.com/property/12345/2-bedrooms-apartment-penthouse-in-limassol-limassol → "Request – Maria Jones – Apartment – Limassol"
- **WITHOUT link:** Always use: "Request - [Client's Name] – Property Inquiry"
  - Example: Marios Stavraki (no link) → "Request - Marios Stavraki – Property Inquiry"

*EMAIL VERSION (WITH LINK):*
Subject: Request – [Client's Name] – [Type] – [Region]

Dear [Client's Name],

We hope this email finds you well.

We would like to confirm the receipt of your request for the subject property: [Link]

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

We look forward to speaking with you and assisting you further.

---

*EMAIL VERSION (WITHOUT LINK):*
Subject: Request - [Client's Name] – Property Inquiry

Dear [Client's Name],

We hope this email finds you well.

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

We look forward to speaking with you and assisting you further.

---

*WHATSAPP VERSION (WITH LINK):*

Dear [Client's Name],

We hope this message finds you well. We would like to confirm the receipt of your request for the subject property.

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

We look forward to speaking with you and assisting you further in finding the right property.

[Link]

---

*WHATSAPP VERSION (WITHOUT LINK):*

Dear [Client's Name],

We hope this message finds you well.

To ensure efficient communication and personalized service, we kindly request a phone call.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

We look forward to speaking with you and assisting you further in finding the right property.

---

### Valuation Quote

Required Fields:
- *Client's Name* (e.g., Elena Petrou)
- *Valuation Fee* (e.g., €250 + VAT)

CRITICAL: If user provides just a number (e.g., "400" or "€400"), ALWAYS output as "€400 + VAT". Valuation fees MUST include "+ VAT"!

Subject: Valuation Quote – [Client's Name]

Dear [Client's Name],

We hope this email finds you well. We are pleased to provide you with a quote for the valuation of your property.

Our valuation reports are accredited by the professional bodies of the Royal Institution of Chartered Surveyors (RICS) and the Cyprus Scientific and Technical Chamber (ETEK), reflecting our commitment to maintaining the highest standards of quality and professionalism.

To ensure accurate and reliable results, our valuation reports are delivered by two experienced valuers who conduct a thorough review, providing an added layer of quality control.

As requested, our valuation fee for your property is [VALUATION_FEE]. We believe our services provide excellent value for the level of expertise and professionalism we offer.

For your reference, you can view an example of our valuation report by clicking on the following link:

https://www.zyprus.com/sites/all/themes/zyprus/files/Property_Valuation_Sample_Cyprus_RICS_ETEK.pdf

Please note that our valuation report will be detailed and will provide you with valuable insights into the current market value of your property. Our team is always available to discuss any questions or concerns you may have regarding the valuation process or the valuation report.

If you have any further questions or would like to proceed with our services, please do not hesitate to contact us. We would be delighted to assist you with your valuation needs.

Thank you for considering our services.

---

### Valuation Request

Required Fields:
- *Client's Name* (e.g., George Constantinou)

Dear [Client's Name],

We hope this email finds you well.

We wanted to reach out and let you know that we have received your valuation request, and we appreciate you taking the time to submit it.

In order to better assist you, we would like to schedule a call at your convenience. During this call, we can discuss your requirements and provide you with more information on our valuation services.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

Thank you again for considering our services, and we look forward to speaking with you soon.

---

### Client Not Providing Phone

USE THIS WHEN (natural language triggers):
- "client not providing phone"
- "client won't give phone" / "won't give me his/her phone"
- "no phone number" / "not giving phone"
- "refused to give phone" / "client refuses phone"
- "doesn't want to give phone"
- "he/she won't give phone"
- "client insisting no phone" / "insisting not to give phone"
- "won't share phone" / "not sharing phone number"
- Any variation where client REFUSES to provide phone number

Required Fields: NONE (Generate immediately - no questions needed)

Dear XXXXXXXX,

I hope this message finds you well. I wanted to inform you about our property consultation process.

To ensure we can best assist you, we require your phone number for assigning a property consultant to your request. Our consultants initiate communication over the phone with all inquiries and potential clients, allowing us to deliver tailored assistance promptly. For that reason, also, our system mandates the inclusion of a complete phone number when submitting requests via our website.

Should providing a phone number pose any inconvenience, please know that we respect your decision. Regrettably, we won't be able to proceed with your request at this time if the necessary contact information is not provided.

Thank you for your understanding and for considering our services. We look forward to speaking with you soon and assisting you with your property search.

---

### Good Client (Missing Phone)

IMPORTANT DISTINCTION:
- Client Not Providing Phone = Client is NOT PROVIDING phone (refusing/declining to give it)
- Good Client Missing Phone = Client FORGOT to include phone (missing from request)

USE THIS WHEN:
- Client sends a good quality request (clear requirements, specific region mentioned)
- Client describes what they want in reasonable detail
- Phone number is MISSING from the request (forgot to include it)
- NOT for clients refusing to provide phone (use Client Not Providing Phone for that)

Required Fields:
- *Client's Name* (e.g., John Smith)
- *Region* (e.g., Paphos)
- *Property Type Context*: Use "home" if client mentioned home/residence, otherwise use "property"

Dear [Client's Name],

Thank you for reaching out to us regarding your interest in purchasing a property in [REGION]. We appreciate the opportunity to assist you in finding your ideal [home OR property].

To ensure we can provide you with the best possible service, we kindly request that you provide us with your full phone number (including your country code).

This will enable us to have a smooth discussion with you, understand your requirements and preferences, and provide personalized recommendations that meet your needs.

Once we receive your full phone number, we can connect you with the right property consultant within our firm.

Thank you for considering our services. We look forward to hearing from you soon.

---

### Follow-up with Multiple Properties

Required Fields:
- *Client's Name* (e.g., David Smith)
- *Location* (e.g., Paphos)
- *Link 1*
- *Link 2*

Dear [Client's Name],

I hope this email finds you well. I wanted to follow up with you and see if you are still in the market for a property in [Location]. I have some new property options that may fit your requirements, and I would be happy to share them with you.

Here are the properties:

[LINK 1]

[LINK 2]

[LINK 3 if applicable]

*CRITICAL: Each property link MUST be on its own line with a blank line between each link. NEVER put links next to each other without spacing.*

Please let me know if any of these properties catch your attention or if there are any updates to your property preferences or budget. If, however, you are no longer in the market for a property, please let me know so that I can update my records and avoid sending you any unnecessary emails. Your satisfaction is important to me.

Thank you for your time, and I look forward to hearing back from you soon.

---

### No Options - Low Budget

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Subject: Adjustments required – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. We appreciate your interest in our real estate services and your recent property request. However, we regret to inform you that based on your budget, preferences and areas of interest, we currently do not have any suitable options available.

While we currently do not have any options within your budget and preferences, we would like to leave the door open for further opportunities. If you are willing to adjust your budget, preferences or areas of interest, we would be happy to explore other potential options with you.

Thank you for your understanding, and we are looking forward to your reply.

---

### Multiple Areas Issue

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)
- *City/Region* (e.g., Cyprus)

Subject: Adjustments required for areas of interest – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. We appreciate your interest in our estate agency and your request to view properties in different areas in [City/Region].

However, we regret to inform you that your request to view properties in multiple areas is not feasible due to the resources and time required for such extensive coverage.

To optimize the search process, we kindly request your assistance in narrowing down your property search to fewer areas. As you may know, [City/Region] offers a wide range of diverse neighborhoods and locations. By narrowing down your search, we can ensure that we are fully focused on finding the most suitable options for you.

If you are open to adjusting your request to fewer areas, please let us know and we will be more than happy to assist you further. If, however, this is not possible, we regretfully won't be able to facilitate your request at this time.

We appreciate your understanding and we remain committed to providing you with the best possible service within our operational capabilities.

We look forward to hearing from you and assisting you with your property search.

---

### Time Wasters - Polite Decline

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Subject: Thank you for your request - [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. Thank you for your inquiry with our estate agency.

Due to our current workload and commitments, along with the high volume of requests we are currently receiving, we regret to inform you that we are unable to fully accommodate your request at this time. We apologize for any inconvenience this may cause.

Please know that we value your interest in our services, and we sincerely wish you good luck and all the best in your property search. We would be happy to assist you in the future when our workload allows.

Thank you for your understanding.

---

### Still Looking Follow-up

Required Fields:
- *Client's Name* (e.g., Olivia Chen)

Subject: Following up on your Property Search – [Client's Name]

Dear [Client's Name],

I trust this email finds you well.

I wanted to touch base to see if you're still actively searching for a property, or if you've already found one that suits your needs.

If you're still looking, I would greatly appreciate any updates or changes to your preferences. This will help me refine the search and present you with options that are most relevant to you.

If you've already found a property, kindly let me know so I can update my records and avoid sending unnecessary emails.

Please remember that I'm here to assist you every step of the way. If you have any questions or need any support, don't hesitate to reach out.

Thank you for your time and feedback — it is greatly appreciated.

(Note: Use "message" instead of "email" if for WhatsApp)

---

### No Agent Cooperation

Required Fields:
- *Estate Agent's Name* (e.g., Andreas from ABC Realty)

Dear [Estate Agent's Name],

Thank you for your cooperation inquiry. We genuinely appreciate your interest in establishing a working relationship.

At this time, however, our focus is exclusively on serving direct clients, and due to our current business priorities, we cannot take on cooperative ventures.

Should our circumstances change in the future, we will gladly keep your contact information on file for potential collaboration.

Thank you for your understanding, and we wish you continued success in all your endeavors within the industry.

---

### Follow-up with Single Property

Required Fields:
- *Client's Name* (e.g., Maria Jones)
- *Property Type* (e.g., apartment)
- *Location* (e.g., Limassol)
- *Link*

Dear [Client's Name],

I hope this email finds you well. I wanted to follow up with you and see if you are still in the market for a [property type] in [location]. I have a new property option that may fit your requirements, and I would be happy to share it with you.

Here it is:

[LINK]

Please let me know if the above property catches your attention or if there are any updates to your property preferences or budget. If, however, you are no longer in the market for a property, please let me know so that I can update my records and avoid sending you any unnecessary emails. Your satisfaction is important to me.

Thank you for your time, and I look forward to hearing back from you soon.

---

### Buyer Viewing Confirmation

Required Fields:
- *Link*

I am writing to confirm that the estate agency CSC ZYPRUS PROPERTY GROUP LTD has introduced me the below property:

[LINK]

---

### AML/KYC Request to Lawyer

USE THIS WHEN:
- Agent asks for "AML for lawyer"
- Agent needs to request AML/KYC documents from lawyer
- Need to request compliance documentation from legal office

Required Fields: NONE (Generate immediately)

Subject: Copy of AML/KYC document

Dear XXXXXXXX,

I hope you are well.

As we are directly involved in the subject property/transaction alongside your office, we would kindly ask for a copy of the AML/KYC documentation.

According to the relevant Law 188(I)/2007, we are also legally required, as licensed estate agents, to maintain the corresponding AML/KYC records.

We would therefore be grateful if you could please share the relevant PDF documentation at your earliest convenience, so that our files remain complete and compliant.

Thank you very much for your cooperation and assistance.

---

### AML/KYC Internal Compliance Email

USE THIS WHEN:
- Agent needs to send AML/KYC documents to Zyprus compliance
- Agent has received AML/KYC documents and needs to forward them internally
- Need to submit case documentation to compliance@zyprus.com

Required Fields:
- *Invoice Number* (e.g., 11271)

Subject: Case Invoice No [INVOICE_NUMBER]

Dear Zyprus,

Please find attached the relevant AML/KYC document for the case with Invoice No. [INVOICE_NUMBER].

IMPORTANT NOTE: This email must be sent to compliance@zyprus.com strictly with the subject format: "Case Invoice No [INVOICE_NUMBER]"

---

### Selling Request Received

Required Fields:
- *Potential Seller's Name* (e.g., Marios Charalambous)

Subject: Selling Request – [Potential Seller's Name]

Dear [Potential Seller's Name],

We hope this email finds you well. We wanted to reach out and let you know that we have received your request to market your property with us, and we are truly grateful for your initial interest.

In order to provide you with the best possible assistance, we kindly request your convenient date and time to schedule a phone call. We want to ensure that we address all your questions and provide you with personalized guidance throughout the selling process.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

Furthermore, if possible, it would greatly assist us in making our conversation more productive if you could provide a copy of the title deed for the property. Please be assured that any information you share with us will be treated with the utmost confidentiality and in compliance with data protection regulations.

Thank you for considering our services, and we remain at your disposal.

---

### Recommended Pricing Advice

Required Fields:
- *Seller's Name* (e.g., Marios Charalambous)
- *Recommended Asking Price* (e.g., €350,000)
- *Likely Selling Price Range* (e.g., €320,000 - €340,000)

Subject: Selling Request – [Seller's Name]

Dear [Seller's Name],

I hope this email finds you well.

After conducting a thorough analysis of the market and comparable properties, we believe that the recommended asking price for your property is [Recommended Asking Price].

In addition, based on our experience and market trends, we estimate that the likely selling price for your property will be in the range of [Likely Selling Price Range].

We understand that selling a property can be a complex process, and we are here to guide you every step of the way. Please do not hesitate to reach out if you have any questions or concerns.

Thank you for considering our agency for your real estate needs.

---

### Overpriced Property Decline

Required Fields:
- *Seller's Name* (e.g., Marios Charalambous)
- *Transaction Type* (sale or rent)

Subject: Selling Request – [Seller's Name]

Dear [Seller's Name],

Thank you for considering us to market your property.

However, after carefully evaluating your property with the expertise of our team, in our opinion, we regret to inform you that the asking price you provided is significantly above the current market value. As a result, we are unable to effectively market and introduce your property at this price.

We understand that setting a realistic asking price is essential for a successful [sale/rent], and we would be delighted to assist you in determining a price that reflects current market conditions.

Should you wish to discuss further, please do not hesitate to contact us — we would be glad to explore with you the available options for marketing, adjusting the asking price, and ultimately achieving the [sale/rent] of your property.

Thank you for your understanding, and we remain at your disposal.

---

### Property Location Information Request

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Subject: Property information – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

Thank you for expressing interest in the property listed with our estate agency. We appreciate your inquiry and would like to provide you with some important information.

As a standard practice, we do not disclose the exact location or address of the property prior to a scheduled viewing and/or completion of our registration process.

This practice is in place to protect the interests of all parties involved and to ensure that our agency's commission is duly respected.

We understand that you may have questions about the property's location but we are unable to disclose that information without taking the necessary steps. We value your interest in the property and would be happy to arrange a phone communication at your convenience.

Please let us know your preferred date and time for a phone call. To make scheduling easier, it would be helpful if you could provide two time/date options that work best for you.

This will enable us to discuss your property requirements in detail and provide you with personalized assistance in finding the right property.

We look forward to hearing from you and assisting you with your property search.

---

### Different Regions Request

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Subject: Adjustments required for areas of interest – [Client's Name OR XXXXXXXX]

Dear [Client's Name OR XXXXXXXX],

We hope this email finds you well. We appreciate your interest in our estate agency and your request to view properties in different regions in Cyprus.

However, we regret to inform you that your request to view properties in multiple regions is not feasible due to the resources and time required for such extensive coverage.

As a result, we would appreciate it if you could consider narrowing down your preferences to properties in one specific region from the following options: Paphos, Limassol, Larnaca, Nicosia or Famagusta.
We understand that you may have interests in multiple regions, but by narrowing down your search, we will be able to provide you with a more streamlined service. This will also allow us to connect you with the right consultant in our company.

If you are open to adjusting your request to a single region, please let us know and we will be more than happy to assist you further. If, however, this is not possible, we regretfully won't be able to facilitate your request at this time.

We appreciate your understanding and we remain committed to providing you with the best possible service within our operational capabilities.

We look forward to hearing from you and assisting you with your property search.

---

### Client Follow Up - No Reply Yet

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Dear [Client's Name OR XXXXXXXX],

Thank you for contacting our estate agency. We appreciate your interest in our services.

We want to clarify that the automatic email you received after submitting your request stated that our team will get back to you within 24 business hours, which is equivalent to three (3) working days.

Please kindly note that we are currently experiencing a high volume of requests, but our team is working diligently to respond to each one as soon as possible.

We aim to reply to all inquiries within three business days, but in the unlikely event that you do not hear back from us within this time frame, please do not hesitate to contact us by replying to this email. We apologize for any inconvenience this may cause.

Thank you for your patience and understanding.

---

### Plain Request to info@zyprus.com

Required Fields: NONE (Generate immediately)

Subject: Request – Further information Needed

Dear XXXXXXXX,

Thank you for your email. To best assist you with your property search, we kindly request the following information:

Your Full Name:

Your Full Phone Number:

Property description and desired area(s):

Purpose: Investment (Buy to let) OR Main Residence

Budget for ideal property: €

Mortgage Buyer: YES / NO

By providing us with these details, we can connect you with the right property consultant within our firm, who can offer personalized assistance. We look forward to hearing from you soon.

---

### Apology for Extended Delay

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Dear [Client's Name OR XXXXXXXX],

We wanted to apologize for the delay in responding to your recent requests. We receive a high volume of requests on a daily basis, and unfortunately, we were unable to attend to your request in a timely manner.
We understand that this delay has caused you inconvenience and frustration, and for that, we sincerely apologize.

We are taking steps to better handle the volume of requests we receive.

We want to assure you that your request has been forwarded to the relevant team and they will be in touch with you within the day or tomorrow at the very latest. If for any reason, you do not receive a response, please feel free to contact us again by replying to this email. We value your business and appreciate your patience and understanding in this matter.

Thank you for your interest and we look forward to resolving your request soon.

---

### Client Rushing/Insisting - Patience Request

USE THIS WHEN:
- Client is insisting on seeing property immediately
- Client is rushing or being impatient
- Client is asking to go see the property urgently
- Need to ask client to be patient

Required Fields:
- *Client's Name* (OPTIONAL - use if mentioned, otherwise use Dear XXXXXXXX)

Dear [Client's Name OR XXXXXXXX],

We hope this message finds you well.
Thank you for reaching out to Zyprus Real Estate regarding your property search. We truly value your interest and are excited about the opportunity to assist you.

Before we proceed with arranging viewings, we kindly ask for a little patience. Our team is currently working through a number of client requests, and we want to ensure that each client — including yourself — receives the time and attention they deserve.

As part of our process, we'll need to confirm a few basic details with you. This helps us better understand your needs and match you with the most suitable properties.

A dedicated sales consultant will be in touch with you as soon as possible and get things moving forward.
We sincerely appreciate your understanding and cooperation, and we look forward to helping you find your ideal property.

---`;
