/**
 * Telegram Group Message Search Service
 *
 * Searches for phone numbers in the indexed `telegram_group_messages` table.
 * The Telegram Bot API has no message-search endpoint, so we rely on
 * messages being indexed as they arrive via the Next.js webhook handler.
 *
 * Phase 12, Plan 01
 */

import { LogCategory, logger } from "../sophia-bot/utils/logger.ts";
import { getSupabaseAdmin } from "./db.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  groupName: string;
  groupChatId: number;
  messageDate: string;
  senderName: string | null;
  messageText: string;
}

// ---------------------------------------------------------------------------
// Regional Group IDs
// ---------------------------------------------------------------------------

export const REGIONAL_GROUP_IDS: Record<string, number> = {
  paphos: -843_115_873,
  limassol: -768_604_814,
  larnaca: -870_056_882,
  nicosia: 0, // Not yet configured
};

export const ZYPRESS_OTHERS_CHAT_ID: number = -1_003_337_263_793;
export const VASYA_TELEGRAM_USER_ID = 0; // Replace with actual Vasya's Telegram user ID

// ---------------------------------------------------------------------------
// Phone Number Normalization
// ---------------------------------------------------------------------------

/**
 * Normalise a phone number into multiple search variants.
 *
 * Examples:
 *   +35722123456  -> ["22123456", "35722123456", "+35722123456"]
 *   0035722123456 -> ["22123456", "35722123456", "0035722123456"]
 *   99123456      -> ["99123456"]
 *   +4412345678   -> ["4412345678", "+4412345678"]
 */
export function normalizePhoneForSearch(phone: string): string[] {
  // Strip spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-()]/g, "");

  const variants: Set<string> = new Set();

  // Always add the cleaned version
  variants.add(cleaned);

  // Strip leading +
  if (cleaned.startsWith("+")) {
    const withoutPlus = cleaned.slice(1);
    variants.add(withoutPlus);

    // If Cyprus prefix +357, also add the local part
    if (withoutPlus.startsWith("357") && withoutPlus.length > 3) {
      variants.add(withoutPlus.slice(3));
    }
  }

  // Strip leading 00 (international dialing prefix)
  if (cleaned.startsWith("00")) {
    const withoutPrefix = cleaned.slice(2);
    variants.add(withoutPrefix);

    // If Cyprus prefix 357, also add the local part
    if (withoutPrefix.startsWith("357") && withoutPrefix.length > 3) {
      variants.add(withoutPrefix.slice(3));
    }
  }

  // If starts with 357 (no + or 00), also add local part
  if (
    cleaned.startsWith("357") &&
    !cleaned.startsWith("+") &&
    !cleaned.startsWith("00") &&
    cleaned.length > 3
  ) {
    variants.add(cleaned.slice(3));
  }

  return [...variants];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search indexed group messages for a phone number.
 *
 * @param phoneNumber  - Raw phone number to search (any format)
 * @param groupChatIds - Array of group chat IDs to search within
 * @param auditDate    - Only match messages from this date (YYYY-MM-DD). If omitted, searches all time.
 * @returns            - Array of matching messages
 *
 * @throws Error if no configured group IDs provided
 */
export async function searchPhoneInGroups(
  phoneNumber: string,
  groupChatIds: number[],
  auditDate?: string
): Promise<SearchResult[]> {
  // Guard: caller should pass only configured (non-zero) group IDs
  const validIds = groupChatIds.filter((id) => id !== 0);
  if (validIds.length === 0) {
    throw new Error(
      "No configured group chat IDs provided \u2014 all IDs are 0 (unconfigured)"
    );
  }

  const variants = normalizePhoneForSearch(phoneNumber);
  if (variants.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();

  try {
    // Build OR filter: message_text ilike '%variant%' for each variant
    const orFilter = variants.map((v) => `message_text.ilike.%${v}%`).join(",");

    let query = supabase
      .from("telegram_group_messages")
      .select(
        "group_name, group_chat_id, message_date, sender_name, message_text"
      )
      .in("group_chat_id", validIds)
      .or(orFilter);

    // Restrict to same-day messages when auditDate is provided
    if (auditDate) {
      query = query
        .gte("message_date", `${auditDate}T00:00:00+00`)
        .lt("message_date", `${auditDate}T23:59:59+00`);
    }

    const { data, error } = await query
      .order("message_date", { ascending: false })
      .limit(20);

    if (error) {
      logger.error("Error searching group messages", error, {
        category: LogCategory.DATABASE,
        operation: "searchPhoneInGroups",
        phoneNumber,
      });
      return [];
    }

    return (data || []).map((row) => ({
      groupName: row.group_name ?? "Unknown Group",
      groupChatId: row.group_chat_id,
      messageDate: row.message_date,
      senderName: row.sender_name ?? null,
      messageText: row.message_text ?? "",
    }));
  } catch (error) {
    logger.error(
      "Exception searching group messages",
      error instanceof Error ? error : new Error(String(error)),
      { category: LogCategory.DATABASE, operation: "searchPhoneInGroups" }
    );
    return [];
  }
}
