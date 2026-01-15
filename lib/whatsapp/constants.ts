/**
 * WhatsApp Module Constants
 *
 * Centralized configuration for the WhatsApp integration.
 * Eliminates magic numbers and provides a single source of truth.
 */

export const WHATSAPP_CONFIG = {
  /**
   * Number of days to retain message history for context.
   * Messages older than this are not included in AI context.
   */
  HISTORY_RETENTION_DAYS: 30,

  /**
   * Maximum number of AI generation retries on transient errors.
   * Uses exponential backoff: 1s, 2s, 3s...
   */
  MAX_AI_RETRIES: 2,

  /**
   * Base backoff delay in milliseconds for retry logic.
   * Actual delay = RETRY_BACKOFF_BASE_MS * retryAttempt
   */
  RETRY_BACKOFF_BASE_MS: 1000,

  /**
   * Maximum message length before splitting into chunks.
   * WhatsApp has a ~4096 character limit, we use 4000 for safety.
   */
  MESSAGE_MAX_LENGTH: 4000,

  /**
   * Delay between sending split message chunks (ms).
   * Prevents rate limiting and ensures message ordering.
   */
  MESSAGE_SPLIT_DELAY_MS: 500,

  /**
   * Chat session reuse window in milliseconds.
   * Chats within this window use the same session.
   * Default: 24 hours
   */
  SESSION_REUSE_WINDOW_MS: 24 * 60 * 60 * 1000,

  /**
   * Deduplication cache TTL in seconds.
   * Prevents processing duplicate webhook deliveries.
   */
  DEDUP_TTL_SECONDS: 60,

  /**
   * Rate limit: requests per minute per phone number.
   * Prevents message flooding from a single user.
   */
  RATE_LIMIT_REQUESTS_PER_MINUTE: 30,
} as const;

/**
 * Message type constants
 */
export const MESSAGE_TYPES = {
  TEXT: "text",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  DOCUMENT: "document",
  LOCATION: "location",
  VCARD: "vcard",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

/**
 * Error message templates for user-facing messages
 */
export const ERROR_MESSAGES = {
  /** Default error message for unhandled errors */
  DEFAULT: "I encountered an error. Please try again or rephrase.",

  /** Message when AI quota is exhausted */
  QUOTA_EXHAUSTED:
    "I'm currently experiencing high demand. Please try again in a few moments.",

  /** Message when AI returns empty response */
  EMPTY_RESPONSE:
    "I couldn't generate a response. Please try rephrasing your question.",

  /** Message when AI fails to initialize */
  INITIALIZATION_FAILED:
    "I'm having trouble connecting. Please try again in a moment.",

  /** Message when rate limit is exceeded */
  RATE_LIMITED:
    "You're sending messages too quickly. Please wait a moment and try again.",
} as const;

/**
 * Webhook event types from WaSenderAPI
 */
export const WEBHOOK_EVENTS = {
  // Message events
  MESSAGE: "message",
  MESSAGES_RECEIVED: "messages.received",
  MESSAGES_UPSERT: "messages.upsert",

  // Status events
  MESSAGE_STATUS: "message.status",
  MESSAGES_UPDATE: "messages.update",
  MESSAGE_RECEIPT_UPDATE: "message-receipt.update",

  // Session events
  SESSION_STATUS: "session.status",

  // Other events
  CONTACT_UPSERT: "contact.upsert",
  CONTACTS_UPSERT: "contacts.upsert",
  GROUP_UPDATE: "group.update",
  GROUPS_UPDATE: "groups.update",
  GROUPS_UPSERT: "groups.upsert",
  CHATS_UPSERT: "chats.upsert",
  CHATS_UPDATE: "chats.update",
  CALL: "call",

  // Test event
  WEBHOOK_TEST: "webhook.test",
} as const;
