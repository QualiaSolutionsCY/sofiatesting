/**
 * Field validation utilities for SOPHIA bot document generation
 * Ensures all required fields are present before generating DOCX files
 */

/**
 * Checks if the AI response contains placeholders or missing data
 * NOTE: Signature lines (___________) are intentional and NOT placeholders
 */
export function containsPlaceholders(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // Check for XXXXXXXX placeholders (real placeholder indicator)
  if (/XXXXXXX+/g.test(content)) {
    console.log("[Field Validator] Found XXXXXXXX placeholder");
    return true;
  }

  // Check for [FIELD_NAME] style placeholders - but not signature lines
  // Only match if inside brackets with uppercase words
  const bracketPlaceholders = content.match(/\[[A-Z][A-Z_\s]+\]/g) || [];
  // Filter out legitimate bracketed content
  const realPlaceholders = bracketPlaceholders.filter(p =>
    !p.includes('Reg.') &&
    !p.includes('License') &&
    p.length > 3
  );
  if (realPlaceholders.length > 0) {
    console.log("[Field Validator] Found bracket placeholders:", realPlaceholders);
    return true;
  }

  // Check for {{placeholder}} style
  if (/\{\{[\w\s_]+\}\}/g.test(content)) {
    console.log("[Field Validator] Found mustache placeholder");
    return true;
  }

  // Check for common placeholder words (but not signature-related)
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
      console.log("[Field Validator] Found placeholder word:", word);
      return true;
    }
  }

  // NOTE: We intentionally do NOT flag:
  // - _______________ (signature lines - these are intentional in viewing forms)
  // - Name: _________ (signature fields - users sign these)

  return false;
}

/**
 * Checks if content looks like a completed viewing form document
 * Viewing forms have specific structure with "Herein, I" and ID/passport info
 */
function isCompletedViewingFormDocument(content: string): boolean {
  const lowerContent = content.toLowerCase();
  
  // Must have the "Herein, I" opening
  if (!lowerContent.includes('herein, i')) {
    return false;
  }
  
  // Must have confirmation language
  if (!lowerContent.includes('confirm that') && !lowerContent.includes('have been shown')) {
    return false;
  }
  
  // Must have an ID/passport pattern - check multiple formats
  // Format 1: "with ID A123456" or "with id 123456"
  // Format 2: "Passport/ID Number: 123456" or "ID/Passport: A123456"
  // Format 3: "ID Number: 123456" or "Passport Number: ABC123"
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
function isCompletedMarketingAgreementDocument(content: string): boolean {
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
 * Checks if the AI response is requesting information from the user
 * NOTE: Completed documents with signature fields are NOT requesting information
 */
export function isRequestingInformation(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // FIRST: Check if this looks like a completed document
  if (isCompletedViewingFormDocument(content)) {
    console.log("[Field Validator] Detected completed viewing form, not requesting info");
    return false;
  }

  if (isCompletedMarketingAgreementDocument(content)) {
    console.log("[Field Validator] Detected completed marketing agreement, not requesting info");
    return false;
  }

  if (isCompletedReservationAgreementDocument(content)) {
    console.log("[Field Validator] Detected completed reservation agreement, not requesting info");
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
      console.log("[Field Validator] Found request pattern");
      return true;
    }
  }

  // Check for multiple questions (indicates gathering information)
  const questionMarks = (content.match(/\?/g) || []).length;
  if (questionMarks >= 2) {
    console.log("[Field Validator] Multiple questions detected");
    return true;
  }

  // Check for bullet point lists requesting information
  // IMPORTANT: Exclude markdown bold headers (** **) from being counted as bullets
  // First, remove all markdown bold patterns to avoid false positives
  const contentWithoutBold = content.replace(/\*\*[^*]+\*\*/g, '');
  
  // Now count actual bullet points (not markdown bold)
  // Match: • bullet, - bullet, * bullet (but not ** which is bold)
  const bulletListCount = (contentWithoutBold.match(/^[•\-]\s*[\w\s]+:/gm) || []).length +
                          (contentWithoutBold.match(/^\*\s+[\w\s]+:/gm) || []).length;
  
  if (bulletListCount >= 3 && content.length < 800) {
    // Short response with multiple bullet points = likely requesting info
    console.log("[Field Validator] Bullet list requesting info (count: " + bulletListCount + ")");
    return true;
  }

  return false;
}

/**
 * Validates if all required fields are present for a viewing form
 */
function validateViewingFormFields(content: string): boolean {
  // FIRST: If this looks like a completed viewing form document, it's valid
  if (isCompletedViewingFormDocument(content)) {
    console.log("[Field Validator] Viewing form passes completed document check");
    return true;
  }

  const lowerContent = content.toLowerCase();

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
    console.log(`[Field Validator] Viewing form missing ${missingFields} fields:`, missingFieldNames.join(', '));
  }

  // If more than 2 fields are missing, it's likely a request for information
  return missingFields <= 2;
}

