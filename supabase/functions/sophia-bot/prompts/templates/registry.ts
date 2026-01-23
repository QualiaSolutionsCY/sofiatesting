/**
 * Template Registry - Defines which templates are TEXT vs DOCX
 *
 * This is the single source of truth for template routing.
 * - TEXT templates: Sent as WhatsApp messages
 * - DOCX templates: Sent as file attachments
 */

/**
 * DOCX Templates - These are sent as file attachments
 * Only these 5 templates should generate DOCX files
 */
export const DOCX_TEMPLATE_TITLES = [
  // Viewing Forms (Templates 09-10)
  "Viewing Form", // Standard viewing form (single or multiple)
  "Standard Viewing Form",
  "Advanced Viewing Form",
  "Advanced Viewing/Introduction Form",

  // Reservation Forms (Templates 11-12)
  "Property Reservation Form",
  "Property Reservation Agreement",

  // Marketing Agreement (Template 15)
  "Marketing Agreement",
  "Non-Exclusive Marketing Agreement",
] as const;

/**
 * Template categories for organization
 */
export const TEMPLATE_CATEGORIES = {
  REGISTRATIONS: {
    name: "Registration Templates",
    templates: ["01", "02", "03", "04", "05", "06", "07", "08"],
    outputType: "TEXT" as const,
    description: "Seller, Bank, Developer registrations - sent as WhatsApp messages",
  },
  VIEWING_FORMS: {
    name: "Viewing Forms",
    templates: ["09", "10"],
    outputType: "DOCX" as const,
    description: "Standard and Advanced viewing forms - sent as DOCX files",
  },
  RESERVATIONS: {
    name: "Reservation Forms",
    templates: ["11", "12"],
    outputType: "DOCX" as const,
    description: "Property reservation forms and agreements - sent as DOCX files",
  },
  MARKETING_EMAIL: {
    name: "Email Marketing Agreement",
    templates: ["14"],
    outputType: "TEXT" as const,
    description: "Email marketing agreement - sent as WhatsApp message",
  },
  MARKETING_NON_EXCLUSIVE: {
    name: "Non-Exclusive Marketing Agreement",
    templates: ["15"],
    outputType: "DOCX" as const,
    description: "Non-exclusive marketing agreement for signature - sent as DOCX file",
  },
  CLIENT_COMMS: {
    name: "Client Communications",
    templates: ["17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28",
                "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43"],
    outputType: "TEXT" as const,
    description: "27 client communication templates - follow-ups, valuations, responses - sent as WhatsApp messages",
  },
} as const;

/**
 * Check if a response title/header indicates a DOCX template
 * This checks the FIRST LINE or HEADER of the AI response
 */
export function isDocxTemplateTitle(title: string): boolean {
  const normalizedTitle = title.toLowerCase().trim();
  
  return DOCX_TEMPLATE_TITLES.some(docxTitle => 
    normalizedTitle.includes(docxTitle.toLowerCase())
  );
}

/**
 * Extract the template title from an AI response
 * Looks for bold headers like **Viewing Form** or titles at the start
 */
export function extractTemplateTitle(response: string): string | null {
  const lines = response.trim().split('\n');
  
  // Check first few lines for a title
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check for bold header: **Title**
    const boldMatch = line.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return boldMatch[1].trim();
    }
    
    // Check for underlined title (common in DOCX forms)
    if (line.match(/^[A-Z][a-zA-Z\s\/\-]+$/) && line.length < 50) {
      return line;
    }
    
    // If first non-empty line doesn't look like a title, stop looking
    if (i === 0 && !line.startsWith('**') && !line.match(/^[A-Z]/)) {
      break;
    }
  }
  
  return null;
}

/**
 * Check if a response is a clarification question rather than actual document content
 */
