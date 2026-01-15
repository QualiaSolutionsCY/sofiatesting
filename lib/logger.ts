/**
 * Structured Logger
 *
 * Provides consistent logging across the application with:
 * - JSON format in production for log aggregation
 * - Human-readable format in development
 * - Context metadata support
 * - Log levels: debug, info, warn, error
 *
 * Usage:
 * ```typescript
 * import { logger } from "@/lib/logger";
 *
 * logger.info("User logged in", { userId: "123", method: "email" });
 * logger.error("Database connection failed", new Error("timeout"));
 * logger.warn("Rate limit approaching", { remaining: 10, limit: 100 });
 * ```
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: number;
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
  [key: string]: unknown;
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Format log entry for output
 */
const formatLogEntry = (
  level: LogLevel,
  msg: string,
  meta?: LogMeta,
  error?: Error
): string => {
  const entry: LogEntry = {
    level,
    msg,
    ts: Date.now(),
    ...meta,
  };

  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  if (isProduction) {
    // JSON format for production (log aggregation friendly)
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const timestamp = new Date().toISOString().substring(11, 23);
  const levelStr = level.toUpperCase().padEnd(5);
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  const errorStr = error ? ` | Error: ${error.message}` : "";

  return `[${timestamp}] ${levelStr} ${msg}${metaStr}${errorStr}`;
};

/**
 * Structured logger with context support
 */
export const logger = {
  /**
   * Debug level - verbose information for debugging
   * Only logged in development or when DEBUG=true
   */
  debug: (msg: string, meta?: LogMeta): void => {
    if (isProduction && !process.env.DEBUG) return;
    console.debug(formatLogEntry("debug", msg, meta));
  },

  /**
   * Info level - general operational information
   */
  info: (msg: string, meta?: LogMeta): void => {
    console.info(formatLogEntry("info", msg, meta));
  },

  /**
   * Warn level - potentially problematic situations
   */
  warn: (msg: string, meta?: LogMeta): void => {
    console.warn(formatLogEntry("warn", msg, meta));
  },

  /**
   * Error level - error conditions with optional Error object
   */
  error: (msg: string, error?: Error | unknown, meta?: LogMeta): void => {
    const err = error instanceof Error ? error : undefined;
    const extraMeta = error && !(error instanceof Error) ? { errorData: error } : {};
    console.error(formatLogEntry("error", msg, { ...meta, ...extraMeta }, err));
  },

  /**
   * Create a child logger with preset context
   * Useful for module-specific logging
   */
  child: (context: LogMeta) => ({
    debug: (msg: string, meta?: LogMeta) =>
      logger.debug(msg, { ...context, ...meta }),
    info: (msg: string, meta?: LogMeta) =>
      logger.info(msg, { ...context, ...meta }),
    warn: (msg: string, meta?: LogMeta) =>
      logger.warn(msg, { ...context, ...meta }),
    error: (msg: string, error?: Error | unknown, meta?: LogMeta) =>
      logger.error(msg, error, { ...context, ...meta }),
  }),
};

/**
 * Create a logger for a specific module
 *
 * @example
 * const log = createModuleLogger("WhatsApp");
 * log.info("Message received", { from: phoneNumber });
 */
export const createModuleLogger = (module: string) =>
  logger.child({ module });

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  whatsapp: createModuleLogger("WhatsApp"),
  telegram: createModuleLogger("Telegram"),
  ai: createModuleLogger("AI"),
  db: createModuleLogger("Database"),
  zyprus: createModuleLogger("ZyprusAPI"),
  auth: createModuleLogger("Auth"),
};
