/**
 * URL Validator - SSRF Prevention for Supabase Edge Function
 *
 * Provides security measures against Server-Side Request Forgery (SSRF) by:
 * - Validating URLs against an allowlist of trusted domains
 * - Blocking requests to private/internal IP ranges
 * - Enforcing HTTPS-only connections
 * - Preventing access to cloud metadata endpoints
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { logger, LogCategory } from "./logger.ts";

/**
 * Domains allowed for external URL fetching
 * Only add trusted domains that you control or have verified
 */
const ALLOWED_DOMAINS = [
  // Supabase storage (project-specific)
  "vceeheaxcrhmpqueudqx.supabase.co",
  // Supabase storage (general pattern for subdomains)
  "supabase.co",
  "supabase.in",
];

/**
 * Regex patterns for blocked IP ranges (SSRF prevention)
 * These patterns match private, loopback, and cloud metadata IPs
 */
const BLOCKED_IP_PATTERNS = [
  // Private IPv4 ranges (RFC 1918)
  /^10\./, // Class A private: 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private: 172.16.0.0/12
  /^192\.168\./, // Class C private: 192.168.0.0/16

  // Loopback
  /^127\./, // Loopback: 127.0.0.0/8
  /^0\./, // Invalid/default: 0.0.0.0/8

  // Link-local (AWS/GCP/Azure metadata endpoint)
  /^169\.254\./, // Link-local: 169.254.0.0/16

  // Localhost variations
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

/**
 * Hostnames that should always be blocked
 */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
  "metadata.azure.com", // Azure metadata
];

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
  hostname?: string;
  protocol?: string;
}

/**
 * Check if a hostname matches any blocked IP pattern
 */
const isBlockedIp = (hostname: string): boolean => {
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname));
};

/**
 * Check if a hostname is in the blocked list
 */
const isBlockedHostname = (hostname: string): boolean => {
  const lowerHostname = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(
    (blocked) => lowerHostname === blocked.toLowerCase()
  );
};

/**
 * Check if a hostname matches an allowed domain
 * Supports exact match and subdomain matching
 */
const isAllowedDomain = (hostname: string): boolean => {
  const lowerHostname = hostname.toLowerCase();

  return ALLOWED_DOMAINS.some((domain) => {
    const lowerDomain = domain.toLowerCase();
    // Exact match
    if (lowerHostname === lowerDomain) {
      return true;
    }
    // Subdomain match (e.g., "storage.supabase.co" matches "supabase.co")
    if (lowerHostname.endsWith(`.${lowerDomain}`)) {
      return true;
    }
    return false;
  });
};

/**
 * Check if a hostname is a raw IP address (v4 or v6)
 */
const isIpAddress = (hostname: string): boolean => {
  // IPv4 pattern
  const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^[\da-f:]+$/i;

  return ipv4Pattern.test(hostname) || ipv6Pattern.test(hostname);
};

/**
 * Validate an external URL for safe fetching
 *
 * Use this before any server-side fetch() to prevent SSRF attacks.
 * Only allows HTTPS requests to whitelisted domains.
 *
 * @param url - The URL to validate
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const result = validateExternalUrl(documentUrl);
 * if (!result.valid) {
 *   return { success: false, error: result.error };
 * }
 * const response = await fetch(documentUrl);
 * ```
 */
