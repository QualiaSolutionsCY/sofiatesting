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
 *  - Credit notes: reference the source invoice number ONLY — the cancellation /
 *    correction reason is NEVER put on the caption (it must not appear on or with
 *    any invoice/receipt/credit-note).
 *  - Explicit override: an operator-typed caption wins over the blank default.
 */
function buildWhatsappCaption(
  document: InvoiceDocument,
  target: WhatsappTarget,
  override?: string
): string {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) return trimmedOverride;

  // Credit notes reference ONLY the source invoice number — never the cancellation
  // / correction reason. The reason must not appear on or alongside any document.
  if (document.kind === "credit-note") {
    return document.sourceInvoiceNumber
      ? `Cancels/source invoice: ${document.sourceInvoiceNumber}.`
      : "";
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

