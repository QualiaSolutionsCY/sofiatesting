/**
 * Simple in-memory circuit breaker for external API calls.
 *
 * States:
 *   CLOSED  – requests pass through normally
 *   OPEN    – requests fail fast (too many recent failures)
 *   HALF_OPEN – one probe request allowed to test recovery
 *
 * Module-level state persists across warm Edge Function invocations.
 */

import { LogCategory, logger } from "./logger.ts";

enum State {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit */
  failureThreshold: number;
  /** How long the circuit stays open before allowing a probe (ms) */
  resetTimeoutMs: number;
  /** Name for logging */
  name: string;
}

interface CircuitState {
  state: State;
  failureCount: number;
  lastFailureTime: number;
}

const circuits = new Map<string, CircuitState>();

function getState(name: string): CircuitState {
  if (!circuits.has(name)) {
    circuits.set(name, {
      state: State.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
    });
  }
  return circuits.get(name)!;
}

/**
 * Check if the circuit allows a request through.
 * Returns true if the request should proceed, false if it should fail fast.
 */
export function canRequest(config: CircuitBreakerConfig): boolean {
  const circuit = getState(config.name);

  if (circuit.state === State.CLOSED) {
    return true;
  }

  if (circuit.state === State.OPEN) {
    const elapsed = Date.now() - circuit.lastFailureTime;
    if (elapsed >= config.resetTimeoutMs) {
      // Transition to half-open: allow one probe
      circuit.state = State.HALF_OPEN;
      logger.info(
        `[CircuitBreaker:${config.name}] OPEN -> HALF_OPEN (${elapsed}ms elapsed, allowing probe)`,
        { category: LogCategory.GENERAL }
      );
      return true;
    }
    return false;
  }

  // HALF_OPEN: allow the probe request
  return true;
}

/**
 * Record a successful request. Resets failure count and closes the circuit.
 */
export function recordSuccess(config: CircuitBreakerConfig): void {
  const circuit = getState(config.name);

  if (circuit.state === State.HALF_OPEN) {
    logger.info(
      `[CircuitBreaker:${config.name}] HALF_OPEN -> CLOSED (probe succeeded)`,
      { category: LogCategory.GENERAL }
    );
  }

  circuit.state = State.CLOSED;
  circuit.failureCount = 0;
}

/**
 * Record a failed request. Increments failure count and may open the circuit.
 */
export function recordFailure(config: CircuitBreakerConfig): void {
  const circuit = getState(config.name);
  circuit.failureCount++;
  circuit.lastFailureTime = Date.now();

  if (circuit.state === State.HALF_OPEN) {
    // Probe failed — reopen
    circuit.state = State.OPEN;
    logger.warn(
      `[CircuitBreaker:${config.name}] HALF_OPEN -> OPEN (probe failed)`,
      { category: LogCategory.GENERAL }
    );
    return;
  }

  if (circuit.failureCount >= config.failureThreshold) {
    circuit.state = State.OPEN;
    logger.warn(
      `[CircuitBreaker:${config.name}] CLOSED -> OPEN (${circuit.failureCount} consecutive failures)`,
      { category: LogCategory.GENERAL }
    );
  }
}