export const validateExternalUrl = (url: string): UrlValidationResult => {
  try {
    const parsed = new URL(url);

    // 1. Protocol check - HTTPS only
    if (parsed.protocol !== "https:") {
      logger.warn("[URL Validator] SSRF blocked: non-HTTPS protocol", {
        category: LogCategory.GENERAL,
        protocol: parsed.protocol,
      });
      return {
        valid: false,
        error: "Only HTTPS URLs are allowed",
        protocol: parsed.protocol,
      };
    }

    const hostname = parsed.hostname;

    // 2. Block known dangerous hostnames
    if (isBlockedHostname(hostname)) {
      logger.warn("[URL Validator] SSRF blocked: dangerous hostname", {
        category: LogCategory.GENERAL,
        hostname,
      });
      return {
        valid: false,
        error: "Access to this host is not allowed",
        hostname,
      };
    }

    // 3. Block raw IP addresses
    if (isIpAddress(hostname)) {
      // Check if it's a private/internal IP
      if (isBlockedIp(hostname)) {
        logger.error("[URL Validator] SSRF ATTACK BLOCKED: private IP range", undefined, {
          category: LogCategory.GENERAL,
          hostname,
        });
        return {
          valid: false,
          error: "Access to private networks is not allowed",
          hostname,
        };
      }

      // Block all raw IPs even if public - use domain names
      logger.warn("[URL Validator] SSRF blocked: raw IP address", {
        category: LogCategory.GENERAL,
        hostname,
      });
      return {
        valid: false,
        error: "IP addresses are not allowed - use a domain name",
        hostname,
      };
    }

    // 4. Check against allowed domains
    if (!isAllowedDomain(hostname)) {
      logger.warn("[URL Validator] SSRF blocked: domain not in allowlist", {
        category: LogCategory.GENERAL,
        hostname,
      });
      return {
        valid: false,
        error: `Domain "${hostname}" is not in the allowed list`,
        hostname,
      };
    }

    // 5. Check for path traversal attempts
    if (parsed.pathname.includes("..")) {
      logger.warn("[URL Validator] SSRF blocked: path traversal attempt", {
        category: LogCategory.GENERAL,
        pathname: parsed.pathname,
      });
      return {
        valid: false,
        error: "Path traversal detected",
        hostname,
      };
    }

    // All checks passed
    return {
      valid: true,
      hostname,
      protocol: parsed.protocol,
    };
  } catch {
    logger.warn("[URL Validator] Invalid URL format", {
      category: LogCategory.GENERAL,
    });
    return {
      valid: false,
      error: "Invalid URL format",
    };
  }
};

/**
 * Quick check if a URL is potentially safe (less strict)
 * Use this for logging or filtering, not for security decisions
 *
 * @param url - The URL to check
 * @returns true if URL appears safe for basic filtering
 */
export const isUrlSafe = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !isBlockedHostname(parsed.hostname) &&
      !isBlockedIp(parsed.hostname)
    );
  } catch {
    return false;
  }
};

/**
 * Safe fetch wrapper that validates URLs before fetching
 * Blocks redirects to prevent redirect-based SSRF attacks
 *
 * @param url - The URL to fetch
 * @returns Response from fetch
 * @throws Error if URL validation fails
 */
export const safeFetch = async (url: string): Promise<Response> => {
  const validation = validateExternalUrl(url);

  if (!validation.valid) {
    throw new Error(`SSRF blocked: ${validation.error}`);
  }

  // Don't follow redirects - they could redirect to internal IPs
  return fetch(url, { redirect: "error" });
};

/**
 * Validate and sanitize a document URL before fetching
 * Returns a sanitized URL or throws if invalid
 *
 * @param url - The document URL to validate
 * @throws Error if URL is invalid or blocked
 * @returns The validated URL (unchanged if valid)
 */
export const validateDocumentUrl = (url: string): string => {
  const result = validateExternalUrl(url);

  if (!result.valid) {
    throw new Error(`Document URL validation failed: ${result.error}`);
  }

  return url;
};

/**
 * Validate an image URL (less restrictive than document URLs)
 * Allows any public URL but blocks private IPs and metadata endpoints
 *
 * Use this for user-provided image URLs that may come from external sources
 *
 * @param url - The image URL to validate
 * @returns Validation result with error message if invalid
 */
export const validateImageUrl = (url: string): UrlValidationResult => {
  try {
    const parsed = new URL(url);

    // 1. Protocol check - HTTPS preferred, HTTP allowed for some image sources
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        valid: false,
        error: "Only HTTP/HTTPS URLs are allowed for images",
        protocol: parsed.protocol,
      };
    }

    const hostname = parsed.hostname;

    // 2. Block known dangerous hostnames
    if (isBlockedHostname(hostname)) {
      logger.warn("[URL Validator] Image URL blocked: dangerous hostname", {
        category: LogCategory.IMAGE,
        hostname,
      });
      return {
        valid: false,
        error: "Access to this host is not allowed",
        hostname,
      };
    }

    // 3. Block private IP ranges (SSRF prevention)
    if (isIpAddress(hostname) && isBlockedIp(hostname)) {
      logger.error("[URL Validator] SSRF blocked for image: private IP", undefined, {
        category: LogCategory.IMAGE,
        hostname,
      });
      return {
        valid: false,
        error: "Access to private networks is not allowed",
        hostname,
      };
    }

    // 4. Check for path traversal attempts
    if (parsed.pathname.includes("..")) {
      return {
        valid: false,
        error: "Path traversal detected",
        hostname,
      };
    }

    // Allow public URLs for images (no domain allowlist)
    return {
      valid: true,
      hostname,
      protocol: parsed.protocol,
    };
  } catch {
    return {
      valid: false,
      error: "Invalid URL format",
    };
  }
};
