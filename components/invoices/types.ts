import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export type ComposerMode = "closed" | "create" | "edit";

export type DocumentActionHandlers = {
  onEdit: () => void;
  onSendToMarios: () => void;
  onApprove: () => void;
  onApplyOfficialNumber: (number: string) => void;
  onStorePdf: () => void;
  onRetrievePdf: () => void;
  onRegeneratePdf: () => void;
  onForwardAccounting: () => void;
  onCorrectResend: (reason: string) => void;
  onMarkPaidAndIssueReceipt: () => void;
  onCancelWithCreditNote: () => void;
  onRetryDelivery: (queueItemId: string) => void;
  onCancelDelivery: (queueItemId: string) => void;
  onQueueClientEmail: () => void;
  onDelete: () => void;
};

export type SelectedDocumentProps = {
  document: InvoiceDocument;
};
