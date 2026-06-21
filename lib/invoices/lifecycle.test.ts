/**
 * Invoicing lifecycle unit tests.
 *
 * Covers the core invoice business logic that previously had NO dedicated
 * coverage (only generic document/chat tests existed):
 *   - invoice creation + VAT calculation + validation-derived flags
 *   - the approval state machine (draft -> sent-to-marios -> approved ->
 *     numbered -> sent-to-accounting, plus correction/credit branches)
 *   - mark-as-paid workflow + receipt generation
 *   - credit-note issuance
 *   - draft numbering / sequence advancement
 *   - authorized-agent access enforcement (the access gate that protects
 *     who may drive invoicing)
 *
 * Runner: node:test via tsx (matches the other non-edge unit suites under
 * tests/unit, e.g. conversation-pruning.test.ts). The `@/` alias resolves
 * through tsconfig paths.
 *
 * Run directly:
 *   pnpm exec tsx --test lib/invoices/lifecycle.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findAccessUser } from "@/lib/invoices/access";
import { isAuthorizedAgent, normalizeMsisdn } from "@/lib/invoices/constants";
import {
  calculateVat,
  createCreditNoteFromInvoice,
  createDocument,
  createReceiptFromInvoice,
  type DocumentInput,
  documentMatchesInvoiceNumberSearch,
} from "@/lib/invoices/document-actions";
import {
  createDraftNumber,
  getNextDraftSequence,
} from "@/lib/invoices/numbering";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import {
  applyOfficialNumberToDocument,
  cancelInvoiceWithCreditNote,
  forwardToAccounting,
  markApproved,
  markCorrectedForResend,
  markPaidWithReceipt,
  markStorageReady,
  sendDraftToMarios,
} from "@/lib/invoices/workflow-actions";

const baseInput: DocumentInput = {
  kind: "invoice",
  clientName: "Test Client Ltd",
  clientEmail: "client@example.com",
  description: "Consultancy services rendered",
  amount: 1000,
  vatMode: "plus-vat",
  issueDate: "2026-06-01",
  dueDate: "2026-07-01",
  recurrence: "none",
};

function makeInvoice(
  overrides: Partial<DocumentInput> = {},
  index = 1
): InvoiceDocument {
  return createDocument({ ...baseInput, ...overrides }, index);
}

describe("invoicing lifecycle — VAT calculation", () => {
  it("adds 19% VAT in plus-vat mode", () => {
    assert.deepEqual(calculateVat(1000, "plus-vat"), {
      vatAmount: 190,
      total: 1190,
    });
  });

  it("extracts embedded VAT in included-vat mode without changing the total", () => {
    const { vatAmount, total } = calculateVat(1190, "included-vat");
    assert.equal(total, 1190);
    // 1190 / 1.19 = 1000 net -> 190 VAT.
    assert.equal(vatAmount, 190);
  });

  it("applies no VAT in no-vat mode", () => {
    assert.deepEqual(calculateVat(1000, "no-vat"), {
      vatAmount: 0,
      total: 1000,
    });
  });

  it("rounds plus-vat amounts to two decimals", () => {
    const { vatAmount, total } = calculateVat(99.99, "plus-vat");
    assert.equal(vatAmount, 19);
    assert.equal(total, 118.99);
  });
});

describe("invoicing lifecycle — invoice creation", () => {
  it("creates a draft invoice with computed totals and an opening timeline event", () => {
    const invoice = makeInvoice();

    assert.equal(invoice.kind, "invoice");
    assert.equal(invoice.status, "draft");
    assert.equal(invoice.paymentStatus, "unpaid");
    assert.equal(invoice.vatAmount, 190);
    assert.equal(invoice.total, 1190);
    assert.equal(invoice.currency, "EUR");
    assert.ok(invoice.draftNumber.endsWith("-DRAFT"));
    assert.equal(invoice.storageStatus, "not-generated");
    assert.equal(invoice.whatsappStatus, "planned");
    assert.equal(invoice.approvalTimeline.length, 1);
    assert.equal(invoice.approvalTimeline[0].label, "Draft created");
  });

  it("normalizes the description (capitalizes first letter)", () => {
    const invoice = makeInvoice({
      description: "commission for property sale",
    });
    assert.equal(invoice.description, "Commission for property sale");
  });

  it("flags commission descriptions as requiring a commission person", () => {
    const invoice = makeInvoice({
      description: "Commission from the sale of the property",
    });
    assert.equal(invoice.requiresCommissionPerson, true);
    assert.ok(
      invoice.notes.some((note) =>
        note.includes("Commission trigger detected")
      ),
      "expected a commission-trigger note"
    );
  });

  it("does not flag non-commission descriptions", () => {
    const invoice = makeInvoice({
      description: "Consultancy services rendered",
    });
    assert.equal(invoice.requiresCommissionPerson, false);
  });

  it("labels valuation descriptions", () => {
    const invoice = makeInvoice({
      description: "Valuation of residential property",
    });
    assert.equal(invoice.label, "valuation");
  });

  it("drops the recurrence day for one-off invoices", () => {
    const invoice = makeInvoice({ recurrence: "none", recurrenceDay: 15 });
    assert.equal(invoice.recurrenceDay, undefined);
  });

  it("keeps the recurrence day for monthly invoices", () => {
    const invoice = makeInvoice({ recurrence: "monthly", recurrenceDay: 15 });
    assert.equal(invoice.recurrenceDay, 15);
  });
});

describe("invoicing lifecycle — approval state machine", () => {
  it("moves draft -> sent-to-marios and queues the WhatsApp message", () => {
    const sent = sendDraftToMarios(makeInvoice());
    assert.equal(sent.status, "sent-to-marios");
    assert.equal(sent.whatsappStatus, "queued");
    const last = sent.approvalTimeline.at(-1)!;
    assert.equal(last.label, "With Marios");
    assert.equal(last.by, "Sophia");
  });

  it("approval is attributed to Marios", () => {
    const approved = markApproved(sendDraftToMarios(makeInvoice()));
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvalTimeline.at(-1)!.by, "Marios");
  });

  it("applying an official number numbers the document and clears the pending reason", () => {
    const approved = markApproved(sendDraftToMarios(makeInvoice()));
    const numbered = applyOfficialNumberToDocument(approved, "  11425 ");

    assert.equal(numbered.status, "numbered");
    assert.equal(numbered.officialNumber, "11425");
    assert.equal(numbered.officialNumberPendingReason, undefined);
    assert.equal(numbered.storageStatus, "needs-regeneration");
  });

  it("ignores a blank official number (no-op)", () => {
    const approved = markApproved(sendDraftToMarios(makeInvoice()));
    const result = applyOfficialNumberToDocument(approved, "   ");
    assert.equal(result, approved);
  });

  it("forwarding to accounting queues the WhatsApp message", () => {
    const numbered = applyOfficialNumberToDocument(
      markApproved(sendDraftToMarios(makeInvoice())),
      "11426"
    );
    const forwarded = forwardToAccounting(numbered);
    assert.equal(forwarded.status, "sent-to-accounting");
    assert.equal(forwarded.whatsappStatus, "queued");
  });

  it("marks a correction-resend with a reason, requeue and regeneration", () => {
    const forwarded = forwardToAccounting(
      applyOfficialNumberToDocument(
        markApproved(sendDraftToMarios(makeInvoice())),
        "11427"
      )
    );
    const corrected = markCorrectedForResend(forwarded);

    assert.equal(corrected.status, "corrected-resend");
    assert.equal(corrected.storageStatus, "needs-regeneration");
    assert.equal(corrected.whatsappStatus, "queued");
    assert.ok(corrected.correctionReason, "expected a correction reason");
    assert.ok(
      corrected.notes.some((note) => note.includes("Accounting must ignore")),
      "expected an ignore-previous-version note"
    );
  });

  it("markStorageReady transitions storage to stored with a deterministic path", () => {
    const numbered = applyOfficialNumberToDocument(
      markApproved(sendDraftToMarios(makeInvoice())),
      "11428"
    );
    const stored = markStorageReady(numbered);
    assert.equal(stored.storageStatus, "stored");
    assert.ok(stored.storagePath?.startsWith("generated/"));
    assert.ok(stored.storagePath?.endsWith(".pdf"));
  });

  it("does not mutate the input document (transitions are pure)", () => {
    const draft = makeInvoice();
    const before = JSON.stringify(draft);
    sendDraftToMarios(draft);
    assert.equal(
      JSON.stringify(draft),
      before,
      "transition must not mutate its argument"
    );
  });
});

describe("invoicing lifecycle — mark paid + receipt generation", () => {
  it("marks the invoice paid and issues a linked receipt draft", () => {
    const numbered = applyOfficialNumberToDocument(
      markApproved(sendDraftToMarios(makeInvoice())),
      "11429"
    );
    const { invoice, receipt } = markPaidWithReceipt(
      numbered,
      5,
      "2026-06-15T00:00:00.000Z"
    );

    assert.equal(invoice.paymentStatus, "paid");
    assert.equal(invoice.paidAt, "2026-06-15T00:00:00.000Z");
    assert.equal(invoice.paidAmount, invoice.total);
    assert.equal(invoice.status, "sent-to-accounting");
    assert.equal(invoice.receiptNumber, receipt.draftNumber);

    assert.equal(receipt.kind, "receipt");
    assert.equal(receipt.status, "draft");
    assert.equal(receipt.paymentStatus, "paid");
    assert.equal(receipt.sourceInvoiceNumber, "11429");
    assert.equal(receipt.paidAmount, numbered.total);
  });

  it("createReceiptFromInvoice carries the paid amount and source reference", () => {
    const invoice = makeInvoice();
    const receipt = createReceiptFromInvoice(invoice, 9);
    assert.equal(receipt.kind, "receipt");
    assert.equal(receipt.recurrence, "none");
    assert.equal(receipt.paidAmount, invoice.total);
    assert.equal(receipt.sourceInvoiceNumber, invoice.draftNumber);
    assert.ok(receipt.draftNumber.startsWith("RCPT-"));
  });
});

describe("invoicing lifecycle — credit-note issuance", () => {
  it("cancels an invoice into a linked credit note", () => {
    const numbered = applyOfficialNumberToDocument(
      markApproved(sendDraftToMarios(makeInvoice())),
      "11430"
    );
    const { invoice, creditNote } = cancelInvoiceWithCreditNote(numbered, 3);

    assert.equal(invoice.status, "credited");
    assert.equal(invoice.linkedCreditNoteNumber, creditNote.draftNumber);
    assert.equal(invoice.storageStatus, "needs-regeneration");

    assert.equal(creditNote.kind, "credit-note");
    assert.equal(creditNote.status, "draft");
    assert.equal(creditNote.paymentStatus, "not-required");
    assert.equal(creditNote.sourceInvoiceNumber, "11430");
    assert.ok(creditNote.draftNumber.startsWith("CN-"));
  });

  it("createCreditNoteFromInvoice resets receipt/payment fields", () => {
    const paidInvoice = makeInvoice();
    const creditNote = createCreditNoteFromInvoice(
      {
        ...paidInvoice,
        paymentStatus: "paid",
        paidAmount: 1190,
        receiptNumber: "RCPT-1",
      },
      4
    );
    assert.equal(creditNote.paymentStatus, "not-required");
    assert.equal(creditNote.paidAmount, undefined);
    assert.equal(creditNote.receiptNumber, undefined);
  });
});

describe("invoicing lifecycle — draft numbering", () => {
  it("formats draft numbers per kind with a zero-padded sequence and -DRAFT suffix", () => {
    const year = new Date().getFullYear();
    assert.equal(createDraftNumber("invoice", 7), `INV-${year}-00007-DRAFT`);
    assert.equal(createDraftNumber("credit-note", 7), `CN-${year}-00007-DRAFT`);
    assert.equal(createDraftNumber("receipt", 7), `RCPT-${year}-00007-DRAFT`);
  });

  it("advances the next sequence past the existing fallback floor when empty", () => {
    assert.equal(getNextDraftSequence([], "invoice"), 11_425);
    assert.equal(getNextDraftSequence([], "credit-note"), 10_097);
    assert.equal(getNextDraftSequence([], "receipt"), 10_387);
  });

  it("advances past the highest existing official/draft sequence of the same kind", () => {
    const docs: InvoiceDocument[] = [
      {
        ...makeInvoice(),
        officialNumber: "11500",
        draftNumber: "INV-2026-11499-DRAFT",
      },
      { ...makeInvoice(), officialNumber: "11600" },
    ];
    assert.equal(getNextDraftSequence(docs, "invoice"), 11_601);
  });

  it("scopes sequence advancement to the requested kind", () => {
    const docs: InvoiceDocument[] = [
      { ...makeInvoice(), officialNumber: "99999" },
    ];
    // No credit notes present -> still falls back to the credit-note floor.
    assert.equal(getNextDraftSequence(docs, "credit-note"), 10_097);
  });
});

describe("invoicing lifecycle — search", () => {
  it("matches on draft, official and source numbers; empty query matches all", () => {
    const invoice = applyOfficialNumberToDocument(
      markApproved(sendDraftToMarios(makeInvoice())),
      "11431"
    );
    assert.equal(documentMatchesInvoiceNumberSearch(invoice, ""), true);
    assert.equal(documentMatchesInvoiceNumberSearch(invoice, "11431"), true);
    assert.equal(
      documentMatchesInvoiceNumberSearch(invoice, "nope-not-here"),
      false
    );
  });
});

describe("invoicing lifecycle — authorized-agent access gate", () => {
  it("normalizes MSISDNs to digits only", () => {
    assert.equal(normalizeMsisdn("+357 99 921560"), "35799921560");
    assert.equal(normalizeMsisdn("00357-99-921560"), "0035799921560");
  });

  it("authorizes known agents across +357 / 00357 / bare formats (last 8 digits)", () => {
    assert.equal(isAuthorizedAgent("+357 99 921560"), true);
    assert.equal(isAuthorizedAgent("0035799921560"), true);
    assert.equal(isAuthorizedAgent("99921560"), true);
    assert.equal(isAuthorizedAgent("99076732@s.whatsapp.net"), true);
  });

  it("rejects unknown numbers and too-short inputs", () => {
    assert.equal(isAuthorizedAgent("35799000000"), false);
    assert.equal(isAuthorizedAgent("12345"), false);
    assert.equal(isAuthorizedAgent(""), false);
  });
});

describe("invoicing lifecycle — access-code gate", () => {
  it("resolves a known access code case-insensitively with whitespace tolerance", () => {
    const user = findAccessUser("  marios-2026  ");
    assert.ok(user, "expected Marios to be resolved");
    assert.equal(user?.name, "Marios");
    assert.equal(user?.role, "owner");
  });

  it("returns undefined for an unknown access code", () => {
    assert.equal(findAccessUser("NOT-A-REAL-CODE"), undefined);
    assert.equal(findAccessUser(""), undefined);
  });
});