function isClarificationQuestion(response: string): boolean {
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
    // NEW: Choice questions - asking user to pick between options
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
    " or the ", // "X or the Y?" pattern
  ];

  // Check if response is short and contains clarification patterns
  // Clarification responses are typically < 800 chars
  if (response.length < 800) {
    for (const pattern of clarificationPatterns) {
      if (lower.includes(pattern)) {
        console.log(`[Registry] Clarification detected: "${pattern}" in short response`);
        return true;
      }
    }
  }

  // Check for bullet points asking for info (common pattern)
  const bulletCount = (response.match(/[•\-\*]\s+/g) || []).length;
  const questionCount = (response.match(/\?/g) || []).length;

  // Multiple bullets + questions + short = definitely asking for info
  if (bulletCount >= 3 && questionCount >= 1 && response.length < 1000) {
    console.log(`[Registry] Clarification detected: ${bulletCount} bullets, ${questionCount} questions`);
    return true;
  }

  // NEW: Any question mark in a short response is likely a clarification
  if (questionCount >= 1 && response.length < 500) {
    console.log(`[Registry] Clarification detected: question mark in short response (${response.length} chars)`);
    return true;
  }

  return false;
}

/**
 * Minimum length for a real document (not a question or short response)
 */
const MIN_DOCX_LENGTH = 400;

/**
 * Determine if a response should be sent as DOCX based on its content
 * This is the main detection function used by the response router
 *
 * IMPORTANT: Only these templates should EVER be DOCX:
 * - Standard Viewing Form
 * - Advanced Viewing Form
 * - Property Reservation Form
 * - Property Reservation Agreement
 * - Non-Exclusive Marketing Agreement
 */
export function shouldSendAsDocx(response: string): boolean {
  // Rule 0: If it's a clarification question, NEVER send as DOCX
  if (isClarificationQuestion(response)) {
    console.log("[Registry] Clarification response -> TEXT");
    return false;
  }

  // Rule 1: If it has a Subject: line, it's an email template -> TEXT
  if (response.includes("Subject:")) {
    console.log("[Registry] Has Subject: line -> TEXT");
    return false;
  }

  // Rule 2: Response must be long enough to be a real document
  if (response.length < MIN_DOCX_LENGTH) {
    console.log(`[Registry] Too short for DOCX: ${response.length} < ${MIN_DOCX_LENGTH} -> TEXT`);
    return false;
  }

  // Rule 3: Extract title and check against DOCX templates
  const title = extractTemplateTitle(response);
  if (title && isDocxTemplateTitle(title)) {
    console.log(`[Registry] Title match: "${title}" -> DOCX`);
    return true;
  }

  // Rule 4: Check for specific DOCX template markers - must have document structure
  const firstPart = response.substring(0, 500).toLowerCase();
  const fullLower = response.toLowerCase();

  // Viewing Form detection - requires actual form content
  if (
    firstPart.includes("viewing form") &&
    (fullLower.includes("herein, i") || fullLower.includes("confirm that")) &&
    (fullLower.includes("id number") || fullLower.includes("passport") || fullLower.includes("signature"))
  ) {
    console.log("[Registry] Viewing Form content detected -> DOCX");
    return true;
  }

  // Reservation Form detection - requires actual form content
  if (
    (firstPart.includes("property reservation form") ||
      firstPart.includes("reservation agreement")) &&
    (fullLower.includes("buyer") || fullLower.includes("vendor") || fullLower.includes("deposit"))
  ) {
    console.log("[Registry] Reservation content detected -> DOCX");
    return true;
  }

  // Marketing Agreement detection (Non-Exclusive) - requires actual agreement content
  if (
    firstPart.includes("marketing agreement") &&
    fullLower.includes("non-exclusive") &&
    (fullLower.includes("between") || fullLower.includes("csc zyprus")) &&
    (fullLower.includes("owner") || fullLower.includes("agent") || fullLower.includes("property"))
  ) {
    console.log("[Registry] Marketing Agreement content detected -> DOCX");
    return true;
  }

  // Default: TEXT
  console.log("[Registry] No DOCX match -> TEXT");
  return false;
}

/**
 * Get the template type for a given template number
 */
export function getTemplateOutputType(templateNumber: string): "TEXT" | "DOCX" {
  const num = templateNumber.padStart(2, "0");

  // DOCX templates: 09, 10, 11, 12, 15
  if (["09", "10", "11", "12", "15"].includes(num)) {
    return "DOCX";
  }

  return "TEXT";
}

