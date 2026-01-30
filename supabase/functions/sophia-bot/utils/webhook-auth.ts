/**
 * Webhook authentication for Sophia WhatsApp Bot
 *
 * Verifies WaSend webhook signatures to prevent unauthorized
 * webhook calls from attackers.
 *
 * WaSend uses HMAC-SHA256 for webhook signature verification.
 */

import { logger, LogCategory, ErrorCategory } from "./logger.ts";

/**
 * Verifies the webhook signature from WaSend
 *
 * @param signature - The signature from X-Wasend-Signature header
 * @param body - The raw request body as string
 * @param secret - The webhook secret configured in WaSend dashboard
 * @returns true if signature is valid, false otherwise
 */
export async function verifyWebhookSignature(
  signature: string | null,
  body: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    // Create HMAC-SHA256 signature using Web Crypto API (Deno compatible)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(body);

    // Import the secret key
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    // Sign the message
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, messageData);

    // Convert to hex string
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison to prevent timing attacks
    return constantTimeCompare(signature, expectedSignature);
  } catch (err) {
    logger.error("Webhook signature verification error", err as Error, { category: LogCategory.WEBHOOK, errorCategory: ErrorCategory.AUTH });
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * This ensures the comparison takes the same amount of time
 * regardless of where the strings differ or their lengths.
 * The comparison always processes the maximum length to avoid
 * leaking length information through timing.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);

  // XOR the lengths first - this will be non-zero if lengths differ
  let result = a.length ^ b.length;

  // Always iterate through the maximum length to prevent timing leaks
  for (let i = 0; i < maxLen; i++) {
    // Use 0 as fallback for out-of-bounds access
    const charA = i < a.length ? a.charCodeAt(i) : 0;
    const charB = i < b.length ? b.charCodeAt(i) : 0;
    result |= charA ^ charB;
  }

  return result === 0;
}

/**
 * Extracts and validates the webhook signature header
 *
 * WaSend may send the signature in different header formats,
 * this function handles the common cases.
 *
 * @param headers - Request headers
 * @returns The signature string or null if not found
 */
export function extractSignatureHeader(headers: Headers): string | null {
  // Primary header used by WaSend
  const signature = headers.get("X-Wasend-Signature");
  if (signature) {
    return signature;
  }

  // Alternative header names that might be used
  const alternatives = [
    "x-wasend-signature",
    "X-Webhook-Signature",
    "x-webhook-signature",
    "X-Hub-Signature-256",
  ];

  for (const header of alternatives) {
    const value = headers.get(header);
    if (value) {
      // Some webhooks send "sha256=signature", extract just the signature
      if (value.startsWith("sha256=")) {
        return value.slice(7);
      }
      return value;
    }
  }

  return null;
}

