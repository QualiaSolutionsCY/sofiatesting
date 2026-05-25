/**
 * Lead Router for Telegram Groups
 * Implements SOPHIA spec routing rules for forwarding leads to agents
 *
 * Routing Rules:
 * 1. Client requests specific agent by name → Direct forward
 * 2. Paphos region → 50/50 Marios A or Dimitris (round-robin)
 * 3. Limassol/Larnaca region → ONLY Michelle or Diana (prefer Diana for Russian)
 * 4. "Others" group (Nicosia, Famagusta) → Regional agents
 * 5. Other regions → Regional agents with round-robin rotation
 * 6. Deduplication: 10-minute window per property per group
 */

import {
  checkRecentDuplicatesBatch,
  findAgentByName,
  findPreviousAgentForCaller,
  getAgentsByNames,
  getAgentsByRegion,
  getOrCreateGroup,
  logLead,
  selectNextAgentAtomic,
  updateRotationState,
} from "./database.ts";
import {
  detectRegionFromText,
  detectRentalIntent,
  detectRussianLanguage,
  extractCallerPhone,
  extractPropertyIds,
  extractRequestedAgent,
  extractZyprusUrls,
  isLarnacaRegion,
  isLeadMessage,
  isLimassolRegion,
  isOthersGroup,
  LARNACA_AGENTS,
  LIMASSOL_AGENTS,
  OTHERS_GROUP_AGENTS,
  PAPHOS_AGENTS,
  PAPHOS_OFFICE_FALLBACK_AGENTS,
  RUSSIAN_SPEAKER_AGENT,
} from "./routing-constants.ts";
import { forwardMessage, sendMessage } from "./telegram-client.ts";
import type {
  Agent,
  ForwardResult,
  TelegramGroup,
  TelegramMessage,
} from "./types.ts";
import { getOwnerFromUrls } from "./zyprus-api.ts";

// Full-name overrides for region-based routing. A missing agent (inactive,
// no telegram_user_id, etc.) falls through to the group's normal routing.
const REGION_PRIMARY_AGENT: Record<string, string> = {
  famagusta: "Narine Akopyan",
  nicosia: "Ivan Kazakov",
  larnaca: "Lysandros Ioanni",
  limassol: "Michelle Longridge",
};

const PAPHOS_RENTAL_AGENT = "Evelina Neophytou";

// ==========================================
// FORWARDING HELPER
// ==========================================

/**
 * Forward lead message to agent and send acknowledgment to group
 */
const forwardLeadToAgent = async (
  message: TelegramMessage,
  group: TelegramGroup,
  agent: Agent,
  propertyIds: string[],
  clientLanguage: "russian" | "english" | "unknown",
  callerPhone: string | null = null
): Promise<ForwardResult> => {
  const chatId = message.chat.id;
  const agentTelegramId = agent.telegram_user_id;

  if (!agentTelegramId) {
    console.error(`[LeadRouter] Agent ${agent.full_name} has no Telegram ID`);
    return { success: false, error: "agent_not_registered" };
  }

  console.log(
    `[LeadRouter] Forwarding to ${agent.full_name} (${agentTelegramId})`
  );

  // 1. Forward the original message to agent
  const forwardedMessageId = await forwardMessage(
    agentTelegramId,
    chatId,
    message.message_id
  );

  if (!forwardedMessageId) {
    console.error(
      `[LeadRouter] Failed to forward to ${agent.full_name} (${agentTelegramId}) — likely needs /start`
    );

    // Log the failed attempt so audit shows the lead exists, even though
    // delivery failed. Caller decides whether to fall through to a fallback.
    const senderName = message.from
      ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim()
      : null;

    await logLead({
      source_group_id: chatId,
      source_group_name: group.group_name,
      original_message_id: String(message.message_id),
      original_message_text: message.text || null,
      sender_telegram_id: message.from?.id || null,
      sender_name: senderName,
      property_reference_id: propertyIds[0] || null,
      property_region: group.region,
      forwarded_to_agent_id: agent.id,
      forwarded_to_telegram_id: agentTelegramId,
      forwarded_message_id: null,
      group_ack_message_id: null,
      client_language: clientLanguage,
      status: "forward_failed",
      caller_phone: callerPhone,
    });

    return { success: false, error: "forward_failed" };
  }

  // 2. Send acknowledgment to group
  const ackText = `✓ Lead forwarded to ${agent.full_name}`;
  const ackSuccess = await sendMessage(chatId, ackText, message.message_id);
  const ackMessageId = ackSuccess ? message.message_id : null;

  // 3. Log lead to database
  const senderName = message.from
    ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim()
    : null;

  await logLead({
    source_group_id: chatId,
    source_group_name: group.group_name,
    original_message_id: String(message.message_id),
    original_message_text: message.text || null,
    sender_telegram_id: message.from?.id || null,
    sender_name: senderName,
    property_reference_id: propertyIds[0] || null,
    property_region: group.region,
    forwarded_to_agent_id: agent.id,
    forwarded_to_telegram_id: agentTelegramId,
    forwarded_message_id: forwardedMessageId,
    group_ack_message_id: ackMessageId,
    client_language: clientLanguage,
    status: "forwarded",
    caller_phone: callerPhone,
  });

  // 4. Update rotation state
  if (group.region) {
    await updateRotationState(group.region, agent.id);
  }

  console.log(`[LeadRouter] Successfully forwarded lead to ${agent.full_name}`);

  return {
    success: true,
    agent,
    forwardedMessageId,
    ackMessageId: ackMessageId || undefined,
  };
};

