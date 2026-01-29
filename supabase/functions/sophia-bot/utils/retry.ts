/**
 * Exponential backoff retry utility with jitter
 *
 * Features:
 * - Configurable max retries, base delay, max delay
 * - Jitter to prevent thundering herd
 * - Retryable status code detection (408, 429, 5xx)
 * - Network error detection
 * - Structured logging with correlation IDs
 *
 * Usage:
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.example.com'),
 *   { maxRetries: 3, baseDelayMs: 1000 },
 *   'fetch-example-api'
 * );
 * ```
 */

import { logger } from "./logger.ts";
import { LogCategory } from "./logger.ts";

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Random jitter in milliseconds (0 to this value) (default: 500) */
  jitterMs?: number;
  /** HTTP status codes that trigger retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterMs: 500,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Check if an error is retryable based on type and status
 */
export function isRetryableError(
  error: unknown,
  retryableStatuses: number[]
): boolean {
  // Network errors (fetch failures, timeouts, connection issues)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network-related error patterns
    if (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound") ||
      message.includes("socket hang up") ||
      message.includes("connection reset") ||
      name.includes("fetch") ||
      name.includes("timeout")
    ) {
      return true;
    }
  }

  // HTTP Response status codes
  if (error instanceof Response) {
    return retryableStatuses.includes(error.status);
  }

  // Generic object with status property
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return retryableStatuses.includes(error.status);
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add random jitter (0 to jitterMs)
  const jitter = Math.random() * jitterMs;

  return cappedDelay + jitter;
}

/**
 * Retry an async operation with exponential backoff
 *
 * @param operation - Async function to execute
 * @param config - Retry configuration
 * @param operationName - Name for logging purposes
 * @returns Result of the operation
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: RetryConfig,
  operationName = "operation"
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    jitterMs,
    retryableStatuses,
  } = finalConfig;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Attempt the operation
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt
      const isLastAttempt = attempt === maxRetries;

      // Check if error is retryable
      const shouldRetry = isRetryableError(error, retryableStatuses);

      if (!shouldRetry || isLastAttempt) {
        // Don't retry - throw the error
        throw error;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(
        attempt,
        baseDelayMs,
        maxDelayMs,
        jitterMs
      );

      // Log retry attempt
      logger.warn(`Retry attempt for ${operationName}`, {
        category: LogCategory.GENERAL,
        operation: operationName,
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delayMs),
        errorMessage:
          error instanceof Error ? error.message : String(error),
      });

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}
