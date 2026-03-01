/**
 * Input validation utilities for Sophia WhatsApp Bot
 *
 * Provides:
 * - Phone number validation (E.164 format)
 * - Message length validation
 * - Prompt injection detection and filtering
 */

/**
 * Validates phone number is in E.164 format
 * E.164: + followed by 8-15 digits
 */
export function validatePhoneNumber(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone);
}

/**
 * Validates message length is within acceptable bounds
 */
export function validateMessageLength(
  message: string,
  maxLength = 5000
): boolean {
  return message.length > 0 && message.length <= maxLength;
}

/**
 * Patterns that may indicate prompt injection attempts
 * These are common patterns used to try to manipulate AI behavior
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Instruction override attempts
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous\s+instructions/i,
  /override\s+(all\s+)?previous\s+instructions/i,

  // System prompt extraction attempts
  /reveal\s+(your\s+)?system\s+prompt/i,
  /show\s+(your\s+)?system\s+prompt/i,
  /what\s+(is\s+|are\s+)your\s+(initial\s+)?instructions/i,
  /print\s+(your\s+)?instructions/i,

  // Role manipulation attempts
  /you\s+are\s+now\s+a/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /act\s+as\s+(if\s+you\s+are|a)/i,
  /roleplay\s+as/i,

  // API key extraction attempts
  /reveal\s+(your\s+)?api\s*key/i,
  /show\s+(your\s+)?api\s*key/i,
  /what\s+(is\s+)?your\s+api\s*key/i,
  /print\s+(your\s+)?credentials/i,

  // Memory/context manipulation
  /forget\s+everything/i,
  /reset\s+(your\s+)?memory/i,
  /clear\s+(your\s+)?context/i,

  // Jailbreak patterns
  /\bDAN\b/i, // "Do Anything Now" jailbreak
  /developer\s+mode/i,
  /jailbreak/i,
];

/**
 * Checks if a message contains potential prompt injection patterns
 * Returns the matched pattern if found, null otherwise
 */
export function detectPromptInjection(message: string): RegExp | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Sanitizes user input by:
 * 1. Checking for prompt injection patterns (throws if found)
 * 2. Truncating to max length
 * 3. Basic normalization
 */
export function sanitizeUserInput(message: string, maxLength = 5000): string {
  // Check for prompt injection
  const injectionPattern = detectPromptInjection(message);
  if (injectionPattern) {
    throw new Error("Message contains prohibited content");
  }

  // Truncate to max length
  let sanitized = message.substring(0, maxLength);

  // Normalize whitespace (but preserve intentional newlines)
  sanitized = sanitized.replace(/\r\n/g, "\n"); // Normalize line endings
  sanitized = sanitized.replace(/[ \t]+/g, " "); // Collapse horizontal whitespace
  sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n"); // Limit consecutive newlines

  return sanitized.trim();
}

/**
 * Sanitize AI output before sending to WhatsApp.
 * Strips suspicious URLs and patterns that could indicate prompt injection
 * leaking through the AI's response. Non-destructive — only removes the
 * dangerous parts, leaves the rest of the message intact.
 */
export function sanitizeAiOutput(response: string): string {
  let sanitized = response;

  // Strip URLs that aren't from trusted domains
  // Trusted: zyprus.com, google.com (maps), whatsapp.com, supabase.co
  const urlRegex = /https?:\/\/[^\s)>\]]+/gi;
  sanitized = sanitized.replace(urlRegex, (url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const trusted = [
        "zyprus.com",
        "www.zyprus.com",
        "google.com",
        "www.google.com",
        "maps.google.com",
        "goo.gl",
        "whatsapp.com",
        "wa.me",
        "supabase.co",
      ];
      if (trusted.some((d) => hostname === d || hostname.endsWith("." + d))) {
        return url; // Keep trusted URLs
      }
      return "[link removed]";
    } catch {
      return "[link removed]";
    }
  });

  // Strip any leaked system prompt markers
  sanitized = sanitized.replace(/---\s*system\s*prompt\s*---/gi, "");
  sanitized = sanitized.replace(/\[SYSTEM\]/gi, "");

  // Strip instruction override language that shouldn't appear in output
  sanitized = sanitized.replace(
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    ""
  );
  sanitized = sanitized.replace(
    /disregard\s+(all\s+)?previous\s+instructions/gi,
    ""
  );

  return sanitized.trim();
}

/**
 * Validates webhook payload has expected structure
 * Returns true if payload appears to be a valid WaSend webhook
 */
export function validateWebhookPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const p = payload as Record<string, unknown>;

  // WaSend webhooks should have 'event' and 'data' fields
  // Or direct message fields for other formats
  return (
    (typeof p.event === "string" && typeof p.data === "object") ||
    typeof p.from === "string" ||
    typeof p.message === "object"
  );
}