/**
 * Checks if content looks like a completed reservation agreement document
 */
export function isCompletedReservationAgreementDocument(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // Must have reservation agreement structure
  if (!lowerContent.includes('property reservation') && !lowerContent.includes('reservation agreement')) {
    return false;
  }

  // Must have prospective buyer with ID info (passport, Cyprus ID, UK ID, etc.)
  // Accepts: "Cyprus ID: 123456", "Passport: AB123456", "ID: 123456", "UK Passport: 123456"
  const hasBuyerInfo = /prospective\s+buyer/i.test(content) &&
                       (/(?:passport|id)[:\s]+[A-Z0-9]+/i.test(content) ||
                        /[A-Z]+\s+(?:passport|id)[:\s]+[A-Z0-9]+/i.test(content));

  // Must have vendor
  const hasVendor = /vendor[:\s]+/i.test(content);

  // Must have property registration
  const hasPropertyReg = /\d+\/\d+/i.test(content);

  // Must have financial terms (handle markdown bold **€6,000** format)
  // Strip ** before checking amounts
  const contentNoMarkdown = content.replace(/\*\*/g, '');
  const hasFinancials = /reservation\s+fee[:\s]+[€$]?\s*[\d,]+/i.test(contentNoMarkdown) &&
                        /purchase\s+price[:\s]+[€$]?\s*[\d,]+/i.test(contentNoMarkdown);

  console.log(`[Field Validator] Reservation check: buyer=${hasBuyerInfo}, vendor=${hasVendor}, reg=${hasPropertyReg}, financials=${hasFinancials}`);

  return hasBuyerInfo && hasVendor && hasPropertyReg && hasFinancials;
}

/**
 * Validates if all required fields are present for a reservation agreement
 */
function validateReservationAgreementFields(content: string): boolean {
  // FIRST: If this looks like a completed reservation agreement, it's valid
  if (isCompletedReservationAgreementDocument(content)) {
    console.log("[Field Validator] Reservation agreement passes completed document check");
    return true;
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
    console.log(`[Field Validator] Reservation agreement missing ${missingFields} fields:`, missingFieldNames.join(', '));
  }

  // Allow up to 2 missing fields
  return missingFields <= 2;
}

/**
 * Main validation function to check if all required fields are present
 */
export function hasAllRequiredFields(aiResponse: string, templateType?: string): boolean {
  const lowerResponse = aiResponse.toLowerCase();

  // First, check if it contains placeholders
  if (containsPlaceholders(aiResponse)) {
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
  return !containsPlaceholders(aiResponse) && !isRequestingInformation(aiResponse);
}

/**
 * Checks if the response appears to be collecting information before document generation
 * NOTE: Completed documents are NOT collecting information
 */
export function isCollectingInformation(content: string): boolean {
  const lowerContent = content.toLowerCase();

  // FIRST: Check if this looks like a completed document
  if (isCompletedViewingFormDocument(content)) {
    return false;
  }

  if (isCompletedMarketingAgreementDocument(content)) {
    return false;
  }

  if (isCompletedReservationAgreementDocument(content)) {
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

