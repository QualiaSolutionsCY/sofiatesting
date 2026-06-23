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
  target: WhatsappTarget,
  /** Explicit caption the caller typed — honored verbatim, overriding the default blank rules. */
  override?: string
): WhatsappMessage {
  const filename = getUnifiedFilename(document);

  return {
    target,
    documentId: document.id,
    filename,
    text: buildWhatsappCaption(document, target, override)
  };
}

/**
 * Decide the caption that rides alongside the invoice PDF over WhatsApp, per Marios's rules:
 *  - Marios / client group: ALWAYS blank — just the PDF.
 *  - Accounting group: the agent name ONLY when an agent exists; otherwise blank.
 *  - No agent at all: blank for both targets.
 *  - Credit notes: keep the cancellation/correction reason text — the accountant
 *    needs to know why an invoice was cancelled.
 *  - Explicit override: an operator-typed caption wins over the blank default.
 */
function buildWhatsappCaption(
  document: InvoiceDocument,
  target: WhatsappTarget,
  override?: string
): string {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) return trimmedOverride;

  // Credit notes always carry their cancellation reason + source invoice so the
  // accounting group knows why the original invoice was cancelled.
  if (document.kind === "credit-note") {
    const correctionLine = document.correctionReason
      ? `Correction: ${document.correctionReason}. Please ignore the previous version.`
      : "";
    const sourceLine = document.sourceInvoiceNumber
      ? ` Cancels/source invoice: ${document.sourceInvoiceNumber}.`
      : "";
    return `${correctionLine}${sourceLine}`.trim();
  }

  // Accounting group: agent name only when an agent is present. Marios and the
  // no-agent case both get a blank caption — just the PDF.
  if (
    target === "accounting-group" &&
    document.requiresCommissionPerson &&
    document.commissionPersonName
  ) {
    return document.commissionPersonName;
  }

  return "";
}

