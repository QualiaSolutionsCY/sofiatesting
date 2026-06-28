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

/**
 * Kind-aware fallback metadata, derived from the intent, for when the bridge
 * doesn't return a filename. Without this a receipt or credit-note would default
 * to "invoice.pdf" / type "invoice" — so Marios could receive a receipt named
 * like an invoice. The type also labels the stored "last document".
 */
function fallbackDocMeta(intent: string): { filename: string; type: string } {
  if (intent === "issue_receipt" || intent === "mark_paid") {
    return { filename: "receipt.pdf", type: "receipt" };
  }
  if (intent === "issue_credit_note") {
    return { filename: "credit-note.pdf", type: "credit-note" };
  }
  return { filename: "invoice.pdf", type: "invoice" };
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
    // Forward the recipient email so create_draft can store it as the document's
    // clientEmail (per SHARED CONTRACT). For monthly/recurring invoices Sophia
    // asks Marios which email to send each invoice to and passes it here.
    clientEmail: args.clientEmail,
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
    // Forward the requested email recipients so `email_invoice` can send to the
    // exact addresses the agent named over WhatsApp (R6 multi-email). Without
    // this the bot path would drop them and fall back to the default recipient.
    recipients: args.recipients,
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
    // Prefer the real filename/type the backend produced (already kind-correct,
    // e.g. "… Receipt 10393.pdf"); only fall back to a kind-aware default so a
    // receipt/credit-note is never mislabelled as an invoice.
    const docMeta = fallbackDocMeta(intent);
    try {
      // sendDocumentByUrl NEVER throws — it returns a Response (503 breaker-open,
      // 500 fetch error, or the WaSend status). documentSent MUST reflect the real
      // outcome: if we set it true on a failed send, webhook.ts suppresses the text
      // reply and the agent gets NEITHER the PDF NOR the confirmation text.
      const res = await sendDocumentByUrl(
        phoneNumber || agent?.mobile || "",
        result.pdfUrl,
        result.filename || docMeta.filename,
        result.reply
      );
      documentSent = res.ok;
      if (res.ok) {
        // Register the invoice/receipt/credit-note PDF as the user's "last document"
        // so that if they then ask Sophia to email it, the email auto-attach picks
        // THIS document (not an unrelated DOCX). Stored under bare international
        // digits to match how the email handler looks it up. Only on a confirmed
        // send — never register an undelivered PDF as the "last document".
        const lastDocUserId = (phoneNumber || agent?.mobile || "").replace(/[^\d]/g, "");
        if (lastDocUserId) {
          await saveLastDocument(
            lastDocUserId,
            result.pdfUrl,
            result.filename || docMeta.filename,
            docMeta.type
          );
        }
      } else {
        // documentSent stays false so webhook.ts falls through to the text reply.
        console.error("sendDocumentByUrl non-ok", res.status);
      }
    } catch (_e) {
      // sendDocumentByUrl is designed not to throw, but guard genuine throws here;
      // documentSent stays false so the text reply still goes out.
    }
  }

  // Marios's OWN copy of the approved invoice. The accounting group already gets it,
  // but his DIRECT copy must go through THIS sender (the bot's 1:1 channel, which he
  // has an open chat with from approving) — the Vercel-side notify can't reliably DM
  // him. Blank caption — just the PDF (Marios's rule). Best-effort; skip when Marios
  // is the approver (no double-send) or no PDF URL was produced.
  const MARIOS_MSISDN = "35799921560";
  const requesterDigits = (phoneNumber || agent?.mobile || "").replace(/[^\d]/g, "");
  if (
    intent === "approve" &&
    result.ok &&
    result.pdfUrl &&
    !requesterDigits.endsWith("99921560")
  ) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2500 : 4000));
      let mres: Response | undefined;
      try {
        mres = await sendDocumentByUrl(
          MARIOS_MSISDN,
          result.pdfUrl,
          result.filename || fallbackDocMeta(intent).filename,
          ""
        );
      } catch (_e) {
        mres = undefined;
      }
      if (mres?.ok || mres?.status !== 429) break; // stop unless it was a rate-limit
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
