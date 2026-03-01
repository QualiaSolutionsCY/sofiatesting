/**
 * Call Audit Configuration
 *
 * Centralized configuration for the call audit system including:
 * - Target phone number to audit
 * - Internal extensions to filter out
 * - Cyprus timezone settings
 * - Schedule configuration
 * - 3CX credentials validation
 */

import type { ThreeCXConfig } from "./3cx/types.ts";

/**
 * Main audit configuration
 */
export const AUDIT_CONFIG = {
  // The main phone number to audit (Zyprus main line)
  TARGET_NUMBER: "22032770",

  // Internal extensions to exclude from audits (agent phones, internal routing)
  INTERNAL_EXTENSIONS: ["70", "64", "99", "801", "900"],

  // Cyprus timezone for proper call time handling
  TIMEZONE: "Europe/Nicosia",

  // Schedule: Run daily at 5:00 PM Cyprus time
  SCHEDULE_HOUR: 17,

  // Schedule: Monday through Friday only
  SCHEDULE_DAYS: [1, 2, 3, 4, 5], // 1=Monday, 5=Friday
} as const;

/**
 * Get 3CX configuration from environment variables
 * @throws Error if any required environment variables are missing
 */
export function get3CXConfig(): ThreeCXConfig {
  const baseUrl = Deno.env.get("CX3_BASE_URL");
  const username = Deno.env.get("CX3_USERNAME");
  const password = Deno.env.get("CX3_PASSWORD");

  if (!baseUrl) {
    throw new Error(
      "CX3_BASE_URL environment variable is required. " +
        "Set it to your 3CX web client URL (e.g., https://yourcompany.3cx.com)"
    );
  }

  if (!username) {
    throw new Error(
      "CX3_USERNAME environment variable is required. " +
        "Set it to your 3CX login username"
    );
  }

  if (!password) {
    throw new Error(
      "CX3_PASSWORD environment variable is required. " +
        "Set it to your 3CX login password"
    );
  }

  // Clean up baseUrl - remove trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    baseUrl: cleanBaseUrl,
    username,
    password,
  };
}
