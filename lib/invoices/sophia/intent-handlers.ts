import "server-only";

import {
  approveDocumentAction,
  cancelWithCreditNoteAction,
  correctResendAction,
  createDocumentAction,
  loadDocumentsAction,
  markPaidAndIssueReceiptAction,
  sendDocumentToAccountingGroup,
  storeDocumentPdfAction,
  updateDocumentAction,
} from "@/lib/invoices/actions/documents";
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
  | "send_pdf";

export interface IntentParams {
  client?: string;
  amount?: number;
  vatMode?: "plus" | "included" | "none";
  description?: string;
  documentId?: string;
  officialNumber?: string;
  correctionReason?: string;
  groupMessage?: string;
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
  if (p.documentId) {
    const byId = docs.find(
      (d) =>
        d.id === p.documentId ||
        d.draftNumber === p.documentId ||
        d.officialNumber === p.documentId
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
      const input: DocumentInput = {
        kind: "invoice",
        clientName: params.client,
        description: params.description || "Services rendered",
        amount: params.amount,
        vatMode: mapVat(params.vatMode),
        issueDate: new Date().toISOString().slice(0, 10),
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
          ? `Draft ${doc.draftNumber} created for ${doc.clientName} — ${money(doc.total)} (${doc.vatMode}). Queued to Marios for approval.`
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
      return {
        ok: true,
        documentId: doc.id,
        ...pdf,
        reply: `${doc.clientName} — ${numberOf(doc)} — ${money(doc.total)}. PDF attached.`,
      };
    }

    case "approve": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to approve." };
      const out = await approveDocumentAction(doc.id);
      const updated = out.documents.find((d) => d.id === doc.id);
      const pdf = await attachPdf(doc.id);
      return {
        ok: true,
        documentId: doc.id,
        ...pdf,
        reply: `Approved ${doc.clientName} — official number ${updated?.officialNumber ?? "assigned"}.`,
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
        description: params.description ?? doc.description,
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

      // After an edit, the group must be told. Ask Marios for the message first;
      // once provided, post the edited invoice to the accounting group.
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
      await correctResendAction(doc.id, params.correctionReason || "Correction requested");
      return { ok: true, documentId: doc.id, reply: `Marked ${doc.clientName} for correction & resend.` };
    }

    case "mark_paid":
    case "issue_receipt": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      const out = await markPaidAndIssueReceiptAction(doc.id);
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
      // The agent is asked (by the prompt) for the message to send to the group;
      // it arrives as groupMessage and becomes the credit-note reason/group caption.
      const groupMessage = params.groupMessage || params.correctionReason;
      if (!groupMessage) {
        return {
          ok: false,
          reply: `Before I issue the credit note for ${doc.clientName}, what message should I send to the group along with it?`,
        };
      }
      const out = await cancelWithCreditNoteAction(doc.id, groupMessage);
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
      await correctResendAction(doc.id, params.correctionReason || "Resend requested");
      const pdf = await attachPdf(doc.id);
      return { ok: true, documentId: doc.id, ...pdf, reply: `Resent ${doc.clientName} (${numberOf(doc)}). PDF attached.` };
    }

    default:
      return { ok: false, reply: "Unknown invoicing action." };
  }
}