// ==========================================
// AGENT SELECTION HELPERS
// ==========================================

/**
 * Select next agent in round-robin rotation using atomic database function
 * Prevents race conditions when multiple leads arrive simultaneously
 */
const selectNextInRotation = async (
  agents: Agent[],
  region: string | null
): Promise<Agent | null> => {
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];

  const rotationKey = region?.toLowerCase() || "default";
  const agentIds = agents.map((a) => a.id);

  // Use atomic selection to prevent race conditions
  const selectedAgentId = await selectNextAgentAtomic(rotationKey, agentIds);

  if (!selectedAgentId) {
    console.log(
      "[LeadRouter] Atomic selection returned null, using first agent"
    );
    return agents[0];
  }

  // Find the selected agent
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  if (!selectedAgent) {
    console.log(
      "[LeadRouter] Selected agent not found in list, using first agent"
    );
    return agents[0];
  }

  console.log(
    `[LeadRouter] Atomic round-robin selected: ${selectedAgent.full_name}`
  );
  return selectedAgent;
};

/**
 * Select agent from eligible list
 * Applies Russian preference or round-robin
 */
const selectAgent = async (
  agents: Agent[],
  isRussian: boolean,
  region: string | null
): Promise<Agent | null> => {
  if (agents.length === 0) return null;
  if (agents.length === 1) return agents[0];

  // Russian preference: Diana if available
  if (isRussian) {
    const russianAgent = agents.find(
      (a) => a.full_name === RUSSIAN_SPEAKER_AGENT
    );
    if (russianAgent) {
      console.log(
        "[LeadRouter] Selected Russian-speaking agent:",
        russianAgent.full_name
      );
      return russianAgent;
    }
  }

  // Round-robin selection
  return await selectNextInRotation(agents, region);
};

// ==========================================
// ROUTING LOGIC
// ==========================================

/**
 * Get target agents based on group type and region
 */
const getTargetAgents = async (group: TelegramGroup): Promise<Agent[]> => {
  // RULE 1/1.5: Limassol or Larnaca → Michelle/Diana + Lauren/Qualia
  if (isLimassolRegion(group.region) || isLarnacaRegion(group.region)) {
    console.log(
      "[LeadRouter] Limassol/Larnaca region - routing to LIMASSOL_AGENTS"
    );
    return await getAgentsByNames(LIMASSOL_AGENTS);
  }

  // RULE 2: Paphos region → 50/50 Marios A and Dimitris ONLY
  if (group.region?.toLowerCase() === "paphos") {
    console.log(
      "[LeadRouter] Paphos region - routing 50/50 to Marios A / Dimitris"
    );
    return await getAgentsByNames(PAPHOS_OFFICE_FALLBACK_AGENTS);
  }

  // RULE 3: "Others" group → Others agents
  if (isOthersGroup(group.group_type)) {
    console.log("[LeadRouter] Others group - routing to OTHERS_GROUP_AGENTS");
    return await getAgentsByNames(OTHERS_GROUP_AGENTS);
  }

  // RULE 4: Regional routing (fallback to DB lookup)
  if (group.region) {
    console.log(`[LeadRouter] Regional routing for: ${group.region}`);
    const regionalAgents = await getAgentsByRegion(group.region);
    if (regionalAgents.length > 0) {
      return regionalAgents;
    }
  }

  // Fallback: "All" group or unknown - use Limassol agents
  console.log("[LeadRouter] Fallback to Limassol agents");
  return await getAgentsByNames(LIMASSOL_AGENTS);
};

