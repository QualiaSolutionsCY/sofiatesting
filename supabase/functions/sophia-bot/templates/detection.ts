/**
 * Template Detection - Single Source of Truth for All Detection Logic
 *
 * This module contains THE ONLY implementations of:
 * - isCompletedReservationAgreement()
 * - isClarificationQuestion()
 * - shouldSendAsDocx()
 * - detectTemplateType()
 *
 * All other files should import from here. Do NOT duplicate this logic.
 */

import { logger, LogCategory } from "../utils/logger.ts";
import {
  DOCX_TEMPLATE_TITLES,
  extractTemplateTitle,
  isDocxTemplateTitle,
} from "./registry.ts";

/**
 * Minimum length for a valid DOCX document
 */
const MIN_DOCX_LENGTH = 400;

/**
 * Checks if content looks like a completed reservation agreement document
 * THIS IS THE ONLY IMPLEMENTATION - import from here
 */
export function isCompletedReservationAgreement(content: string): boolean {
  // Remove markdown bold for pattern matching
  const cleanContent = content.replace(/\*\*/g, '');
  const cleanLower = cleanContent.toLowerCase();

  // Must have reservation agreement structure (multiple patterns)
  const hasTitle = cleanLower.includes('property reservation agreement') ||
                   cleanLower.includes('property reservation') ||
                   cleanLower.includes('reservation agreement');

  if (!hasTitle) {
    logger.debug("[Detection] Reservation: No title match", { category: LogCategory.GENERAL });
    return false;
  }

  // Must have prospective buyer with ID info (passport, Cyprus ID, UK ID, etc.)
  // Very flexible: accepts many formats
  // - "Prospective Buyer: Name Cyprus ID: 123456"
  // - "Prospective Buyer: Name, Passport: AB123456"
  // - "Buyer: Name ID: 123456"
  const hasBuyerKeyword = /(?:prospective\s+)?buyer[:\s]/i.test(cleanContent);

  // ID patterns - very flexible to match various formats
  const hasIdPattern =
    /(?:cyprus\s+)?id[:\s]+\d+/i.test(cleanContent) ||  // "Cyprus ID: 945119" or "ID: 945119"
    /passport[:\s]+[A-Z0-9]+/i.test(cleanContent) ||     // "Passport: AB123456"
    /[A-Z]+\s+passport[:\s]+[A-Z0-9]+/i.test(cleanContent) ||  // "UK Passport: 123456"
    /id\s+(?:number|no\.?)[:\s]+\d+/i.test(cleanContent);  // "ID Number: 945119"

  const hasBuyerInfo = hasBuyerKeyword && hasIdPattern;

  if (!hasBuyerInfo) {
    logger.debug("[Detection] Reservation: Missing buyer info", {
      category: LogCategory.GENERAL,
      hasBuyerKeyword,
      hasIdPattern
    });
  }

  // Must have vendor (flexible pattern)
  const hasVendor = /vendor[:\s]+[A-Za-z]/i.test(cleanContent);

  if (!hasVendor) {
    logger.debug("[Detection] Reservation: Missing vendor", { category: LogCategory.GENERAL });
  }

  // Property: either registration number OR property description
  const hasPropertyReg = /\d+\/\d+/i.test(cleanContent);
  const hasPropertyDesc = /property\s+(?:details|description)[:\s]/i.test(cleanLower) ||
                          /(?:apartment|villa|house|flat|building)/i.test(cleanContent);
  const hasProperty = hasPropertyReg || hasPropertyDesc;

  if (!hasProperty) {
    logger.debug("[Detection] Reservation: Missing property", { category: LogCategory.GENERAL });
  }

  // Must have financial terms (very flexible patterns)
  const hasReservationFee = /reservation\s+fee[:\s]+[€$]?\s*[\d,]+/i.test(cleanContent) ||
                            /reservation[:\s]+[€$]\s*[\d,]+/i.test(cleanContent) ||
                            /fee[:\s]+[€$]\s*[\d,]+/i.test(cleanContent);

  const hasPurchasePrice = /purchase\s+price[:\s]+[€$]?\s*[\d,]+/i.test(cleanContent) ||
                           /price[:\s]+[€$]\s*[\d,]+/i.test(cleanContent) ||
                           /total[:\s]+[€$]\s*[\d,]+/i.test(cleanContent);

  const hasFinancials = hasReservationFee && hasPurchasePrice;

  if (!hasFinancials) {
    logger.debug("[Detection] Reservation: Missing financials", {
      category: LogCategory.GENERAL,
      hasReservationFee,
      hasPurchasePrice
    });
  }

  // Log successful detection
  if (hasBuyerInfo && hasVendor && hasProperty && hasFinancials) {
    logger.debug("[Detection] Reservation agreement DETECTED - all criteria met", { category: LogCategory.GENERAL });
    return true;
  }

  // Fallback: If has title + at least 3 of 4 criteria + length > 500, it's probably complete
  const criteriaCount = [hasBuyerInfo, hasVendor, hasProperty, hasFinancials].filter(Boolean).length;
  if (criteriaCount >= 3 && content.length > 500) {
    logger.debug("[Detection] Reservation agreement DETECTED - fallback (3/4 criteria + length)", {
      category: LogCategory.GENERAL,
      criteriaCount
    });
    return true;
  }

  return false;
}

