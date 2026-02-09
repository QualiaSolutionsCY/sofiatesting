/**
 * Webhook authentication for Sophia WhatsApp Bot
 *
 * Verifies WaSend webhook signatures to prevent unauthorized
 * webhook calls from attackers.
 *
 * WaSend uses simple signature verification where the X-Webhook-Signature
 * header contains the webhook secret directly (NOT an HMAC hash).
 * See: https://wasenderapi.com/help/messaging/using-webhooks
 */

/**
 * Verifies the webhook signature from WaSend
 *
 * WaSend uses a simple signature verification where the X-Webhook-Signature
 * header contains the webhook secret directly (NOT an HMAC hash).
 * See: https://wasenderapi.com/help/messaging/using-webhooks
 *
 * @param signature - The signature from X-Webhook-Signature header
 * @param _body - The raw request body (unused - WaSend doesn't hash the body)
 * @param secret - The webhook secret configured in WaSend dashboard
 * @returns true if signature matches secret, false otherwise
 */
export async function verifyWebhookSignature(
  signature: string | null,
  _body: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  // WaSend sends the secret directly as the signature header
  // Use constant-time comparison to prevent timing attacks
  return constantTimeCompare(signature, secret);
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

