/**
 * Field Validation Utilities for SOPHIA Bot
 *
 * This module provides field validation for document generation.
 * Detection functions are imported from the centralized templates module.
 *
 * NEW CODE SHOULD IMPORT DETECTION FUNCTIONS DIRECTLY FROM:
 * - ../templates/detection.ts
 */

import { logger, LogCategory } from "./logger.ts";

// Re-export detection functions from centralized module for backward compatibility
export {
  isCompletedReservationAgreement as isCompletedReservationAgreementDocument,
  isCompletedViewingForm as isCompletedViewingFormDocument,
  isCompletedMarketingAgreement as isCompletedMarketingAgreementDocument,
  containsPlaceholders,
  isClarificationQuestion,
} from "../templates/detection.ts";

// Import for internal use
import {
  isCompletedReservationAgreement,
  isCompletedViewingForm,
  isCompletedMarketingAgreement,
  containsPlaceholders as checkPlaceholders,
} from "../templates/detection.ts";

/**
 * Checks if the AI response is requesting information from the user
 * NOTE: Completed documents with signature fields are NOT requesting information
 */
export function isRequestingInformation(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // FIRST: Check if this looks like a completed document
  if (isCompletedViewingForm(content)) {
    logger.debug("[Field Validator] Detected completed viewing form, not requesting info", { category: LogCategory.GENERAL });
    return false;
  }

  if (isCompletedMarketingAgreement(content)) {
    logger.debug("[Field Validator] Detected completed marketing agreement, not requesting info", { category: LogCategory.GENERAL });
    return false;
  }

  if (isCompletedReservationAgreement(content)) {
    logger.debug("[Field Validator] Detected completed reservation agreement, not requesting info", { category: LogCategory.GENERAL });
    return false;
  }

  // Common patterns for information requests
  const requestPatterns = [
    // Direct requests
    /please\s+provide\s+(the\s+)?following/,
    /i('ll)?\s+need\s+(the\s+)?following\s+information/,
    /i('ll)?\s+need\s+(the\s+)?following\s+details/,
    /to\s+prepare\s+.+\s+i('ll)?\s+need/,
    /to\s+create\s+.+\s+please\s+provide/,
    /could\s+you\s+please\s+provide/,
    /please\s+share\s+(the\s+)?following/,
    /i\s+require\s+(the\s+)?following/,

    // Question patterns
    /what\s+is\s+(the\s+)?.*\?/,
    /could\s+you\s+tell\s+me/,
    /can\s+you\s+provide/,
    /please\s+specify/,
  ];

  // Check for request patterns
  for (const pattern of requestPatterns) {
    if (pattern.test(lowerContent)) {
      logger.debug("[Field Validator] Found request pattern", { category: LogCategory.GENERAL });
      return true;
    }
  }

  // Check for multiple questions (indicates gathering information)
  const questionMarks = (content.match(/\?/g) || []).length;
  if (questionMarks >= 2) {
    logger.debug("[Field Validator] Multiple questions detected", { category: LogCategory.GENERAL });
    return true;
  }

  // Check for bullet point lists requesting information
  // IMPORTANT: Exclude markdown bold headers (** **) from being counted as bullets
  const contentWithoutBold = content.replace(/\*\*[^*]+\*\*/g, '');

  // Now count actual bullet points (not markdown bold)
  const bulletListCount = (contentWithoutBold.match(/^[•\-]\s*[\w\s]+:/gm) || []).length +
                          (contentWithoutBold.match(/^\*\s+[\w\s]+:/gm) || []).length;

  if (bulletListCount >= 3 && content.length < 800) {
    // Short response with multiple bullet points = likely requesting info
    logger.debug("[Field Validator] Bullet list requesting info (count: " + bulletListCount + ")", { category: LogCategory.GENERAL });
    return true;
  }

  return false;
}

/**
 * Validates if all required fields are present for a viewing form
 */
function validateViewingFormFields(content: string): boolean {
  // FIRST: If this looks like a completed viewing form document, it's valid
  if (isCompletedViewingForm(content)) {
    logger.debug("[Field Validator] Viewing form passes completed document check", { category: LogCategory.GENERAL });
    return true;
  }

  // Required fields for viewing forms - more flexible patterns
  const requiredPatterns = [
    // Date (multiple formats: **Date:** 17/12/2025, Date: 17-12-2025, etc.)
    /date[:\*\s]+\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/i,
    // Name with ID (format: "I Fawzi Goussous with ID" or "Name: John Smith")
    /(herein,?\s*i\s+[A-Z][a-z]+\s+[A-Z][a-z]+|name[:\*\s]+[A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    // ID/Passport number (multiple formats)
    /(with\s+id\s+[A-Z0-9]+|id[:\*\s]+[A-Z0-9]{5,}|passport[:\*\s]+[A-Z0-9]{5,})/i,
    // Property registration (format like 0/1234 or Registration No.: 0/1234)
    /(\d+\/\d+|registration[\s\w\*:]+\d+\/\d+)/i,
    // District/Municipality/Location
    /(district|municipality|locality)[:\*\s]+[A-Za-z]+/i,
  ];

  let missingFields = 0;
  const missingFieldNames: string[] = [];
  const fieldNames = ['Date', 'Name', 'ID/Passport', 'Registration', 'District/Location'];

  for (let i = 0; i < requiredPatterns.length; i++) {
    if (!requiredPatterns[i].test(content)) {
      missingFields++;
      missingFieldNames.push(fieldNames[i]);
    }
  }

  if (missingFields > 0) {
    logger.debug(`[Field Validator] Viewing form missing ${missingFields} fields: ${missingFieldNames.join(', ')}`, { category: LogCategory.GENERAL });
  }

  // If more than 2 fields are missing, it's likely a request for information
  return missingFields <= 2;
}

/**
 * Validates if all required fields are present for a reservation agreement
 */
function validateReservationAgreementFields(content: string): boolean {
  // FIRST: If this looks like a completed reservation agreement, it's valid
  if (isCompletedReservationAgreement(content)) {
    logger.debug("[Field Validator] Reservation agreement passes completed document check", { category: LogCategory.GENERAL });
    return true;
  }

  // SECOND: Check for blank document patterns - these are intentional blank documents
  const hasBlankBrackets = /\[\s*\]/g.test(content);
  const hasRepeatedDots = /[\.…]{8,}/g.test(content);
  const hasUnderscoreLines = /_{15,}/g.test(content);

  if (hasBlankBrackets || hasRepeatedDots || hasUnderscoreLines) {
    const lowerContent = content.toLowerCase();
    const hasDocStructure =
      lowerContent.includes('property reservation agreement') ||
      lowerContent.includes('reservation agreement') ||
      lowerContent.includes('csc zyprus');
    if (hasDocStructure) {
      logger.debug("[Field Validator] Blank reservation agreement detected - allowing blank document", { category: LogCategory.GENERAL });
      return true;
    }
  }

  const requiredPatterns = [
    // Buyer name with passport info
    /(?:prospective\s+)?buyer[:\s]+[A-Za-z\s]+/i,
    // Passport number
    /passport[:\s]+[A-Z0-9]+|[A-Z]+\s+PASSPORT[:\s]+\d+/i,
    // Vendor
    /vendor[:\s]+[A-Za-z\s]+/i,
    // Property registration
    /\d+\/\d+/,
    // Reservation fee
    /reservation\s+fee[:\s]+[€$]?\s*[\d,]+/i,
    // Purchase price
    /purchase\s+price[:\s]+[€$]?\s*[\d,]+/i,
  ];

  let missingFields = 0;
  const fieldNames = ['Buyer Name', 'Passport', 'Vendor', 'Registration No', 'Reservation Fee', 'Purchase Price'];
  const missingFieldNames: string[] = [];

  for (let i = 0; i < requiredPatterns.length; i++) {
    if (!requiredPatterns[i].test(content)) {
      missingFields++;
      missingFieldNames.push(fieldNames[i]);
    }
  }

  if (missingFields > 0) {
    logger.debug(`[Field Validator] Reservation agreement missing ${missingFields} fields: ${missingFieldNames.join(', ')}`, { category: LogCategory.GENERAL });
  }

  // Allow up to 2 missing fields
  return missingFields <= 2;
}

/**
 * Main validation function to check if all required fields are present
 *
 * CRITICAL FIX: Check for completed documents FIRST before any placeholder/info checks.
 * Completed viewing forms, marketing agreements, and reservation agreements should pass
 * validation even if they have patterns that might look like "requesting info" or placeholders.
 */
export function hasAllRequiredFields(aiResponse: string, templateType?: string): boolean {
  const lowerResponse = aiResponse.toLowerCase();

  // CRITICAL FIX: Check for completed documents FIRST before other checks
  // This prevents valid completed documents from being rejected by placeholder or
  // "requesting information" checks that misinterpret their structure
  if (isCompletedViewingForm(aiResponse)) {
    logger.debug("[Field Validator] hasAllRequiredFields: Detected completed viewing form -> PASS", { category: LogCategory.GENERAL });
    return true;
  }

  if (isCompletedMarketingAgreement(aiResponse)) {
    logger.debug("[Field Validator] hasAllRequiredFields: Detected completed marketing agreement -> PASS", { category: LogCategory.GENERAL });
    return true;
  }

  if (isCompletedReservationAgreement(aiResponse)) {
    logger.debug("[Field Validator] hasAllRequiredFields: Detected completed reservation agreement -> PASS", { category: LogCategory.GENERAL });
    return true;
  }

  // Only after confirming it's not a completed document, check for placeholders
  if (checkPlaceholders(aiResponse)) {
    return false;
  }

  // Check if it's requesting information
  if (isRequestingInformation(aiResponse)) {
    return false;
  }

  // If we can detect the template type, validate specific fields
  if (templateType) {
    if (templateType.includes('viewing')) {
      return validateViewingFormFields(aiResponse);
    }
    if (templateType.includes('reservation-agreement') || templateType.includes('reservation agreement')) {
      return validateReservationAgreementFields(aiResponse);
    }
  }

  // Auto-detect template type from content
  if (lowerResponse.includes('viewing form') || lowerResponse.includes('property viewing')) {
    return validateViewingFormFields(aiResponse);
  }
  if (lowerResponse.includes('reservation agreement') || lowerResponse.includes('property reservation')) {
    return validateReservationAgreementFields(aiResponse);
  }
  // For other templates, just check for placeholders and information requests
  return !checkPlaceholders(aiResponse) && !isRequestingInformation(aiResponse);
}

/**
 * Checks if the response appears to be collecting information before document generation
 * NOTE: Completed documents are NOT collecting information
 */
export function isCollectingInformation(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // FIRST: Check if this looks like a completed document
  if (isCompletedViewingForm(content)) {
    return false;
  }

  if (isCompletedMarketingAgreement(content)) {
    return false;
  }

  if (isCompletedReservationAgreement(content)) {
    return false;
  }

  const indicators = [
    'please provide',
    'i need the following',
    'i\'ll need',
    'could you provide',
    'please share',
    'following information',
    'following details',
    'need to know',
  ];

  let matchCount = 0;

  for (const indicator of indicators) {
    if (lowerContent.includes(indicator)) {
      matchCount++;
    }
  }

  // If 2 or more indicators are present, it's likely collecting information
  return matchCount >= 2;
}
