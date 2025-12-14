/**
 * WhatsApp Webhook Utilities
 * Pure functions for webhook processing that can be tested independently
 */

import crypto from "node:crypto";

/**
 * Verify HMAC signature from WaSenderAPI webhook
 * Uses timing-safe comparison to prevent timing attacks
 *
 * @param rawBody - The raw request body as a string
 * @param signature - The signature from the x-wasender-signature header
 * @param secret - The webhook secret
 * @returns true if signature is valid, false otherwise
 */
export const verifyWebhookSignature = (
  rawBody: string,
  signature: string | null,
  secret: string
): boolean => {
  if (!signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    // If buffers have different lengths, timingSafeEqual throws
    return false;
  }
};

/**
 * Create an HMAC signature for testing purposes
 *
 * @param payload - The payload to sign
 * @param secret - The secret key
 * @returns The HMAC-SHA256 signature as hex
 */
export const createHmacSignature = (
  payload: string,
  secret: string
): string => {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};
