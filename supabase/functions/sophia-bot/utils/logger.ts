/**
 * Structured logger with PII redaction for Sophia WhatsApp Bot
 *
 * Features:
 * - PII redaction (phone numbers, emails)
 * - Structured JSON output for log analysis
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Context support for operation tracking
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  operation?: string;
  messageId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
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
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (context) {
      const redactedContext = this.redactPII(context) as Record<string, unknown>;
      Object.assign(entry, redactedContext);
    }

    if (error) {
      entry.errorMessage = error.message;
      entry.errorName = error.name;
      // Don't include stack traces in production logs
    }

    return JSON.stringify(entry);
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
const logLevel = LogLevel[logLevelStr as keyof typeof LogLevel] ?? LogLevel.INFO;

export const logger = new Logger(logLevel);

