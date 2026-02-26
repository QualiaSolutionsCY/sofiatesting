/**
 * DOCX Generator
 *
 * Generates professional DOCX documents from AI responses.
 * Only 4 specific templates generate DOCX files:
 * - Standard Viewing Form (Template 09)
 * - Advanced Viewing Form (Template 10)
 * - Property Reservation Agreement (Template 11)
 * - Non-Exclusive Marketing Agreement (Template 15)
 */

import { Document, Packer, Paragraph, ImageRun, TextRun, AlignmentType } from "https://esm.sh/docx@8.5.0";
import { SOPHIA_LOGO_BASE64 } from "./assets/sophia-logo.ts";
import { VIEWING_FORM_LOGO_BASE64 } from "./assets/viewing-form-logo.ts";
import { isRequestingInformation, containsPlaceholders } from "./utils/field-validator.ts";
import {
  createReservationAgreement,
  parseReservationAgreementData,
  createBlankReservationAgreementData,
  createMarketingAgreement,
  parseMarketingAgreementData,
  createViewingFormSingle,
  parseViewingFormSingleData,
  createBlankViewingFormData,
  createViewingFormAdvanced,
  parseViewingFormAdvancedData,
  createBlankViewingFormAdvancedData,
  createViewingFormMultiple,
  parseViewingFormMultipleData,
} from "./docx/templates/index.ts";
import { logger, LogCategory } from "./utils/logger.ts";

// Import from centralized modules
import {
  extractTemplateTitle as centralizedExtractTitle,
  isDocxTemplateTitle as centralizedIsDocxTitle,
} from "./templates/registry.ts";
import {
  isClarificationQuestion as centralizedIsClarification,
  isConfirmationMessage as centralizedIsConfirmation,
  hasDefaultedLoanVatFlags,
} from "./templates/detection.ts";

/**
 * Font settings
 */
const FONTS = {
  PRIMARY: "Calibri",
  SIZES: {
    BODY: 24,  // 12pt in half-points
    TITLE: 28, // 14pt
  },
};

// isConfirmationMessage imported from templates/detection.ts as centralizedIsConfirmation

/**
 * PERFORMANCE: Pre-decode logos at module initialization (cold start)
 */
const decodeLogo = (base64: string, name: string): Uint8Array | null => {
  try {
    if (!base64 || base64.length === 0) {
      logger.debug(`No ${name} logo data available`, { category: LogCategory.GENERAL });
      return null;
    }
    const binaryString = atob(base64);
    const array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      array[i] = binaryString.charCodeAt(i);
    }
    logger.debug(`Pre-decoded ${name} logo at module initialization`, { category: LogCategory.GENERAL });
    return array;
  } catch (error) {
    logger.warn(`Failed to pre-decode ${name} logo at module init`, { category: LogCategory.GENERAL, error: String(error) });
    return null;
  }
};

// Sophia logo - used for standalone logo requests
const DECODED_LOGO: Uint8Array | null = decodeLogo(SOPHIA_LOGO_BASE64, "SOPHIA");
// Zyprus viewing form logo - used on viewing form DOCX documents
const DECODED_VIEWING_FORM_LOGO: Uint8Array | null = decodeLogo(VIEWING_FORM_LOGO_BASE64, "viewing-form");

// Use centralized functions from templates/
const extractTemplateTitle = centralizedExtractTitle;
const isDocxTemplateTitle = centralizedIsDocxTitle;
const isClarificationQuestion = centralizedIsClarification;
const isConfirmationMessage = centralizedIsConfirmation;

/**
 * Determines if an AI response should be sent as a DOCX file
 * 
 * Rules:
 * 1. If it has "Subject:" -> TEXT (it's an email)
 * 2. If title matches DOCX templates -> DOCX
 * 3. If content matches DOCX patterns -> DOCX
 * 4. If has document structure -> DOCX
 * 5. Default -> TEXT
 */
