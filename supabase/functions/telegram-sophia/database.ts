/**
 * Database operations for Telegram SOPHIA bot
 * Uses Supabase for chat history, message deduplication, and lead routing
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  detectGroupType,
  detectRegionFromName,
  normalizePhoneForSearch,
} from "./routing-constants.ts";
import type {
  Agent,
  LeadForwardingRotation,
  TelegramGroup,
  TelegramLead,
} from "./types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Message structure for conversation history
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Get conversation history for a Telegram user
 * Returns last 10 messages in chronological order
 */
export const getHistory = async (
  telegramUserId: number
): Promise<ChatMessage[]> => {
  try {
    const { data, error } = await supabase
      .from("telegram_chat_history")
      .select("role, content")
      .eq("telegram_user_id", telegramUserId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[DB] getHistory error:", error);
      return [];
    }

    // Reverse to get chronological order (oldest first)
    return (data || []).reverse() as ChatMessage[];
  } catch (error) {
    console.error("[DB] getHistory exception:", error);
    return [];
  }
};

/**
 * Add a message to conversation history
 */
export const addMessage = async (
  telegramUserId: number,
  role: "user" | "assistant",
  content: string
): Promise<boolean> => {
  try {
    const { error } = await supabase.from("telegram_chat_history").insert({
      telegram_user_id: telegramUserId,
      role,
      content,
    });

    if (error) {
      console.error("[DB] addMessage error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DB] addMessage exception:", error);
    return false;
  }
};

/**
 * Claim a message for processing (deduplication)
 * Uses atomic INSERT to prevent race conditions from duplicate webhooks
 *
 * @returns true if this request should process the message
 * @returns false if another request already claimed it (duplicate)
 */
export const claimMessage = async (
  messageKey: string,
  telegramUserId: number
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("telegram_processed_messages")
      .insert({
        message_key: messageKey,
        telegram_user_id: telegramUserId,
      });

    if (error) {
      // 23505 = unique constraint violation (already exists)
      if (error.code === "23505") {
        console.log("[DB] Duplicate message detected:", messageKey);
        return false;
      }
      console.error("[DB] claimMessage error:", error);
      // Fail-open: process message if DB error (avoid blocking messages)
      return true;
    }

    return true;
  } catch (error) {
    console.error("[DB] claimMessage exception:", error);
    // Fail-open
    return true;
  }
};

/**
 * Clear conversation history for a user
 * Called when user sends /clear command
 */
export const clearHistory = async (
  telegramUserId: number
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("telegram_chat_history")
      .delete()
      .eq("telegram_user_id", telegramUserId);

    if (error) {
      console.error("[DB] clearHistory error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DB] clearHistory exception:", error);
    return false;
  }
};

// ==========================================
// LEAD ROUTING DATABASE OPERATIONS
// ==========================================

/**
 * Get or create a Telegram group record
 * Auto-detects group type and region from name
 */
export const getOrCreateGroup = async (
  groupId: number,
  groupName: string | null
): Promise<TelegramGroup | null> => {
  try {
    // Try to find existing group
    const { data: existing, error: selectError } = await supabase
      .from("telegram_groups")
      .select("*")
      .eq("group_id", groupId)
      .single();

    if (existing && !selectError) {
      // Update name if changed
      if (groupName && existing.group_name !== groupName) {
        await supabase
          .from("telegram_groups")
          .update({ group_name: groupName })
          .eq("id", existing.id);
      }
      return existing as TelegramGroup;
    }

    // Create new group record
    const groupType = detectGroupType(groupName);
    const region = detectRegionFromName(groupName);

    const { data: newGroup, error: insertError } = await supabase
      .from("telegram_groups")
      .insert({
        group_id: groupId,
        group_name: groupName,
        group_type: groupType,
        region,
        is_active: true,
        lead_routing_enabled: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[DB] getOrCreateGroup insert error:", insertError);
      return null;
    }

    console.log(
      "[DB] Created new group:",
      newGroup?.group_name,
      "type:",
      groupType
    );
    return newGroup as TelegramGroup;
  } catch (error) {
    console.error("[DB] getOrCreateGroup exception:", error);
    return null;
  }
};

/**
 * Get agents by name list (for specific routing rules)
 * Only returns active agents who can receive leads
 */
export const getAgentsByNames = async (names: string[]): Promise<Agent[]> => {
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .in("full_name", names)
      .eq("is_active", true)
      .eq("can_receive_leads", true);

    if (error) {
      console.error("[DB] getAgentsByNames error:", error);
      return [];
    }

    return (data || []) as Agent[];
  } catch (error) {
    console.error("[DB] getAgentsByNames exception:", error);
    return [];
  }
};

/**
 * Get agents by region (for regional routing)
 * Only returns active agents who can receive leads
 */
