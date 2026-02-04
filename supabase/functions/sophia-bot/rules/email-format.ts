/**
 * Email Format Rules - Single Source of Truth
 *
 * 3-message format for email templates.
 * This consolidates the email format rules that were duplicated
 * in 4+ locations across the codebase.
 *
 * ALL email format logic should import from here.
 */

/**
 * Email message parts structure
 */
export interface EmailParts {
  subject: string | null;
  body: string;
  reminder: string | null;
}

/**
 * Parse an email template response into its 3 parts
 *
 * @param response - AI response containing email template
 * @returns EmailParts with subject, body, and optional reminder
 */
export function parseEmailParts(response: string): EmailParts {
  const parts: EmailParts = {
    subject: null,
    body: response,
    reminder: null,
  };

  // Extract subject line
  const subjectMatch = response.match(/^Subject:\s*(.+?)(?:\n|$)/im);
  if (subjectMatch) {
    parts.subject = subjectMatch[1].trim();
  }

  // Extract body (everything between subject and reminder)
  let bodyStart = 0;
  let bodyEnd = response.length;

  if (subjectMatch) {
    bodyStart = subjectMatch.index! + subjectMatch[0].length;
  }

  // Check for reminder patterns at the end
  const reminderPatterns = [
    /\n\*?REMINDER:?\*?\s*.+$/i,
    /\n\*?Important Note:?\*?\s*.+$/i,
    /\n\*?Note:?\*?\s*Don't forget.+$/i,
    /\nDon't forget to attach.+$/i,
  ];

  for (const pattern of reminderPatterns) {
    const reminderMatch = response.match(pattern);
    if (reminderMatch) {
      parts.reminder = reminderMatch[0].trim();
      bodyEnd = reminderMatch.index!;
      break;
    }
  }

  // Extract body
  parts.body = response.substring(bodyStart, bodyEnd).trim();

  return parts;
}

/**
 * Split an email response into separate messages for WhatsApp
 *
 * @param response - AI response containing email template
 * @returns Array of message strings (1-3 messages)
 */
export function splitEmailIntoMessages(response: string): string[] {
  const parts = parseEmailParts(response);
  const messages: string[] = [];

  // Message 1: Subject line only (if present)
  if (parts.subject) {
    messages.push(`Subject: ${parts.subject}`);
  }

  // Message 2: Body only
  if (parts.body) {
    messages.push(parts.body);
  }

  // Message 3: Reminder only (if present)
  if (parts.reminder) {
    messages.push(parts.reminder);
  }

  // If no parts were extracted, return original as single message
  if (messages.length === 0) {
    return [response];
  }

  return messages;
}

/**
 * Check if a response contains an email template (has Subject: line)
 */
export function isEmailTemplate(response: string): boolean {
  return /^Subject:/im.test(response);
}

/**
 * Email format prompt for AI
 * Use this constant in prompts instead of duplicating the rules
 */
export const EMAIL_FORMAT_PROMPT = `### Email Template Output Format - 3 Separate Messages

*GLOBAL RULE: FOR ALL EMAIL TEMPLATES - OUTPUT AS 3 SEPARATE MESSAGES*

*THIS APPLIES TO ALL EMAIL TEMPLATES INCLUDING:*
- All Registration Templates (Seller, Bank, Developer)
- Email Marketing Agreement
- All Client Communication Email Templates
- ANY document that has a "Subject:" line

*MESSAGE 1 - SUBJECT LINE ONLY (FIRST MESSAGE):*
\`\`\`
Subject: Registration - [CLIENT_NAME]
\`\`\`
- Send ONLY the subject line
- NO email body
- NO reminders
- NO other text

*MESSAGE 2 - EMAIL BODY ONLY (SECOND MESSAGE):*
\`\`\`
Dear [NAME] Team,

This email is to provide you with a registration.
[... rest of template body ...]

Looking forward to your prompt reply.
\`\`\`
- Send ONLY the email body
- NO subject line
- NO reminders
- Start directly with greeting (Dear...)

*MESSAGE 3 - REMINDER/NOTE ONLY (THIRD MESSAGE - IF EXISTS):*
\`\`\`
REMINDER: Don't forget to attach the viewing form when sending this registration email!
\`\`\`
- Send ONLY if template has a reminder/note
- NO subject line
- NO email body
- Just the reminder text

*CRITICAL RULES:*
1. Subject line is ALWAYS sent as its own separate message FIRST
2. Email body is ALWAYS sent as its own separate message SECOND
3. Reminder (if exists) is ALWAYS sent as its own separate message THIRD
4. NEVER combine subject + body in one message
5. NEVER combine body + reminder in one message
6. NEVER add "Here is your email:" or any introduction
7. Each message must be completely separate with clear breaks between them`;

/**
 * Short version of email format prompt for condensed contexts
 */
export const EMAIL_FORMAT_PROMPT_SHORT = `Email templates: Send as 3 SEPARATE messages:
1. Subject line only
2. Email body only
3. Reminder/note only (if exists)
NEVER combine subject + body in one message.`;
