import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import { getUnifiedFilename } from "@/lib/invoices/format";

export type WhatsappTarget = "marios" | "accounting-group";

export type WhatsappMessage = {
  target: WhatsappTarget;
  documentId: string;
  text: string;
  filename: string;
};

export function buildWhatsappMessage(
  document: InvoiceDocument,
  target: WhatsappTarget
): WhatsappMessage {
  const filename = getUnifiedFilename(document);
  const targetLabel = target === "marios" ? "Marios" : document.accountingGroupLabel;
  const commissionLine =
    document.requiresCommissionPerson && document.commissionPersonName
      ? ` Commission person: ${document.commissionPersonName}.`
      : "";
  const correctionLine = document.correctionReason
    ? ` Correction: ${document.correctionReason}. Please ignore the previous version.`
    : "";
  const sourceLine = document.sourceInvoiceNumber
    ? ` Cancels/source invoice: ${document.sourceInvoiceNumber}.`
    : "";

  return {
    target,
    documentId: document.id,
    filename,
    text: `Send ${filename} to ${targetLabel} for ${target === "marios" ? "approval" : "accounting"} review.${commissionLine}${sourceLine}${correctionLine}`
  };
}

