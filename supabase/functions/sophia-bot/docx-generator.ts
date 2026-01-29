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
import { ZYPRUS_LOGO_BASE64 } from "./prompts.ts";
import { isRequestingInformation, containsPlaceholders, isCompletedReservationAgreementDocument } from "./utils/field-validator.ts";
import {
  createReservationAgreement,
  parseReservationAgreementData,
} from "./docx/templates/index.ts";
import { logger, LogCategory } from "./utils/logger.ts";

/**
 * DOCX Template Titles - Only these generate DOCX files
 */
const DOCX_TEMPLATE_TITLES = [
  "viewing form",
  "standard viewing form",
  "advanced viewing form",
  "advanced viewing/introduction form",
  "property reservation agreement",
  "property reservation",
  "reservation agreement",
  "marketing agreement",
  "non-exclusive marketing agreement",
];

/**
 * Font settings
 */
const FONTS = {
  PRIMARY: "Calibri",
  SIZES: {
    BODY: 22,  // 11pt in half-points
    TITLE: 27, // 13.5pt
  },
};

/**
 * Checks if a response is a confirmation message (not actual document content)
 * These should ALWAYS be sent as text, never as DOCX
 */
function isConfirmationMessage(text: string): boolean {
  // Patterns that indicate this is a confirmation, not document content
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

  // If the message is short and contains confirmation patterns
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
 * PERFORMANCE: Pre-decode logo at module initialization (cold start)
 */
const DECODED_LOGO: Uint8Array | null = (() => {
  try {
    if (!ZYPRUS_LOGO_BASE64 || ZYPRUS_LOGO_BASE64.length === 0) {
      logger.debug("No logo data available", { category: LogCategory.GENERAL });
      return null;
    }
    const binaryString = atob(ZYPRUS_LOGO_BASE64);
    const array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      array[i] = binaryString.charCodeAt(i);
    }
    logger.debug("Pre-decoded Zyprus logo at module initialization", { category: LogCategory.GENERAL });
    return array;
  } catch (error) {
    logger.warn("Failed to pre-decode logo at module init", { category: LogCategory.GENERAL, error: String(error) });
    return null;
  }
})();

/**
 * Extract template title from AI response
 */
function extractTemplateTitle(response: string): string | null {
  const lines = response.trim().split('\n');
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for bold header: **Title**
    const boldMatch = line.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return boldMatch[1].trim();
    }
    
    // Check for plain title
    if (line.match(/^[A-Z][a-zA-Z\s\/\-]+$/) && line.length < 50) {
      return line;
    }
  }
  
  return null;
}

/**
 * Check if title matches a DOCX template
 */
function isDocxTemplateTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return DOCX_TEMPLATE_TITLES.some(t => normalized.includes(t));
}

/**
 * Check if response is a clarification question (asking user for info)
 * These should NEVER be sent as DOCX
 */
function isClarificationQuestion(response: string): boolean {
  // FIRST: Check if this is a completed reservation agreement - these should NOT be classified as clarifications
  if (isCompletedReservationAgreementDocument(response)) {
    logger.debug("[DOCX] Detected completed reservation agreement, not a clarification", { category: LogCategory.GENERAL });
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
        logger.debug(`[DOCX] Clarification detected: "${pattern}"`, { category: LogCategory.GENERAL });
        return true;
      }
    }
  }

  // Check for question marks in short responses
  const questionCount = (response.match(/\?/g) || []).length;
  if (questionCount >= 1 && response.length < 600) {
    logger.debug("[DOCX] Clarification detected: question mark in short response", { category: LogCategory.GENERAL });
    return true;
  }

  return false;
}

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
  logger.debug(`[DOCX] Checking response (length: ${aiResponse.length})`, { category: LogCategory.GENERAL });

  // STRICT CHECK 0: Short responses are NEVER DOCX
  if (aiResponse.length < 400) {
    logger.debug("[DOCX] Too short -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // STRICT CHECK 1: Clarification questions are NEVER DOCX
  if (isClarificationQuestion(aiResponse)) {
    logger.debug("[DOCX] Clarification question -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // STRICT CHECK 2: Confirmation messages are NEVER DOCX
  if (isConfirmationMessage(aiResponse)) {
    logger.debug("[DOCX] Response is a confirmation message -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // STRICT CHECK 3: Check if AI is requesting information first
  if (isRequestingInformation(aiResponse)) {
    logger.debug("[DOCX] Response is requesting information -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // NEW: Check if response contains placeholders
  if (containsPlaceholders(aiResponse)) {
    logger.debug("[DOCX] Response contains placeholders -> TEXT", { category: LogCategory.GENERAL });
    return false;
  }

  // Rule 1: Subject line = email = TEXT
  if (aiResponse.includes("Subject:")) {
    logger.debug("[DOCX] Has Subject: -> TEXT", { category: LogCategory.GENERAL });
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
  if (viewingFormPatterns.some(p => p)) {
    // Check if it's actually requesting form information
    if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
      logger.debug("[DOCX] Viewing form pattern but requesting info/has placeholders -> TEXT", { category: LogCategory.GENERAL });
      return false;
    }
    logger.debug("[DOCX] Viewing form pattern with complete data -> DOCX", { category: LogCategory.GENERAL });
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
  const marketingPatterns = [
    firstPart.includes("marketing agreement"),
    firstPart.includes("non-exclusive") && firstPart.includes("agreement"),
    firstPart.includes("between") && firstPart.includes("csc zyprus") && firstPart.includes("agent"),
    firstPart.includes("seller") && firstPart.includes("agent may advertise"),
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

    // Use specialized Reservation Agreement template
    if (isReservationAgreement) {
      logger.debug("[DOCX] Detected Reservation Agreement - using specialized template", { category: LogCategory.GENERAL });
      const parsedData = parseReservationAgreementData(content);
      if (parsedData) {
        logger.debug("[DOCX] Successfully parsed reservation agreement data", { category: LogCategory.GENERAL });
        const doc = createReservationAgreement(parsedData);
        const buffer = await Packer.toBuffer(doc);
        return new Uint8Array(buffer);
      } else {
        logger.warn("[DOCX] Failed to parse reservation agreement data - falling back to generic DOCX", { category: LogCategory.GENERAL });
      }
    }

    const paragraphs: Paragraph[] = [];

    // Add logo if available (Reservation Agreement already handled above with specialized template)
    if (DECODED_LOGO && DECODED_LOGO.length > 0) {
      try {
        paragraphs.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: DECODED_LOGO,
                transformation: {
                  width: 200,
                  height: 103,
                },
                type: "png",
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
    
    // Process content lines
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        paragraphs.push(new Paragraph({ text: "" }));
        continue;
      }
      
      // Handle bold text (**text**)
      const parts: TextRun[] = [];
      const boldRegex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;
      
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

