/**
 * Document Detector for WhatsApp Integration
 *
 * Determines whether SOFIA's response should be sent as a .docx document
 * or as plain text based on HARDCODED template classification.
 *
 * FORMS (Templates 09-13, 15-16) → Send as .docx file (require signatures)
 * EMAILS (All others) → Send as plain text messages
 */

/**
 * Detect if the response should be sent as a document (.docx)
 *
 * FORMS (send as .docx) - Templates that require signatures:
 * - 09: Standard Viewing Form
 * - 10: Advanced Viewing Form
 * - 11: Multiple Persons Viewing Form
 * - 12: Property Reservation Form
 * - 13: Property Reservation Agreement
 * - 15: Non-Exclusive Marketing Agreement (Contract)
 * - 16: Exclusive Marketing Agreement (Contract)
 *
 * EMAILS (send as text) - Everything else:
 * - 01-08: Registration templates
 * - 14: Email Marketing Agreement
 * - 17-33, 39-43: Client Communications
 */
export function shouldSendAsDocument(response: string): boolean {
  // FORM: Viewing Forms (Templates 09-11)
  if (/Standard\s*Viewing\s*Form/i.test(response)) {
    return true;
  }
  if (/Advanced\s*Viewing\s*Form/i.test(response)) {
    return true;
  }
  if (/Multiple\s*Persons?\s*Viewing\s*Form/i.test(response)) {
    return true;
  }

  // FORM: Reservation Forms (Templates 12-13)
  if (/Property\s*Reservation\s*Form/i.test(response)) {
    return true;
  }
  if (/Property\s*Reservation\s*Agreement/i.test(response)) {
    return true;
  }

  // FORM: Marketing Agreement Contracts (Templates 15-16)
  // But NOT "Email Marketing Agreement" (Template 14) which is an email
  if (/Non-Exclusive\s*Marketing\s*Agreement/i.test(response)) {
    return true;
  }
  if (/Exclusive\s*Marketing\s*Agreement/i.test(response)) {
    // Make sure it's not "Email Marketing Agreement"
    if (!/Email\s*Marketing\s*Agreement/i.test(response)) {
      return true;
    }
  }

  // Everything else is an EMAIL - send as text
  return false;
}

/**
 * Get the document type based on response content
 * Used for naming the generated .docx file
 * Only applies to FORM templates (09-13, 15-16)
 */
export function getDocumentType(response: string): string {
  // Viewing Forms (09-11)
  if (/Standard\s*Viewing\s*Form/i.test(response)) {
    return "ViewingForm";
  }
  if (/Advanced\s*Viewing\s*Form/i.test(response)) {
    return "ViewingForm";
  }
  if (/Multiple\s*Persons?\s*Viewing/i.test(response)) {
    return "ViewingForm";
  }

  // Reservations (12-13)
  if (/Property\s*Reservation/i.test(response)) {
    return "Reservation";
  }

  // Marketing Agreements (15-16)
  if (/Non-Exclusive\s*Marketing\s*Agreement/i.test(response)) {
    return "MarketingAgreement";
  }
  if (/Exclusive\s*Marketing\s*Agreement/i.test(response)) {
    return "MarketingAgreement";
  }

  // Default fallback
  return "Document";
}
