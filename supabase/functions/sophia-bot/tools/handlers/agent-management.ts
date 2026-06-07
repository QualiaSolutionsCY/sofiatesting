/**
 * Agent Management Tool Handlers
 *
 * Admin-only tools that let Lauren, Charalambos, and Fawzi add and remove
 * agents from the registry over WhatsApp.
 *
 * Safety model:
 * - addAgent: insert with phone normalization so Sophia recognises the new
 *   agent next time they message — mirrors the admin panel POST endpoint.
 * - removeAgent: SOFT-deactivate only (is_active = false). Permanent
 *   cascading delete stays in the admin panel — too risky to expose to chat.
 *
 * Gating: every handler hard-checks isWhatsAppAdmin(agent.id). Non-admins
 * receive a refusal regardless of how the AI phrased the call.
 */

import { getSupabaseAdmin } from "../../../_shared/db.ts";
import type { Agent } from "../../agents/identifier.ts";
import { isWhatsAppAdmin } from "../../config/business-rules.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import type { ToolResult } from "../executor.ts";

type Region =
  | "paphos"
  | "limassol"
  | "larnaca"
  | "nicosia"
  | "famagusta"
  | "all";

type Role = "agent" | "manager" | "management";

const VALID_REGIONS: ReadonlySet<Region> = new Set([
  "paphos",
  "limassol",
  "larnaca",
  "nicosia",
  "famagusta",
  "all",
]);

const VALID_ROLES: ReadonlySet<Role> = new Set([
  "agent",
  "manager",
  "management",
]);

/**
 * Normalize a Cyprus phone number to E.164 (+357XXXXXXXX).
 * Mirrors app/api/admin/agents/route.ts normalizeCyprusPhone so the new
 * agent's WhatsApp messages match via the last-8-digit lookup.
 */
function normalizeCyprusPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let local = digits;
  if (local.startsWith("357")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length === 8) return `+357${local}`;
  return digits.startsWith("357") ? `+${digits}` : digits;
}

/** Refusal returned when a non-admin tries an admin-only tool. */
function adminRefusal(): ToolResult {
  return {
    success: false,
    error:
      "This action is restricted to management — only Lauren, Charalambos, and Fawzi can add or remove agents over WhatsApp. Please ask one of them to do it, or use the admin panel.",
  };
}

interface AddAgentInput {
  fullName?: unknown;
  phoneNumber?: unknown;
  region?: unknown;
  role?: unknown;
  email?: unknown;
  landline?: unknown;
}

/**
 * Tool handler: addAgent
 * Creates a new agent row. Returns a friendly message for the AI to relay.
 */
