import "server-only";

import {
  approveDocumentAction,
  cancelWithCreditNoteAction,
  createDocumentAction,
  loadDocumentsAction,
  markPaidAndIssueReceiptAction,
  notifyMariosApprovedAction,
  resendCorrectedInvoiceAction,
  sendDocumentToAccountingGroup,
  sendInvoiceEmailAction,
  storeDocumentPdfAction,
  updateDocumentAction,
} from "@/lib/invoices/actions/documents";
import { stripAgentName } from "@/lib/invoices/format";
import { buildClientEmailMessage } from "@/lib/invoices/email";
import type { DocumentInput } from "@/lib/invoices/document-actions";
import type { InvoiceDocument, VatMode } from "@/lib/invoices/types/invoice";

export type SophiaIntent =
  | "create_draft"
  | "list_drafts"
  | "query_status"
  | "approve"
  | "edit_invoice"
  | "request_correction"
  | "mark_paid"
  | "issue_receipt"
  | "issue_credit_note"
  | "resend"
  | "send_pdf"
  | "email_invoice";

export interface IntentParams {
  client?: string;
  amount?: number;
  vatMode?: "plus" | "included" | "none";
  description?: string;
  /** Recipient email for the invoice, captured the same way the dashboard's
   * recurring-email field captures it. Stored as the document's clientEmail so
   * a recurring invoice knows where each issue should be sent. Optional for
   * one-off invoices. */
  clientEmail?: string;
  documentId?: string;
  officialNumber?: string;
  correctionReason?: string;
  groupMessage?: string;
  /** Explicit email recipients for the email_invoice intent. A single request to
   * "email this invoice to a@x.com and b@y.com" maps to all of them. */
  recipients?: string[];
  recurrence?: "none" | "monthly" | "yearly";
  recurrenceDay?: number;
  /** New due date as an ISO date (YYYY-MM-DD), for edit_invoice. */
  dueDate?: string;
  /** New due date expressed as days-to-pay from the issue date, for edit_invoice. */
  dueDays?: number;
}

export interface IntentResult {
  ok: boolean;
  reply: string;
  documentId?: string;
  /** Public URL of the generated invoice PDF, when one was produced. */
  pdfUrl?: string;
  /** Suggested filename for the attachment, e.g. "CSC … Invoice 11424.pdf". */
  filename?: string;
  error?: string;
}

function mapVat(v?: string): VatMode {
  if (v === "included") return "included-vat";
  if (v === "none") return "no-vat";
  return "plus-vat";
}