/**
 * Checks if content looks like a completed viewing form document
 */
export function isCompletedViewingForm(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // Must have the "Herein, I" opening
  if (!lowerContent.includes('herein, i')) {
    return false;
  }

  // Must have confirmation language
  if (!lowerContent.includes('confirm that') && !lowerContent.includes('have been shown')) {
    return false;
  }

  // Must have an ID/passport pattern
  const hasIdPattern =
    /with\s+id\s+[A-Z0-9]+/i.test(content) ||
    /passport\/id\s*(number)?:?\s*[A-Z0-9]+/i.test(content) ||
    /id\/passport:?\s*[A-Z0-9]+/i.test(content) ||
    /(id|passport)\s*(number)?:?\s*[A-Z0-9]{5,}/i.test(content);

  if (!hasIdPattern) {
    return false;
  }

  // Should have property-related content
  const hasPropertyContent =
    lowerContent.includes('property') ||
    lowerContent.includes('registration') ||
    lowerContent.includes('immovable');

  return hasPropertyContent;
}

/**
 * Checks if content looks like a completed marketing agreement document
 */
export function isCompletedMarketingAgreement(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // NEW FORMAT: Terms and Conditions for Property Listing
  const hasNewFormat =
    lowerContent.includes('terms and conditions for property listing') &&
    lowerContent.includes('representation') &&
    lowerContent.includes('agency fees');

  // OLD FORMAT: Marketing Agreement with "between" clause
  const hasOldFormat =
    (lowerContent.includes('this agreement made on') ||
     lowerContent.includes('marketing agreement')) &&
    lowerContent.includes('between');

  if (!hasNewFormat && !hasOldFormat) {
    return false;
  }

  // Must have registration number pattern OR seller details
  const hasRegNumber = /reg\.?\s*no\.?\s*\d+\/\d+/i.test(content) ||
                       /registration:?\s*\d+\/\d+/i.test(content) ||
                       /property:\s*reg/i.test(content);

  // Must have a real seller name (not placeholder)
  const hasSellerName = /seller:\s*[A-Z][a-z]+\s+[A-Z][a-z]+/i.test(content);

  return hasRegNumber || hasSellerName;
}

/**
 * Check if a response is a clarification question rather than actual document content
 * THIS IS THE ONLY IMPLEMENTATION - import from here
 */