export const getAgentsByRegion = async (region: string): Promise<Agent[]> => {
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("region", region.toLowerCase())
      .eq("is_active", true)
      .eq("can_receive_leads", true);

    if (error) {
      console.error("[DB] getAgentsByRegion error:", error);
      return [];
    }

    return (data || []) as Agent[];
  } catch (error) {
    console.error("[DB] getAgentsByRegion exception:", error);
    return [];
  }
};

/**
 * Escape SQL ILIKE wildcards to prevent injection
 */
const escapeILikeWildcards = (input: string): string => {
  return input.replace(/[%_\\]/g, "\\$&");
};

/**
 * Find agent by name (fuzzy match for client requests)
 */
export const findAgentByName = async (name: string): Promise<Agent | null> => {
  try {
    // Escape wildcards to prevent SQL injection
    const escapedName = escapeILikeWildcards(name);

    // Try exact match first
    const { data: exact, error: exactError } = await supabase
      .from("agents")
      .select("*")
      .ilike("full_name", `%${escapedName}%`)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (exact && !exactError) {
      return exact as Agent;
    }

    // Try first name only
    const firstName = escapeILikeWildcards(name.split(" ")[0]);
    const { data: partial, error: partialError } = await supabase
      .from("agents")
      .select("*")
      .ilike("full_name", `${firstName}%`)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (partial && !partialError) {
      return partial as Agent;
    }

    return null;
  } catch (error) {
    console.error("[DB] findAgentByName exception:", error);
    return null;
  }
};

/**
 * Find the agent who handled a previous forwarded lead from this caller in the
 * same Telegram group. Used to keep repeat callers with their original agent
 * instead of letting round-robin send them to a different person.
 *
 * Returns null if there's no prior record, or if the original agent is no
 * longer eligible to receive leads (inactive / can_receive_leads=false /
 * missing telegram_user_id). Caller should then fall through to normal routing.
 */
export const findPreviousAgentForCaller = async (
  callerPhone: string,
  sourceGroupId: number
): Promise<Agent | null> => {
  try {
    const variants = normalizePhoneForSearch(callerPhone);
    if (variants.length === 0) return null;

    // ASC = first-assignment wins. Repeat callers should go back to the agent
    // who handled the ORIGINAL lead, not whoever got the most recent one
    // (which may itself have been a routing mistake we're trying to fix).
    // The is_active / can_receive_leads / telegram_user_id guards below
    // handle departed agents by returning null → fall through to normal routing.
    const { data: lead, error: leadError } = await supabase
      .from("telegram_leads")
      .select("forwarded_to_agent_id")
      .eq("source_group_id", sourceGroupId)
      .in("caller_phone", variants)
      .not("forwarded_to_agent_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (leadError || !lead?.forwarded_to_agent_id) {
      return null;
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("id", lead.forwarded_to_agent_id)
      .eq("is_active", true)
      .eq("can_receive_leads", true)
      .not("telegram_user_id", "is", null)
      .maybeSingle();

    if (agentError || !agent) {
      return null;
    }

    return agent as Agent;
  } catch (error) {
    console.error("[DB] findPreviousAgentForCaller exception:", error);
    return null;
  }
};

/**
 * Find agent by phone number (for /register command)
 */
export const findAgentByPhone = async (
  phone: string
): Promise<Agent | null> => {
  try {
    // Normalize phone number (remove spaces, ensure +)
    let normalized = phone.replace(/\s/g, "");
    if (!normalized.startsWith("+")) {
      normalized = "+" + normalized;
    }

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("mobile", normalized)
      .single();

    if (error) {
      console.error("[DB] findAgentByPhone error:", error);
      return null;
    }

    return data as Agent;
  } catch (error) {
    console.error("[DB] findAgentByPhone exception:", error);
    return null;
  }
};

/**
 * Register agent's Telegram ID (link their account)
 */
export const registerAgentTelegram = async (
  agentId: string,
  telegramUserId: number
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from("agents")
      .update({ telegram_user_id: telegramUserId })
      .eq("id", agentId);

    if (error) {
      console.error("[DB] registerAgentTelegram error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DB] registerAgentTelegram exception:", error);
    return false;
  }
};

/**
 * Get agent by Telegram user ID
 */
export const getAgentByTelegramId = async (
  telegramUserId: number
): Promise<Agent | null> => {
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("telegram_user_id", telegramUserId)
      .single();

    if (error) {
      return null;
    }

    return data as Agent;
  } catch (error) {
    console.error("[DB] getAgentByTelegramId exception:", error);
    return null;
  }
};

/**
 * Check if a property was recently forwarded from this group (deduplication)
 * @param propertyId Property reference ID
 * @param sourceGroupId Telegram group ID
 * @param windowMinutes Deduplication window in minutes (default 10)
 */
