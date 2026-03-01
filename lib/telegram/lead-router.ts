import "server-only";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  // Use Supabase native tables (snake_case) for lead routing
  supabaseAgent,
  supabaseLeadForwardingRotation,
  supabaseTelegramGroup,
  supabaseTelegramLead,
} from "../db/schema";
import { logger } from "../logger";
import { getTelegramClient } from "./client";
import { indexGroupMessage } from "./message-indexer";

const log = logger.telegram.child("lead-router");

import { handleAuditAlertResponse } from "./audit-response-handler";
import {
  AGENT_REQUEST_PATTERN,
  detectRussianLanguage,
  extractRegionFromText,
  getRegionalManagerForOthers,
  isLarnacaRegion,
  isLimassolRegion,
  isOthersGroup,
  LARNACA_AGENTS,
  LIMASSOL_AGENTS,
  OTHERS_GROUP_AGENTS,
  RUSSIAN_SPEAKER_AGENT,
} from "./routing-constants";
import type { TelegramMessage } from "./types";

// Top-level regex for lead mention detection
const LEAD_MENTION_PATTERN =
  /\b(lead|client|enquiry|inquiry|interested|viewing|buyer|purchaser)\b/i;

/**
 * Check if the chat type is a group or supergroup
 */
export function isGroupChat(
  chatType: string
): chatType is "group" | "supergroup" {
  return chatType === "group" || chatType === "supergroup";
}

/**
 * Extract property reference IDs from message text
 * Matches patterns like: ZYP-1234, ZYP1234, or zyprus.com/property/xyz links
 */
export function extractPropertyIds(text: string): string[] {
  const ids: string[] = [];

  // Match ZYP-1234 or ZYP1234 patterns
  const refPattern = /ZYP[-]?\d+/gi;
  const refMatches = text.match(refPattern);
  if (refMatches) {
    ids.push(...refMatches.map((m) => m.toUpperCase().replace("-", "-")));
  }

  // Match zyprus.com property links
  const urlPattern =
    /zyprus\.com\/(?:property|properties|listing)\/([a-zA-Z0-9-]+)/gi;
  for (const urlMatch of text.matchAll(urlPattern)) {
    ids.push(urlMatch[1]);
  }

  return [...new Set(ids)]; // Remove duplicates
}

/**
 * Get or create a Telegram group record
 */
async function getOrCreateGroup(
  chatId: number,
  title: string | undefined,
  type: string
): Promise<typeof supabaseTelegramGroup.$inferSelect | null> {
  try {
    // Try to find existing group
    const [existingGroup] = await db
      .select()
      .from(supabaseTelegramGroup)
      .where(eq(supabaseTelegramGroup.groupId, chatId))
      .limit(1);

    if (existingGroup) {
      // Update title if changed
      if (title && existingGroup.groupName !== title) {
        await db
          .update(supabaseTelegramGroup)
          .set({ groupName: title })
          .where(eq(supabaseTelegramGroup.id, existingGroup.id));
      }
      return existingGroup;
    }

    // Detect group type from name
    const groupType = detectGroupType(title);

    // Create new group record
    const [newGroup] = await db
      .insert(supabaseTelegramGroup)
      .values({
        groupId: chatId,
        groupName: title || `Telegram ${type}`,
        groupType,
        region: detectRegionFromName(title),
        isActive: true,
        leadRoutingEnabled: true,
      })
      .returning();

    log.info("Created new Telegram group record", {
      id: newGroup.id,
      groupName: newGroup.groupName,
      groupId: chatId,
    });

    return newGroup;
  } catch (error) {
    log.error("Error getting/creating Telegram group", error);
    return null;
  }
}

/**
 * Detect group type from name
 */
function detectGroupType(name: string | undefined): string {
  if (!name) {
    return "others";
  }

  const nameLower = name.toLowerCase();

  if (nameLower.includes("alla") || nameLower.includes("all")) {
    return "all";
  }
  if (nameLower.includes("limassol")) {
    return "limassol";
  }
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) {
    return "paphos";
  }
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) {
    return "larnaca";
  }
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) {
    return "nicosia";
  }
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) {
    return "famagusta";
  }

  return "others";
}

/**
 * Detect region from group name
 */
