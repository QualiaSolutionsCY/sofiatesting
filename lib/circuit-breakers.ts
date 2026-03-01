import CircuitBreaker from "opossum";
import { logger } from "./logger";

const log = logger.circuit;

/**
 * Circuit Breaker Configuration
 *
 * Prevents cascading failures when external APIs fail or slow down
 * Fails fast when services are unhealthy to preserve system resources
 */

type CircuitBreakerOptions = {
  timeout?: number; // Request timeout in ms
  errorThresholdPercentage?: number; // % of failures to trip circuit
  resetTimeout?: number; // Time before trying again (half-open)
  rollingCountTimeout?: number; // Time window for counting failures
  rollingCountBuckets?: number; // Number of buckets in rolling window
  volumeThreshold?: number; // Min requests before circuit can trip
  name?: string; // Circuit breaker name for logging
};

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  timeout: 10_000, // 10 seconds
  errorThresholdPercentage: 50, // 50% failure rate trips circuit
  resetTimeout: 30_000, // Try again after 30 seconds
  rollingCountTimeout: 10_000, // 10 second rolling window
  rollingCountBuckets: 10, // 10 buckets (1 second each)
  volumeThreshold: 5, // Need at least 5 requests to trip
  name: "anonymous",
};

/**
 * Create a circuit breaker for async functions
 *
 * @example
 * const breaker = createCircuitBreaker(
 *   async () => fetch('https://api.example.com'),
 *   { name: 'ExternalAPI', timeout: 5000 }
 * );
 *
 * breaker.on('open', () => logger.info('Circuit opened'));
 * breaker.on('halfOpen', () => logger.info('Circuit half-open, testing'));
 * breaker.on('close', () => logger.info('Circuit closed, service recovered'));
 *
 * const result = await breaker.fire();
 */
export function createCircuitBreaker<
  T extends (...args: any[]) => Promise<any>,
>(
  fn: T,
  options?: CircuitBreakerOptions
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    rollingCountTimeout: opts.rollingCountTimeout,
    rollingCountBuckets: opts.rollingCountBuckets,
    volumeThreshold: opts.volumeThreshold,
    name: opts.name,
  });

  // Log circuit breaker state changes
  breaker.on("open", () => {
    log.warn("Circuit OPENED - service unhealthy, failing fast", { name: opts.name });
  });

  breaker.on("halfOpen", () => {
    log.info("Circuit HALF-OPEN - testing service health", { name: opts.name });
  });

  breaker.on("close", () => {
    log.info("Circuit CLOSED - service recovered", { name: opts.name });
  });

  breaker.on("timeout", () => {
    log.warn("Request timeout", { name: opts.name, timeout: opts.timeout });
  });

  breaker.on("reject", () => {
    log.warn("Request REJECTED - circuit is open", { name: opts.name });
  });

  // Provide fallback function if specified
  breaker.fallback(() => {
    throw new Error(
      `Service ${opts.name} is temporarily unavailable (circuit breaker open)`
    );
  });

  // Type assertion needed due to opossum library's type definitions
  // not preserving generic types through the constructor
  return breaker as CircuitBreaker<Parameters<T>, ReturnType<T>>;
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getCircuitBreakerStats(breaker: CircuitBreaker<any, any>) {
  const stats = breaker.stats;
  return {
    name: breaker.name,
    state: breaker.opened ? "open" : breaker.halfOpen ? "half-open" : "closed",
    failures: stats.failures,
    successes: stats.successes,
    rejects: stats.rejects,
    timeouts: stats.timeouts,
    fires: stats.fires,
    fallbacks: stats.fallbacks,
    latencyMean: stats.latencyMean,
  };
}

/**
 * Reset circuit breaker to closed state (for testing/admin)
 */
export function resetCircuitBreaker(breaker: CircuitBreaker<any, any>) {
  breaker.close();
  log.info("Manually reset to CLOSED state", { name: breaker.name });
}
