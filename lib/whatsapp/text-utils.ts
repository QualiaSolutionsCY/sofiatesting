/**
 * WhatsApp Text Utilities
 * Pure functions for text processing that can be tested independently
 */

/**
 * Split email into subject, body, and notes for separate WhatsApp messages
 * - 1st message: Subject line
 * - 2nd message: Email body
 * - 3rd message: Warnings/notes (if any)
 */
export function splitEmailParts(text: string): {
  subject: string | null;
  body: string;
  notes: string | null;
} {
  let workingText = text;
  let subject: string | null = null;
  let notes: string | null = null;

  // Extract subject line
  const subjectMatch = workingText.match(
    /^(Subject:\s*[^\n]+)(?:\n\n|\n(?=Dear|Email Body))/im
  );
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
    workingText = workingText.replace(subjectMatch[0], "").trim();
  }

  // Remove "Email Body:" marker if present
  workingText = workingText.replace(/^Email Body:\s*/im, "").trim();

  // Extract notes/warnings from the end (look for lines starting with ⚠️, Note:, Warning:, Important:, etc.)
  const notePatterns = [
    /\n\n(⚠️[^\n]*(?:\n(?!Dear|Subject)[^\n]*)*)$/,
    /\n\n((?:Note|Warning|Important|Reminder|Please note|N\.B\.):\s*[^\n]*(?:\n(?!Dear|Subject)[^\n]*)*)$/i,
  ];

  for (const pattern of notePatterns) {
    const noteMatch = workingText.match(pattern);
    if (noteMatch) {
      notes = noteMatch[1].trim();
      workingText = workingText.replace(noteMatch[0], "").trim();
      break;
    }
  }

  return { subject, body: workingText, notes };
}

/**
 * Split subject line from email body for separate WhatsApp messages
 * @deprecated Use splitEmailParts instead for 3-part splitting
 */
export function splitSubjectFromBody(text: string): {
  subject: string | null;
  body: string;
} {
  const parts = splitEmailParts(text);
  // Combine body and notes for backward compatibility
  const body = parts.notes ? `${parts.body}\n\n${parts.notes}` : parts.body;
  return { subject: parts.subject, body };
}

/**
 * Format text for WhatsApp (plain text mode)
 */
export function formatForWhatsApp(text: string): string {
  let formatted = text;

  // WhatsApp supports basic markdown: *bold*, _italic_, ~strikethrough~, ```code```
  // Convert our markdown to WhatsApp format

  // Bold: **text** -> *text* (WhatsApp format)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Clean up multiple newlines
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  return formatted.trim();
}
