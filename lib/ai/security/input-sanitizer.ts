/**
 * Input Sanitizer - Prompt Injection Detection and Prevention
 *
 * Provides security measures against prompt injection attacks by:
 * - Detecting suspicious patterns in user input
 * - Sanitizing potentially harmful content
 * - Logging security events for monitoring
 *
 * Note: This is a defense-in-depth measure. The AI model's system prompt
 * should also include instructions to ignore manipulation attempts.
 */

import { logger } from "@/lib/logger";

/**
 * Patterns that may indicate prompt injection attempts
 * These are common attack vectors for LLM manipulation
 */
const SUSPICIOUS_PATTERNS = [
  // Instruction override attempts
  /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /forget\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /disregard\s+(?:all\s+)?(?:previous\s+)?instructions/i,
  /override\s+(?:your\s+)?instructions/i,

  // Role manipulation
  /you\s+are\s+now\s+(?:a|an)/i,
  /pretend\s+(?:you\s+are|to\s+be)/i,
  /act\s+as\s+(?:if|a|an)/i,
  /roleplay\s+as/i,

  // System prompt extraction
  /(?:what|show|reveal|display)\s+(?:is\s+)?(?:your\s+)?system\s+prompt/i,
  /(?:what|show|reveal)\s+(?:are\s+)?your\s+instructions/i,
  /(?:print|output|display)\s+(?:your\s+)?(?:initial\s+)?prompt/i,

  // Jailbreak keywords
  /\bDAN\b/, // "Do Anything Now" jailbreak
  /\bjailbreak\b/i,
  /\bdev\s*mode\b/i,
  /\bdeveloper\s*mode\b/i,

  // Code injection attempts
  /```(?:system|admin|root)/i,
  /<\/?(?:script|system|admin|prompt)>/i,

  // Direct command injection
  /(?:execute|run|eval)\s*\(/i,
  /\$\{.*\}/,  // Template literal injection
];

/**
 * Patterns that are definitely malicious (higher confidence)
 */
const HIGH_CONFIDENCE_PATTERNS = [
  /ignore\s+all\s+previous\s+instructions/i,
  /you\s+are\s+now\s+DAN/i,
  /jailbreak/i,
  /reveal\s+(?:your\s+)?system\s+prompt/i,
];

export type InjectionSeverity = "low" | "medium" | "high";

export interface InjectionDetectionResult {
  detected: boolean;
  severity: InjectionSeverity;
  matchedPatterns: string[];
  sanitizedInput?: string;
}

/**
 * Detect potential prompt injection attempts in user input
 *
 * @param input - The user's raw input
 * @returns Detection result with severity and matched patterns
 */
export const detectPromptInjection = (
  input: string
): InjectionDetectionResult => {
  const matchedPatterns: string[] = [];
  let severity: InjectionSeverity = "low";

  // Check high-confidence patterns first
  for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
    if (pattern.test(input)) {
      matchedPatterns.push(pattern.source);
      severity = "high";
    }
  }

  // Check other suspicious patterns
  if (severity !== "high") {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(input)) {
        matchedPatterns.push(pattern.source);
        severity = matchedPatterns.length >= 2 ? "medium" : "low";
      }
    }
  }

  const detected = matchedPatterns.length > 0;

  if (detected) {
    logger.warn("Potential prompt injection detected", {
      severity,
      patternCount: matchedPatterns.length,
      inputLength: input.length,
      inputPreview: input.substring(0, 100),
    });
  }

  return {
    detected,
    severity,
    matchedPatterns,
  };
};

/**
 * Sanitize user input by removing potentially harmful content
 *
 * @param input - The user's raw input
 * @returns Sanitized input string
 */
export const sanitizeUserInput = (input: string): string => {
  return (
    input
      // Remove HTML/XML tags
      .replace(/<[^>]*>/g, "")
      // Remove null bytes
      .replace(/\x00/g, "")
      // Remove control characters (except newlines and tabs)
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      // Trim
      .trim()
  );
};

/**
 * Process user input with security checks
 *
 * @param input - The user's raw input
 * @param options - Processing options
 * @returns Processed result with detection info and sanitized input
 */
export const processSecureInput = (
  input: string,
  options: {
    sanitize?: boolean;
    blockHighSeverity?: boolean;
  } = {}
): {
  input: string;
  detection: InjectionDetectionResult;
  blocked: boolean;
} => {
  const { sanitize = true, blockHighSeverity = false } = options;

  const detection = detectPromptInjection(input);
  const blocked = blockHighSeverity && detection.severity === "high";

  const processedInput = sanitize ? sanitizeUserInput(input) : input;

  if (blocked) {
    logger.error("Blocked high-severity prompt injection attempt", undefined, {
      inputPreview: input.substring(0, 100),
      patterns: detection.matchedPatterns,
    });
  }

  return {
    input: blocked ? "" : processedInput,
    detection,
    blocked,
  };
};

/**
 * Quick check for obvious injection attempts
 * Use this for fast filtering before more expensive operations
 *
 * @param input - The user's input
 * @returns true if input appears suspicious
 */
export const isSuspiciousInput = (input: string): boolean => {
  return HIGH_CONFIDENCE_PATTERNS.some((pattern) => pattern.test(input));
};
