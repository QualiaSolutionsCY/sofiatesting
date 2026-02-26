/**
 * 3CX HTTP Client with Authentication
 *
 * Handles authentication and session management for 3CX phone system API.
 * Supports both v18+ REST API and legacy web client API patterns.
 *
 * Features:
 * - Automatic API version detection (REST vs web client)
 * - Session token/cookie management
 * - Automatic retry on authentication failures
 * - Structured error handling with retry logic
 * - Network resilience via withRetry utility
 */

import { logger, LogCategory } from "../../sophia-bot/utils/logger.ts";
import { withRetry } from "../../sophia-bot/utils/retry.ts";
import {
  ThreeCXConfig,
  ThreeCXLoginResponse,
  ThreeCXAuthError,
  ThreeCXAPIError
} from "./types.ts";

/**
 * Custom error for 3CX authentication failures
 */
export class ThreeCXAuthError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "ThreeCXAuthError";
  }
}

/**
 * 3CX HTTP client with authentication and session management
 */
export class ThreeCXClient {
  private _token: string | null = null;
  private _cookie: string | null = null;
  private _authenticated: boolean = false;

  constructor(private config: ThreeCXConfig) {}

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this._authenticated && (this._token !== null || this._cookie !== null);
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": "SophiaAI-CallAudit",
      "Accept": "application/json",
    };

    if (this._token) {
      headers["Authorization"] = `Bearer ${this._token}`;
    }

    if (this._cookie) {
      headers["Cookie"] = this._cookie;
    }

    return headers;
  }

  /**
   * Authenticate with 3CX system
   *
   * Tries both v18+ REST API and legacy web client API patterns.
   * Stores authentication tokens/cookies for subsequent requests.
   */
  async login(): Promise<void> {
    logger.info("[3CX Client] Attempting authentication", {
      category: LogCategory.GENERAL,
      baseUrl: this.config.baseUrl,
    });

    // Reset authentication state
    this._token = null;
    this._cookie = null;
    this._authenticated = false;

    // Try v18+ REST API first
    const restApiSuccess = await this._tryRestAPILogin();
    if (restApiSuccess) {
      this._authenticated = true;
      logger.info("[3CX Client] Authentication successful (REST API)", {
        category: LogCategory.GENERAL,
      });
      return;
    }

    // Fall back to web client API
    const webClientSuccess = await this._tryWebClientLogin();
    if (webClientSuccess) {
      this._authenticated = true;
      logger.info("[3CX Client] Authentication successful (Web Client API)", {
        category: LogCategory.GENERAL,
      });
      return;
    }

    // Both methods failed
    throw new ThreeCXAuthError(
      "Authentication failed: Neither REST API nor Web Client API accepted credentials"
    );
  }

  /**
   * Try v18+ REST API authentication
   */
  private async _tryRestAPILogin(): Promise<boolean> {
    try {
      const response = await withRetry(
        () => fetch(`${this.config.baseUrl}/api/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SophiaAI-CallAudit",
          },
          body: JSON.stringify({
            Username: this.config.username,
            Password: this.config.password,
          }),
        }),
        {
          maxRetries: 2,
          baseDelayMs: 1000,
        },
        "3cx-rest-login"
      );

      if (response.status === 404) {
        // REST API not available - this is normal for older versions
        logger.debug("[3CX Client] REST API not available (404)", {
          category: LogCategory.GENERAL,
        });
        return false;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          logger.warn("[3CX Client] REST API authentication failed", {
            category: LogCategory.GENERAL,
            status: response.status,
          });
          return false;
        }
        throw new ThreeCXAPIError(
          `REST API error: ${response.status}`,
          response.status,
          "/api/login"
        );
      }

      const data: ThreeCXLoginResponse = await response.json();

      if (data.Status === "Ok" && data.Token) {
        this._token = data.Token;
        return true;
      }

      if (data.Status === "AuthenticationFailed") {
        logger.warn("[3CX Client] REST API credentials rejected", {
          category: LogCategory.GENERAL,
          errorMessage: data.ErrorMessage,
        });
        return false;
      }

      logger.warn("[3CX Client] REST API unexpected response", {
        category: LogCategory.GENERAL,
        status: data.Status,
      });
      return false;

    } catch (error) {
      if (error instanceof ThreeCXAPIError) {
        throw error;
      }

      logger.debug("[3CX Client] REST API attempt failed", {
        category: LogCategory.GENERAL,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Try legacy web client API authentication
   */
  private async _tryWebClientLogin(): Promise<boolean> {
    try {
      const response = await withRetry(
        () => fetch(`${this.config.baseUrl}/webclient/api/Login/GetAccessToken`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "SophiaAI-CallAudit",
          },
          body: new URLSearchParams({
            Username: this.config.username,
            Password: this.config.password,
          }).toString(),
        }),
        {
          maxRetries: 2,
          baseDelayMs: 1000,
        },
        "3cx-webclient-login"
      );

      if (response.status === 404) {
        // Web client API not available
        logger.debug("[3CX Client] Web Client API not available (404)", {
          category: LogCategory.GENERAL,
        });
        return false;
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          logger.warn("[3CX Client] Web Client API authentication failed", {
            category: LogCategory.GENERAL,
            status: response.status,
          });
          return false;
        }
        throw new ThreeCXAPIError(
          `Web Client API error: ${response.status}`,
          response.status,
          "/webclient/api/Login/GetAccessToken"
        );
      }

      // Extract session cookie from response
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        this._cookie = setCookie;
        return true;
      }

      // Try to parse JSON response for token
      try {
        const data: ThreeCXLoginResponse = await response.json();
        if (data.Status === "Ok" && data.Token) {
          this._token = data.Token;
          return true;
        }

        if (data.Status === "AuthenticationFailed") {
          logger.warn("[3CX Client] Web Client API credentials rejected", {
            category: LogCategory.GENERAL,
            errorMessage: data.ErrorMessage,
          });
          return false;
        }
      } catch {
        // Not JSON response - could still be valid if cookie was set
      }

      logger.warn("[3CX Client] Web Client API no token or cookie received", {
        category: LogCategory.GENERAL,
      });
      return false;

    } catch (error) {
      if (error instanceof ThreeCXAPIError) {
        throw error;
      }

      logger.debug("[3CX Client] Web Client API attempt failed", {
        category: LogCategory.GENERAL,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Convenience method to get call logs with date filtering
   *
   * @param params Call log query parameters
   * @returns Raw response from 3CX call log API
   */
  async getCallLog(params: { dateFrom: string; dateTo: string; filter?: string }): Promise<any> {
    const { dateFrom, dateTo, filter } = params;

    // Try the most common 3CX call log endpoint format first
    const path = `/api/calllog?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;

    const response = await this.makeAuthenticatedRequest(path);

    if (!response.ok) {
      throw new ThreeCXAPIError(
        `Call log API error: ${response.status} ${response.statusText}`,
        response.status,
        path
      );
    }

    return await response.json();
  }

  /**
   * Make an authenticated request to 3CX API
   *
   * Handles 401 responses by attempting re-authentication once.
   *
   * @param path API path (will be appended to baseUrl)
   * @param options Additional fetch options
   */
  async makeAuthenticatedRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    if (!this.isAuthenticated()) {
      throw new ThreeCXAuthError("Not authenticated - call login() first");
    }

    const url = `${this.config.baseUrl}${path}`;
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers,
    };

    const requestOptions: RequestInit = {
      ...options,
      headers,
    };

    let response: Response;

    try {
      response = await withRetry(
        () => fetch(url, requestOptions),
        {
          maxRetries: 1,
          baseDelayMs: 500,
        },
        `3cx-api-${path.replace(/[^a-zA-Z0-9]/g, '-')}`
      );
    } catch (error) {
      throw new ThreeCXAPIError(
        `Network error for ${path}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        path
      );
    }

    // Handle session expiry
    if (response.status === 401) {
      logger.warn("[3CX Client] Session expired, attempting re-authentication", {
        category: LogCategory.GENERAL,
        path,
      });

      // Attempt one re-login
      try {
        await this.login();

        // Retry the request with new authentication
        const retryHeaders = {
          ...this.getAuthHeaders(),
          ...options.headers,
        };

        const retryOptions: RequestInit = {
          ...options,
          headers: retryHeaders,
        };

        response = await fetch(url, retryOptions);

        if (response.status === 401) {
          throw new ThreeCXAuthError("Re-authentication failed", 401);
        }

      } catch (error) {
        if (error instanceof ThreeCXAuthError) {
          throw error;
        }
        throw new ThreeCXAuthError(
          `Re-authentication failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (!response.ok && response.status !== 401) {
      throw new ThreeCXAPIError(
        `API error for ${path}: ${response.status} ${response.statusText}`,
        response.status,
        path
      );
    }

    return response;
  }
}