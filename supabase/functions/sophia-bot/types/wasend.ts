/**
 * WaSend Webhook TypeScript Interfaces
 *
 * Type-safe definitions for WaSend webhook payloads.
 * Based on actual payload structures observed in production.
 */

/**
 * Message identification structure
 * Contains phone numbers and message IDs for routing
 */
export interface WaSendKey {
  /** Cleaned sender phone number (recommended for private chats) */
  cleanedSenderPn?: string;
  /** Cleaned participant phone number (for group chats) */
  cleanedParticipantPn?: string;
  /** Remote JID (can be LID format like "520:123456@lid") */
  remoteJid?: string;
  /** Message ID for deduplication */
  id?: string;
  /** Whether message is outgoing (fromMe=true) */
  fromMe?: boolean;
}

/**
 * Encrypted WhatsApp image message structure
 * Images are encrypted by WhatsApp and must be decrypted via WaSend API
 */
export interface WaSendImageMessage {
  /** Encrypted image URL (mmg.whatsapp.net) */
  url: string;
  /** MIME type (e.g., "image/jpeg") */
  mimetype?: string;
  /** Encryption key (required for decryption) */
  mediaKey?: string;
  /** File SHA-256 hash */
  fileSha256?: string;
  /** File length in bytes */
  fileLength?: number | string;
  /** Image caption */
  caption?: string;
}

/**
 * Document message structure (PDF, DOCX, etc.)
 * Can also contain images sent as documents
 */
export interface WaSendDocumentMessage {
  /** Document URL (encrypted if from WhatsApp) */
  url: string;
  /** MIME type (e.g., "application/pdf", "image/jpeg") */
  mimetype?: string;
  /** File name */
  fileName?: string;
  /** Encryption key (required for decryption) */
  mediaKey?: string;
  /** File SHA-256 hash */
  fileSha256?: string;
  /** File length in bytes */
  fileLength?: number | string;
}

/**
 * Extended text message structure
 * Used for messages with additional formatting
 */
export interface WaSendExtendedTextMessage {
  /** Message text content */
  text: string;
}

/**
 * Nested message content structure
 * Contains the actual message payload (text, image, document, etc.)
 */
export interface WaSendMessageContent {
  /** Plain text message */
  conversation?: string;
  /** Extended/formatted text message */
  extendedTextMessage?: WaSendExtendedTextMessage;
  /** Image message (encrypted) */
  imageMessage?: WaSendImageMessage;
  /** Document message (PDF, DOCX, etc.) */
  documentMessage?: WaSendDocumentMessage;
}

/**
 * Core message structure
 * Top-level message object in WaSend webhook payloads
 */
export interface WaSendMessage {
  /** Message identification (phone numbers, IDs) */
  key?: WaSendKey;
  /** Nested message content */
  message?: WaSendMessageContent;
  /** Unified message body field (WaSend convenience field) */
  messageBody?: string;
  /** Message timestamp */
  messageTimestamp?: number;
  /** Message ID (alternative location) */
  id?: string;
  messageId?: string;
  /** Whether message is outgoing */
  fromMe?: boolean;
  /** Remote JID (alternative location) */
  remoteJid?: string;
  /** Sender phone number (alternative locations) */
  from?: string;
  to?: string;
  phone?: string;
  /** Message text (alternative locations) */
  text?: string;
  body?: string;
  content?: string;
  /** Image message (alternative location) */
  imageMessage?: WaSendImageMessage;
  /** Pre-decrypted media URL (if WaSend provides it) */
  decryptedMediaUrl?: string;
  /** Media URL (alternative location) */
  mediaUrl?: string;
  /** Test/simple webhook format - array of public image URLs */
  media?: string[];
  /** Nested data object (alternative location) */
  data?: {
    imageMessage?: WaSendImageMessage;
  };
}

/**
 * WaSend webhook data wrapper
 * Can contain a single message object or an array of messages
 */
export interface WaSendData {
  /** Message object (can be single object OR array) */
  messages?: WaSendMessage | WaSendMessage[];
  /** Alternative message field */
  message?: WaSendMessage;
  /** Image message (alternative location) */
  imageMessage?: WaSendImageMessage;
}

/**
 * Top-level WaSend webhook payload
 * Sent by WaSend webhook to sophia-bot Edge Function
 */
export interface WaSendWebhookPayload {
  /** Event type */
  event:
    | "messages.upsert"
    | "messages.received"
    | "message"
    | "messages"
    | string;
  /** Webhook data */
  data: WaSendData;
}