// ==========================================
// PAPHOS OWNER-BASED ROUTING
// ==========================================

/**
 * Handle Paphos-specific routing based on listing ownership from Zyprus API
 *
 * Rules:
 * - If listing belongs to a Paphos agent → forward to that agent
 * - If listing belongs to office → 50/50 Marios A or Dimitris
 * - If API fails or no owner found → return null to fall through to regular routing
 */
const handlePaphosOwnerRouting = async (
  message: TelegramMessage,
  group: TelegramGroup,
  text: string,
  propertyIds: string[],
  isRussian: boolean,
  callerPhone: string | null
): Promise<ForwardResult | null> => {
  // Extract Zyprus URLs from message
  const zyprusUrls = extractZyprusUrls(text);

  if (zyprusUrls.length === 0) {
    console.log(
      "[LeadRouter] No Zyprus URLs found in message, skipping owner check"
    );
    return null;
  }

  console.log(
    `[LeadRouter] Found ${zyprusUrls.length} Zyprus URLs, checking ownership...`
  );

  try {
    // Get ownership info from Zyprus API
    const ownerInfo = await getOwnerFromUrls(zyprusUrls);

    if (!ownerInfo || !ownerInfo.found) {
      console.log(
        "[LeadRouter] No listing found or API failed, falling back to regular routing"
      );
      return null;
    }

    console.log(
      `[LeadRouter] Listing "${ownerInfo.title}" owner: ${ownerInfo.ownerAgentName || "OFFICE"}`
    );

    let targetAgent: Agent | null = null;

    if (ownerInfo.isOfficeOwned) {
      // Office-owned: 50/50 between Marios A and Dimitris
      console.log(
        "[LeadRouter] Office-owned listing - using 50/50 Marios A / Dimitris"
      );
      const fallbackAgents = await getAgentsByNames(
        PAPHOS_OFFICE_FALLBACK_AGENTS
      );
      const registeredFallback = fallbackAgents.filter(
        (a) => a.telegram_user_id !== null
      );

      if (registeredFallback.length === 0) {
        console.log(
          "[LeadRouter] No fallback agents registered, falling back to regular routing"
        );
        return null;
      }

      // Use atomic round-robin for 50/50 selection
      targetAgent = await selectNextInRotation(
        registeredFallback,
        "paphos_office"
      );
    } else if (ownerInfo.ownerAgentName) {
      // Agent owns the listing - find them in database
      console.log(
        `[LeadRouter] Listing owned by agent: ${ownerInfo.ownerAgentName}`
      );
      const ownerAgent = await findAgentByName(ownerInfo.ownerAgentName);

      if (ownerAgent && ownerAgent.telegram_user_id) {
        // Check if owner is in Paphos team
        const isPaphosAgent = PAPHOS_AGENTS.some(
          (name) => name.toLowerCase() === ownerAgent.full_name.toLowerCase()
        );

        if (isPaphosAgent) {
          console.log(
            `[LeadRouter] Owner ${ownerAgent.full_name} is in Paphos team`
          );
          targetAgent = ownerAgent;
        } else {
          console.log(
            `[LeadRouter] Owner ${ownerAgent.full_name} is NOT in Paphos team, using fallback`
          );
          // Owner not in Paphos team - treat as office-owned
          const fallbackAgents = await getAgentsByNames(
            PAPHOS_OFFICE_FALLBACK_AGENTS
          );
          const registeredFallback = fallbackAgents.filter(
            (a) => a.telegram_user_id !== null
          );
          if (registeredFallback.length > 0) {
            targetAgent = await selectNextInRotation(
              registeredFallback,
              "paphos_office"
            );
          }
        }
      } else {
        console.log(
          `[LeadRouter] Owner agent ${ownerInfo.ownerAgentName} not found or not registered`
        );
        // Owner not found - treat as office-owned
        const fallbackAgents = await getAgentsByNames(
          PAPHOS_OFFICE_FALLBACK_AGENTS
        );
        const registeredFallback = fallbackAgents.filter(
          (a) => a.telegram_user_id !== null
        );
        if (registeredFallback.length > 0) {
          targetAgent = await selectNextInRotation(
            registeredFallback,
            "paphos_office"
          );
        }
      }
    }

    if (!targetAgent) {
      console.log(
        "[LeadRouter] No target agent determined, falling back to regular routing"
      );
      return null;
    }

    // Forward to the selected agent
    return await forwardLeadToAgent(
      message,
      group,
      targetAgent,
      propertyIds,
      isRussian ? "russian" : "english",
      callerPhone
    );
  } catch (error) {
    console.error("[LeadRouter] Error in owner-based routing:", error);
    return null; // Fall through to regular routing on error
  }
};

