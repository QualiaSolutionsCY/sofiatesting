import type { ChatMessage } from "@/lib/types";

/**
 * Conversation History Pruning for Cost Optimization
 *
 * Limits conversation history to prevent unbounded token growth while
 * maintaining context quality.
 *
 * Strategy:
 * - Keep first message (initial context)
 * - Keep last N messages (recent conversation)
 * - Discard middle messages (less relevant)
 *
 * Benefits:
 * - 15-20% cost reduction in long conversations
 * - Bounded token growth
 * - Maintains quality for short conversations (no pruning if ≤ limit)
 */

// Default: Keep first message + last 9 messages (10 total)
// Can be overridden via environment variable
const DEFAULT_MAX_MESSAGES = 10;

/**
 * Get the maximum number of messages to keep in conversation history
 */
export function getMaxConversationMessages(): number {
  const envValue = process.env.MAX_CONVERSATION_MESSAGES;

  if (!envValue) {
    return DEFAULT_MAX_MESSAGES;
  }

  const parsed = Number.parseInt(envValue, 10);

  // Validate: Must be at least 2 (first + last)
  if (Number.isNaN(parsed) || parsed < 2) {
    // Invalid value, use default
    return DEFAULT_MAX_MESSAGES;
  }

  return parsed;
}

/**
 * Prune conversation history to prevent unbounded token growth
 *
 * @param messages - All conversation messages (including current message)
 * @returns Pruned messages maintaining context quality
 *
 * Examples:
 * - 5 messages, limit 10  → Keep all 5 (no pruning)
 * - 15 messages, limit 10 → Keep first + last 9 = 10 total
 * - 100 messages, limit 10 → Keep first + last 9 = 10 total
 */
export function pruneConversationHistory(
  messages: ChatMessage[]
): ChatMessage[] {
  const maxMessages = getMaxConversationMessages();

  // No pruning needed if below limit
  if (messages.length <= maxMessages) {
    return messages;
  }

  // Keep first message (initial context)
  const firstMessage = messages[0];

  // Keep last (maxMessages - 1) messages
  const recentMessages = messages.slice(-(maxMessages - 1));

  // Combine: first message + recent messages
  const prunedMessages = [firstMessage, ...recentMessages];


  return prunedMessages;
}

/**
 * Calculate token savings from conversation pruning
 *
 * @param originalCount - Original message count
 * @param prunedCount - Pruned message count
 * @param avgTokensPerMessage - Average tokens per message (default: 150)
 * @returns Estimated token savings
 */
export function estimatePruningSavings(
  originalCount: number,
  prunedCount: number,
  avgTokensPerMessage = 150
): number {
  const messagesSaved = originalCount - prunedCount;
  return messagesSaved * avgTokensPerMessage;
}