function detectRegionFromName(name: string | undefined): string | null {
  if (!name) {
    return null;
  }

  const nameLower = name.toLowerCase();

  if (nameLower.includes("limassol")) {
    return "Limassol";
  }
  if (nameLower.includes("paphos") || nameLower.includes("pafos")) {
    return "Paphos";
  }
  if (nameLower.includes("larnaca") || nameLower.includes("larnaka")) {
    return "Larnaca";
  }
  if (nameLower.includes("nicosia") || nameLower.includes("lefkosia")) {
    return "Nicosia";
  }
  if (nameLower.includes("famagusta") || nameLower.includes("ammochostos")) {
    return "Famagusta";
  }
  if (nameLower.includes("alla") || nameLower.includes("all")) {
    return "All";
  }

  return null;
}

/**
 * Get the target agent(s) for lead forwarding based on region
 * Implements SOPHIA spec routing rules:
 * - Limassol: ONLY Michelle Longridge or Diana Kultaseva
 * - Others group: Regional manager based on property location, fallback to rotation
 * - Other regions: Standard regional routing
 */
async function getTargetAgents(
  region: string | null,
  groupType: string | null,
  _propertyId?: string | null,
  messageText?: string
): Promise<(typeof supabaseAgent.$inferSelect)[]> {
  try {
    // RULE 1: Limassol leads go ONLY to Michelle or Diana
    // Per spec: "RULE: Never forward to individual agents, FORWARD TO: Michelle OR Diana (only these two)"
    if (isLimassolRegion(region)) {
      log.debug("Limassol region detected - routing to Michelle/Diana only");
      const agents = await db
        .select()
        .from(supabaseAgent)
        .where(
          and(
            inArray(supabaseAgent.fullName, LIMASSOL_AGENTS),
            eq(supabaseAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 1.5: Larnaca leads go to Michelle/Diana (same as Limassol)
    if (isLarnacaRegion(region)) {
      log.debug("Larnaca region detected - routing to Michelle/Diana");
      const agents = await db
        .select()
        .from(supabaseAgent)
        .where(
          and(
            inArray(supabaseAgent.fullName, LARNACA_AGENTS),
            eq(supabaseAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 2: "Zyprus Others" group leads go to regional manager based on property location
    // Per spec: "Forward to regional manager of that area"
    if (groupType && isOthersGroup(groupType)) {
      // Try to extract region from message text
      const extractedRegion = extractRegionFromText(messageText || "");
      const regionalManager = getRegionalManagerForOthers(extractedRegion);

      if (regionalManager) {
        log.debug("Others group routing", {
          extractedRegion,
          regionalManager,
        });
        // Query for the specific regional manager
        const agents = await db
          .select()
          .from(supabaseAgent)
          .where(
            and(
              eq(supabaseAgent.fullName, regionalManager),
              eq(supabaseAgent.isActive, true)
            )
          );

        if (agents.length > 0) {
          return agents;
        }
        // If manager not found, fall through to rotation
        log.debug("Regional manager not found, falling back to rotation", {
          regionalManager,
        });
      }

      // Fallback: no region detected or manager not found, use rotation
      log.debug("Others group - no region extracted, routing to rotation");
      const agents = await db
        .select()
        .from(supabaseAgent)
        .where(
          and(
            inArray(supabaseAgent.fullName, OTHERS_GROUP_AGENTS),
            eq(supabaseAgent.isActive, true)
          )
        );
      return agents;
    }

    // RULE 3: For "All Leads" group, get active agents who can receive leads
    if (!region || region === "All") {
      const agents = await db
        .select()
        .from(supabaseAgent)
        .where(
          and(
            eq(supabaseAgent.isActive, true),
            eq(supabaseAgent.canReceiveLeads, true)
          )
        )
        .limit(5);
      return agents;
    }

    // RULE 4: For other regions (Paphos, Larnaca, Nicosia, Famagusta)
    // Get agents for specific region (case-insensitive match)
    const normalizedRegion = region.toLowerCase();
    const agents = await db
      .select()
      .from(supabaseAgent)
      .where(
        and(
          eq(supabaseAgent.region, normalizedRegion),
          eq(supabaseAgent.isActive, true),
          eq(supabaseAgent.canReceiveLeads, true)
        )
      );

    return agents;
  } catch (error) {
    log.error("Error getting target agents", error, { region, groupType });
    return [];
  }
}

/**
 * Detect if a client requests a specific agent by name
 * Per spec: "Client wants to speak with [Agent Name]" → Forward directly to named agent
 */
async function detectRequestedAgent(
  messageText: string
): Promise<typeof supabaseAgent.$inferSelect | null> {
  const match = messageText.match(AGENT_REQUEST_PATTERN);
  if (!match) return null;

  const requestedName = match[1].trim();
  log.debug("Detected agent request", { requestedName });

  // Look for partial name match (first name or full name)
  const agents = await db
    .select()
    .from(supabaseAgent)
    .where(
      and(
        or(
          ilike(supabaseAgent.fullName, `${requestedName}%`),
          ilike(supabaseAgent.fullName, `% ${requestedName}%`)
        ),
        eq(supabaseAgent.isActive, true)
      )
    )
    .limit(1);

  if (agents.length > 0) {
    log.debug("Found requested agent", { agentName: agents[0].fullName });
    return agents[0];
  }

  log.debug("No agent found matching request", { requestedName });
  return null;
}

/**
 * Select the best agent for Limassol leads, considering Russian language preference
 * Per spec: "CONDITION: If lead appears Russian-speaking → prefer Diana"
 */
function selectLimassolAgent(
  agents: (typeof supabaseAgent.$inferSelect)[],
  isRussianSpeaking: boolean
): typeof supabaseAgent.$inferSelect | null {
  if (agents.length === 0) return null;

  // If Russian-speaking, prefer Diana
  if (isRussianSpeaking) {
    const diana = agents.find((a) => a.fullName === RUSSIAN_SPEAKER_AGENT);
    if (diana) {
      log.debug("Russian-speaking lead detected - routing to Diana");
      return diana;
    }
  }

  // Otherwise return first available (will be rotated)
  return agents[0];
}

/**
 * Get the next agent in rotation for fair lead distribution
 * Uses round-robin algorithm based on stored rotation state
 */
async function getNextAgentInRotation(
  region: string,
  availableAgents: (typeof supabaseAgent.$inferSelect)[]
): Promise<typeof supabaseAgent.$inferSelect | null> {
  if (availableAgents.length === 0) {
    return null;
  }
  if (availableAgents.length === 1) {
    return availableAgents[0];
  }

  // Get current rotation state for this region
  const rotationState = await db
    .select()
    .from(supabaseLeadForwardingRotation)
    .where(eq(supabaseLeadForwardingRotation.region, region.toLowerCase()))
    .limit(1);

  // Sort agents by ID for consistent ordering across calls
  const sortedAgents = [...availableAgents].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  if (rotationState.length === 0 || !rotationState[0].lastForwardedToAgentId) {
    // First lead for this region - start with first agent
    log.debug("First lead for region, starting rotation", {
      region,
      agentName: sortedAgents[0].fullName,
    });
    return sortedAgents[0];
  }

  const lastAgentId = rotationState[0].lastForwardedToAgentId;
  const lastIndex = sortedAgents.findIndex((a) => a.id === lastAgentId);

  if (lastIndex === -1) {
    // Last agent no longer available - start fresh
    log.debug("Previous agent no longer available, restarting rotation", {
      region,
    });
    return sortedAgents[0];
  }

  // Round-robin: next agent in sequence
  const nextIndex = (lastIndex + 1) % sortedAgents.length;
  const nextAgent = sortedAgents[nextIndex];

  log.debug("Rotation selected next agent", {
    region,
    lastAgent: sortedAgents[lastIndex].fullName,
    nextAgent: nextAgent.fullName,
  });

  return nextAgent;
}

/**
 * Update the rotation state after successfully forwarding a lead
 */
async function updateRotationState(
  region: string,
  agentId: string
): Promise<void> {
  const now = new Date();

  try {
    await db
      .insert(supabaseLeadForwardingRotation)
      .values({
        region: region.toLowerCase(),
        lastForwardedToAgentId: agentId,
        forwardCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: supabaseLeadForwardingRotation.region,
        set: {
          lastForwardedToAgentId: agentId,
          forwardCount: sql`${supabaseLeadForwardingRotation.forwardCount} + 1`,
          updatedAt: now,
        },
      });

    log.debug("Updated rotation state", { region, agentId });
  } catch (error) {
    log.error("Failed to update rotation state", error, { region, agentId });
    // Don't throw - rotation state update is non-critical
  }
}

/**
 * Check if a lead was already forwarded recently (deduplication)
 * Prevents the same property from being forwarded multiple times within 10 minutes
 */
async function isRecentDuplicate(
  propertyId: string | null,
  sourceGroupId: number
): Promise<boolean> {
  if (!propertyId) return false;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  try {
    const recentLeads = await db
      .select({ id: supabaseTelegramLead.id })
      .from(supabaseTelegramLead)
      .where(
        and(
          eq(supabaseTelegramLead.propertyReferenceId, propertyId),
          eq(supabaseTelegramLead.sourceGroupId, sourceGroupId),
          sql`${supabaseTelegramLead.createdAt} > ${tenMinutesAgo}`
        )
      )
      .limit(1);

    if (recentLeads.length > 0) {
      log.debug("Duplicate lead detected", { propertyId, sourceGroupId });
      return true;
    }

    return false;
  } catch (error) {
    log.error("Error checking for duplicate lead", error, { propertyId });
    return false; // On error, allow the lead through
  }
}

/**
 * Log a lead in the database
 */
async function logLead(data: {
  propertyReferenceId: string | null;
  sourceGroupId: number;
  sourceGroupName: string | null;
  originalMessageId: string;
  originalMessageText: string | null;
  senderTelegramId: number | null;
  senderName: string | null;
  forwardedToAgentId: string | null;
  forwardedToTelegramId: number | null;
  region: string | null;
  clientLanguage?: string;
}): Promise<void> {
  try {
    await db.insert(supabaseTelegramLead).values({
      propertyReferenceId: data.propertyReferenceId,
      sourceGroupId: data.sourceGroupId,
      sourceGroupName: data.sourceGroupName,
      originalMessageId: data.originalMessageId,
      originalMessageText: data.originalMessageText,
      senderTelegramId: data.senderTelegramId,
      senderName: data.senderName,
      forwardedToAgentId: data.forwardedToAgentId,
      forwardedToTelegramId: data.forwardedToTelegramId,
      propertyRegion: data.region,
      clientLanguage: data.clientLanguage || null,
      status: "forwarded",
    });
  } catch (error) {
    log.error("Error logging lead", error, {
      propertyReferenceId: data.propertyReferenceId,
    });
  }
}

/**
 * Handle messages from Telegram groups
 * Main entry point for lead management
 *
 * Implements SOPHIA AI spec routing rules:
 * 1. If client requests specific agent → route directly to that agent
 * 2. Limassol leads → Michelle or Diana only (prefer Diana for Russian speakers)
 * 3. "Zyprus Others" group → Lauren, Charalambos, or Lysandros
 * 4. Other regions → standard regional routing with fair rotation
 */
export async function handleGroupMessage(
  message: TelegramMessage
): Promise<void> {
  // Check if this is a response to an audit alert (before lead routing)
  const isAlertResponse = await handleAuditAlertResponse(message);
  if (isAlertResponse) {
    return; // Don't process as a lead
  }

  // Index message for phone number search (fire-and-forget)
  indexGroupMessage(message).catch(() => {});

  const telegramClient = getTelegramClient();
  const chatId = message.chat.id;
  const messageText = message.text || message.caption || "";

  // Get or create group record
  const group = await getOrCreateGroup(
    chatId,
    message.chat.title,
    message.chat.type
  );

  // Check DB flag — allows toggling groups on/off from Supabase dashboard without redeploying
  if (group && !group.leadRoutingEnabled) {
    log.debug("Ignoring group message — lead routing disabled for this group", {
      groupName: group.groupName,
      region: group.region,
    });
    return;
  }

  // Extract property IDs from message
  const propertyIds = extractPropertyIds(messageText);

  // If no property IDs found, we don't process as a lead
  if (propertyIds.length === 0) {
    // Check if message mentions "lead", "client", "enquiry", etc.
    const isLeadMention = LEAD_MENTION_PATTERN.test(messageText);

    if (!isLeadMention) {
      // Not a lead message, ignore silently
      return;
    }
  }

  const region = group?.region || detectRegionFromName(message.chat.title);
  const groupType = group?.groupType || detectGroupType(message.chat.title);
  const primaryPropertyId = propertyIds[0] || null;

  // Check for duplicate lead (same property forwarded within 10 minutes)
  if (primaryPropertyId) {
    const isDuplicate = await isRecentDuplicate(primaryPropertyId, chatId);
    if (isDuplicate) {
      // Silently ignore duplicate leads
      log.debug("Skipping duplicate lead", { propertyId: primaryPropertyId });
      return;
    }
  }

  // Detect client language (Russian vs other)
  const senderName = message.from
    ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim()
    : "";
  const isRussianSpeaking = detectRussianLanguage(messageText, senderName);
  const clientLanguage = isRussianSpeaking ? "russian" : "english";

  // RULE 0: Check if client requests a specific agent
  // Per spec: "Client wants to speak with [Agent Name]" → Forward directly to named agent
  const requestedAgent = await detectRequestedAgent(messageText);
  if (requestedAgent) {
    log.info("Client requested specific agent", {
      agentName: requestedAgent.fullName,
    });
    await forwardLeadToAgent(
      telegramClient,
      message,
      requestedAgent,
      primaryPropertyId,
      region,
      clientLanguage,
      "Requested by client"
    );
    return;
  }

  // Get target agents based on region and group type
  const targetAgents = await getTargetAgents(
    region,
    groupType,
    primaryPropertyId,
    messageText
  );

  if (targetAgents.length === 0) {
    log.warn("No target agents found for region", { region });
    // Acknowledge in group but note no agents available
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead noted. No agents currently assigned for ${region || "this region"}.`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      log.error("Failed to send acknowledgment", error);
    }
    return;
  }

  // Filter to agents with Telegram IDs
  const agentsWithTelegram = targetAgents.filter((a) => a.telegramUserId);

  if (agentsWithTelegram.length === 0) {
    log.warn("No agents with Telegram IDs for region", { region });
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead noted. Agents for ${region || "this region"} are not connected to Telegram.`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      log.error("Failed to send acknowledgment", error);
    }
    return;
  }

  // Select agent based on routing rules
  let selectedAgent: typeof supabaseAgent.$inferSelect | null = null;
  const effectiveRegion = region || "all";

  // For Limassol, apply Russian-speaking preference
  if (isLimassolRegion(region)) {
    selectedAgent = selectLimassolAgent(agentsWithTelegram, isRussianSpeaking);
    // If Russian speaker selected Diana, don't use rotation
    if (!isRussianSpeaking) {
      selectedAgent = await getNextAgentInRotation(
        "limassol",
        agentsWithTelegram
      );
    }
  } else if (isLarnacaRegion(region)) {
    // For Larnaca, use same logic as Limassol but without Russian preference
    selectedAgent = await getNextAgentInRotation("larnaca", agentsWithTelegram);
  } else {
    // Standard rotation for other regions
    selectedAgent = await getNextAgentInRotation(
      effectiveRegion,
      agentsWithTelegram
    );
  }

  if (!selectedAgent) {
    log.warn("No agent selected after rotation", { region: effectiveRegion });
    return;
  }

  // Forward the lead
  await forwardLeadToAgent(
    telegramClient,
    message,
    selectedAgent,
    primaryPropertyId,
    region,
    clientLanguage,
    effectiveRegion
  );

  // Update rotation state for fair distribution (skip for Russian-speaking Limassol)
  if (!(isLimassolRegion(region) && isRussianSpeaking)) {
    await updateRotationState(effectiveRegion, selectedAgent.id);
  }
}

/**
 * Forward a lead to a specific agent
 * Handles the actual Telegram forwarding and logging
 */
async function forwardLeadToAgent(
  telegramClient: ReturnType<typeof getTelegramClient>,
  message: TelegramMessage,
  agent: typeof supabaseAgent.$inferSelect,
  propertyId: string | null,
  region: string | null,
  clientLanguage: string,
  routingReason: string
): Promise<void> {
  const chatId = message.chat.id;
  const messageText = message.text || message.caption || "";

  if (!agent.telegramUserId) {
    log.warn("Agent has no Telegram ID", { agentName: agent.fullName });
    return;
  }

  try {
    // Forward the original message
    await telegramClient.forwardMessage({
      chatId: agent.telegramUserId,
      fromChatId: chatId,
      messageId: message.message_id,
    });

    // Send context message with property and sender info
    await telegramClient.sendMessage({
      chatId: agent.telegramUserId,
      text: `New lead from ${message.chat.title || "Zyprus Group"}${
        propertyId ? `\nProperty: ${propertyId}` : ""
      }\nFrom: ${message.from?.first_name || "Unknown"} ${
        message.from?.last_name || ""
      }\nRegion: ${region || "Unknown"}${
        clientLanguage === "russian" ? "\nLanguage: Russian" : ""
      }`,
    });

    log.info("Lead forwarded to agent", {
      agentName: agent.fullName,
      routingReason,
      propertyId,
    });

    // Log the lead
    await logLead({
      propertyReferenceId: propertyId,
      sourceGroupId: chatId,
      sourceGroupName: message.chat.title || null,
      originalMessageId: message.message_id.toString(),
      originalMessageText: messageText.substring(0, 2000),
      senderTelegramId: message.from?.id || null,
      senderName: message.from
        ? `${message.from.first_name} ${message.from.last_name || ""}`.trim()
        : null,
      forwardedToAgentId: agent.id,
      forwardedToTelegramId: agent.telegramUserId,
      region,
      clientLanguage,
    });

    // Acknowledge in group
    try {
      await telegramClient.sendMessage({
        chatId,
        text: `Lead forwarded to ${agent.fullName}`,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      log.error("Failed to send acknowledgment", error);
    }
  } catch (error) {
    log.error("Failed to forward to agent", error, {
      agentName: agent.fullName,
    });
  }
}
