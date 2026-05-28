/**
 * Supabase client for agent data and email tracking
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export interface Agent {
  id: string;
  full_name: string;
  region: string;
  communication_email: string;
  listing_owner_email: string;
  can_receive_leads: boolean;
  is_active: boolean;
}

/**
 * Get all active agents
 */
export async function getActiveAgents(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, full_name, region, communication_email, listing_owner_email, can_receive_leads, is_active"
    )
    .eq("is_active", true);

  if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
  return data || [];
}

/**
 * Get agents for a specific region who can receive leads
 */
export async function getAgentsForRegion(region: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select(
      "id, full_name, region, communication_email, listing_owner_email, can_receive_leads, is_active"
    )
    .eq("is_active", true)
    .eq("can_receive_leads", true)
    .eq("region", region.toLowerCase());

  if (error)
    throw new Error(`Failed to fetch agents for ${region}: ${error.message}`);
  return data || [];
}

/**
 * Check if an email was already processed (deduplication)
 */
export async function isEmailProcessed(
  gmailMessageId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("email_forwards")
    .select("id")
    .eq("gmail_message_id", gmailMessageId)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

/**
 * Log a forwarded email
 */
export async function logEmailForward(record: {
  gmail_message_id: string;
  from_email: string;
  subject: string | null;
  body_preview: string | null;
  forwarded_to_agent_id: string | null;
  forwarded_to_email: string | null;
  region: string | null;
  routing_reason: string | null;
  draft_created: boolean;
  draft_template_name: string | null;
  skipped: boolean;
  skip_reason: string | null;
}): Promise<void> {
  const { error } = await supabase.from("email_forwards").insert(record);
  if (error) {
    console.error("Failed to log email forward:", error.message);
  }
}

/**
 * Get the next agent in rotation for a region (round-robin)
 */
export async function getNextInRotation(
  region: string,
  availableAgents: Agent[]
): Promise<Agent | null> {
  if (availableAgents.length === 0) return null;
  if (availableAgents.length === 1) return availableAgents[0];

  const { data: rotation } = await supabase
    .from("email_forwarding_rotation")
    .select("last_forwarded_to_agent_id")
    .eq("region", region.toLowerCase())
    .limit(1);

  const sorted = [...availableAgents].sort((a, b) => a.id.localeCompare(b.id));

  if (!rotation?.length || !rotation[0].last_forwarded_to_agent_id) {
    return sorted[0];
  }

  const lastId = rotation[0].last_forwarded_to_agent_id;
  const lastIdx = sorted.findIndex((a) => a.id === lastId);
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % sorted.length;
  return sorted[nextIdx];
}

/**
 * A row from the pending_email_forwards queue (delayed Paphos-only intake).
 * See supabase/migrations/20260528_pending_email_forwards.sql.
 */
export interface PendingForward {
  id: string;
  gmail_message_id: string;
  imap_uid: number | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  region: string;
  agent_id: string;
  agent_email: string;
  routing_reason: string | null;
  forward_at: string; // ISO timestamp
  status: "pending" | "sent" | "failed";
}

/**
 * Enqueue a Paphos lead for delayed forwarding. Idempotent: a duplicate
 * gmail_message_id (e.g. on overlapping polls) is logged and skipped, not
 * thrown — Postgres unique constraint enforces the dedupe.
 */
export async function enqueuePendingForward(
  record: Omit<PendingForward, "id" | "status">
): Promise<void> {
  const { error } = await supabase
    .from("pending_email_forwards")
    .insert({ ...record, status: "pending" });
  if (error) {
    // 23505 = unique_violation. Treat as no-op so re-polls are idempotent.
    if (error.code === "23505") {
      console.log(
        `Pending forward already enqueued for gmail_message_id=${record.gmail_message_id}`
      );
      return;
    }
    console.error("Failed to enqueue pending forward:", error.message);
  }
}

/**
 * Fetch up to 50 pending forwards whose forward_at has elapsed, oldest first.
 */
export async function getDuePendingForwards(): Promise<PendingForward[]> {
  const { data, error } = await supabase
    .from("pending_email_forwards")
    .select(
      "id, gmail_message_id, imap_uid, from_email, from_name, subject, text_body, html_body, region, agent_id, agent_email, routing_reason, forward_at, status"
    )
    .eq("status", "pending")
    .lte("forward_at", new Date().toISOString())
    .order("forward_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Failed to fetch due pending forwards:", error.message);
    return [];
  }
  return (data as PendingForward[]) || [];
}

/**
 * Mark a pending forward as successfully sent.
 */
export async function markPendingForwardSent(id: string): Promise<void> {
  const { error } = await supabase
    .from("pending_email_forwards")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error(
      `Failed to mark pending forward ${id} as sent:`,
      error.message
    );
  }
}

/**
 * Mark a pending forward as failed (operator handles manually — no auto-retry).
 */
export async function markPendingForwardFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabase
    .from("pending_email_forwards")
    .update({
      status: "failed",
      sent_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", id);
  if (error) {
    console.error(
      `Failed to mark pending forward ${id} as failed:`,
      error.message
    );
  }
}

/**
 * Update rotation state after forwarding
 */
export async function updateRotation(
  region: string,
  agentId: string
): Promise<void> {
  const { error } = await supabase.from("email_forwarding_rotation").upsert(
    {
      region: region.toLowerCase(),
      last_forwarded_to_agent_id: agentId,
      forward_count: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "region" }
  );

  if (error) {
    console.error("Failed to update rotation:", error.message);
  }
}
