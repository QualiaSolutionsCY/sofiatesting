import { calculateVat } from "@/lib/invoices/document-actions";
import { normalizeInvoiceDescription } from "@/lib/invoices/format";
import { officialNumberPlaceholder } from "@/lib/invoices/numbering";
import type { InvoiceDocument, VatMode } from "@/lib/invoices/types/invoice";
import { accountingGroup, mariosPhone } from "./sample-records";

/**
 * The 14 monthly recurring invoices Sophia issues to clients each month.
 *
 * Source of truth: "monthly invoices NEW (3).xlsx" (14 rows, A/A 1–14).
 * Every invoice recurs monthly on day 22 (Excel "Start Date" 22/06/2026) and
 * is CC'd to Marios (`marios@zyprus.com`) on send — captured per-row in
 * `ccEmail` and surfaced in `notes` + row `metadata.cc_email` because the
 * document model has no first-class CC field.
 *
 * `description` is the recurring base only. The Excel literally read
 * "Consulting Services- February"; the trailing month is a stale artifact
 * (these start in June and recur), so we store the durable base description
 * and leave the month to be appended when an actual month's invoice is
 * generated.
 */
export type RecurringMonthlyInvoiceSource = {
  /** A/A column — 1-based row number from the spreadsheet. */
  index: number;
  /** "Bill To" — the client/company the invoice is addressed to. */
  clientName: string;
  /** Recurring base description (no month suffix). */
  description: string;
  /**
   * Headline figure from the "Amount" column, in EUR.
   * For `plus-vat` this is the net amount; for `included-vat` it is the gross.
   */
  amount: number;
  vatMode: VatMode;
  /** "Email to be send" — the client's billing inbox. */
  clientEmail: string;
  /** "CC email" — copied on every send (always Marios for this batch). */
  ccEmail: string;
};

const CONSULTING = "Consulting Services";
const CC_EMAIL = "marios@zyprus.com";
const RECURRENCE_DAY = 22;
/** First scheduled issue date — Excel "Start Date" 22/06/2026. */
const FIRST_ISSUE_DATE = "2026-06-22";
const SEEDED_AT = "2026-06-04T00:00:00.000Z";
const SOURCE_FILE = "monthly invoices NEW (3).xlsx";

export const RECURRING_MONTHLY_SOURCES: RecurringMonthlyInvoiceSource[] = [
  {
    index: 1,
    clientName: "MG ASSETS BLOG LTD",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "maria@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 2,
    clientName: "D-SIMPLYPOSH CONSULTANCY SERVICES LTD",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "demetra@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 3,
    clientName: "DOMILIO LTD",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "danae@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 4,
    clientName: "I.LYSANDROS PROPERTY SOLUTIONS LTD",
    description: CONSULTING,
    amount: 427,
    vatMode: "plus-vat",
    clientEmail: "larnaca@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 5,
    clientName: "VICTORIA ROBERTS CONSULTING LTD",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "victoria@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 6,
    clientName: "XPLO LTD",
    description:
      "Monthly Payment For Serviced Office - Office 101 at Pythagoras Court, Pythagoras Street, 3027, Limassol.",
    amount: 300,
    vatMode: "included-vat",
    clientEmail: "dte594@proton.me",
    ccEmail: CC_EMAIL,
  },
  {
    index: 7,
    clientName: "PROPERTYVERSE LTD",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "brendan@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 8,
    clientName: "QUETTA Ltd",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "christos@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 9,
    clientName: "SUSAN TAYLOR",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "susan@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 10,
    clientName: "OLESYA ZHEYKO",
    description: CONSULTING,
    amount: 307,
    vatMode: "included-vat",
    clientEmail: "oz@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 11,
    clientName: "N.MICHAELIDOU & ASSOCIATES LLC",
    description: CONSULTING,
    amount: 457,
    vatMode: "plus-vat",
    clientEmail: "nmichaelidou@mzllc.co",
    ccEmail: CC_EMAIL,
  },
  {
    index: 12,
    clientName: "ELENI IORDANIDOU",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "eleni@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 13,
    clientName: "INRESA LIMITED",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "daga@zyprus.com",
    ccEmail: CC_EMAIL,
  },
  {
    index: 14,
    clientName: "DIANA KULTASEVA",
    description: CONSULTING,
    amount: 307,
    vatMode: "plus-vat",
    clientEmail: "diana@zyprus.com",
    ccEmail: CC_EMAIL,
  },
];

/** Stable, deterministic external id so re-seeding upserts (never duplicates). */
export function recurringMonthlyId(index: number): string {
  return `recurring-monthly-${String(index).padStart(2, "0")}`;
}

function recurringDraftNumber(index: number): string {
  return `D-INV-2026-R${String(index).padStart(2, "0")}`;
}

export function buildRecurringMonthlyInvoice(
  source: RecurringMonthlyInvoiceSource
): InvoiceDocument {
  const description = normalizeInvoiceDescription(source.description);
  const { vatAmount, total } = calculateVat(source.amount, source.vatMode);

  return {
    id: recurringMonthlyId(source.index),
    kind: "invoice",
    clientName: source.clientName,
    clientEmail: source.clientEmail,
    billToLabel: "Bill To",
    description,
    amount: source.amount,
    vatMode: source.vatMode,
    vatAmount,
    total,
    currency: "EUR",
    issueDate: FIRST_ISSUE_DATE,
    recurrence: "monthly",
    recurrenceDay: RECURRENCE_DAY,
    draftNumber: recurringDraftNumber(source.index),
    officialNumberPendingReason: officialNumberPlaceholder("invoice"),
    status: "draft",
    paymentStatus: "unpaid",
    requiresCommissionPerson: false,
    storageStatus: "not-generated",
    whatsappStatus: "planned",
    mariosReviewPhone: mariosPhone,
    accountingGroupLabel: accountingGroup,
    approvalTimeline: [
      { label: "Recurring template seeded", at: SEEDED_AT, by: "Sophia" },
    ],
    notes: [
      `Monthly recurring invoice — issues on day ${RECURRENCE_DAY}. CC on send: ${source.ccEmail}.`,
      `Seeded from "${SOURCE_FILE}" row ${source.index}.`,
    ],
  };
}

export function buildRecurringMonthlyInvoices(): InvoiceDocument[] {
  return RECURRING_MONTHLY_SOURCES.map(buildRecurringMonthlyInvoice);
}

/** Extra row metadata that has no first-class column (CC, provenance). */
export function recurringMonthlyMetadata(
  source: RecurringMonthlyInvoiceSource
): Record<string, string | number> {
  return {
    cc_email: source.ccEmail,
    recurring_source_file: SOURCE_FILE,
    recurring_source_row: source.index,
  };
}
