import type { Client, Doc, RecurringRun, StageDescriptor } from "./types";

export const ENTITY = {
  name: "CSC ZYPRUS PROPERTY GROUP LTD",
  regNo: "HE 412 339",
  vatNo: "CY 10412339B",
  address: "29 Christaki Kranou, Office 12, 4042 Limassol, Cyprus",
  iban: "CY17 0020 0144 0000 0000 1247 8312",
  bank: "Bank of Cyprus · SWIFT BCYPCY2N"
};

export const STAGES: Record<string, StageDescriptor> = {
  DRAFT: { id: "draft", label: "Draft", chip: "" },
  SENT_TO_MARIOS: { id: "sent-to-marios", label: "Sent to Marios", chip: "stage-sent-to-marios" },
  CORRECTION_NEEDED: { id: "correction-needed", label: "Correction needed", chip: "stage-correction-needed" },
  CORRECTED_RESEND: { id: "corrected-resend", label: "Corrected · resend", chip: "stage-corrected-resend" },
  APPROVED: { id: "approved", label: "Approved", chip: "stage-approved" },
  NUMBERED: { id: "numbered", label: "Numbered", chip: "stage-numbered" },
  SENT_TO_ACCOUNTING: { id: "sent-to-accounting", label: "Paid · sent to accounting", chip: "stage-sent-to-accounting" },
  CREDITED: { id: "credited", label: "Credited", chip: "stage-credited" },
  CANCELLED: { id: "cancelled", label: "Cancelled", chip: "stage-cancelled" }
};

export const fmt = (n: number) =>
  "€" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CLIENTS: Client[] = [
  { id: "c1", name: "Andreas Konstantinou", property: "Apt 4B · Limassol Marina", vat: "CY 30481299D", address: "12 Vassileos Konstantinou, 3046 Limassol" },
  { id: "c2", name: "Pieridou Trading Ltd", property: "Office 12 · Strovolos", vat: "CY 10298471A", address: "88 Athalassis Avenue, 2024 Nicosia" },
  { id: "c3", name: "Elena Christofidou", property: "Villa 7 · Coral Bay", vat: "—", address: "5 Tafon ton Vasileon, 8049 Paphos" },
  { id: "c4", name: "Hadjigeorgiou Retail", property: "Unit 3 · Larnaca Promenade", vat: "CY 10412998E", address: "Athinon Avenue 41, 6300 Larnaca" },
  { id: "c5", name: "Williams, Charles J.", property: "Penthouse · Amathus Hills", vat: "—", address: "Apt PH-2, 11 Amathountos, 4533 Limassol" },
  { id: "c6", name: "Sophia Andreou", property: "Apt 9A · Aglantzia", vat: "—", address: "Grigori Afxentiou 17, 2100 Nicosia" },
  { id: "c7", name: "Stavrou Logistics LLC", property: "Warehouse 5 · Ypsonas Industrial", vat: "CY 10557228G", address: "Industrial Zone B, 4193 Ypsonas" },
  { id: "c8", name: "Anna Ioannidou", property: "Office 8 · Paphos Centre", vat: "—", address: "Pavlou Mela 9, 8049 Paphos" },
  { id: "c9", name: "Demetriou Holdings", property: "Building 22 · Engomi", vat: "CY 10663541H", address: "Engomis 41, 2406 Nicosia" },
  { id: "c10", name: "Constantinou, Marios", property: "Studio 11 · Old Town", vat: "—", address: "Onasagorou 28, 1011 Nicosia" }
];

const inv = (o: Partial<Doc> & Pick<Doc, "id" | "client" | "issued" | "period" | "lines" | "stage" | "draftNo" | "officialNo" | "description" | "timeline">): Doc => {
  const vatRate = o.vatRate ?? 19;
  return {
    kind: "invoice",
    vatRate,
    vatMode: o.vatMode ?? (vatRate === 0 ? "no-vat" : "plus-vat"),
    total: o.total ?? (o.lines || []).reduce((s, l) => s + l.qty * l.unitPrice * (1 + vatRate / 100), 0),
    ...o
  } as Doc;
};