export async function handleAddAgent(
  args: AddAgentInput,
  agent: Agent | null
): Promise<ToolResult> {
  if (!isWhatsAppAdmin(agent?.id)) {
    logger.warn("Non-admin attempted addAgent", {
      category: LogCategory.TOOL,
      agentName: agent?.fullName,
      agentId: agent?.id,
    });
    return adminRefusal();
  }

  const fullName =
    typeof args.fullName === "string" ? args.fullName.trim() : "";
  const phoneNumberRaw =
    typeof args.phoneNumber === "string" ? args.phoneNumber.trim() : "";
  const regionRaw =
    typeof args.region === "string" ? args.region.trim().toLowerCase() : "";
  const roleRaw =
    typeof args.role === "string" ? args.role.trim().toLowerCase() : "agent";
  const emailRaw = typeof args.email === "string" ? args.email.trim() : "";
  const landline =
    typeof args.landline === "string" ? args.landline.trim() : "";

  if (!fullName) {
    return {
      needsInput: true,
      question: "What's the full name of the agent you want to add?",
    };
  }
  if (!phoneNumberRaw) {
    return {
      needsInput: true,
      question: `What's ${fullName}'s mobile number? I need it to recognise them on WhatsApp.`,
    };
  }
  if (!emailRaw) {
    return {
      needsInput: true,
      question: `What's ${fullName}'s Zyprus email? I need it to recognise their emails — without it, only WhatsApp would work.`,
    };
  }
  if (!regionRaw) {
    return {
      needsInput: true,
      question: `Which region for ${fullName}? (Paphos, Limassol, Larnaca, Nicosia, Famagusta, or All)`,
    };
  }
  if (!VALID_REGIONS.has(regionRaw as Region)) {
    return {
      success: false,
      error: `Region "${args.region}" is not valid. Use one of: Paphos, Limassol, Larnaca, Nicosia, Famagusta, All.`,
    };
  }
  if (!VALID_ROLES.has(roleRaw as Role)) {
    return {
      success: false,
      error: `Role "${args.role}" is not valid. Use one of: agent, manager, management.`,
    };
  }

  const normalizedMobile = normalizeCyprusPhone(phoneNumberRaw);
  if (!normalizedMobile || !normalizedMobile.startsWith("+357")) {
    return {
      success: false,
      error: `"${phoneNumberRaw}" doesn't look like a Cyprus mobile number. I need 8 digits (with or without +357 prefix).`,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return {
      success: false,
      error: `"${emailRaw}" doesn't look like a valid email. Send the agent's real Zyprus email so they're recognised on email too.`,
    };
  }
  const email = emailRaw;

  const supabase = getSupabaseAdmin();

  // Reject duplicates by phone or email
  const last8 = normalizedMobile.slice(-8);
  const { data: existing, error: lookupError } = await supabase
    .from("agents")
    .select("id, full_name, mobile, communication_email")
    .or(
      `communication_email.eq.${email},mobile.ilike.%${last8},whatsapp_phone_number.ilike.%${last8}`
    )
    .limit(1);

  if (lookupError) {
    logger.error("addAgent duplicate check failed", lookupError, {
      category: LogCategory.TOOL,
    });
    return {
      success: false,
      error: "Couldn't check for existing agents. Try again in a moment.",
    };
  }

  if (existing && existing.length > 0) {
    const dup = existing[0] as {
      id: string;
      full_name: string;
      mobile: string;
      communication_email: string;
    };
    return {
      success: false,
      error: `An agent already exists with that phone or email: ${dup.full_name} (${dup.mobile || dup.communication_email}). Aborting — no duplicate created.`,
    };
  }

  const insertPayload = {
    full_name: fullName,
    communication_email: email,
    listing_owner_email: email,
    mobile: normalizedMobile,
    whatsapp_phone_number: normalizedMobile,
    region: regionRaw,
    role: roleRaw,
    is_active: true,
    can_upload: true,
    can_receive_leads: true,
    landline: landline || null,
  };

  const { data: created, error: insertError } = await supabase
    .from("agents")
    .insert(insertPayload)
    .select("id, full_name, mobile, region, role")
    .single();

  if (insertError || !created) {
    logger.error("addAgent insert failed", insertError, {
      category: LogCategory.TOOL,
      payload: insertPayload,
    });
    return {
      success: false,
      error: `Couldn't create the agent: ${insertError?.message || "unknown error"}`,
    };
  }

  logger.info(
    `Agent created via WhatsApp by ${agent?.fullName} (${agent?.id}): ${created.full_name} (${created.mobile})`,
    { category: LogCategory.TOOL }
  );

  return {
    success: true,
    message: `Added ${created.full_name} to ${regionRaw} as ${roleRaw}. Mobile ${created.mobile}, email ${email}. They'll be recognised on BOTH WhatsApp and email from now on. (Telegram group lead routing is configured separately.)`,
    data: {
      id: created.id,
      fullName: created.full_name,
      mobile: created.mobile,
      region: created.region,
      role: created.role,
    },
  };
}

interface RemoveAgentInput {
  fullName?: unknown;
  phoneNumber?: unknown;
  confirm?: unknown;
}

/**
 * Tool handler: removeAgent
 * Soft-deactivates an agent (is_active = false). Permanent delete stays in
 * the admin panel because the cascade across 5 tables is too dangerous to
 * trigger from a typo in a chat.
 *
 * Requires `confirm: true` to actually deactivate — first call returns a
 * question for the admin to confirm.
 */
export async function handleRemoveAgent(
  args: RemoveAgentInput,
  agent: Agent | null
): Promise<ToolResult> {
  if (!isWhatsAppAdmin(agent?.id)) {
    logger.warn("Non-admin attempted removeAgent", {
      category: LogCategory.TOOL,
      agentName: agent?.fullName,
      agentId: agent?.id,
    });
    return adminRefusal();
  }

  const fullName =
    typeof args.fullName === "string" ? args.fullName.trim() : "";
  const phoneNumber =
    typeof args.phoneNumber === "string" ? args.phoneNumber.trim() : "";
  const confirmed = args.confirm === true || args.confirm === "true";

  if (!fullName && !phoneNumber) {
    return {
      needsInput: true,
      question:
        "Which agent should I deactivate? Send me the full name or the mobile number.",
    };
  }

  const supabase = getSupabaseAdmin();

  // Look up the candidate(s)
  let query = supabase
    .from("agents")
    .select("id, full_name, mobile, region, role, is_active")
    .eq("is_active", true);

  if (phoneNumber) {
    const last8 = normalizeCyprusPhone(phoneNumber).slice(-8);
    if (last8) {
      query = query.or(
        `mobile.ilike.%${last8},whatsapp_phone_number.ilike.%${last8}`
      );
    } else {
      query = query.ilike("mobile", `%${phoneNumber.replace(/\D/g, "")}%`);
    }
  } else {
    query = query.ilike("full_name", `%${fullName}%`);
  }

  const { data: matches, error: lookupError } = await query.limit(5);

  if (lookupError) {
    logger.error("removeAgent lookup failed", lookupError, {
      category: LogCategory.TOOL,
    });
    return {
      success: false,
      error: "Couldn't search for that agent. Try again in a moment.",
    };
  }

  if (!matches || matches.length === 0) {
    return {
      success: false,
      error: `No active agent found matching ${fullName || phoneNumber}. They may already be deactivated.`,
    };
  }

  if (matches.length > 1) {
    const list = matches
      .map(
        (m) =>
          `- ${(m as { full_name: string }).full_name} (${(m as { mobile: string }).mobile}, ${(m as { region: string }).region})`
      )
      .join("\n");
    return {
      needsInput: true,
      question: `I found ${matches.length} agents matching "${fullName || phoneNumber}":\n${list}\n\nReply with the full name or mobile of the one to deactivate.`,
    };
  }

  const target = matches[0] as {
    id: string;
    full_name: string;
    mobile: string;
    region: string;
    role: string;
  };

  if (!confirmed) {
    return {
      needsInput: true,
      question: `Confirm: deactivate ${target.full_name} (${target.mobile}, ${target.region})? Their WhatsApp messages will be ignored and they'll stop receiving leads. Reply "yes" to proceed.`,
    };
  }

  const { error: updateError } = await supabase
    .from("agents")
    .update({ is_active: false, can_receive_leads: false })
    .eq("id", target.id);

  if (updateError) {
    logger.error("removeAgent update failed", updateError, {
      category: LogCategory.TOOL,
      targetId: target.id,
    });
    return {
      success: false,
      error: `Couldn't deactivate ${target.full_name}: ${updateError.message}`,
    };
  }

  logger.info(
    `Agent deactivated via WhatsApp by ${agent?.fullName} (${agent?.id}): ${target.full_name} (${target.id})`,
    { category: LogCategory.TOOL }
  );

  return {
    success: true,
    message: `Deactivated ${target.full_name} (${target.mobile}). They no longer receive leads and Sophia will ignore their WhatsApp messages. Use the admin panel if you need a permanent delete.`,
    data: {
      id: target.id,
      fullName: target.full_name,
    },
  };
}
