import { buildClientEmailMessage } from "@/lib/invoices/email";
import { getDisplayNumber } from "@/lib/invoices/format";
import { buildWhatsappMessage } from "@/lib/invoices/whatsapp";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import type { IntegrationDeliveryPayload } from "./types";

export function buildDraftToMariosPayload(document: InvoiceDocument): IntegrationDeliveryPayload {
  const message = buildWhatsappMessage(document, "marios");
  return whatsappPayload(document, "send-draft-to-marios", "marios", message.text, message.filename);
}

export function buildAccountingHandoffPayload(document: InvoiceDocument): IntegrationDeliveryPayload {
  const message = buildWhatsappMessage(document, "accounting-group");
  return whatsappPayload(document, "send-accounting-copy", "accounting-group", message.text, message.filename);
}

export function buildCorrectedResendPayload(
  document: InvoiceDocument,
  reason?: string
): IntegrationDeliveryPayload {
  const message = buildWhatsappMessage(
    reason ? { ...document, correctionReason: reason } : document,
    "accounting-group"
  );
  return whatsappPayload(
    document,
    "send-corrected-resend",
    "accounting-group",
    message.text,
    message.filename,
    { correctionReason: reason ?? document.correctionReason ?? "" }
  );
}

export function buildCreditNoteDeliveryPayload(document: InvoiceDocument): IntegrationDeliveryPayload {
  const message = buildWhatsappMessage(document, "accounting-group");
  return whatsappPayload(document, "send-credit-note", "accounting-group", message.text, message.filename);
}

export function buildReceiptDeliveryPayload(document: InvoiceDocument): IntegrationDeliveryPayload {
  const message = buildWhatsappMessage(document, "accounting-group");
  return whatsappPayload(document, "send-receipt", "accounting-group", message.text, message.filename);
}

export function buildClientEmailPayload(
  document: InvoiceDocument,
  sharedCcEmail: string
): IntegrationDeliveryPayload {
  const message = buildClientEmailMessage(document, sharedCcEmail);
  return {
    documentId: document.id,
    documentKind: document.kind,
    actionType: "send-final-to-client",
    target: "client",
    channel: "email",
    provider: "manual",
    subject: message.subject,
    messageText: message.body,
    attachmentFilename: message.attachmentFilename,
    to: message.to,
    cc: message.cc,
    context: {
      displayNumber: getDisplayNumber(document),
      clientName: document.clientName,
      sourceInvoiceNumber: document.sourceInvoiceNumber ?? null
    }
  };
}

function whatsappPayload(
  document: InvoiceDocument,
  actionType: IntegrationDeliveryPayload["actionType"],
  target: Extract<IntegrationDeliveryPayload["target"], "marios" | "accounting-group">,
  messageText: string,
  attachmentFilename: string,
  context: IntegrationDeliveryPayload["context"] = {}
): IntegrationDeliveryPayload {
  return {
    documentId: document.id,
    documentKind: document.kind,
    actionType,
    target,
    channel: "whatsapp",
    provider: "manual",
    messageText,
    attachmentFilename,
    context: {
      displayNumber: getDisplayNumber(document),
      clientName: document.clientName,
      sourceInvoiceNumber: document.sourceInvoiceNumber ?? null,
      commissionPersonName: document.commissionPersonName ?? null,
      ...context
    }
  };
}
