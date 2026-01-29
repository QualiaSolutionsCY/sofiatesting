/**
 * Structured Logger for SOFIA
 *
 * Provides consistent logging across the application with:
 * - Timestamps (ISO 8601)
 * - Categories/modules for filtering
 * - Structured data support
 * - Log levels: debug, info, warn, error
 *
 * Usage:
 *   import { createLogger } from "@/lib/logger";
 *   const logger = createLogger("module-name");
 *   logger.info("Message", { key: "value" });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
};

/**
 * Format error object for logging
 */
const formatError = (
  error: unknown
): { message: string; stack?: string; code?: string } | undefined => {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: String(error) };
};

/**
 * Serialize log entry for console output
 * In development: readable format
 * In production: JSON for log aggregation
 */
const serializeLogEntry = (entry: LogEntry): string => {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // Human-readable format for development
    const levelColors: Record<LogLevel, string> = {
      debug: "\x1b[90m", // gray
      info: "\x1b[36m", // cyan
      warn: "\x1b[33m", // yellow
      error: "\x1b[31m", // red
    };
    const reset = "\x1b[0m";
    const color = levelColors[entry.level];

    let output = `${color}[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]${reset} ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  // JSON format for production (easier to parse in log aggregation)
  return JSON.stringify(entry);
};

/**
 * Logger interface
 */
export type Logger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, errorOrContext?: unknown, context?: LogContext) => void;
  child: (subCategory: string) => Logger;
};

/**
 * Minimum log level (can be configured via env)
 */
const getMinLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  if (["debug", "info", "warn", "error"].includes(level)) {
    return level;
  }
  // Default: debug in development, info in production
  return process.env.NODE_ENV === "development" ? "debug" : "info";
};

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Create a logger instance for a specific category/module
 */
export const createLogger = (category: string): Logger => {
  const minLevel = getMinLevel();
  const minPriority = levelPriority[minLevel];

  const shouldLog = (level: LogLevel): boolean => {
    return levelPriority[level] >= minPriority;
  };

  const log = (
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      context,
      error: formatError(error),
    };

    const output = serializeLogEntry(entry);

    switch (level) {
      case "debug":
        // biome-ignore lint/suspicious/noConsole: Logger implementation
        console.debug(output);
        break;
      case "info":
        // biome-ignore lint/suspicious/noConsole: Logger implementation
        console.info(output);
        break;
      case "warn":
        // biome-ignore lint/suspicious/noConsole: Logger implementation
        console.warn(output);
        break;
      case "error":
        // biome-ignore lint/suspicious/noConsole: Logger implementation
        console.error(output);
        break;
    }
  };

  return {
    debug: (message: string, context?: LogContext) => {
      log("debug", message, context);
    },

    info: (message: string, context?: LogContext) => {
      log("info", message, context);
    },

    warn: (message: string, context?: LogContext) => {
      log("warn", message, context);
    },

    error: (
      message: string,
      errorOrContext?: unknown,
      context?: LogContext
    ) => {
      // Handle both logger.error("msg", error) and logger.error("msg", { key: val })
      if (
        errorOrContext instanceof Error ||
        (errorOrContext &&
          typeof errorOrContext === "object" &&
          "message" in errorOrContext &&
          "stack" in errorOrContext)
      ) {
        log("error", message, context, errorOrContext);
      } else if (errorOrContext && typeof errorOrContext === "object") {
        // It's a context object, not an error
        log("error", message, errorOrContext as LogContext);
      } else if (errorOrContext) {
        // It's some other value, treat as error
        log("error", message, context, errorOrContext);
      } else {
        log("error", message, context);
      }
    },

    child: (subCategory: string) => {
      return createLogger(`${category}:${subCategory}`);
    },
  };
};

/**
 * Pre-configured loggers for common modules
 */
export const logger = {
  db: createLogger("db"),
  api: createLogger("api"),
  auth: createLogger("auth"),
  ai: createLogger("ai"),
  telegram: createLogger("telegram"),
  whatsapp: createLogger("whatsapp"),
  zyprus: createLogger("zyprus"),
  storage: createLogger("storage"),
  circuit: createLogger("circuit-breaker"),
};

/**
 * Default export for simple usage
 */
export default createLogger;
