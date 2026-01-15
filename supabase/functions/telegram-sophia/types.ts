/**
 * Type definitions for Telegram Lead Routing
 */

// ==========================================
// TELEGRAM API TYPES
// ==========================================

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ==========================================
// DATABASE TYPES
// ==========================================

export interface Agent {
  id: string;
  full_name: string;
  mobile: string;
  communication_email: string | null;
  region: string;
  role: string;
  telegram_user_id: number | null;
  is_active: boolean;
  can_receive_leads: boolean;
}

export interface TelegramGroup {
  id: string;
  group_id: number;
  group_name: string | null;
  group_type: string | null;
  region: string | null;
  is_active: boolean;
  lead_routing_enabled: boolean;
  created_at: string;
}

export interface TelegramLead {
  id: string;
  source_group_id: number;
  source_group_name: string | null;
  original_message_id: string;
  original_message_text: string | null;
  sender_telegram_id: number | null;
  sender_name: string | null;
  property_reference_id: string | null;
  property_region: string | null;
  forwarded_to_agent_id: string | null;
  forwarded_to_telegram_id: number | null;
  forwarded_message_id: number | null;
  group_ack_message_id: number | null;
  client_language: string | null;
  status: "forwarded" | "contacted" | "closed" | "failed";
  created_at: string;
}

export interface LeadForwardingRotation {
  id: string;
  region: string;
  last_forwarded_to_agent_id: string | null;
  forward_count: number;
  updated_at: string;
}

// ==========================================
// LEAD ROUTING TYPES
// ==========================================

export interface LeadContext {
  message: TelegramMessage;
  group: TelegramGroup;
  propertyIds: string[];
  clientLanguage: "russian" | "english" | "unknown";
  requestedAgentName: string | null;
}

export interface ForwardResult {
  success: boolean;
  agent?: Agent;
  forwardedMessageId?: number;
  ackMessageId?: number;
  error?: string;
}
