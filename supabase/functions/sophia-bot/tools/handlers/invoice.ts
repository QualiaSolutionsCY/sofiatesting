/**
 * manageInvoice Handler
 *
 * Lets authorized agents drive the embedded invoicing system through Sophia.
 * Authorization is enforced HERE (allowlist by phone) before anything leaves
 * the bot; the Vercel endpoint re-checks independently (defense in depth).
 */

import { type Agent, normalizePhone } from "../../agents/identifier.ts";
import { callInvoiceIntent } from "../../services/invoice-bridge.ts";
import { LogCategory, logger } from "../../utils/logger.ts";
import { sendDocumentByUrl } from "../../utils/wasend.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
}

// Fawzi Goussous, Charalambos Pitros, Marios Polyviou — last 8 digits of `mobile`.
const ALLOWED_LAST8 = ["99111668", "99076732", "99921560"];

function isAllowed(phone?: string, agent?: Agent | null): boolean {
  const candidates = [phone, agent?.mobile].filter(Boolean) as string[];
  for (const c of candidates) {
    const n = normalizePhone(c);
    if (n.length >= 8 && ALLOWED_LAST8.includes(n.slice(-8))) return true;
  }
  return false;
}

export async function handleManageInvoice(
  args: Record<string, unknown>,
  agent: Agent | null,
  phoneNumber?: string
): Promise<ToolResult> {
  if (!isAllowed(phoneNumber, agent)) {
    logger.warn("manageInvoice denied — sender not on invoicing allowlist", {
      category: LogCategory.TOOL,
      agentName: agent?.fullName,
    });
    return {
      success: false,
      message: "Invoicing is limited to authorized staff, so I can't action that here.",
    };
  }

  const intent = String(args.intent || "").trim();
  if (!intent) {
    return {
      needsInput: true,
      question:
        "Which invoicing action do you need? (e.g. create a draft, list drafts, approve, mark paid, issue a credit note)",
    };
  }

  const params: Record<string, unknown> = {
    client: args.client,
    amount: args.amount,
    vatMode: args.vatMode,
    description: args.description,
    documentId: args.documentId,
    officialNumber: args.officialNumber,
    correctionReason: args.correctionReason,
    recurrence: args.recurrence,
    recurrenceDay: args.recurrenceDay,
  };

  const result = await callInvoiceIntent(
    intent,
    params,
    phoneNumber || agent?.mobile || "",
    undefined
  );

  // Attach the invoice PDF to the agent's WhatsApp when one was produced.
  if (result.ok && result.pdfUrl) {
    try {
      await sendDocumentByUrl(
        phoneNumber || agent?.mobile || "",
        result.pdfUrl,
        result.filename || "invoice.pdf",
        result.reply
      );
    } catch (_e) {
      // Non-fatal — the text reply still goes out even if the file send fails.
    }
  }

  return result.ok
    ? {
        success: true,
        message: result.reply,
        data: { documentId: result.documentId, pdfUrl: result.pdfUrl },
      }
    : { success: false, message: result.reply, error: result.error };
}
