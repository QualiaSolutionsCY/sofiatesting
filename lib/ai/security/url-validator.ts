/**
 * URL Validator - SSRF Prevention
 *
 * Provides security measures against Server-Side Request Forgery (SSRF) by:
 * - Validating URLs against an allowlist of trusted domains
 * - Blocking requests to private/internal IP ranges
 * - Enforcing HTTPS-only connections
 * - Preventing access to cloud metadata endpoints
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { logger } from "@/lib/logger";

/**
 * Domains allowed for external URL fetching
 * Only add trusted domains that you control or have verified
 */
const ALLOWED_DOMAINS = [
  // Supabase storage (project-specific)
  "vceeheaxcrhmpqueudqx.supabase.co",
  // Supabase storage (general pattern for subdomains)
  "supabase.co",
] as const;

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
] as const;

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
] as const;

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
      logger.warn("URL validation failed: non-HTTPS protocol", {
        url: url.substring(0, 100),
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
      logger.warn("URL validation failed: blocked hostname", {
        url: url.substring(0, 100),
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
        logger.error(
          "SSRF attempt blocked: private IP range",
          new Error("Blocked private IP"),
          {
            url: url.substring(0, 100),
            hostname,
          }
        );
        return {
          valid: false,
          error: "Access to private networks is not allowed",
          hostname,
        };
      }

      // Block all raw IPs even if public - use domain names
      logger.warn("URL validation failed: raw IP address", {
        url: url.substring(0, 100),
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
      logger.warn("URL validation failed: domain not in allowlist", {
        url: url.substring(0, 100),
        hostname,
        allowedDomains: ALLOWED_DOMAINS,
      });
      return {
        valid: false,
        error: `Domain "${hostname}" is not in the allowed list`,
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
    logger.warn("URL validation failed: invalid URL format", {
      url: url.substring(0, 50),
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
