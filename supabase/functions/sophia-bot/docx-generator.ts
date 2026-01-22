/**
 * DOCX Generator
 *
 * Generates professional DOCX documents from AI responses.
 * Only 5 specific templates generate DOCX files:
 * - Standard Viewing Form (Template 09)
 * - Advanced Viewing Form (Template 10)
 * - Property Reservation Form (Template 11)
 * - Property Reservation Agreement (Template 12)
 * - Non-Exclusive Marketing Agreement (Template 15)
 */

import { Document, Packer, Paragraph, ImageRun, TextRun, AlignmentType } from "https://esm.sh/docx@8.5.0";
import { ZYPRUS_LOGO_BASE64 } from "./prompts.ts";
import { isRequestingInformation, containsPlaceholders } from "./utils/field-validator.ts";

/**
 * DOCX Template Titles - Only these generate DOCX files
 */
const DOCX_TEMPLATE_TITLES = [
  "viewing form",
  "standard viewing form",
  "advanced viewing form",
  "advanced viewing/introduction form",
  "property reservation form",
  "property reservation agreement",
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
      console.log("No logo data available");
      return null;
    }
    const binaryString = atob(ZYPRUS_LOGO_BASE64);
    const array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      array[i] = binaryString.charCodeAt(i);
    }
    console.log("Pre-decoded Zyprus logo at module initialization");
    return array;
  } catch (error) {
    console.warn("Failed to pre-decode logo at module init:", error);
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
 * Check if response has document-like structure
 * This helps detect partial documents or documents with slightly different formatting
 */
function hasDocumentStructure(response: string): boolean {
  const text = response.toLowerCase();
  
  // Count document structure indicators
  let indicators = 0;
  
  // Bold headers (markdown format)
  const boldHeaderCount = (response.match(/\*\*[A-Z][^*]+\*\*/g) || []).length;
  if (boldHeaderCount >= 2) indicators++;
  
  // Field labels (Name:, Date:, Property:, etc.)
  const fieldLabelCount = (response.match(/\b(Name|Date|Property|Phone|Email|ID|Address|Client|Agent|Passport|Price|Amount):/gi) || []).length;
  if (fieldLabelCount >= 3) indicators++;
  
  // Document opening phrases
  const openingPhrases = [
    "herein, i",
    "i, the undersigned",
    "the undersigned",
    "i confirm that",
    "this agreement",
    "between the parties",
    "registration details",
    "property details",
    "client details",
    "personal details",
  ];
  for (const phrase of openingPhrases) {
    if (text.includes(phrase)) {
      indicators++;
      break;
    }
  }
  
  // Placeholder patterns (XXXXXXXX, [DATE], etc.)
  const placeholderCount = (response.match(/XXXXXXXX|\[DATE\]|\[PROPERTY\]|\[NAME\]|\[AMOUNT\]|\[PHONE\]|\[EMAIL\]/gi) || []).length;
  if (placeholderCount >= 2) indicators++;
  
  // Minimum length for document content
  if (response.length >= 500) indicators++;
  
  console.log(`[DOCX] Document structure indicators: ${indicators} (bold headers: ${boldHeaderCount}, field labels: ${fieldLabelCount}, placeholders: ${placeholderCount})`);
  
  // Need at least 2 indicators to be considered a document
  return indicators >= 2;
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
  console.log(`[DOCX] Checking response (length: ${aiResponse.length})`);

  // NEW: Check if this is a confirmation message (e.g., "I have sent...")
  // These should ALWAYS be text, never DOCX
  if (isConfirmationMessage(aiResponse)) {
    console.log("[DOCX] Response is a confirmation message -> TEXT");
    return false;
  }

  // NEW: Check if AI is requesting information first
  if (isRequestingInformation(aiResponse)) {
    console.log("[DOCX] Response is requesting information -> TEXT");
    return false;
  }

  // NEW: Check if response contains placeholders
  if (containsPlaceholders(aiResponse)) {
    console.log("[DOCX] Response contains placeholders -> TEXT");
    return false;
  }

  // Rule 1: Subject line = email = TEXT
  if (aiResponse.includes("Subject:")) {
    console.log("[DOCX] Has Subject: -> TEXT");
    return false;
  }

  // Rule 2: Check title
  const title = extractTemplateTitle(aiResponse);
  if (title) {
    console.log(`[DOCX] Extracted title: "${title}"`);
    if (isDocxTemplateTitle(title)) {
      // Even with matching title, check if it's requesting information
      if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
        console.log(`[DOCX] Title matches but requesting info/has placeholders -> TEXT`);
        return false;
      }
      console.log(`[DOCX] Title "${title}" matches and has complete data -> DOCX`);
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
      console.log("[DOCX] Viewing form pattern but requesting info/has placeholders -> TEXT");
      return false;
    }
    console.log("[DOCX] Viewing form pattern with complete data -> DOCX");
    return true;
  }

  // Reservation Form detection - multiple patterns
  const reservationPatterns = [
    firstPart.includes("property reservation form"),
    firstPart.includes("reservation agreement"),
    firstPart.includes("reservation form") && firstPart.includes("property"),
    firstPart.includes("reserve") && firstPart.includes("property") && aiResponse.length > 500,
  ];
  if (reservationPatterns.some(p => p)) {
    // Check if it's actually requesting form information
    if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
      console.log("[DOCX] Reservation form pattern but requesting info/has placeholders -> TEXT");
      return false;
    }
    console.log("[DOCX] Reservation form pattern with complete data -> DOCX");
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
      console.log("[DOCX] Marketing agreement pattern but requesting info/has placeholders -> TEXT");
      return false;
    }
    console.log("[DOCX] Marketing agreement pattern with complete data -> DOCX");
    return true;
  }

  // EARLY EXIT: If asking for information, ALWAYS return TEXT
  if (firstPart.includes("please provide") || firstPart.includes("i need the following") || firstPart.includes("which type")) {
    console.log("[DOCX] Contains 'please provide' or question -> TEXT");
    return false;
  }

  // Rule 4: Check for document structure (more lenient detection)
  // Only if the response is substantial enough to be a document
  if (aiResponse.length >= 500 && hasDocumentStructure(aiResponse)) {
    // Additional check: make sure it looks like one of our DOCX templates
    const lowerResponse = aiResponse.toLowerCase();
    const isDocxRelated = ["viewing", "reservation", "form", "marketing agreement"].some((keyword) =>
      lowerResponse.includes(keyword)
    );

    if (isDocxRelated) {
      // Final check for placeholders or information requests
      if (isRequestingInformation(aiResponse) || containsPlaceholders(aiResponse)) {
        console.log("[DOCX] Has document structure but requesting info/has placeholders -> TEXT");
        return false;
      }
      console.log("[DOCX] Has document structure + DOCX keywords + complete data -> DOCX");
      return true;
    }
  }

  // Default: TEXT
  console.log("[DOCX] No match -> TEXT");
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
    "reservation form",
    "reservation agreement",
    "marketing agreement",
    "non-exclusive",
    "signature document",
    "signature form",
    "template 09",
    "template 10",
    "template 11",
    "template 12",
    "template 15",
  ];
  
  return docxKeywords.some(keyword => allMessages.includes(keyword));
}

/**
 * Creates a DOCX file from AI response content
 */
export async function createDocxFile(content: string, _filename: string = "document.docx"): Promise<Uint8Array> {
  try {
    const paragraphs: Paragraph[] = [];
    
    // Add logo if available
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
        console.warn("[DOCX] Error adding image:", imageError);
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
    console.error("[DOCX] Error creating file:", error);
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