export const DOCS: Doc[] = [
  inv({
    id: "d-001",
    draftNo: "DRAFT-2026-0042",
    officialNo: null,
    stage: STAGES.DRAFT.id,
    client: "c1",
    issued: "2026-05-26",
    due: "2026-06-09",
    period: "May 2026",
    lines: [
      { desc: "Rent — Apt 4B, Limassol Marina · May 2026", qty: 1, unitPrice: 1850 },
      { desc: "Service charge", qty: 1, unitPrice: 145 }
    ],
    description: "Standard monthly rent. Service charge per lease addendum.",
    timeline: [
      { at: "2026-05-26 09:14", who: "Sophia", what: "Draft prepared from monthly run", body: "Auto-prepared. Awaiting hand-off." }
    ]
  }),
  inv({
    id: "d-002",
    draftNo: "DRAFT-2026-0043",
    officialNo: null,
    stage: STAGES.SENT_TO_MARIOS.id,
    client: "c2",
    issued: "2026-05-25",
    due: "2026-06-08",
    period: "May 2026",
    lines: [
      { desc: "Office 12 lease — May 2026", qty: 1, unitPrice: 3200 },
      { desc: "Parking spaces (2) — May 2026", qty: 2, unitPrice: 95 }
    ],
    description: "Includes parking allocation per Schedule B.",
    timeline: [
      { at: "2026-05-25 08:02", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-25 08:03", who: "Sophia", what: "Sent to Marios for review", body: "Sent directly to Marios on WhatsApp" }
    ]
  }),
  inv({
    id: "d-003",
    draftNo: "DRAFT-2026-0041",
    officialNo: null,
    stage: STAGES.CORRECTION_NEEDED.id,
    client: "c3",
    issued: "2026-05-24",
    due: "2026-06-07",
    period: "May 2026",
    lines: [{ desc: "Villa 7 — Coral Bay · long-let May 2026", qty: 1, unitPrice: 4200 }],
    description: "Long-let tenant. Tenant requested annual prepay; on hold per Marios.",
    correction: { reason: "Tenant moved to annual prepay — reissue as single line, drop service charge.", at: "2026-05-24 14:22", from: "Marios" },
    timeline: [
      { at: "2026-05-24 09:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-24 09:02", who: "Sophia", what: "Sent to Marios for review", body: "—" },
      { at: "2026-05-24 14:22", who: "Marios", what: "Correction requested", body: "Tenant moved to annual prepay — reissue as single line, drop service charge." }
    ]
  }),
  inv({
    id: "d-004",
    draftNo: "DRAFT-2026-0040",
    officialNo: null,
    stage: STAGES.CORRECTED_RESEND.id,
    client: "c4",
    issued: "2026-05-23",
    due: "2026-06-06",
    period: "May 2026",
    lines: [
      { desc: "Unit 3 retail lease · May 2026", qty: 1, unitPrice: 2900 },
      { desc: "Common area maintenance", qty: 1, unitPrice: 180 }
    ],
    description: "Corrected per Marios — CAM was duplicated on prior version.",
    timeline: [
      { at: "2026-05-23 09:14", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-23 11:30", who: "Marios", what: "Correction requested", body: "CAM line was double-counted." },
      { at: "2026-05-23 11:48", who: "Sophia", what: "Corrected & resent", body: "—" }
    ]
  }),
  inv({
    id: "d-005",
    draftNo: "DRAFT-2026-0039",
    officialNo: null,
    stage: STAGES.APPROVED.id,
    client: "c5",
    issued: "2026-05-22",
    due: "2026-06-05",
    period: "May 2026",
    lines: [{ desc: "Penthouse · Amathus Hills — long-let May 2026", qty: 1, unitPrice: 6500 }],
    description: "Approved by Marios. Awaiting official number assignment.",
    timeline: [
      { at: "2026-05-22 08:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-22 08:01", who: "Sophia", what: "Sent to Marios", body: "—" },
      { at: "2026-05-22 10:14", who: "Marios", what: "Approved", body: "Looks good — number it." }
    ]
  }),
  inv({
    id: "d-006",
    draftNo: "DRAFT-2026-0038",
    officialNo: "11424",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11424.pdf",
    stage: STAGES.NUMBERED.id,
    client: "c6",
    issued: "2026-05-21",
    due: "2026-06-04",
    period: "May 2026",
    lines: [
      { desc: "Apt 9A · Aglantzia — May 2026", qty: 1, unitPrice: 1100 },
      { desc: "Service charge", qty: 1, unitPrice: 85 }
    ],
    description: "Numbered, sent to tenant. Awaiting payment confirmation.",
    timeline: [
      { at: "2026-05-21 08:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-21 08:01", who: "Sophia", what: "Sent to Marios", body: "—" },
      { at: "2026-05-21 09:45", who: "Marios", what: "Approved", body: "—" },
      { at: "2026-05-21 09:46", who: "Sophia", what: "Numbered as 11424", body: "Official sequence assigned." },
      { at: "2026-05-21 09:47", who: "Sophia", what: "Sent to client", body: "WhatsApp · +357 99 ••• 312" }
    ]
  }),
  inv({
    id: "d-007",
    draftNo: "DRAFT-2026-0037",
    officialNo: "11423",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11423.pdf",
    stage: STAGES.NUMBERED.id,
    client: "c7",
    issued: "2026-05-20",
    due: "2026-06-03",
    period: "May 2026",
    lines: [{ desc: "Warehouse 5 · Ypsonas Industrial — May 2026", qty: 1, unitPrice: 5400 }],
    description: "Numbered & delivered. Awaiting payment.",
    commission: { agent: "Christos Lambrou", rate: "5%", amount: 270 },
    timeline: [
      { at: "2026-05-20 08:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-20 08:01", who: "Sophia", what: "Sent to Marios", body: "Commission flag — agent Christos Lambrou." },
      { at: "2026-05-20 09:10", who: "Marios", what: "Approved", body: "Confirmed Christos as agent of record." },
      { at: "2026-05-20 09:11", who: "Sophia", what: "Numbered as 11423", body: "—" },
      { at: "2026-05-20 09:12", who: "Sophia", what: "Sent to client", body: "WhatsApp · +357 99 ••• 451" }
    ]
  }),
  inv({
    id: "d-008",
    draftNo: "DRAFT-2026-0036",
    officialNo: "11422",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11422.pdf",
    stage: STAGES.SENT_TO_ACCOUNTING.id,
    client: "c8",
    issued: "2026-05-19",
    paidOn: "2026-05-24",
    due: "2026-06-02",
    period: "May 2026",
    lines: [{ desc: "Office 8 · Paphos Centre — May 2026", qty: 1, unitPrice: 1800 }],
    description: "Paid by tenant. Receipt 10386 issued & sent to accounting.",
    receiptNo: "10386",
    receiptPdf: "CSC ZYPRUS PROPERTY GROUP LTD Receipt 10386.pdf",
    timeline: [
      { at: "2026-05-19 08:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-19 09:00", who: "Marios", what: "Approved & numbered", body: "11422 assigned." },
      { at: "2026-05-19 09:02", who: "Sophia", what: "Sent to client", body: "WhatsApp · +357 99 ••• 728" },
      { at: "2026-05-24 14:30", who: "Marios", what: "Marked paid", body: "Bank transfer confirmed." },
      { at: "2026-05-24 14:31", who: "Sophia", what: "Receipt 10386 generated", body: "Sent to client & accounting." }
    ]
  }),
  inv({
    id: "d-009",
    draftNo: "DRAFT-2026-0028",
    officialNo: "11418",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11418.pdf",
    stage: STAGES.CREDITED.id,
    client: "c9",
    issued: "2026-05-14",
    due: "2026-05-28",
    period: "May 2026",
    lines: [{ desc: "Building 22 · Engomi — May 2026", qty: 1, unitPrice: 7800 }],
    description: "Cancelled by credit note 10096 — tenant exited lease 17 May.",
    creditedBy: "cn-001",
    timeline: [
      { at: "2026-05-14 08:00", who: "Sophia", what: "Issued as 11418", body: "—" },
      { at: "2026-05-17 11:10", who: "Marios", what: "Lease terminated", body: "Tenant gave notice. Credit note required." },
      { at: "2026-05-17 11:42", who: "Sophia", what: "Credit note 10096 issued", body: "Linked to 11418." }
    ]
  }),
  {
    kind: "credit",
    id: "cn-001",
    draftNo: null,
    officialNo: "10096",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Credit Note 10096.pdf",
    stage: STAGES.NUMBERED.id,
    client: "c9",
    issued: "2026-05-17",
    period: "May 2026",
    appliesTo: "11418",
    appliesToId: "d-009",
    vatRate: 19,
    vatMode: "plus-vat",
    lines: [{ desc: "Credit re: Invoice 11418 — early lease termination", qty: 1, unitPrice: -7800 }],
    total: -7800 * 1.19,
    description: "Full credit of invoice 11418. Tenant exited 17 May 2026.",
    timeline: [
      { at: "2026-05-17 11:40", who: "Sophia", what: "Credit draft prepared", body: "Linked to 11418." },
      { at: "2026-05-17 11:41", who: "Marios", what: "Approved", body: "—" },
      { at: "2026-05-17 11:42", who: "Sophia", what: "Numbered as 10096", body: "—" }
    ]
  },
  inv({
    id: "d-010",
    draftNo: "DRAFT-2026-0031",
    officialNo: null,
    stage: STAGES.CANCELLED.id,
    client: "c10",
    issued: "2026-05-18",
    due: "2026-06-01",
    period: "May 2026",
    lines: [{ desc: "Studio 11 · Old Town — May 2026", qty: 1, unitPrice: 950 }],
    description: "Cancelled before numbering — duplicate of d-006 line.",
    timeline: [
      { at: "2026-05-18 08:00", who: "Sophia", what: "Draft prepared", body: "—" },
      { at: "2026-05-18 09:15", who: "Marios", what: "Cancel requested", body: "Duplicate — already invoiced under 11424." }
    ]
  }),
  inv({
    id: "d-011",
    draftNo: "DRAFT-2026-0024",
    officialNo: "11414",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11414.pdf",
    stage: STAGES.SENT_TO_ACCOUNTING.id,
    client: "c1",
    issued: "2026-04-26",
    paidOn: "2026-04-30",
    due: "2026-05-09",
    period: "April 2026",
    receiptNo: "10381",
    lines: [
      { desc: "Rent — Apt 4B, Limassol Marina · April 2026", qty: 1, unitPrice: 1850 },
      { desc: "Service charge", qty: 1, unitPrice: 145 }
    ],
    description: "Paid on time.",
    timeline: [{ at: "2026-04-30 12:00", who: "Sophia", what: "Receipt 10381 generated", body: "—" }]
  }),
  inv({
    id: "d-012",
    draftNo: "DRAFT-2026-0021",
    officialNo: "11411",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11411.pdf",
    stage: STAGES.SENT_TO_ACCOUNTING.id,
    client: "c5",
    issued: "2026-04-22",
    paidOn: "2026-04-28",
    due: "2026-05-06",
    period: "April 2026",
    receiptNo: "10378",
    lines: [{ desc: "Penthouse · Amathus Hills — April 2026", qty: 1, unitPrice: 6500 }],
    description: "Paid.",
    timeline: [{ at: "2026-04-28 10:30", who: "Sophia", what: "Receipt 10378 generated", body: "—" }]
  }),
  inv({
    id: "d-013",
    draftNo: "DRAFT-2026-0019",
    officialNo: "11409",
    pdf: "CSC ZYPRUS PROPERTY GROUP LTD Invoice 11409.pdf",
    stage: STAGES.SENT_TO_ACCOUNTING.id,
    client: "c7",
    issued: "2026-04-20",
    paidOn: "2026-05-02",
    due: "2026-05-04",
    period: "April 2026",
    receiptNo: "10375",
    lines: [{ desc: "Warehouse 5 · Ypsonas Industrial — April 2026", qty: 1, unitPrice: 5400 }],
    description: "Paid 2 days late.",
    timeline: [{ at: "2026-05-02 11:00", who: "Sophia", what: "Receipt 10375 generated", body: "—" }]
  })
];

export const RECURRING: RecurringRun[] = [
  { id: "r-monthly", cadence: "Monthly", nextRun: "2026-06-01 08:00", count: 11, owners: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c11"], paused: false, lastRun: "2026-05-01 08:00", lastRunCount: 11, lastRunIssued: 11 },
  { id: "r-yearly", cadence: "Yearly", nextRun: "2027-01-15 08:00", count: 2, owners: ["c3", "c10"], paused: false, lastRun: "2026-01-15 08:00", lastRunCount: 2, lastRunIssued: 2 }
];

export function clientById(id: string): Client {
  return CLIENTS.find((c) => c.id === id) ?? { id: "", name: "Unknown", property: "—", vat: "—", address: "—" };
}

export function replaceClientRegistry(next: Client[]) {
  CLIENTS.splice(0, CLIENTS.length, ...next);
}

export function metrics(docs: Doc[]) {
  const today = docs.filter((d) => d.stage === "sent-to-marios" || d.stage === "correction-needed").length;
  const awaitingNumber = docs.filter((d) => d.stage === "approved").length;
  const unpaid = docs.filter((d) => d.stage === "numbered" && d.kind === "invoice").length;
  const paidThisMonth = docs.filter((d) => d.stage === "sent-to-accounting" && d.paidOn && d.paidOn.startsWith("2026-05")).length;
  return { today, awaitingNumber, unpaid, paidThisMonth };
}

export function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nextSequence(doc: Doc): string {
  if (doc.kind === "credit") return "10097";
  const last = DOCS.filter((d) => d.officialNo && d.kind === "invoice")
    .map((d) => parseInt(d.officialNo as string, 10))
    .sort((a, b) => b - a)[0] ?? 11423;
  return String(last + 1);
}