export function isClarificationQuestion(response: string): boolean {
  // FIRST: Check if this is a completed document - these should NOT be classified as clarifications
  if (isCompletedReservationAgreement(response)) {
    logger.debug("[Detection] Detected completed reservation agreement, not a clarification", { category: LogCategory.GENERAL });
    return false;
  }

  if (isCompletedViewingForm(response)) {
    logger.debug("[Detection] Detected completed viewing form, not a clarification", { category: LogCategory.GENERAL });
    return false;
  }

  if (isCompletedMarketingAgreement(response)) {
    logger.debug("[Detection] Detected completed marketing agreement, not a clarification", { category: LogCategory.GENERAL });
    return false;
  }

  const lower = response.toLowerCase();

  // Clarification patterns - AI asking for more info
  const clarificationPatterns = [
    "please provide",
    "please specify",
    "i'll create",
    "i will create",
    "i'll generate",
    "i will generate",
    "i'll prepare",
    "i will prepare",
    "could you provide",
    "could you specify",
    "can you provide",
    "can you specify",
    "i need the following",
    "please share",
    "what is the",
    "what are the",
    "which property",
    "to proceed",
    "to generate this",
    "to create this",
    // Choice questions
    "would you like",
    "do you want",
    "do you need",
    "which one",
    "which type",
    "which would you",
    "please choose",
    "please select",
    "let me know which",
    "let me know if",
    " or the ",
    "standard or advanced",
    "here are the options",
    "here's what i can",
    "here is what i can",
  ];

  // Check if response is short and contains clarification patterns
  if (response.length < 1000) {
    for (const pattern of clarificationPatterns) {
      if (lower.includes(pattern)) {
        logger.debug(`[Detection] Clarification detected: "${pattern}"`, { category: LogCategory.GENERAL });
        return true;
      }
    }
  }

  // Check for bullet points asking for info (common pattern)
  const bulletCount = (response.match(/[•\-\*]\s+/g) || []).length;
  const questionCount = (response.match(/\?/g) || []).length;

  // Multiple bullets + questions + short = definitely asking for info
  if (bulletCount >= 3 && questionCount >= 1 && response.length < 1000) {
    logger.debug(`[Detection] Clarification detected: ${bulletCount} bullets, ${questionCount} questions`, { category: LogCategory.GENERAL });
    return true;
  }

  // Any question mark in a short response is likely a clarification
  if (questionCount >= 1 && response.length < 600) {
    logger.debug(`[Detection] Clarification detected: question mark in short response (${response.length} chars)`, { category: LogCategory.GENERAL });
    return true;
  }

  return false;
}

/**
 * Checks if a response is a confirmation message (not actual document content)
 */
