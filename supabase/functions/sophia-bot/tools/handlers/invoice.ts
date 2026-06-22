/**
 * manageInvoice Handler
 *
 * Lets authorized agents drive the embedded invoicing system through Sophia.
 * Authorization is enforced HERE (allowlist by phone) before anything leaves
 * the bot; the Vercel endpoint re-checks independently (defense in depth).
 */

import { saveLastDocument } from "../../../_shared/db.ts";
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
  /** True when this tool already delivered a document to the user with `message`
   * as its caption — the caller must NOT send `message` again as a separate text. */
  documentSent?: boolean;
}

// Fawzi Goussous, Charalambos Pitros, Marios Polyviou, Moayad Alqam — last 8 digits of `mobile`.
const ALLOWED_LAST8 = ["99111668", "99076732", "99921560", "99687499"];

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
    groupMessage: args.groupMessage,
    dueDate: args.dueDate,
    dueDays: args.dueDays,
    recurrence: args.recurrence,
    recurrenceDay: args.recurrenceDay,
  };

  const result = await callInvoiceIntent(
    intent,
    params,
    phoneNumber || agent?.mobile || "",
    undefined
  );

  // Attach the invoice PDF to the agent's WhatsApp when one was produced. The PDF
  // carries `result.reply` as its caption, so when it sends we flag documentSent
  // and the caller skips re-sending the same text as a separate chat message.
  let documentSent = false;
  if (result.ok && result.pdfUrl) {
    try {
      await sendDocumentByUrl(
        phoneNumber || agent?.mobile || "",
        result.pdfUrl,
        result.filename || "invoice.pdf",
        result.reply
      );
      documentSent = true;
      // Register the invoice/receipt/credit-note PDF as the user's "last document"
      // so that if they then ask Sophia to email it, the email auto-attach picks
      // THIS document (not an unrelated DOCX). Stored under bare international
      // digits to match how the email handler looks it up.
      const lastDocUserId = (phoneNumber || agent?.mobile || "").replace(/[^\d]/g, "");
      if (lastDocUserId) {
        await saveLastDocument(
          lastDocUserId,
          result.pdfUrl,
          result.filename || "invoice.pdf",
          "invoice"
        );
      }
    } catch (_e) {
      // Non-fatal — the text reply still goes out even if the file send fails.
    }
  }

  return result.ok
    ? {
        success: true,
        message: result.reply,
        documentSent,
        data: { documentId: result.documentId, pdfUrl: result.pdfUrl },
      }
    : { success: false, message: result.reply, error: result.error };
}