function money(n: number): string {
  return `€${(n ?? 0).toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberOf(d: InvoiceDocument): string {
  return d.officialNumber ? `№ ${d.officialNumber}` : d.draftNumber;
}

function findDoc(docs: InvoiceDocument[], p: IntentParams): InvoiceDocument | null {
  // Match against ANY identifier Sophia passed — `documentId` OR `officialNumber`
  // (for "invoice no 11450" she puts the bare number in either field). Normalize so
  // "№ 11450", " 11450 ", and "INV-2026-11450-DRAFT" all resolve to a document.
  const refs = [p.documentId, p.officialNumber]
    .map((r) => (r ?? "").toString().replace(/^№\s*/, "").trim())
    .filter(Boolean);
  for (const ref of refs) {
    const byId = docs.find(
      (d) => d.id === ref || d.draftNumber === ref || d.officialNumber === ref
    );
    if (byId) return byId;
  }
  if (p.client) {
    const q = p.client.toLowerCase();
    const hit = docs.find((d) => d.clientName.toLowerCase().includes(q));
    if (hit) return hit;
  }
  return null;
}

/**
 * Resolve the email recipients for the email_invoice intent.
 *
 * - Explicit addresses (the agent named who to send to) always win and are used
 *   verbatim — this is the multi-email case (R6).
 * - Otherwise, for a recurring (monthly/yearly) invoice we mirror the dashboard's
 *   client-email model (R7): accounting + Marios CC + the client's own address.
 *   The accounting/CC addresses come from env (never hardcoded); the client
 *   address comes from buildClientEmailMessage's recipient model.
 * Falsy/blank entries are filtered and duplicates collapsed.
 */
function resolveEmailRecipients(doc: InvoiceDocument, explicit?: string[]): string[] {
  const clean = (list: (string | undefined)[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const v = (raw || "").trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out;
  };

  if (explicit && explicit.length > 0) {
    return clean(explicit);
  }

  if (doc.recurrence !== "none") {
    // Monthly/yearly recurring email goes to accounting + the client in the
    // WhatsApp/Sophia flow. Marios's CC on recurring invoices is handled ONLY in
    // the ADMIN PANEL "Send email" — keep the two flows separate, never mixed.
    const accounting = process.env.INVOICE_ACCOUNTING_EMAIL?.trim();
    const clientMessage = buildClientEmailMessage(doc, "");
    return clean([accounting, clientMessage.to]);
  }

  // Non-recurring with no explicit recipients: fall back to the client's address.
  return clean([doc.clientEmail]);
}

/** Generate + store the PDF for a document and return its public URL + filename. */
async function attachPdf(documentId: string): Promise<{ pdfUrl?: string; filename?: string }> {
  try {
    const res = await storeDocumentPdfAction(documentId);
    if (res.storageFile?.publicUrl) {
      return { pdfUrl: res.storageFile.publicUrl, filename: res.storageFile.filename };
    }
  } catch {
    // PDF generation/storage is best-effort — never fail the intent on it.
  }
  return {};
}

/**
 * Execute one invoicing intent against the embedded invoice backend.
 * Called only after HMAC verification + allowlist check in the route handler.
 */
export async function runIntent(
  intent: SophiaIntent,
  params: IntentParams
): Promise<IntentResult> {
  switch (intent) {
    case "create_draft": {
      if (!params.client || typeof params.amount !== "number") {
        return { ok: false, reply: "I need the client name and the amount to create a draft." };
      }
      const issueDate = new Date().toISOString().slice(0, 10);
      // Default due date is 30 days from issue unless the agent specified otherwise.
      const dueDays = typeof params.dueDays === "number" ? Math.max(0, Math.round(params.dueDays)) : 30;
      const dueBase = new Date(issueDate);
      dueBase.setDate(dueBase.getDate() + dueDays);
      const input: DocumentInput = {
        kind: "invoice",
        clientName: params.client,
        // Capture the recipient email when provided (per SHARED CONTRACT, stored
        // as the document's clientEmail). Absent → left undefined, preserving the
        // existing create_draft behaviour for invoices created without an email.
        clientEmail: params.clientEmail?.trim() || undefined,
        description: stripAgentName(params.description) || "Services rendered",
        amount: params.amount,
        vatMode: mapVat(params.vatMode),
        issueDate,
        dueDate: params.dueDate || dueBase.toISOString().slice(0, 10),
        recurrence: params.recurrence ?? "none",
        recurrenceDay: params.recurrenceDay,
      };
      const res = await createDocumentAction(input);
      const doc = res.documents.find((d) => d.id === res.selectedId);
      const pdf = doc ? await attachPdf(doc.id) : {};
      return {
        ok: true,
        documentId: doc?.id,
        ...pdf,
        reply: doc
          ? `Draft ${doc.draftNumber} created for ${doc.clientName} — ${money(doc.total)} (${doc.vatMode}), due ${doc.dueDate}. Queued to Marios for approval.`
          : "Draft created.",
      };
    }

    case "list_drafts": {
      const res = await loadDocumentsAction();
      const drafts = res.documents
        .filter((d) => d.status !== "approved" && !d.officialNumber)
        .slice(0, 10);
      if (drafts.length === 0) return { ok: true, reply: "No open drafts right now." };
      const lines = drafts.map(
        (d) => `• ${d.clientName} — ${numberOf(d)} — ${money(d.total)} (${d.status})`
      );
      return { ok: true, reply: `${drafts.length} open draft(s):\n${lines.join("\n")}` };
    }

    case "query_status": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      return {
        ok: true,
        documentId: doc.id,
        reply: `${doc.clientName} — ${numberOf(doc)} — ${money(doc.total)} — status: ${doc.status}, payment: ${doc.paymentStatus}.`,
      };
    }

    case "send_pdf": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to send." };
      const pdf = await attachPdf(doc.id);
      if (!pdf.pdfUrl) {
        return { ok: false, reply: `I couldn't generate the PDF for ${doc.clientName} just now.` };
      }
      // M1 (Marios): a plain invoice goes out as JUST the PDF — no caption/description.
      // Commission invoices and credit notes keep their descriptive line.
      const plainInvoice = doc.kind === "invoice" && !doc.requiresCommissionPerson;
      return {
        ok: true,
        documentId: doc.id,
        ...pdf,
        reply: plainInvoice ? "" : `${doc.clientName} — ${numberOf(doc)} — ${money(doc.total)}. PDF attached.`,
      };
    }

    case "approve": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to approve." };

      // Approve (idempotent — skip re-approving if already numbered, so the
      // group-message follow-up call doesn't try to approve a second time).
      let updated = doc;
      if (!doc.officialNumber && doc.status !== "numbered") {
        const out = await approveDocumentAction(doc.id);
        updated = out.documents.find((d) => d.id === doc.id) ?? doc;
      }
      const pdf = await attachPdf(updated.id);
      const num = updated.officialNumber ?? "assigned";

      // Approving ALWAYS auto-sends a copy to the accounting group AND to Marios —
      // never ask "what message should I send?". The group caption follows Marios's
      // rule: an explicit typed override wins, otherwise it's the agent's name only
      // when an agent exists (commission invoice), and blank for everything else.
      const caption =
        params.groupMessage?.trim() ||
        (updated.requiresCommissionPerson && updated.commissionPersonName
          ? updated.commissionPersonName
          : "");
      const sentToGroup = await sendDocumentToAccountingGroup(updated, caption);
      const mResult = await notifyMariosApprovedAction(updated.id);
      const mariosOk = mResult.mariosNotified ?? false;
      return {
        ok: true,
        documentId: updated.id,
        ...pdf,
        reply:
          `Approved ${updated.clientName} — № ${num}. ` +
          `${mariosOk ? "Sent Marios his copy" : "Couldn't reach Marios"}; ` +
          `${sentToGroup ? "posted to the accounting group" : "couldn't reach the group"}.`,
      };
    }

    case "edit_invoice": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to edit." };

      // Resolve the new due date: explicit ISO date, or days-to-pay from the
      // issue date, otherwise keep what's already on the document.
      let dueDate = doc.dueDate;
      if (typeof params.dueDays === "number" && Number.isFinite(params.dueDays)) {
        const base = new Date(doc.issueDate);
        base.setDate(base.getDate() + Math.max(0, Math.round(params.dueDays)));
        dueDate = base.toISOString().slice(0, 10);
      } else if (params.dueDate) {
        dueDate = params.dueDate;
      }

      // Merge the requested changes onto the document's current values so a
      // partial edit (just description, or just due date) never wipes other fields.
      const input: DocumentInput = {
        kind: doc.kind,
        clientName: doc.clientName,
        clientEmail: doc.clientEmail,
        description: params.description !== undefined ? stripAgentName(params.description) : doc.description,
        amount: typeof params.amount === "number" ? params.amount : doc.amount,
        vatMode: params.vatMode ? mapVat(params.vatMode) : doc.vatMode,
        issueDate: doc.issueDate,
        dueDate,
        recurrence: doc.recurrence,
        recurrenceDay: doc.recurrenceDay,
        sourceInvoiceNumber: doc.sourceInvoiceNumber,
        commissionPersonName: doc.commissionPersonName,
      };

      const out = await updateDocumentAction(doc.id, input);
      const updated = out.documents.find((d) => d.id === doc.id) ?? doc;
      const pdf = await attachPdf(doc.id);
      const dueLine = updated.dueDate ? `, due ${updated.dueDate}` : "";

      // The group is only notified AFTER approval. If the invoice is still a draft
      // (not yet approved/numbered), just apply the edit and wait — no group step.
      const isApproved =
        !!updated.officialNumber ||
        updated.status === "approved" ||
        updated.status === "numbered" ||
        updated.status === "sent-to-accounting";
      if (!isApproved) {
        return {
          ok: true,
          documentId: doc.id,
          ...pdf,
          reply: `Updated ${updated.clientName} — ${numberOf(updated)} — ${money(updated.total)}${dueLine}. Still a draft — approve it whenever you're ready.`,
        };
      }

      // Approved invoice edited: ask Marios for the group message first, then post
      // the edited invoice to the accounting group on the follow-up call.
      if (!params.groupMessage) {
        return {
          ok: true,
          documentId: doc.id,
          ...pdf,
          reply: `Updated ${updated.clientName} — ${numberOf(updated)} — ${money(updated.total)}${dueLine}. What message should I send to the group along with the edited invoice?`,
        };
      }

      const caption = `Edited invoice ${numberOf(updated)} — ${updated.clientName} (${money(updated.total)}). ${params.groupMessage}`;
      const sentToGroup = await sendDocumentToAccountingGroup(updated, caption);
      return {
        ok: true,
        documentId: doc.id,
        ...pdf,
        reply: sentToGroup
          ? `Updated ${updated.clientName} — ${numberOf(updated)} — ${money(updated.total)}${dueLine}, and sent the edited invoice to the group.`
          : `Updated ${updated.clientName} — ${numberOf(updated)} — ${money(updated.total)}${dueLine}. (I couldn't reach the group just now.)`,
      };
    }

    case "request_correction": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      await resendCorrectedInvoiceAction(doc.id, params.correctionReason || "Correction requested");
      return { ok: true, documentId: doc.id, reply: `Marked ${doc.clientName} for correction & resend.` };
    }

    case "mark_paid":
    case "issue_receipt": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      // A cancelled / credited invoice has been voided — refuse the receipt at
      // this layer too (the server action mirrors the same guard).
      if (doc.status === "cancelled" || doc.status === "credited") {
        return { ok: false, reply: "That invoice has been cancelled — I can't issue a receipt for it." };
      }
      // notifyMarios:false — the bot delivers the receipt PDF to the requester
      // itself (one PDF build, one send), so Sophia replies faster and Marios
      // isn't messaged twice when he's the one asking.
      const out = await markPaidAndIssueReceiptAction(doc.id, { notifyMarios: false });
      const receipt = out.documents.find((d) => d.id === out.selectedId);
      const pdf = receipt ? await attachPdf(receipt.id) : {};
      return {
        ok: true,
        documentId: receipt?.id,
        ...pdf,
        reply: `Marked ${doc.clientName} paid — receipt ${receipt?.draftNumber ?? "issued"} created.`,
      };
    }

    case "issue_credit_note": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      // Credit notes need NO approval and are issued directly: the action
      // auto-approves them and auto-posts the PDF to the accounting group. The
      // optional reason rides along as context — never gate on it.
      const reason = params.correctionReason || params.groupMessage;
      const out = await cancelWithCreditNoteAction(doc.id, reason);
      const cn = out.documents.find((d) => d.id === out.selectedId);
      const pdf = cn ? await attachPdf(cn.id) : {};
      return {
        ok: true,
        documentId: cn?.id,
        ...pdf,
        reply: `Credit note ${cn?.draftNumber ?? "created"} issued against ${doc.clientName}.`,
      };
    }

    case "resend": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to resend." };
      await resendCorrectedInvoiceAction(doc.id, params.correctionReason || "Resend requested");
      const pdf = await attachPdf(doc.id);
      return { ok: true, documentId: doc.id, ...pdf, reply: `Resent ${doc.clientName} (${numberOf(doc)}). PDF attached.` };
    }

    case "email_invoice": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to email." };

      const recipients = resolveEmailRecipients(doc, params.recipients);
      if (recipients.length === 0) {
        return {
          ok: false,
          reply: "I don't have an email address to send this to — give me the recipient address(es).",
        };
      }
      try {
        await sendInvoiceEmailAction(doc.id, recipients);
      } catch (error) {
        return {
          ok: false,
          reply: "I couldn't email that invoice just now.",
          error: error instanceof Error ? error.message : "email failed",
        };
      }
      const recap = recipients.length === 1 ? recipients[0] : `${recipients.length} recipients`;
      return {
        ok: true,
        documentId: doc.id,
        reply: `Emailed ${doc.clientName} — ${numberOf(doc)} to ${recap}.`,
      };
    }

    default:
      return { ok: false, reply: "Unknown invoicing action." };
  }
}