export const isRecentDuplicate = async (
  propertyId: string,
  sourceGroupId: number,
  windowMinutes = 10
): Promise<boolean> => {
  try {
    const windowAgo = new Date(
      Date.now() - windowMinutes * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from("telegram_leads")
      .select("id")
      .eq("property_reference_id", propertyId)
      .eq("source_group_id", sourceGroupId)
      .gte("created_at", windowAgo)
      .limit(1);

    if (error) {
      console.error("[DB] isRecentDuplicate error:", error);
      return false; // Fail-open: allow forwarding if check fails
    }

    return (data?.length || 0) > 0;
  } catch (error) {
    console.error("[DB] isRecentDuplicate exception:", error);
    return false;
  }
};

/**
 * Log a forwarded lead to the database
 */
export const logLead = async (
  lead: Omit<TelegramLead, "id" | "created_at"> & {
    caller_phone?: string | null;
  }
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from("telegram_leads")
      .insert(lead)
      .select("id")
      .single();

    if (error) {
      console.error("[DB] logLead error:", error);
      return null;
    }

    return data?.id || null;
  } catch (error) {
    console.error("[DB] logLead exception:", error);
    return null;
  }
};

/**
 * Get rotation state for a region
 */
export const getRotationState = async (
  region: string
): Promise<LeadForwardingRotation | null> => {
  try {
    const { data, error } = await supabase
      .from("lead_forwarding_rotation")
      .select("*")
      .eq("region", region.toLowerCase())
      .single();

    if (error) {
      // No rotation state yet - that's OK
      return null;
    }

    return data as LeadForwardingRotation;
  } catch (error) {
    console.error("[DB] getRotationState exception:", error);
    return null;
  }
};

/**
 * Update rotation state after forwarding to an agent
 * Uses upsert to create if not exists
 */
export const updateRotationState = async (
  region: string,
  agentId: string
): Promise<boolean> => {
  try {
    const { error } = await supabase.from("lead_forwarding_rotation").upsert(
      {
        region: region.toLowerCase(),
        last_forwarded_to_agent_id: agentId,
        forward_count: 1,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "region",
      }
    );

    if (error) {
      console.error("[DB] updateRotationState error:", error);
      return false;
    }

    // Increment forward count
    await supabase.rpc("increment_forward_count", {
      p_region: region.toLowerCase(),
    });

    return true;
  } catch (error) {
    console.error("[DB] updateRotationState exception:", error);
    return false;
  }
};

// ==========================================
// REGISTRATION STATE (Database-backed)
// ==========================================

export interface RegistrationState {
  step: "awaiting_phone";
  created_at: string;
}

/**
 * Get registration state for a user from database
 * Returns null if no active registration or expired
 */
export const getRegistrationState = async (
  telegramUserId: number
): Promise<RegistrationState | null> => {
  try {
    const { data, error } = await supabase.rpc("get_registration_state", {
      p_user_id: telegramUserId,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    return {
      step: data[0].step as "awaiting_phone",
      created_at: data[0].created_at,
    };
  } catch (error) {
    console.error("[DB] getRegistrationState exception:", error);
    return null;
  }
};

/**
 * Set registration state for a user in database
 * Expires after 5 minutes
 */
export const setRegistrationState = async (
  telegramUserId: number,
  step: "awaiting_phone"
): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc("set_registration_state", {
      p_user_id: telegramUserId,
      p_step: step,
    });

    if (error) {
      console.error("[DB] setRegistrationState error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DB] setRegistrationState exception:", error);
    return false;
  }
};

/**
 * Clear registration state for a user
 */
export const clearRegistrationState = async (
  telegramUserId: number
): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc("clear_registration_state", {
      p_user_id: telegramUserId,
    });

    if (error) {
      console.error("[DB] clearRegistrationState error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[DB] clearRegistrationState exception:", error);
    return false;
  }
};

// ==========================================
// BATCH OPERATIONS
// ==========================================

/**
 * Check multiple property IDs for recent duplicates in a single query
 * Returns array of property IDs that are duplicates
 */
export const checkRecentDuplicatesBatch = async (
  propertyIds: string[],
  sourceGroupId: number,
  windowMinutes = 10
): Promise<string[]> => {
  if (propertyIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc("check_recent_duplicates", {
      p_property_ids: propertyIds,
      p_group_id: sourceGroupId,
      p_window_minutes: windowMinutes,
    });

    if (error) {
      console.error("[DB] checkRecentDuplicatesBatch error:", error);
      return []; // Fail-open: allow forwarding if check fails
    }

    return data || [];
  } catch (error) {
    console.error("[DB] checkRecentDuplicatesBatch exception:", error);
    return [];
  }
};

/**
 * Select next agent atomically using database function
 * Prevents race conditions in round-robin selection
 */
export const selectNextAgentAtomic = async (
  region: string,
  agentIds: string[]
): Promise<string | null> => {
  if (agentIds.length === 0) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("select_next_agent_atomic", {
      p_region: region.toLowerCase(),
      p_agent_ids: agentIds,
    });

    if (error) {
      console.error("[DB] selectNextAgentAtomic error:", error);
      // Fallback to first agent if atomic selection fails
      return agentIds[0];
    }

    return data;
  } catch (error) {
    console.error("[DB] selectNextAgentAtomic exception:", error);
    return agentIds[0];
  }
};
