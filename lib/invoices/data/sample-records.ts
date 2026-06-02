import type { InvoiceDocument } from "@/lib/invoices/types/invoice";

export const mariosPhone = "+357 99 921560";
export const accountingGroup = "Zyprus accounting WhatsApp group";

export const sampleDocuments: InvoiceDocument[] = [
  {
    id: "inv-11424",
    kind: "invoice",
    clientName: "VIKTORIYA URYUPINA",
    billToLabel: "Bill To",
    description:
      "Commission from the assignment of the property: flat no. 203 at MOUSON RESIDENCE, registration number 1/34229, sheet/plan 54/570604, plot 635, section 1 at Agios Ioannis, Limassol",
    amount: 5000,
    vatMode: "plus-vat",
    vatAmount: 950,
    total: 5950,
    currency: "EUR",
    issueDate: "2026-04-22",
    dueDate: "2026-05-22",
    recurrence: "none",
    draftNumber: "D-INV-2026-0001",
    officialNumber: "11424",
    status: "sent-to-accounting",
    paymentStatus: "unpaid",
    commissionPersonName: "Pending person from Marios",
    requiresCommissionPerson: true,
    storageStatus: "stored",
    storagePath: "samples/CSC ZYPRUS PROPERTY GROUP LTD Invoice 11424.pdf",
    whatsappStatus: "sent",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Draft prepared by Sophia", at: "2026-04-22T09:00:00.000Z", by: "Sophia" },
      { label: "Approved by Marios", at: "2026-04-22T10:29:00.000Z", by: "Marios" },
      { label: "Forwarded to accounting", at: "2026-04-22T10:32:00.000Z", by: "Sophia" }
    ],
    notes: [
      "Sample invoice from the provided PDF.",
      "Commission keyword requires the relevant person/agent name in the group message."
    ]
  },
  {
    id: "cn-10096",
    kind: "credit-note",
    clientName: "VIKTORIYA URYUPINA",
    billToLabel: "Bill to",
    description: "Credit Note for invoice 11293",
    amount: 5000,
    vatMode: "plus-vat",
    vatAmount: 950,
    total: 5950,
    currency: "EUR",
    issueDate: "2026-03-31",
    recurrence: "none",
    draftNumber: "D-CN-2026-0001",
    officialNumber: "10096",
    status: "credited",
    paymentStatus: "not-required",
    sourceInvoiceNumber: "11293",
    requiresCommissionPerson: false,
    storageStatus: "stored",
    storagePath: "samples/CSC ZYPRUS PROPERTY GROUP LTD Credit Note 10096.pdf",
    whatsappStatus: "sent",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Credit note prepared", at: "2026-03-31T09:00:00.000Z", by: "Sophia" },
      { label: "Approved by Marios", at: "2026-03-31T10:29:00.000Z", by: "Marios" }
    ],
    notes: [
      "Credit note must visibly include Bill to before the customer name.",
      "Credit-note numbering follows the same approve-then-finalize process as invoices."
    ]
  },
  {
    id: "inv-monthly-management",
    kind: "invoice",
    clientName: "Monthly management client",
    clientEmail: "accounts@example.com",
    billToLabel: "Bill To",
    description: "Monthly property management service for May 2026",
    amount: 850,
    vatMode: "plus-vat",
    vatAmount: 161.5,
    total: 1011.5,
    currency: "EUR",
    issueDate: "2026-05-25",
    dueDate: "2026-06-24",
    recurrence: "monthly",
    draftNumber: "D-INV-2026-0002",
    officialNumberPendingReason:
      "Fake draft number until Marios approves and the client-provided sequence is applied.",
    status: "sent-to-marios",
    paymentStatus: "unpaid",
    requiresCommissionPerson: false,
    storageStatus: "not-generated",
    whatsappStatus: "queued",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Recurring draft prepared", at: "2026-05-25T08:00:00.000Z", by: "Sophia" },
      { label: "Sent to Marios for review", at: "2026-05-25T08:05:00.000Z", by: "Sophia" }
    ],
    notes: ["Monthly and yearly recurrence are both first-class MVP concepts."]
  },
  {
    id: "inv-yearly-retainer",
    kind: "invoice",
    clientName: "Yearly retainer client",
    clientEmail: "finance@example.com",
    billToLabel: "Bill To",
    description: "Yearly administration retainer for property portfolio",
    amount: 2400,
    vatMode: "included-vat",
    vatAmount: 383.19,
    total: 2400,
    currency: "EUR",
    issueDate: "2026-06-01",
    dueDate: "2026-07-01",
    recurrence: "yearly",
    draftNumber: "D-INV-2026-0003",
    officialNumberPendingReason:
      "Fake draft number until Marios approves and the client-provided sequence is applied.",
    status: "draft",
    paymentStatus: "unpaid",
    requiresCommissionPerson: false,
    storageStatus: "not-generated",
    whatsappStatus: "planned",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [{ label: "Draft created", at: "2026-06-01T08:00:00.000Z", by: "Sophia" }],
    notes: ["VAT is included in the amount, so the total remains unchanged."]
  },
  {
    id: "inv-correction",
    kind: "invoice",
    clientName: "Correction example client",
    billToLabel: "Bill To",
    description: "Valuation service - corrected client address",
    amount: 300,
    vatMode: "no-vat",
    vatAmount: 0,
    total: 300,
    currency: "EUR",
    issueDate: "2026-05-18",
    dueDate: "2026-06-17",
    recurrence: "none",
    draftNumber: "D-INV-2026-0004",
    officialNumber: "11431",
    status: "corrected-resend",
    paymentStatus: "unpaid",
    correctionReason: "Client address was wrong in the first sent PDF.",
    requiresCommissionPerson: false,
    storageStatus: "needs-regeneration",
    whatsappStatus: "queued",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Original sent", at: "2026-05-18T09:00:00.000Z", by: "Sophia" },
      { label: "Correction requested", at: "2026-05-18T10:00:00.000Z", by: "Marios" }
    ],
    notes: [
      "Sophia must retrieve, modify, regenerate, and resend invoices that were sent wrong.",
      "Accounting caption must say to ignore the previous version."
    ]
  },
  {
    id: "receipt-10386",
    kind: "receipt",
    clientName: "AVRAMIDES GERASIMOS",
    billToLabel: "Bill To",
    description:
      "Commission from the sale of the plot 301, reg.no. 0/8122, Ierokipia Municipality, Geroskipou",
    amount: 12500,
    vatMode: "plus-vat",
    vatAmount: 2375,
    total: 14875,
    currency: "EUR",
    issueDate: "2026-05-19",
    recurrence: "none",
    draftNumber: "D-RCPT-2026-0001",
    officialNumber: "10386",
    status: "numbered",
    paymentStatus: "paid",
    paidAt: "2026-05-19T09:00:00.000Z",
    paidAmount: 14875,
    sourceInvoiceNumber: "11373",
    requiresCommissionPerson: true,
    commissionPersonName: "Pending person from Marios",
    storageStatus: "stored",
    storagePath: "samples/CSC ZYPRUS PROPERTY GROUP LTD Receipt 10386.pdf",
    whatsappStatus: "planned",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Invoice marked paid", at: "2026-05-19T09:00:00.000Z", by: "Sophia" },
      { label: "Receipt issued", at: "2026-05-19T09:03:00.000Z", by: "Sophia" }
    ],
    notes: [
      "Receipt sample from the client message.",
      "The final receipt template must remove the unwanted payment-method line."
    ]
  }
];
