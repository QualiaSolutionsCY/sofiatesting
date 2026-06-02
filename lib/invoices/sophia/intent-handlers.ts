import "server-only";

import {
  approveDocumentAction,
  cancelWithCreditNoteAction,
  correctResendAction,
  createDocumentAction,
  loadDocumentsAction,
  markPaidAndIssueReceiptAction,
} from "@/lib/invoices/actions/documents";
import type { DocumentInput } from "@/lib/invoices/document-actions";
import type { InvoiceDocument, VatMode } from "@/lib/invoices/types/invoice";

export type SophiaIntent =
  | "create_draft"
  | "list_drafts"
  | "query_status"
  | "approve"
  | "request_correction"
  | "mark_paid"
  | "issue_receipt"
  | "issue_credit_note"
  | "resend";

export interface IntentParams {
  client?: string;
  amount?: number;
  vatMode?: "plus" | "included" | "none";
  description?: string;
  documentId?: string;
  officialNumber?: string;
  correctionReason?: string;
}

export interface IntentResult {
  ok: boolean;
  reply: string;
  documentId?: string;
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
        recurrence: "none",
      };
      const res = await createDocumentAction(input);
      const doc = res.documents.find((d) => d.id === res.selectedId);
      return {
        ok: true,
        documentId: doc?.id,
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

    case "approve": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to approve." };
      const out = await approveDocumentAction(doc.id);
      const updated = out.documents.find((d) => d.id === doc.id);
      return {
        ok: true,
        documentId: doc.id,
        reply: `Approved ${doc.clientName} — official number ${updated?.officialNumber ?? "assigned"}.`,
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
      return {
        ok: true,
        documentId: receipt?.id,
        reply: `Marked ${doc.clientName} paid — receipt ${receipt?.draftNumber ?? "issued"} created.`,
      };
    }

    case "issue_credit_note": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice." };
      const out = await cancelWithCreditNoteAction(doc.id);
      const cn = out.documents.find((d) => d.id === out.selectedId);
      return {
        ok: true,
        documentId: cn?.id,
        reply: `Credit note ${cn?.draftNumber ?? "created"} issued against ${doc.clientName}.`,
      };
    }

    case "resend": {
      const res = await loadDocumentsAction();
      const doc = findDoc(res.documents, params);
      if (!doc) return { ok: false, reply: "I couldn't find that invoice to resend." };
      await correctResendAction(doc.id, params.correctionReason || "Resend requested");
      return { ok: true, documentId: doc.id, reply: `Resent ${doc.clientName} (${numberOf(doc)}).` };
    }

    default:
      return { ok: false, reply: "Unknown invoicing action." };
  }
}
