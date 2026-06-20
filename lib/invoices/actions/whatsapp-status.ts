"use server";

import { wasenderClient } from "@/lib/whatsapp/client";

export interface WhatsAppGroupStatus {
  /** The accounting-group JID is configured (env var set). */
  configured: boolean;
  /** The WhatsApp session is live AND (if configured) the group is reachable. */
  connected: boolean;
  /** Raw session status, lowercased (e.g. "connected", "need_scan"). */
  sessionStatus?: string;
  /** Group subject as WhatsApp reports it, when reachable. */
  groupName?: string;
  /** Human-readable reason when not connected. */
  detail?: string;
}

/**
 * Live connection check for the accounting WhatsApp group that credit notes are
 * sent to. Asks WasenderAPI for the session status, then confirms the configured
 * group JID is reachable (and resolves its name). Best-effort and defensive — any
 * failure resolves to connected:false with a reason rather than throwing.
 */
export async function getWhatsAppGroupStatus(): Promise<WhatsAppGroupStatus> {
  const jidRaw = process.env.INVOICE_ACCOUNTING_GROUP_MSISDN;
  const configured = !!jidRaw && jidRaw.trim().length > 0;

  if (!wasenderClient) {
    return { configured, connected: false, detail: "WhatsApp API key not configured" };
  }

  try {
    const session = await wasenderClient.getSessionStatus();
    const raw = (session as { response?: { status?: string } })?.response?.status ?? "";
    const sessionStatus = String(raw).toLowerCase();
    const sessionConnected = sessionStatus === "connected";

    if (!configured) {
      return { configured, connected: false, sessionStatus, detail: "No group configured (set INVOICE_ACCOUNTING_GROUP_MSISDN)" };
    }
    if (!sessionConnected) {
      return { configured, connected: false, sessionStatus, detail: `WhatsApp session is ${sessionStatus || "unavailable"}` };
    }

    // Session is live — confirm the group itself is reachable and name it.
    const jid = jidRaw.includes("@g.us") ? jidRaw : `${jidRaw}@g.us`;
    try {
      const meta = await wasenderClient.getGroupMetadata(jid);
      const groupName = (meta as { response?: { data?: { subject?: string } } })?.response?.data?.subject;
      return { configured, connected: true, sessionStatus, groupName };
    } catch {
      // Session up but group not found/accessible with this JID.
      return { configured, connected: false, sessionStatus, detail: "Session live, but the group JID wasn't reachable" };
    }
  } catch (error) {
    return {
      configured,
      connected: false,
      detail: error instanceof Error ? error.message : "Status check failed",
    };
  }
}
