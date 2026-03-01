/**
 * Structured logger with PII redaction for Sophia WhatsApp Bot
 *
 * Features:
 * - PII redaction (phone numbers, emails)
 * - Structured JSON output for log analysis
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Context support for operation tracking
 * - Correlation IDs for request tracing
 * - Category-based filtering for subsystems
 * - Error classification for diagnostics
 */

import { getContext } from "./context.ts";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export enum LogCategory {
  WEBHOOK = "webhook",
  TOOL = "tool",
  ZYPRUS = "zyprus",
  IMAGE = "image",
  AI = "ai",
  DATABASE = "database",
  CACHE = "cache",
  GENERAL = "general",
}

export enum ErrorCategory {
  NETWORK = "network",
  AUTH = "auth",
  VALIDATION = "validation",
  AI = "ai",
  DATABASE = "database",
  UNKNOWN = "unknown",
}

export interface LogContext {
  operation?: string;
  messageId?: string;
  userId?: string;
  duration?: number;
  correlationId?: string;
  category?: LogCategory;
  errorCategory?: ErrorCategory;
  [key: string]: unknown;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  correlationId: string;
  category?: LogCategory;
  errorCategory?: ErrorCategory;
  [key: string]: unknown;
}

class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  /**
   * Redacts PII from strings and objects
   */
  private redactPII(data: unknown): unknown {
    if (typeof data === "string") {
      // Redact phone numbers (E.164 and common formats)
      let redacted = data.replace(/\+?\d{10,15}/g, "[PHONE_REDACTED]");
      // Redact email addresses
      redacted = redacted.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        "[EMAIL_REDACTED]"
      );
      return redacted;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.redactPII(item));
    }

    if (data !== null && typeof data === "object") {
      const redactedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Fully redact sensitive field values
        if (
          key.toLowerCase().includes("phone") ||
          key.toLowerCase().includes("email") ||
          key.toLowerCase() === "from" ||
          key.toLowerCase() === "to" ||
          key.toLowerCase() === "remotejid" ||
          key.toLowerCase() === "userid" ||
          key.toLowerCase() === "user_id"
        ) {
          redactedObj[key] = "[REDACTED]";
        } else {
          redactedObj[key] = this.redactPII(value);
        }
      }
      return redactedObj;
    }

    return data;
  }

  /**
   * Formats a log entry as JSON
   */
  private formatEntry(
    level: string,
    message: string,
    context?: LogContext,
    error?: Error
  ): string {
    // Get correlation ID from context or request context
    const requestContext = getContext();
    const correlationId =
      context?.correlationId || requestContext.correlationId;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (context) {
      const redactedContext = this.redactPII(context) as Record<
        string,
        unknown
      >;
      Object.assign(entry, redactedContext);
    }

    if (error) {
      entry.errorMessage = error.message;
      entry.errorName = error.name;
      // Don't include stack traces in production logs

      // Auto-classify errors if not explicitly provided
      if (!entry.errorCategory) {
        entry.errorCategory = this.classifyError(error);
      }
    }

    return JSON.stringify(entry);
  }

  /**
   * Classify errors by type
   */
  private classifyError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network errors
    if (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      name.includes("fetch")
    ) {
      return ErrorCategory.NETWORK;
    }

    // Auth errors
    if (
      message.includes("unauthorized") ||
      message.includes("forbidden") ||
      message.includes("authentication") ||
      message.includes("401") ||
      message.includes("403")
    ) {
      return ErrorCategory.AUTH;
    }

    // Validation errors
    if (
      message.includes("validation") ||
      message.includes("invalid") ||
      message.includes("required") ||
      message.includes("missing") ||
      name.includes("validation")
    ) {
      return ErrorCategory.VALIDATION;
    }

    // AI errors
    if (
      message.includes("anthropic") ||
      message.includes("claude") ||
      message.includes("ai") ||
      message.includes("model")
    ) {
      return ErrorCategory.AI;
    }

    // Database errors
    if (
      message.includes("database") ||
      message.includes("query") ||
      message.includes("supabase") ||
      message.includes("postgres")
    ) {
      return ErrorCategory.DATABASE;
    }

    return ErrorCategory.UNKNOWN;
  }

  debug(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(this.formatEntry("DEBUG", message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.INFO) {
      console.log(this.formatEntry("INFO", message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(this.formatEntry("WARN", message, context));
    }
  }

  error(message: string, error?: Error, context?: LogContext): void {
    console.error(this.formatEntry("ERROR", message, context, error));
  }
}

// Export singleton instance with INFO level by default
// Can be configured via environment variable in production
const logLevelStr = Deno.env.get("LOG_LEVEL") || "INFO";
const logLevel =
  LogLevel[logLevelStr as keyof typeof LogLevel] ?? LogLevel.INFO;

export const logger = new Logger(logLevel);
