import type { Client, Doc, DocKind, Stage, TimelineEvent } from "./types";
import type { InvoiceDocument, DocumentKind, ApprovalStatus, VatMode } from "@/lib/invoices/types/invoice";

function clientIdFromName(name: string): string {
  return "client-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function kindRedesign(kind: DocumentKind): DocKind {
  if (kind === "credit-note") return "credit";
  return kind;
}

function kindStorage(kind: DocKind): DocumentKind {
  if (kind === "credit") return "credit-note";
  return kind;
}

function vatRateFromMode(mode: VatMode): number {
  if (mode === "no-vat") return 0;
  return 19;
}

function periodFromIssue(issueDate: string): string {
  const [y, m] = issueDate.split("-");
  if (!y || !m) return "";
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-GB", { month: "long" });
  return `${month} ${y}`;
}

function timelineFromInvoice(invoice: InvoiceDocument): TimelineEvent[] {
  return (invoice.approvalTimeline ?? []).map((event) => ({
    at: event.at,
    who: event.by,
    what: event.label,
    body: "—"
  }));
}

export function invoiceToDoc(invoice: InvoiceDocument): Doc {
  const sub = invoice.amount;
  const lines =
    invoice.lineItems && invoice.lineItems.length
      ? invoice.lineItems.map((li) => ({ desc: li.description, qty: li.quantity, unitPrice: li.unitPrice }))
      : [
          {
            desc: invoice.description || invoice.billToLabel || `${kindRedesign(invoice.kind)} — ${invoice.clientName}`,
            qty: 1,
            unitPrice: sub
          }
        ];
  const total = invoice.total * (invoice.kind === "credit-note" ? -1 : 1);

  return {
    id: invoice.id,
    kind: kindRedesign(invoice.kind),
    stage: invoice.status as Stage,
    draftNo: invoice.draftNumber || null,
    officialNo: invoice.officialNumber ?? null,
    pdf: invoice.storagePath ? invoice.storagePath.split("/").at(-1) : undefined,
    client: clientIdFromName(invoice.clientName),
    clientEmail: invoice.clientEmail ?? undefined,
    issued: invoice.issueDate,
    due: invoice.dueDate,
    paidOn: invoice.paidAt,
    period: periodFromIssue(invoice.issueDate),
    recurrence: invoice.recurrence,
    vatRate: vatRateFromMode(invoice.vatMode),
    vatMode: invoice.vatMode,
    lines,
    total,
    description: invoice.description,
    commission: invoice.requiresCommissionPerson && invoice.commissionPersonName
      ? { agent: invoice.commissionPersonName, rate: "5%", amount: sub * 0.05 }
      : undefined,
    correction: invoice.correctionReason
      ? { reason: invoice.correctionReason, at: invoice.approvalTimeline.at(-1)?.at ?? invoice.issueDate, from: "Marios" }
      : undefined,
    receiptNo: invoice.receiptNumber,
    appliesTo: invoice.sourceInvoiceNumber,
    timeline: timelineFromInvoice(invoice),
    deletedAt: invoice.deletedAt
  };
}

export function deriveClients(invoices: InvoiceDocument[]): Client[] {
  const byId = new Map<string, Client>();
  for (const inv of invoices) {
    const id = clientIdFromName(inv.clientName);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: inv.clientName,
        property: inv.billToLabel || "—",
        address: "—",
        vat: "—"
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function invoicesToDocs(invoices: InvoiceDocument[]): { docs: Doc[]; clients: Client[] } {
  // Preserve the repository order (updated_at desc — see listInvoiceDocuments)
  // so the most recently created/updated invoice is always on top. Sorting by
  // issue date here buried freshly created invoices below future-dated ones.
  const docs = invoices.map(invoiceToDoc);
  const clients = deriveClients(invoices);
  // Cross-link credit notes ↔ invoices
  for (const doc of docs) {
    if (doc.kind === "credit" && doc.appliesTo) {
      const target = docs.find((d) => d.officialNo === doc.appliesTo);
      if (target) doc.appliesToId = target.id;
    }
  }
  for (const doc of docs) {
    if (doc.kind === "invoice" && doc.officialNo) {
      const credit = docs.find((d) => d.kind === "credit" && d.appliesTo === doc.officialNo);
      if (credit) doc.creditedBy = credit.id;
    }
  }
  return { docs, clients };
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Reverse of invoiceToDoc — rebuilds the storage-shape InvoiceDocument from a
 * redesign Doc so the deterministic A4 PDF generator (lib/invoices/pdf.ts) can
 * render it directly. Used by the "Download / Preview PDF" buttons instead of
 * window.print(), which produced a multi-page browser-chrome printout.
 *
 * Amounts are recomputed from the line items the same way TemplatePreview does,
 * so the downloaded PDF matches the on-screen preview exactly.
 */
export function docToInvoiceDocument(doc: Doc, client: Client): InvoiceDocument {
  const lineSum = (doc.lines || []).reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const rate = doc.vatMode === "no-vat" ? 0 : doc.vatRate || 0;
  const includesVat = doc.vatMode === "included-vat";
  const vat = includesVat ? lineSum - lineSum / (1 + rate / 100) : (lineSum * rate) / 100;
  const sub = includesVat ? lineSum - vat : lineSum;
  const total = includesVat ? lineSum : lineSum + vat;

  return {
    id: doc.id,
    kind: kindStorage(doc.kind),
    clientName: client.name,
    clientEmail: undefined,
    billToLabel: client.property || "—",
    description: doc.description || doc.lines?.[0]?.desc || "",
    amount: round2(Math.abs(sub)),
    vatMode: doc.vatMode as VatMode,
    vatAmount: round2(Math.abs(vat)),
    total: round2(Math.abs(total)),
    currency: "EUR",
    issueDate: doc.issued,
    dueDate: doc.due,
    recurrence: "none",
    draftNumber: doc.draftNo || "",
    officialNumber: doc.officialNo || undefined,
    status: doc.stage as ApprovalStatus,
    paymentStatus: "not-required",
    sourceInvoiceNumber: doc.appliesTo,
    requiresCommissionPerson: !!doc.commission,
    storageStatus: "not-generated",
    whatsappStatus: "planned",
    mariosReviewPhone: "",
    accountingGroupLabel: "",
    approvalTimeline: [],
    notes: []
  };
}

export { kindStorage, clientIdFromName };
