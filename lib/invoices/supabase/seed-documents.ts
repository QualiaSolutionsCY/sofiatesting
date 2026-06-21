import { sampleDocuments } from "@/lib/invoices/data/sample-records";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import {
  toApprovalRows,
  toDocumentRow,
  toMessageEventRows,
  toRevisionRow,
  toStorageObjectRow,
} from "./document-mappers";

export type SupabaseSeedBundle = {
  documents: ReturnType<typeof toDocumentRow>[];
  revisions: ReturnType<typeof toRevisionRow>[];
  approvals: ReturnType<typeof toApprovalRows>[number][];
  storageObjects: ReturnType<typeof toStorageObjectRow>[];
  messageEvents: ReturnType<typeof toMessageEventRows>[number][];
};

export function getSeedWorkflowDocuments(): InvoiceDocument[] {
  const invoice = findSample("invoice", "inv-11424");
  const creditNote = findSample("credit-note", "cn-10096");
  const receipt = findSample("receipt", "receipt-10386");

  return [invoice, creditNote, receipt];
}

export function buildSupabaseSeedBundle(
  documents = getSeedWorkflowDocuments()
): SupabaseSeedBundle {
  return {
    documents: documents.map(toDocumentRow),
    revisions: documents.map((document, index) =>
      toRevisionRow(document, index + 1)
    ),
    approvals: documents.flatMap(toApprovalRows),
    storageObjects: documents.map(toStorageObjectRow),
    messageEvents: documents.flatMap(toMessageEventRows),
  };
}

function findSample(kind: InvoiceDocument["kind"], id: string) {
  const document = sampleDocuments.find(
    (sample) => sample.kind === kind && sample.id === id
  );
  if (!document) {
    throw new Error(`Missing seed document ${id}`);
  }
  return document;
}
