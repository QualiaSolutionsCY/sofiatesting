/**
 * Unified Message Types for Multi-Channel SOPHIA
 *
 * These types normalize messages from WhatsApp, Telegram, and future channels
 * into a common format that the shared AI brain can process.
 */

export type ChannelType = "whatsapp" | "telegram";

/**
 * Normalized incoming message from any channel
 */
export interface UnifiedMessage {
  /** Channel this message came from */
  channelType: ChannelType;

  /** Sender's phone number (normalized, no country code prefix issues) */
  senderPhone: string;

  /** Sender's display name if available */
  senderName?: string;

  /** When the message was received */
  timestamp: Date;

  /** Text content of the message */
  text?: string;

  /** Image URLs attached to the message */
  images?: Array<{
    url: string;
    caption?: string;
  }>;

  /** Document URLs attached to the message */
  documents?: Array<{
    url: string;
    filename: string;
    mimetype?: string;
  }>;

  /** Unique conversation identifier (used for chat history) */
  conversationId: string;

  /** Message ID this is replying to (for threaded conversations) */
  replyToMessageId?: string;
}

/**
 * Normalized outgoing response
 */
export interface UnifiedResponse {
  /** Text content to send */
  text?: string;

  /** Document to attach (DOCX, PDF, etc.) */
  document?: {
    buffer: ArrayBuffer;
    filename: string;
    mimetype?: string;
  };
}

/**
 * Agent information from the database
 */
export interface Agent {
  uuid: string;
  full_name: string;
  email: string;
  mobile: string;
  region: string;
  can_upload: boolean;
  is_admin: boolean;
}

/**
 * Tool call from AI response
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Chat history entry
 */
export interface ChatMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}
