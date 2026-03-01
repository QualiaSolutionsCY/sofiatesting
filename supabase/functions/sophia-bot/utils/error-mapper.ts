/**
 * Error classification and user-friendly message mapping
 *
 * Features:
 * - Classifies errors by type (network, auth, validation, etc.)
 * - Maps technical errors to user-friendly messages
 * - No technical jargon exposed to end users
 * - Integrates with structured logger
 *
 * Usage:
 * ```typescript
 * try {
 *   await apiCall();
 * } catch (error) {
 *   const errorType = classifyError(error);
 *   const userMessage = getUserFriendlyMessage(errorType);
 *   // Send userMessage to user via WhatsApp
 * }
 * ```
 */

import { LogCategory, type LogContext, logger } from "./logger.ts";

/**
 * Error type classification
 * Extends ErrorCategory from logger.ts with additional types
 */
export enum ErrorType {
  /** Network errors (fetch failures, DNS, connection refused) */
  NETWORK = "network",
  /** Authentication errors (401, 403, token expired) */
  AUTH = "auth",
  /** Validation errors (400, 422, invalid input) */
  VALIDATION = "validation",
  /** Rate limiting (429, too many requests) */
  RATE_LIMIT = "rate_limit",
  /** Server errors (500-599, API unavailable) */
  SERVER = "server",
  /** Timeout errors (request/response timeout) */
  TIMEOUT = "timeout",
  /** AI model errors (context length, model unavailable) */
  AI = "ai",
  /** Database errors (Supabase, Postgres) */
  DATABASE = "database",
  /** Unknown/unclassifiable errors */
  UNKNOWN = "unknown",
}

/**
 * Classify an error by analyzing its type, status code, or message
 *
 * @param error - Error to classify (Error, Response, or HTTP status code)
 * @returns Classified error type
 */
export function classifyError(
  error: Error | Response | number | unknown
): ErrorType {
  // Handle HTTP status codes directly
  if (typeof error === "number") {
    return classifyHttpStatus(error);
  }

  // Handle Response objects
  if (error instanceof Response) {
    return classifyHttpStatus(error.status);
  }

  // Handle Error objects
  if (error instanceof Error) {
    return classifyErrorByMessage(error);
  }

  // Handle generic objects with status property
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return classifyHttpStatus(error.status);
  }

  return ErrorType.UNKNOWN;
}

/**
 * Classify error by HTTP status code
 */
function classifyHttpStatus(status: number): ErrorType {
  if (status === 401 || status === 403) {
    return ErrorType.AUTH;
  }

  if (status === 400 || status === 422) {
    return ErrorType.VALIDATION;
  }

  if (status === 408) {
    return ErrorType.TIMEOUT;
  }

  if (status === 429) {
    return ErrorType.RATE_LIMIT;
  }

  if (status >= 500 && status < 600) {
    return ErrorType.SERVER;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Classify error by analyzing error message and name
 */
function classifyErrorByMessage(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Timeout errors
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    name.includes("timeout")
  ) {
    return ErrorType.TIMEOUT;
  }

  // Network errors
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("dns") ||
    name.includes("fetch")
  ) {
    return ErrorType.NETWORK;
  }

  // Auth errors
  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("authentication") ||
    message.includes("token expired") ||
    message.includes("invalid token") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return ErrorType.AUTH;
  }

  // Validation errors
  if (
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("missing") ||
    message.includes("malformed") ||
    message.includes("bad request") ||
    name.includes("validation")
  ) {
    return ErrorType.VALIDATION;
  }

  // Rate limit errors
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return ErrorType.RATE_LIMIT;
  }

  // AI errors
  if (
    message.includes("anthropic") ||
    message.includes("claude") ||
    message.includes("openai") ||
    message.includes("gemini") ||
    message.includes("context length") ||
    message.includes("model") ||
    message.includes("ai")
  ) {
    return ErrorType.AI;
  }

  // Database errors
  if (
    message.includes("database") ||
    message.includes("query") ||
    message.includes("supabase") ||
    message.includes("postgres") ||
    message.includes("sql")
  ) {
    return ErrorType.DATABASE;
  }

  // Server errors (generic)
  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("server error")
  ) {
    return ErrorType.SERVER;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Get user-friendly error message for a classified error type
 *
 * @param errorType - Classified error type
 * @param context - Optional context to include in the message
 * @returns User-friendly error message (no technical jargon)
 */
export function getUserFriendlyMessage(
  errorType: ErrorType,
  context?: string
): string {
  switch (errorType) {
    case ErrorType.NETWORK:
      return "I'm having trouble connecting. Please try again in a moment.";

    case ErrorType.AUTH:
      return "There's an authentication issue. Please contact support.";

    case ErrorType.VALIDATION:
      return context
        ? `Some information was invalid. ${context}`
        : "Some information was invalid. Please check your input.";

    case ErrorType.RATE_LIMIT:
      return "Too many requests. Please wait a minute and try again.";

    case ErrorType.SERVER:
      return "The service is temporarily unavailable. Please try again shortly.";

    case ErrorType.TIMEOUT:
      return "The request took too long. Please try again.";

    case ErrorType.AI:
      return "I'm having trouble processing your request. Please try rephrasing.";

    case ErrorType.DATABASE:
      return "There's a database issue. Please try again.";

    case ErrorType.UNKNOWN:
    default:
      return "Something went wrong. Please try again or contact support.";
  }
}

/**
 * Log an error with automatic classification
 *
 * Classifies the error, logs it with appropriate category,
 * and includes classification in the log context.
 *
 * @param message - Log message
 * @param error - Error to classify and log
 * @param context - Additional context for logging
 */
export function logClassifiedError(
  message: string,
  error: Error,
  context?: LogContext
): void {
  const errorType = classifyError(error);

  // Map ErrorType to logger's ErrorCategory
  const errorCategory = errorType as string;

  logger.error(message, error, {
    ...context,
    category: context?.category || LogCategory.GENERAL,
    errorCategory,
    errorType,
  });
}