export function isDocxTemplate(
  aiResponse: string,
  _conversationHistory?: Array<{role: string, parts: Array<{text: string}>}>
): boolean {
  // Strip markdown bold markers so all regexes work regardless of AI formatting
  // e.g., "**Seller:** John" becomes "Seller: John"
  aiResponse = aiResponse.replace(/\*\*/g, '');
  logger.info(`[DOCX CHECK] Starting check - length: ${aiResponse.length}`, { category: LogCategory.GENERAL });

  // STRICT CHECK 0: Short responses are NEVER DOCX
  // EXCEPTION: Blank viewing forms are naturally short (300-400 chars)
  // EXCEPTION: Reservation agreements with only data fields (no legal text) can be ~250-350 chars
  // EXCEPTION: Marketing agreements in structured format ("Marketing Agreement" + "Seller:" + "Property:") can be ~100-200 chars
  const lowerResponse = aiResponse.toLowerCase();
  const isViewingFormShort = lowerResponse.includes('viewing form') &&
                            lowerResponse.includes('herein, i') &&
                            aiResponse.length >= 300;

  const isReservationShort = (lowerResponse.includes('property reservation agreement') ||
                              lowerResponse.includes('reservation agreement')) &&
                             lowerResponse.includes('prospective buyer') &&
                             lowerResponse.includes('purchase price') &&
                             aiResponse.length >= 200;

  const isMarketingShort = lowerResponse.includes('marketing agreement') &&
                           /^seller[:\s]/im.test(aiResponse) &&
                           /^property[:\s]/im.test(aiResponse) &&
                           aiResponse.length >= 50;

  if (aiResponse.length < 400 && !isViewingFormShort && !isReservationShort && !isMarketingShort) {
    logger.info(`[DOCX CHECK] BLOCKED at length check: ${aiResponse.length} < 400`, { category: LogCategory.GENERAL });
    return false;
  }
  if (isViewingFormShort) {
    logger.info(`[DOCX CHECK] Viewing form exception: length ${aiResponse.length} >= 300`, { category: LogCategory.GENERAL });
  } else if (isReservationShort) {
    logger.info(`[DOCX CHECK] Reservation agreement exception: length ${aiResponse.length} >= 200`, { category: LogCategory.GENERAL });
  } else if (isMarketingShort) {
    logger.info(`[DOCX CHECK] Marketing agreement structured format exception: length ${aiResponse.length} >= 80`, { category: LogCategory.GENERAL });
  } else {
    logger.info(`[DOCX CHECK] Passed length check: ${aiResponse.length} >= 400`, { category: LogCategory.GENERAL });
  }

  // STRICT CHECK 1: Clarification questions are NEVER DOCX
  const clarificationResult = isClarificationQuestion(aiResponse);
  if (clarificationResult) {
    logger.info(`[DOCX CHECK] BLOCKED at clarification check`, { category: LogCategory.GENERAL });
    return false;
  }
  logger.info(`[DOCX CHECK] Passed clarification check`, { category: LogCategory.GENERAL });

  // STRICT CHECK 2: Confirmation messages are NEVER DOCX
  const confirmationResult = isConfirmationMessage(aiResponse);
  if (confirmationResult) {
    logger.info(`[DOCX CHECK] BLOCKED at confirmation check`, { category: LogCategory.GENERAL });
    return false;
  }
  logger.info(`[DOCX CHECK] Passed confirmation check`, { category: LogCategory.GENERAL });

  // STRICT CHECK 3: Check if AI is requesting information first
  const requestingResult = isRequestingInformation(aiResponse);
  if (requestingResult) {
    logger.info(`[DOCX CHECK] BLOCKED at requesting info check`, { category: LogCategory.GENERAL });
    return false;
  }
  logger.info(`[DOCX CHECK] Passed requesting info check`, { category: LogCategory.GENERAL });

  // CHECK 3.5: Log Reservation Agreement Loan/VAT flags (no longer blocks — prompt enforcement handles asking)
  hasDefaultedLoanVatFlags(aiResponse);

  // NEW: Check if response contains placeholders
  const placeholdersResult = containsPlaceholders(aiResponse);
  if (placeholdersResult) {
    logger.info(`[DOCX CHECK] BLOCKED at placeholders check`, { category: LogCategory.GENERAL });
    return false;
  }
  logger.info(`[DOCX CHECK] Passed placeholders check`, { category: LogCategory.GENERAL });

  // Rule 1: Subject line = email = TEXT
  if (aiResponse.includes("Subject:")) {
    logger.debug("[DOCX] Has Subject: -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 1.5: Registration templates (contain "Dear XXXXXXXX") are ALWAYS TEXT
  if (/Dear\s+X{6,}/i.test(aiResponse)) {
    logger.debug("[DOCX] Contains 'Dear XXXXXXXX' registration pattern -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 2: Check title
  const title = extractTemplateTitle(aiResponse);
  if (title) {
    logger.debug(`[DOCX] Extracted title: "${title}"`, { category: LogCategory.GENERAL });
    if (isDocxTemplateTitle(title)) {
      // Even with matching title, check if it's requesting information
      if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
        logger.debug("[DOCX] Title matches but requesting info/has placeholders -> TEXT", { category: LogCategory.GENERAL });
        return false;
      }
      logger.debug(`[DOCX] Title "${title}" matches and has complete data -> DOCX`, { category: LogCategory.GENERAL });
      return true;
    }
  }

  // Rule 3: Check content patterns in first 800 chars (expanded from 500)
  const firstPart = aiResponse.substring(0, 800).toLowerCase();

  // Viewing Form detection - multiple patterns
  const viewingFormPatterns = [
    firstPart.includes("viewing form"),
    firstPart.includes("herein, i") && firstPart.includes("undersigned"),
    firstPart.includes("confirm that") && firstPart.includes("viewing"),
    firstPart.includes("property viewing") && aiResponse.length > 500,
  ];
  logger.info(`[DOCX CHECK] Viewing form patterns: ${JSON.stringify(viewingFormPatterns)}`, { category: LogCategory.GENERAL });
  if (viewingFormPatterns.some(p => p)) {
    // Check if it's actually requesting form information
    const requestingInfoAgain = isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse);
    logger.info(`[DOCX CHECK] Viewing form pattern matched, requesting/placeholder recheck: ${requestingInfoAgain}`, { category: LogCategory.GENERAL });
    if (requestingInfoAgain) {
      logger.info("[DOCX CHECK] BLOCKED - Viewing form pattern but requesting info/has placeholders -> TEXT", { category: LogCategory.GENERAL });
      return false;
    }
    logger.info("[DOCX CHECK] SUCCESS - Viewing form pattern with complete data -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Reservation Agreement detection - multiple patterns
  const reservationPatterns = [
    firstPart.includes("property reservation agreement"),
    firstPart.includes("reservation agreement"),
    firstPart.includes("property reservation"),
    firstPart.includes("reserve") && firstPart.includes("property") && aiResponse.length > 500,
  ];
  if (reservationPatterns.some(p => p)) {
    // Check if it's actually requesting form information
    if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
      logger.debug("[DOCX] Reservation agreement pattern but requesting info/has placeholders -> TEXT", { category: LogCategory.GENERAL });
      return false;
    }
    logger.debug("[DOCX] Reservation agreement pattern with complete data -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // Marketing Agreement detection - multiple patterns
  // IMPORTANT: "between" + "csc zyprus" + "agent" is too broad - matches registration emails
  const marketingPatterns = [
    firstPart.includes("marketing agreement") && !firstPart.includes("subject:"),
    firstPart.includes("non-exclusive") && firstPart.includes("agreement") && !firstPart.includes("subject:"),
    firstPart.includes("between") && firstPart.includes("csc zyprus") && firstPart.includes("agent may advertise"),
    firstPart.includes("terms and conditions for property listing"),
  ];
  if (marketingPatterns.some(p => p)) {
    // Check if it's actually requesting form information
    if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
      logger.debug("[DOCX] Marketing agreement pattern but requesting info/has placeholders -> TEXT", { category: LogCategory.GENERAL });
      return false;
    }
    logger.debug("[DOCX] Marketing agreement pattern with complete data -> DOCX", { category: LogCategory.GENERAL });
    return true;
  }

  // EARLY EXIT: If asking for information, ALWAYS return TEXT
  if (firstPart.includes("please provide") || firstPart.includes("i need the following") || firstPart.includes("which type")) {
    logger.debug("[DOCX] Contains 'please provide' or question -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 4: REMOVED - No more "document structure" guessing
  // Only strict title/content matching above should trigger DOCX

  // Default: TEXT
  logger.debug("[DOCX] No match -> TEXT", { category: LogCategory.GENERAL });
  return false;
}

/**
 * Check if a DOCX template was requested in conversation
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
    "reservation agreement",
    "property reservation",
    "marketing agreement",
    "non-exclusive",
    "signature document",
    "signature form",
    "template 09",
    "template 10",
    "template 11",
    "template 15",
  ];
  
  return docxKeywords.some(keyword => allMessages.includes(keyword));
}

/**
 * Creates a DOCX file from AI response content
 */
export async function createDocxFile(content: string, _filename: string = "document.docx"): Promise<Uint8Array> {
  try {
    // Check if this is a Reservation Agreement - use specialized template
    const isReservationAgreement = content.toLowerCase().includes("property reservation agreement") ||
      content.toLowerCase().includes("reservation agreement") ||
      (content.toLowerCase().includes("property reservation") && content.toLowerCase().includes("prospective buyer"));

    // Check if this is a Marketing Agreement - use specialized template (NO LOGO)
    // IMPORTANT: Do NOT match registration templates that mention CSC Zyprus + seller
    const contentLower = content.toLowerCase();
    const isMarketingAgreement = (contentLower.includes("marketing agreement") && !contentLower.includes("subject:") && !/Dear\s+X{6,}/i.test(content)) ||
      (contentLower.includes("non-exclusive") && contentLower.includes("agreement") && !contentLower.includes("subject:")) ||
      (contentLower.includes("terms and conditions for property listing") && contentLower.includes("representation"));

    // Use specialized Reservation Agreement template
    if (isReservationAgreement) {
      logger.debug("[DOCX] Detected Reservation Agreement - using specialized template", { category: LogCategory.GENERAL });

      // SAFEGUARD: Detect if AI incorrectly wrote legal text instead of just data fields
      // These phrases should NEVER appear in AI output - they're in our template, not AI's
      const forbiddenPhrases = [
        "non-refundable, except",
        "taken off the market",
        "escrow agent",
        "reservation period",
        "clean land registry search",
        "encumbrances",
        "fails to materialize",
        "buyer's exclusive fault",
        "50% to the vendor",
        "determining who is at fault",
        "for the entire duration",
        "directly and/or indirectly, advertise",
      ];

      const aiWroteLegalText = forbiddenPhrases.some(phrase =>
        contentLower.includes(phrase.toLowerCase())
      );

      if (aiWroteLegalText) {
        logger.warn("[DOCX] AI incorrectly wrote legal text - stripping and using template", {
          category: LogCategory.GENERAL,
          hint: "AI should only output data fields, not legal paragraphs"
        });
      }

      const parsedData = parseReservationAgreementData(content);
      if (parsedData) {
        logger.debug("[DOCX] Successfully parsed reservation agreement data", { category: LogCategory.GENERAL });
        const doc = createReservationAgreement(parsedData);
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      } else {
        // CRITICAL FIX: Even if parsing fails, use blank template with placeholders
        // NEVER fall back to generic DOCX (which would render AI's potentially wrong text)
        logger.warn("[DOCX] Failed to parse reservation agreement data - using template with placeholders", { category: LogCategory.GENERAL });

        // Try to extract Loan/VAT flags even if full parsing failed
        let hasLoanClause = false;
        let hasVatClause = false;
        const commentMatch = contentLower.match(/<!--[^>]*?loan[:\s]*(yes|no)[^>]*?vat[:\s]*(yes|no)[^>]*?-->/i);
        if (commentMatch) {
          hasLoanClause = /yes/i.test(commentMatch[1]);
          hasVatClause = /yes/i.test(commentMatch[2]);
        }

        // Use blank template with correct legal clauses
        const blankData = createBlankReservationAgreementData();
        blankData.hasLoanClause = hasLoanClause;
        blankData.hasVatClause = hasVatClause;

        const doc = createReservationAgreement(blankData);
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      }
    }

    // Use specialized Marketing Agreement template (NO LOGO - NEVER fall back to generic)
    if (isMarketingAgreement) {
      logger.debug("[DOCX] Detected Marketing Agreement - using specialized template (no logo)", { category: LogCategory.GENERAL });
      // Extract agent name from content if available
      const agentMatch = content.match(/represented by\s+([A-Za-z\s]+?)(?:\.|,|\n)/i);
      const agentName = agentMatch ? agentMatch[1].trim() : "Charalambos Pitros";

      const parsedData = parseMarketingAgreementData(content, agentName);
      if (parsedData) {
        logger.debug("[DOCX] Successfully parsed marketing agreement data", { category: LogCategory.GENERAL });
        const doc = createMarketingAgreement(parsedData);
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      } else {
        // CRITICAL FIX: Even if parsing fails, use clean template with placeholders
        // NEVER fall back to generic DOCX (which adds logo)
        logger.warn("[DOCX] Failed to parse marketing agreement data - using template with placeholders (no logo)", { category: LogCategory.GENERAL });
        const fallbackData = {
          agreementDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          sellerFullName: "[Seller's Name]",
          propertyRegistration: "[Property Registration]",
          marketingPrice: "[Price]",
          agentName: agentName,
        };
        const doc = createMarketingAgreement(fallbackData);
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      }
    }

    // Check if this is a Viewing Form - use specialized templates
    const isViewingForm = contentLower.includes("viewing form") ||
      (contentLower.includes("herein, i") && contentLower.includes("confirm that") && contentLower.includes("registry details"));

    if (isViewingForm) {
      logger.debug("[DOCX] Detected Viewing Form - using specialized template", { category: LogCategory.GENERAL });

      // Determine if it's advanced (has legal text OR title says "advanced" OR mentions "digitally")
      const isAdvanced = contentLower.includes("exclusive representative") ||
        contentLower.includes("liability") ||
        contentLower.includes("bypassing our agency") ||
        contentLower.includes("commission fee") ||
        contentLower.includes("advanced viewing") ||
        contentLower.includes("viewing and/or digitally");

      // Try advanced form first (has legal paragraph)
      if (isAdvanced) {
        const parsedAdvanced = parseViewingFormAdvancedData(content);
        if (parsedAdvanced) {
          logger.debug(`[DOCX] Parsed advanced viewing form with ${parsedAdvanced.persons.length} person(s)`, { category: LogCategory.GENERAL });
          const doc = createViewingFormAdvanced(parsedAdvanced, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
          const buffer = await Packer.toBuffer(doc);
          return new Uint8Array(buffer);
        }
        // Advanced parsing failed — try multiple parser but still use advanced template
        const parsedMultiAdvanced = parseViewingFormMultipleData(content);
        if (parsedMultiAdvanced && parsedMultiAdvanced.persons.length > 0) {
          logger.debug(`[DOCX] Using advanced template with ${parsedMultiAdvanced.persons.length} person(s) from multiple parser`, { category: LogCategory.GENERAL });
          const doc = createViewingFormAdvanced({
            date: parsedMultiAdvanced.date,
            persons: parsedMultiAdvanced.persons,
            property: parsedMultiAdvanced.property,
          }, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
          const buffer = await Packer.toBuffer(doc);
          return new Uint8Array(buffer);
        }
      }

      // Try multiple persons form (standard only)
      const parsedMultiple = parseViewingFormMultipleData(content);
      if (parsedMultiple && parsedMultiple.persons.length > 1) {
        logger.debug(`[DOCX] Parsed multiple viewing form with ${parsedMultiple.persons.length} persons`, { category: LogCategory.GENERAL });
        const doc = createViewingFormMultiple(parsedMultiple, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      }

      // Try single person form
      const parsedSingle = parseViewingFormSingleData(content);
      if (parsedSingle) {
        logger.debug("[DOCX] Parsed single viewing form", { category: LogCategory.GENERAL });
        const doc = createViewingFormSingle(parsedSingle, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      }

      // CRITICAL FIX: Never fall back to generic DOCX for viewing forms
      // Use blank template instead to prevent AI's raw text from being rendered
      logger.warn("[DOCX] Failed to parse viewing form data - using blank template instead of generic DOCX", { category: LogCategory.GENERAL });

      // Try to extract date from content
      const dateMatch = content.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const extractedDate = dateMatch ? dateMatch[1] : undefined;

      if (isAdvanced) {
        const blankAdvanced = createBlankViewingFormAdvancedData(extractedDate);
        const doc = createViewingFormAdvanced(blankAdvanced, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      } else {
        const blankSingle = createBlankViewingFormData(extractedDate);
        const doc = createViewingFormSingle(blankSingle, DECODED_VIEWING_FORM_LOGO || undefined, "jpg");
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      }
    }

    const paragraphs: Paragraph[] = [];

    // Add logo if available (skip for Reservation Agreements - they have NO logo per reference templates)
    if (DECODED_LOGO && DECODED_LOGO.length > 0 && !isReservationAgreement) {
      try {
        paragraphs.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: DECODED_LOGO,
                transformation: {
                  width: 120,
                  height: 120,
                },
                type: "jpg",
              }),
            ],
            alignment: AlignmentType.LEFT,
            spacing: { after: 400 },
          })
        );
      } catch (imageError) {
        logger.warn("[DOCX] Error adding image", { category: LogCategory.GENERAL, error: String(imageError) });
      }
    }
    
    // Process content lines (strip HTML comments like <!-- Loan: No, VAT: No -->)
    const lines = content.replace(/<!--[\s\S]*?-->/g, '').split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        paragraphs.push(new Paragraph({ text: "" }));
        continue;
      }
      
      // Handle bold text (**text**)
      const parts: TextRun[] = [];
      const boldRegex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      
      while ((match = boldRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          const beforeText = line.substring(lastIndex, match.index);
          if (beforeText) {
            parts.push(new TextRun({
              text: beforeText,
              font: FONTS.PRIMARY,
              size: FONTS.SIZES.BODY,
            }));
          }
        }
        parts.push(new TextRun({
          text: match[1],
          bold: true,
          font: FONTS.PRIMARY,
          size: FONTS.SIZES.BODY,
        }));
        lastIndex = match.index + match[0].length;
      }
      
      if (lastIndex < line.length) {
        const remainingText = line.substring(lastIndex);
        if (remainingText) {
          parts.push(new TextRun({
            text: remainingText,
            font: FONTS.PRIMARY,
            size: FONTS.SIZES.BODY,
          }));
        }
      }
      
      if (parts.length === 0) {
        parts.push(new TextRun({
          text: line,
          font: FONTS.PRIMARY,
          size: FONTS.SIZES.BODY,
        }));
      }
      
      paragraphs.push(new Paragraph({ children: parts }));
    }
    
    // Create document
    const doc = new Document({
      sections: [{
        children: paragraphs,
      }],
    });
    
    const buffer = await Packer.toBuffer(doc);
    return new Uint8Array(buffer);
    
  } catch (error) {
    logger.error("[DOCX] Error creating file", error instanceof Error ? error : new Error(String(error)), { category: LogCategory.GENERAL });
    // Minimal fallback
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${content.split('\n').map(line => 
      line.trim() ? `<w:p><w:r><w:t>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>` : '<w:p/>'
    ).join('')}
  </w:body>
</w:document>`;
    return new TextEncoder().encode(fallbackXml);
  }
}