// ==========================================
// MAIN ENTRY POINT
// ==========================================

/**
 * Handle a message from a Telegram group
 * Checks if it's a lead-related message and forwards to appropriate agent
 */
export const handleGroupMessage = async (
  message: TelegramMessage
): Promise<ForwardResult> => {
  const text = message.text || "";
  const chatId = message.chat.id;
  const chatTitle = message.chat.title || "Unknown Group";

  console.log(
    `[LeadRouter] Processing group message from "${chatTitle}": "${text.substring(0, 50)}..."`
  );

  // 1. Check if this is a lead-related message
  if (!isLeadMessage(text)) {
    console.log("[LeadRouter] Not a lead message, skipping");
    return { success: false, error: "not_lead_message" };
  }

  console.log("[LeadRouter] Lead message detected!");

  // 2. Get or create group record
  const group = await getOrCreateGroup(chatId, chatTitle);
  if (!group) {
    console.error("[LeadRouter] Failed to get/create group record");
    return { success: false, error: "group_record_failed" };
  }

  // Check if lead routing is enabled for this group
  if (!group.lead_routing_enabled) {
    console.log("[LeadRouter] Lead routing disabled for this group");
    return { success: false, error: "routing_disabled" };
  }

  // 3. Extract property IDs for deduplication
  const propertyIds = extractPropertyIds(text);
  console.log("[LeadRouter] Property IDs:", propertyIds);

  // 4. Check for duplicates (10-minute window) - batch check for efficiency
  if (propertyIds.length > 0) {
    const duplicates = await checkRecentDuplicatesBatch(propertyIds, chatId);
    if (duplicates.length > 0) {
      console.log(
        `[LeadRouter] Duplicates detected: ${duplicates.join(", ")}, skipping`
      );
      return { success: false, error: "duplicate_lead" };
    }
  }

  // 5. Detect client language (for Russian speaker preference)
  const senderName = message.from
    ? `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim()
    : "";
  const isRussian =
    detectRussianLanguage(text) || detectRussianLanguage(senderName);
  console.log("[LeadRouter] Russian detected:", isRussian);

  // 5b. Extract caller phone once for repeat-caller lookup + persistence
  const callerPhone = extractCallerPhone(text);
  if (callerPhone) {
    console.log(`[LeadRouter] Caller phone extracted: ${callerPhone}`);
  }

  // 6. Check if client requested specific agent (highest priority)
  const requestedAgentName = extractRequestedAgent(text);
  if (requestedAgentName) {
    console.log(`[LeadRouter] Client requested agent: ${requestedAgentName}`);
    const agent = await findAgentByName(requestedAgentName);
    if (agent && agent.telegram_user_id) {
      return await forwardLeadToAgent(
        message,
        group,
        agent,
        propertyIds,
        isRussian ? "russian" : "english",
        callerPhone
      );
    }
    console.log("[LeadRouter] Requested agent not found or not registered");
  }

  // 6b. Repeat caller: keep the caller with the agent who handled their last lead
  //     in this group. Wins over owner-based and round-robin because the caller
  //     relationship matters more than listing ownership.
  if (callerPhone) {
    const previousAgent = await findPreviousAgentForCaller(callerPhone, chatId);
    if (previousAgent) {
      console.log(
        `[LeadRouter] Repeat caller ${callerPhone} → ${previousAgent.full_name} (previous handler)`
      );
      return await forwardLeadToAgent(
        message,
        group,
        previousAgent,
        propertyIds,
        isRussian ? "russian" : "english",
        callerPhone
      );
    }
  }

  // 6c. Determine the effective region. In the Paphos/Limassol/Larnaca groups
  //     the group itself is authoritative. In the "Others" group we infer from
  //     the message body — Vasia forwards leads for every region there.
  const groupRegion = group.region?.toLowerCase() || null;
  const mentionedRegion = detectRegionFromText(text);
  const isOthers = isOthersGroup(group.group_type);
  const effectiveRegion = isOthers
    ? mentionedRegion || groupRegion
    : groupRegion;

  // 6d. Paphos rental rule: "wants a rental in Paphos" with no listing link
  //     and no explicit agent goes to Evelina. If there IS a listing link,
  //     owner-based routing takes over below (rental may be owned by someone
  //     else in the Paphos team).
  const hasListingReference =
    propertyIds.length > 0 || text.includes("zyprus.com");
  if (
    effectiveRegion === "paphos" &&
    detectRentalIntent(text) &&
    !hasListingReference
  ) {
    const evelina = await findAgentByName(PAPHOS_RENTAL_AGENT);
    if (evelina && evelina.telegram_user_id) {
      console.log(
        `[LeadRouter] Paphos rental (no listing ref) → ${evelina.full_name}`
      );
      return await forwardLeadToAgent(
        message,
        group,
        evelina,
        propertyIds,
        isRussian ? "russian" : "english",
        callerPhone
      );
    }
  }

  // 6e. "Others" group region override: route by the region mentioned in the
  //     message. Paphos falls through so the full Paphos logic (owner lookup,
  //     50/50 Azinas/Dimitris) can run below.
  if (isOthers && mentionedRegion && mentionedRegion !== "paphos") {
    const primaryName = REGION_PRIMARY_AGENT[mentionedRegion];
    if (primaryName) {
      const primary = await findAgentByName(primaryName);
      if (primary && primary.telegram_user_id) {
        console.log(
          `[LeadRouter] Others-group ${mentionedRegion} → ${primary.full_name}`
        );
        return await forwardLeadToAgent(
          message,
          group,
          primary,
          propertyIds,
          isRussian ? "russian" : "english",
          callerPhone
        );
      }
      console.log(
        `[LeadRouter] ${primaryName} unavailable (no telegram_user_id) — falling through`
      );
    }
  }

  // 7. PAPHOS-SPECIFIC: Check Zyprus API for listing ownership.
  //     Runs when the group IS Paphos, or when the Others group message
  //     mentions Paphos (so a Paphos-owned listing still routes correctly).
  //     Only RETURN on success — on any failure (no owner, owner not
  //     registered, Telegram refused the forward) fall through to regular
  //     routing so the lead still reaches Marios A or Dimitris.
  if (effectiveRegion === "paphos") {
    const ownerBasedResult = await handlePaphosOwnerRouting(
      message,
      group,
      text,
      propertyIds,
      isRussian,
      callerPhone
    );
    if (ownerBasedResult?.success) {
      return ownerBasedResult;
    }
  }

  // 8. Get target agents based on routing rules
  const agents = await getTargetAgents(group);
  if (agents.length === 0) {
    console.error("[LeadRouter] No eligible agents found for routing");
    return { success: false, error: "no_agents_available" };
  }

  // 9. Filter agents with Telegram IDs (can receive forwards)
  const registeredAgents = agents.filter((a) => a.telegram_user_id !== null);
  if (registeredAgents.length === 0) {
    console.error(
      "[LeadRouter] No registered agents (with Telegram IDs) available"
    );
    return { success: false, error: "no_registered_agents" };
  }

  // 10. Select agent (Russian preference or round-robin)
  const selectedAgent = await selectAgent(
    registeredAgents,
    isRussian,
    group.region
  );
  if (!selectedAgent) {
    console.error("[LeadRouter] Failed to select agent");
    return { success: false, error: "agent_selection_failed" };
  }

  // 11. Forward lead to selected agent
  return await forwardLeadToAgent(
    message,
    group,
    selectedAgent,
    propertyIds,
    isRussian ? "russian" : "english",
    callerPhone
  );
};

/**
 * Check if chat type is a group or supergroup
 */
export const isGroupChat = (
  chatType: string
): chatType is "group" | "supergroup" => {
  return chatType === "group" || chatType === "supergroup";
};
