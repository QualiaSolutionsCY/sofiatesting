/**
 * Zyprus OAuth2 Authentication
 * Handles token management and configuration for Zyprus API
 */

import { LogCategory, logger } from "../utils/logger.ts";
import { withRetry } from "../utils/retry.ts";
import {
  canRequest,
  recordSuccess,
  recordFailure,
} from "../utils/circuit-breaker.ts";

export interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface ZyprusConfig {
  apiUrl: string;
  siteUrl: string;
  clientId: string;
  clientSecret: string;
}

// Token cache (in-memory for Edge Function)
let cachedToken: TokenCache | null = null;

// Circuit breaker configuration for Zyprus API
const ZYPRUS_BREAKER_CONFIG = {
  name: "zyprus-api",
  failureThreshold: 3,
  resetTimeoutMs: 60_000, // 1 minute
};

/**
 * Get Zyprus API configuration from environment
 */
export function getZyprusConfig(): ZyprusConfig {
  const apiUrl = Deno.env.get("ZYPRUS_API_URL");
  const siteUrl = Deno.env.get("ZYPRUS_SITE_URL") || "https://zyprus.com";
  const clientId = Deno.env.get("ZYPRUS_CLIENT_ID");
  const clientSecret = Deno.env.get("ZYPRUS_CLIENT_SECRET");

  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error("Zyprus API credentials not configured");
  }

  return { apiUrl, siteUrl, clientId, clientSecret };
}

/**
 * Get OAuth2 access token
 */
export async function getAccessToken(config: ZyprusConfig): Promise<string> {
  // Check cache (with 5 minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  // Circuit breaker check - fail fast if Zyprus is down
  if (!canRequest(ZYPRUS_BREAKER_CONFIG)) {
    throw new Error(
      "[Zyprus] Circuit breaker OPEN - failing fast to protect system stability"
    );
  }

  logger.info("Fetching new Zyprus access token", {
    category: LogCategory.ZYPRUS,
    operation: "getAccessToken",
  });

  try {
    const response = await withRetry(
    async () => {
      const res = await fetch(`${config.apiUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SophiaAI",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok && [500, 502, 503, 504].includes(res.status)) {
        throw new Error(`Token request failed: ${res.status}`);
      }
      return res;
    },
    { maxRetries: 3, baseDelayMs: 500 },
    "getAccessToken"
  );

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Failed to get Zyprus access token", undefined, {
      category: LogCategory.ZYPRUS,
      operation: "getAccessToken",
      status: response.status,
      errorPreview: errorText.substring(0, 200),
    });
    // Record failure in circuit breaker
    recordFailure(ZYPRUS_BREAKER_CONFIG);
    // Generic error message - don't expose OAuth token flow details to users
    throw new Error(
      "Unable to connect to property system. Please try again later."
    );
  }

  const data = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  // Record success in circuit breaker
  recordSuccess(ZYPRUS_BREAKER_CONFIG);

  logger.info("Zyprus access token obtained successfully", {
    category: LogCategory.ZYPRUS,
    operation: "getAccessToken",
    expiresIn: data.expires_in,
  });
  return data.access_token;
  } catch (error) {
    // Record failure and re-throw
    recordFailure(ZYPRUS_BREAKER_CONFIG);
    throw error;
  }
}
