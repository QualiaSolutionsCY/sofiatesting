import { formatDate, getDisplayNumber, getUnifiedFilename } from "@/lib/invoices/format";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export type ClientEmailMessage = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachmentFilename: string;
};

export function buildClientEmailMessage(
  document: InvoiceDocument,
  sharedCcEmail: string
): ClientEmailMessage {
  const number = getDisplayNumber(document);
  const issueMonth = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric"
  }).format(new Date(document.issueDate));
  const documentName = document.kind === "credit-note" ? "Credit note" : document.kind === "receipt" ? "Receipt" : "Invoice";

  return {
    to: document.clientEmail ?? "",
    cc: sharedCcEmail.trim(),
    subject: `${documentName} ${number} for ${issueMonth}`,
    attachmentFilename: getUnifiedFilename(document),
    body: [
      `Dear ${document.clientName},`,
      "",
      `Please find attached ${documentName.toLowerCase()} ${number} dated ${formatDate(document.issueDate)}.`,
      "",
      "Kind regards,",
      "Sophia"
    ].join("\n")
  };
}
