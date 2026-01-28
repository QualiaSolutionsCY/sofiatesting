/**
 * Request context propagation for correlation IDs and request-scoped data
 *
 * Uses AsyncLocalStorage pattern to propagate context through async operations
 * without explicit parameter passing.
 *
 * Usage:
 * ```typescript
 * // At request entry point
 * withContext({ correlationId: crypto.randomUUID() }, () => {
 *   // All nested calls can access context
 *   const ctx = getContext();
 *   logger.info("Processing", { correlationId: ctx.correlationId });
 * });
 * ```
 */

export interface RequestContext {
  correlationId: string;
  userId?: string;
  messageId?: string;
  startTime?: number;
  [key: string]: unknown;
}

// Global context storage using WeakMap to avoid memory leaks
const contextMap = new WeakMap<object, RequestContext>();
let currentContextKey: object | null = null;

/**
 * Execute a function with a request context
 *
 * @param context - Context to propagate through execution
 * @param fn - Function to execute with context
 * @returns Result of the function
 */
export function withContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const key = {};
  contextMap.set(key, context);
  const previousKey = currentContextKey;
  currentContextKey = key;

  try {
    const result = fn();

    // If the function returns a Promise, restore context after it completes
    if (result instanceof Promise) {
      return result.finally(() => {
        currentContextKey = previousKey;
      }) as T;
    }

    // Restore previous context for sync functions
    currentContextKey = previousKey;
    return result;
  } catch (error) {
    // Restore context on error
    currentContextKey = previousKey;
    throw error;
  }
}

/**
 * Get the current request context
 *
 * @returns Current context or empty object if no context is active
 */
export function getContext(): RequestContext {
  if (!currentContextKey) {
    return { correlationId: "no-context" };
  }

  const context = contextMap.get(currentContextKey);
  return context || { correlationId: "no-context" };
}

/**
 * Update the current context with additional data
 *
 * @param updates - Partial context to merge with current context
 */
export function updateContext(updates: Partial<RequestContext>): void {
  if (!currentContextKey) {
    return;
  }

  const current = contextMap.get(currentContextKey);
  if (current) {
    contextMap.set(currentContextKey, { ...current, ...updates });
  }
}