export function isConfirmationMessage(text: string): boolean {
  const lower = text.toLowerCase();

  // Property upload confirmations
  if (lower.includes("uploaded the property") ||
      lower.includes("uploaded as a draft") ||
      lower.includes("draft listing") ||
      (lower.includes("uploaded") && lower.includes("property"))) {
    return true;
  }

  // Document/email sent confirmations
  const confirmationPatterns = [
    /i have sent/i,
    /i['']ve sent/i,
    /has been sent/i,
    /successfully sent/i,
    /email sent/i,
    /document sent/i,
    /sent to .+@.+\..+/i,
    /please check your inbox/i,
    /don['']t forget to/i,
  ];

  if (text.length < 500) {
    for (const pattern of confirmationPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if the AI response contains placeholders or missing data
 */
export function containsPlaceholders(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // Check for XXXXXXXX placeholders (real placeholder indicator)
  // EXCEPTION: "Dear XXXXXXXX" is a known template pattern in registrations
  // and should NOT block DOCX generation for reservation agreements
  const hasXPattern = /XXXXXXX+/g.test(content);
  const isDearPattern = /Dear\s+XXXXXXX+/i.test(content);

  if (hasXPattern && !isDearPattern) {
    logger.debug("[Detection] Found XXXXXXXX placeholder", { category: LogCategory.GENERAL });
    return true;
  }

  // Check for [FIELD_NAME] style placeholders
  const bracketPlaceholders = content.match(/\[[A-Z][A-Z_\s]+\]/g) || [];
  const realPlaceholders = bracketPlaceholders.filter(p =>
    !p.includes('Reg.') &&
    !p.includes('License') &&
    p.length > 3
  );
  if (realPlaceholders.length > 0) {
    logger.debug("[Detection] Found bracket placeholders:", { placeholders: realPlaceholders, category: LogCategory.GENERAL });
    return true;
  }

  // Check for {{placeholder}} style
  if (/\{\{[\w\s_]+\}\}/g.test(content)) {
    logger.debug("[Detection] Found mustache placeholder", { category: LogCategory.GENERAL });
    return true;
  }

  // Check for common placeholder words
  const placeholderWords = [
    'placeholder',
    'insert here',
    'to be filled',
    'to be provided',
    'fill in the',
    '[blank]',
    '(blank)',
  ];

  for (const word of placeholderWords) {
    if (lowerContent.includes(word)) {
      logger.debug(`[Detection] Found placeholder word: ${word}`, { category: LogCategory.GENERAL });
      return true;
    }
  }

  return false;
}

/**
 * Determine if a response should be sent as DOCX based on its content
 * THIS IS THE MAIN ROUTING DECISION - import from here
 *
 * IMPORTANT: Only these templates should EVER be DOCX:
 * - Standard Viewing Form
 * - Advanced Viewing Form
 * - Property Reservation Agreement
 * - Non-Exclusive Marketing Agreement
 */
export function shouldSendAsDocx(response: string): boolean {
  // Rule 0: If it's a clarification question, NEVER send as DOCX
  if (isClarificationQuestion(response)) {
    logger.debug("[Detection] Clarification response -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 0.5: If it's a confirmation message, NEVER send as DOCX
  if (isConfirmationMessage(response)) {
    logger.debug("[Detection] Confirmation message -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 1: If it has a Subject: line, it's an email template -> TEXT
  if (response.includes("Subject:")) {
    logger.debug("[Detection] Has Subject: line -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 1.5: Registration templates (contain "Dear XXXXXXXX") are ALWAYS TEXT
  // This catches seller, bank, developer registrations that may contain
  // keywords like "csc zyprus", "agent", "seller" which falsely match marketing patterns
  if (/Dear\s+X{6,}/i.test(response)) {
    logger.debug("[Detection] Contains 'Dear XXXXXXXX' registration pattern -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 2: Response must be long enough to be a real document
  if (response.length < MIN_DOCX_LENGTH) {
    logger.debug(`[Detection] Too short for DOCX: ${response.length} < ${MIN_DOCX_LENGTH} -> TEXT`, { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 2.5: Check for DOCX templates FIRST (before placeholder check)
  // Reservation agreements should be DOCX even if vendor field has placeholders
  const firstPart = response.substring(0, 800).toLowerCase();

  // Check for Property Reservation Agreement early - allow even with placeholders
  if (
    (firstPart.includes("property reservation agreement") ||
      firstPart.includes("reservation agreement")) &&
    response.length > 800 &&
    (response.toLowerCase().includes("prospective buyer") || response.toLowerCase().includes("buyer:"))
  ) {
    logger.debug("[Detection] Reservation Agreement structure detected -> DOCX (bypassing placeholder check)", { category: LogCategory.GENERAL });
    return true;
  }

  // Rule 2.6: Check for placeholders (only for non-reservation templates)
  if (containsPlaceholders(response)) {
    logger.debug("[Detection] Contains placeholders -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 3: Extract title and check against DOCX templates
  const title = extractTemplateTitle(response);
  if (title && isDocxTemplateTitle(title)) {
    logger.debug(`[Detection] Title match: "${title}" -> DOCX`, { category: LogCategory.GENERAL });
    return true;
  }

  // Rule 4: Check for specific DOCX template markers - must have document structure
  // firstPart already declared above
  const fullLower = response.toLowerCase();

  // Viewing Form detection - requires actual form content
  if (
    firstPart.includes("viewing form") &&
    (fullLower.includes("herein, i") || fullLower.includes("confirm that")) &&
    (fullLower.includes("id number") || fullLower.includes("passport") || fullLower.includes("signature"))
  ) {
    logger.debug("[Detection] Viewing Form content detected -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Reservation Agreement detection - use the comprehensive detection function
  if (isCompletedReservationAgreement(response)) {
    logger.debug("[Detection] Reservation Agreement detected (via isCompletedReservationAgreement) -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Fallback: Check for reservation agreement keywords if comprehensive detection fails
  if (
    (firstPart.includes("property reservation agreement") ||
      firstPart.includes("property reservation") ||
      firstPart.includes("reservation agreement")) &&
    (fullLower.includes("buyer") || fullLower.includes("vendor") || fullLower.includes("deposit"))
  ) {
    logger.debug("[Detection] Reservation Agreement content detected (fallback) -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Marketing Agreement detection (Non-Exclusive) - requires actual agreement content
  // IMPORTANT: Must NOT match registration emails that mention CSC Zyprus + agency fees
  if (
    firstPart.includes("marketing agreement") &&
    fullLower.includes("non-exclusive") &&
    (fullLower.includes("between") || fullLower.includes("csc zyprus")) &&
    (fullLower.includes("owner") || fullLower.includes("agent may advertise") || fullLower.includes("terms and conditions for property listing")) &&
    !fullLower.includes("subject:") &&
    !/dear\s+x{6,}/i.test(response)
  ) {
    logger.debug("[Detection] Marketing Agreement content detected -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Default: TEXT
  logger.debug("[Detection] No DOCX match -> TEXT", { category: LogCategory.GENERAL });
  return false;
}

/**
 * DOCX template type for specialized generation
 */
export type DocxTemplateType =
  | "viewing-form-single"
  | "viewing-form-multiple"
  | "viewing-form-advanced"
  | "reservation-agreement"
  | "marketing-non-exclusive"
  | "unknown";

/**
 * Detect specific DOCX template type from response content
 * Returns the template identifier for specialized generation
 */
export function detectDocxTemplateType(response: string): DocxTemplateType {
  const lower = response.toLowerCase();
  const first500 = lower.substring(0, 500);

  // Viewing Forms
  if (first500.includes("viewing form") || first500.includes("herein, i")) {
    // Check for advanced (has legal paragraph)
    if (lower.includes("exclusive representative") ||
        lower.includes("monetary compensation") ||
        lower.includes("commission fee")) {
      // Check for multiple people
      if (lower.includes("and i ") && (lower.match(/with id/gi) || []).length > 1) {
        return "viewing-form-multiple";
      }
      return "viewing-form-advanced";
    }

    // Check for multiple people (standard)
    if (lower.includes("and i ") && (lower.match(/with id/gi) || []).length > 1) {
      return "viewing-form-multiple";
    }

    return "viewing-form-single";
  }

  // Reservation Agreement
  if (first500.includes("reservation agreement") ||
      first500.includes("property reservation agreement") ||
      first500.includes("property reservation")) {
    return "reservation-agreement";
  }

  // Marketing Agreement (Non-Exclusive)
  if (first500.includes("marketing agreement") ||
      (first500.includes("non-exclusive") && lower.includes("agent may advertise"))) {
    return "marketing-non-exclusive";
  }

  return "unknown";
}

/**
 * Detect template type from user message
 */
export function detectTemplateTypeFromMessage(userMessage: string): string | null {
  const message = userMessage.toLowerCase();

  if (message.includes("viewing form") || message.includes("standard viewing")) {
    return "Standard Viewing Form";
  }
  if (message.includes("advanced viewing") || message.includes("introduction form")) {
    return "Advanced Viewing/Introduction Form";
  }
  if (message.includes("reservation form") || message.includes("reservation agreement") || message.includes("property reservation")) {
    return "Property Reservation Agreement";
  }
  if (message.includes("marketing agreement") || message.includes("non-exclusive") || message.includes("non exclusive")) {
    if (message.includes("email marketing") ||
        message.includes("via email") ||
        message.includes("by email") ||
        message.includes("send marketing agreement to")) {
      return "Email Marketing Agreement";
    }
    return "Marketing Agreement DOCX";
  }

  return null;
}

/**
 * Check if a DOCX template was requested based on conversation history
 */
export function wasDocxTemplateRequested(
  conversationHistory?: Array<{role: string, parts: Array<{text: string}>}>
): boolean {
  if (!conversationHistory || conversationHistory.length === 0) {
    return false;
  }

  const allMessages = conversationHistory
    .map(msg => msg.parts.map(p => p.text).join(" "))
    .join(" ")
    .toLowerCase();

  const docxKeywords = [
    "viewing form",
    "standard viewing",
    "advanced viewing",
    "reservation agreement",
    "property reservation",
    "non-exclusive",
    "non exclusive",
    "marketing agreement",
    "signature document",
    "template 09",
    "template 10",
    "template 11",
    "template 15",
  ];

  return docxKeywords.some(keyword => allMessages.includes(keyword));
}

// Re-export DOCX_TEMPLATE_TITLES for backward compatibility
export { DOCX_TEMPLATE_TITLES };
