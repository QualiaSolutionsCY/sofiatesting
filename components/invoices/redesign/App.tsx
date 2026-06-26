"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  applyOfficialNumberAction,
  approveDocumentAction,
  cancelWithCreditNoteAction,
  correctResendAction,
  createDocumentAction,
  deleteDocumentAction,
  forwardAccountingAction,
  loadDeletedDocumentsAction,
  loadDocumentsAction,
  markPaidAndIssueReceiptAction,
  notifyAccountingGroupOfInvoiceAction,
  notifyMariosApprovedAction,
  regenerateStoredDocumentAction,
  resendCorrectedInvoiceAction,
  restoreDocumentAction,
  sendInvoiceEmailAction,
  sendToMariosAction,
  updateDocumentAction
} from "@/lib/invoices/actions/documents";
import { docToInvoiceDocument, invoicesToDocs } from "@/lib/invoices/redesign/adapter";
import { addOneMonth, addOneYear, rollDescriptionMonth, rollDescriptionYear } from "@/lib/invoices/format";
import { downloadDocumentPdf } from "@/lib/invoices/downloads";
import { clientById, nowStamp, replaceClientRegistry, todayStamp } from "@/lib/invoices/redesign/data";
import type {
  Client,
  ComposerForm,
  ConfirmState,
  Doc,
  DocKind,
  Filters,
  PaletteItem,
  RecurringRun,
  Stage,
  TimelineEvent
} from "@/lib/invoices/redesign/types";
import type { DocumentInput } from "@/lib/invoices/document-actions";
import type { InvoiceDocument } from "@/lib/invoices/types/invoice";
import { AccessGate } from "./chrome/AccessGate";
import { Sidebar } from "./chrome/Sidebar";
import { Topbar } from "./chrome/Topbar";
import { DetailPane } from "./ledger/DetailPane";
import { ListPane } from "./ledger/ListPane";
import { CommandPalette } from "./modals/CommandPalette";
import { Composer } from "./modals/Composer";
import { ConfirmDialog } from "./modals/ConfirmDialog";
import { TemplateEditor } from "./modals/TemplateEditor";
import { TemplateProvider } from "@/lib/invoices/redesign/template-context";
import { PDFLightbox } from "./modals/PDFLightbox";
import { SettingsPanel } from "./modals/SettingsPanel";
import { ShortcutsOverlay } from "./modals/ShortcutsOverlay";
import { Toast } from "./modals/Toast";
import { GuidedTour } from "./overlays/GuidedTour";
import { MonthlyRunOverlay } from "./overlays/MonthlyRun";
import { RecurringRunsPanel } from "./overlays/RecurringRunsPanel";

const ACCESS_MAP: Record<string, string> = {
  "MARIOS-2026": "Marios Charalambous",
  "CHAR-2026": "Andreas Charalambous",
  "ZYPRUS-2026": "Eleni · Duty operator"
};

interface AppProps {
  initialDocs: Doc[];
  initialClients: Client[];
  persistenceMode: "supabase" | "fallback";
  /** When true, access was already enforced server-side (the /access code gate); skip the in-app access screen. */
  preAuthed?: boolean;
}

function vatRateToMode(rate: number): "plus-vat" | "no-vat" {
  return rate === 0 ? "no-vat" : "plus-vat";
}

function formToDocumentInput(form: ComposerForm): DocumentInput {
  const sub = form.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const clientName = form.newClient?.name ?? clientById(form.client).name;
  return {
    kind: form.kind === "credit" ? "credit-note" : form.kind,
    clientName,
    clientEmail: form.recurrenceEmail || undefined,
    description: form.lines.map((l) => l.desc.trim()).filter(Boolean).join("\n") || form.description || "",
    lineItems: form.lines.map((l) => ({ description: l.desc, quantity: l.qty, unitPrice: l.unitPrice })),
    amount: sub,
    vatMode: form.vatMode ?? vatRateToMode(form.vatRate),
    issueDate: form.issued || todayStamp(),
    dueDate: form.due,
    recurrence: form.recurrence,
    commissionPersonName: form.commission?.agent
  };
}

export default function App({ initialDocs, initialClients, persistenceMode, preAuthed = false }: AppProps) {
  useMemo(() => replaceClientRegistry(initialClients), [initialClients]);

  const [operator, setOperator] = useState<string>(preAuthed ? "Operator" : "");
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [selectedId, setSelectedId] = useState<string | null>(initialDocs[0]?.id ?? null);
  const [filters, setFilters] = useState<Filters>({ kind: "all", stage: "all", q: "", from: "", to: "" });
  const [sharedCc, setSharedCc] = useState("+357 99 040 117");
  const [accountingEmail, setAccountingEmail] = useState("accounting@zyprus.cy");
  const [autoRoute, setAutoRoute] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPrefill, setComposerPrefill] = useState<Partial<Doc> | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [lightboxDoc, setLightboxDoc] = useState<Doc | null>(null);
  const [batchPreview, setBatchPreview] = useState<Doc[] | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  // Which recurring cadence the run overlay is showing — monthly or yearly (R14).
  const [runCadence, setRunCadence] = useState<"monthly" | "yearly">("monthly");
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false);
  const [recurringRuns, setRecurringRuns] = useState<RecurringRun[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [toast, setToast] = useState("");
  // Soft-deleted documents, loaded on demand for the "Deleted" view (M4).
  const [deletedDocs, setDeletedDocs] = useState<Doc[]>([]);
  // Per-document edited WhatsApp captions (the "Edit message" action, M9). An
  // empty string means "send blank — just the PDF". Absent = use the default.
  const [msgOverrides, setMsgOverrides] = useState<Record<string, string>>({});
  // Per-document override for the CLIENT-delivery message (mirror of msgOverrides for
  // Marios) — lets the operator edit the message sent with the client's email.
  const [clientMsgOverrides, setClientMsgOverrides] = useState<Record<string, string>>({});
  // Per-document recipient-email override — the delivery card's "Edit email"
  // action. Falls back to the invoice's stored clientEmail when unset.
  const [clientEmailOverrides, setClientEmailOverrides] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (preAuthed) return;
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sophia.operator") : "";
    if (saved) setOperator(saved);
  }, [preAuthed]);

  useEffect(() => {
    if (!operator) return;
    const isTyping = (target: EventTarget | null) => {
      if (!target) return false;
      const el = target as HTMLElement;
      const tag = el.tagName || "";
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((p) => !p);
        return;
      }
      if (isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const k = event.key;
      if (k === "/") {
        event.preventDefault();
        const el = document.querySelector<HTMLInputElement>(".search-box input");
        el?.focus();
      } else if (k === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      } else if (k === "n" || k === "N") {
        event.preventDefault();
        setComposerPrefill(null);
        setComposerOpen(true);
      } else if (k === "r" || k === "R") {
        event.preventDefault();
        setRunOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [operator]);

  // Re-pull documents when the operator returns to the tab/window so documents
  // created out-of-band (e.g. by an agent over WhatsApp via Sophia) show up
  // without a full page reload. Skipped while the composer is open so an
  // in-progress draft is never disrupted; selection is preserved because
  // reconcile keeps the current selectedId when none is passed.
  useEffect(() => {
    if (!operator) return;
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (composerOpen) return;
      refetchDocuments();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [operator, composerOpen]);

  // Load soft-deleted documents on demand when the "Deleted" view is opened (M4).
  useEffect(() => {
    if (filters.stage !== "deleted") return;
    let cancelled = false;
    loadDeletedDocumentsAction()
      .then((result) => {
        if (cancelled) return;
        setDeletedDocs(invoicesToDocs(result.documents).docs);
      })
      .catch((error) => console.error("Failed to load deleted documents", error));
    return () => {
      cancelled = true;
    };
  }, [filters.stage]);

  function reconcile(invoices: InvoiceDocument[], selectId?: string) {
    const { docs: nextDocs, clients: nextClients } = invoicesToDocs(invoices);
    replaceClientRegistry(nextClients);
    setDocs(nextDocs);
    if (selectId) setSelectedId(selectId);
  }

  // Pull the latest documents from the server and merge them in, keeping the
  // current selection. Used by the topbar Refresh button and the on-focus
  // refresh above. A transient failure is swallowed — the current view stays.
  function refetchDocuments() {
    startTransition(async () => {
      try {
        const result = await loadDocumentsAction();
        reconcile(result.documents);
      } catch (error) {
        console.error("Document refresh failed", error);
      }
    });
  }

  if (!operator) {
    return (
      <AccessGate
        onEnter={(code) => {
          const name = ACCESS_MAP[code] ?? code;
          window.localStorage.setItem("sophia.operator", name);
          setOperator(name);
        }}
      />
    );
  }

  const signOut = () => {
    window.localStorage.removeItem("sophia.operator");
    setOperator("");
  };

  // The list shows soft-deleted documents under the "Deleted" view, the live set
  // everywhere else (M4).
  const viewDocs = filters.stage === "deleted" ? deletedDocs : docs;
  const selected = viewDocs.find((d) => d.id === selectedId) ?? null;

  const advanceStageLocal = (id: string, nextStage: Stage, extras: Partial<Doc> = {}) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...extras, stage: nextStage } : d)));
  };

  const appendEvent = (doc: Doc, event: TimelineEvent): TimelineEvent[] => [...(doc.timeline ?? []), event];

  function handleAct(stageOrAction: string) {
    if (!selected) return;
    switch (stageOrAction) {
      case "draft": {
        // R18b: approving a draft no longer sends immediately. Open an editable
        // message (seeded from any saved override) and only approve + notify when
        // the operator confirms — restoring the approve → edit-message → send step.
        const current = selected;
        const existingMsg = msgOverrides[current.id] ?? "";
        setConfirmState({
          title: "Approve and send this invoice?",
          body:
            "This assigns the official number and posts the PDF to Marios and the accounting group. Edit the message that rides with the PDF below — leave it blank to keep the saved/default text. Payment is a separate step.",
          confirmLabel: "Approve & send",
          prompt: {
            label: "Message sent with the PDF",
            placeholder: existingMsg || "Leave blank to send the default message",
            required: false
          },
          onConfirm: (text) => {
            // An empty textarea means "keep what was already saved". The edited text
            // is both persisted into msgOverrides (for later resends) AND passed
            // directly to the first group + Marios sends below, so the message the
            // operator writes here actually rides with the PDF on this approve.
            const edited = (text ?? "").trim();
            const messageToUse = edited || existingMsg;
            setMsgOverrides((prev) => ({ ...prev, [current.id]: messageToUse }));
            startTransition(async () => {
              // Approve the draft, assign its official number, and post the PDF to
              // the accounting group + Marios. Payment is a SEPARATE step — the
              // invoice is NOT marked paid here.
              try {
                const result = await approveDocumentAction(current.id);
                if (current.kind === "invoice") {
                  // An approved invoice ALWAYS goes to Marios (his copy) AND the
                  // accounting group — never the accounting group alone. Gate the
                  // toast on the REAL send results so it never claims a delivery
                  // that didn't happen.
                  const groupOk = await notifyAccountingGroupOfInvoiceAction(current.id, messageToUse);
                  const mResult = await notifyMariosApprovedAction(current.id, messageToUse);
                  const mariosOk = mResult.mariosNotified ?? false;
                  setToast(
                    "Approved. " +
                      [
                        mariosOk ? "Sent to Marios" : "Marios delivery NOT confirmed",
                        groupOk ? "posted to accounting group" : "accounting group NOT confirmed"
                      ].join("; ") +
                      ". Mark as paid when payment arrives."
                  );
                } else {
                  setToast("Approved and numbered.");
                }
                reconcile(result.documents, current.id);
                setFilters((f) => ({ ...f, stage: "all" }));
              } catch (error) {
                console.error("Approve from draft failed", error);
                setToast("Couldn't approve this invoice — please try again.");
              }
            });
          }
        });
        break;
      }
      case "sent-to-marios":
        startTransition(async () => {
          const result = await sendToMariosAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast(
            result.mariosNotified
              ? "Sent to Marios."
              : "Couldn't confirm the send to Marios — try again."
          );
        });
        break;
      case "correction-needed":
        setComposerPrefill(selected);
        setComposerOpen(true);
        break;
      case "corrected-resend":
        startTransition(async () => {
          const result = await correctResendAction(selected.id, selected.correction?.reason ?? "");
          reconcile(result.documents, selected.id);
          setToast("Resent correction.");
        });
        break;
      case "approved":
      case "number":
        startTransition(async () => {
          const result = await approveDocumentAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("Locked and official number assigned.");
        });
        break;
      case "numbered":
      case "receipt":
        // A receipt is always issued against THIS numbered invoice — it can never
        // exist standalone. markPaidAndIssueReceiptAction keys the receipt to the
        // invoice id, so the receipt is inherently linked to the source invoice.
        if (selected.kind !== "invoice" || !selected.officialNo) {
          setToast("Receipts can only be issued from a numbered invoice.");
          break;
        }
        startTransition(async () => {
          const result = await markPaidAndIssueReceiptAction(selected.id);
          reconcile(result.documents, result.selectedId ?? selected.id);
          setFilters((f) => ({ ...f, stage: "all" }));
          setToast("Receipt issued.");
        });
        break;
      case "sent-to-accounting": {
        // "Open issued receipt" must show the RECEIPT, not the source invoice.
        // The receipt links back via appliesTo === the invoice's official number.
        const receipt = docs.find(
          (d) => d.kind === "receipt" && !!selected.officialNo && d.appliesTo === selected.officialNo
        );
        setLightboxDoc(receipt ?? selected);
        break;
      }
      case "credited": {
        // Open the linked document in EITHER direction: from a credited invoice
        // open its credit note (creditedBy); from a credit note open the source
        // invoice (appliesToId). Fall back to a clear message if no link exists.
        const linkedId = selected.creditedBy ?? selected.appliesToId;
        const linked = linkedId ? docs.find((d) => d.id === linkedId) : undefined;
        if (linked) {
          setSelectedId(linked.id);
          setToast(linked.kind === "credit" ? "Opened linked credit note." : "Opened the source invoice.");
        } else {
          setToast("No linked document found for this credit note.");
        }
        break;
      }
      case "cancelled":
        setComposerPrefill({ ...selected, id: undefined, draftNo: undefined, officialNo: undefined, stage: undefined });
        setComposerOpen(true);
        break;
      case "preview":
        setLightboxDoc(selected);
        break;
      case "edit":
        setComposerPrefill(selected);
        setComposerOpen(true);
        break;
      case "duplicate": {
        const dup: Doc = {
          ...selected,
          id: "d-" + Math.random().toString(36).slice(2, 7),
          draftNo: "DRAFT-2026-00" + (44 + docs.filter((d) => d.draftNo).length + 1),
          officialNo: null,
          stage: "draft",
          pdf: undefined,
          paidOn: undefined,
          receiptNo: undefined,
          creditedBy: undefined,
          issued: todayStamp(),
          timeline: [
            {
              at: nowStamp(),
              who: operator,
              what: "Duplicated from previous document",
              body: `Source: ${selected.officialNo ? "№ " + selected.officialNo : selected.draftNo}`
            }
          ]
        };
        setDocs((d) => [dup, ...d]);
        setSelectedId(dup.id);
        setToast("Duplicated. New draft is ready for editing.");
        break;
      }
      case "print":
      case "download":
        try {
          downloadDocumentPdf(docToInvoiceDocument(selected, clientById(selected.client)));
          setToast("PDF downloaded.");
        } catch (error) {
          console.error("PDF download failed", error);
          setToast("Could not generate the PDF.");
        }
        break;
      case "copy-link":
        navigator.clipboard?.writeText(`sophia://document/${selected.id}`).catch(() => {});
        setToast("Document link copied to clipboard.");
        break;
      case "credit": {
        // Credit notes are only ever created from an existing invoice — never from scratch.
        if (selected.kind !== "invoice" || !selected.officialNo) {
          setToast("Credit notes can only be issued from a numbered invoice.");
          break;
        }
        setConfirmState({
          title: "Issue a credit note?",
          body: `This cancels invoice ${selected.officialNo ? "№ " + selected.officialNo : selected.draftNo} in full, links a credit note, and sends it to the group with your reason.`,
          confirmLabel: "Issue credit note",
          prompt: {
            label: "Reason for the credit note (sent to the group)",
            placeholder: "e.g. Commission double-counted — corrected on the new invoice.",
            required: true
          },
          onConfirm: (reason) => {
            startTransition(async () => {
              const result = await cancelWithCreditNoteAction(selected.id, reason);
              reconcile(result.documents, result.selectedId ?? selected.id);
              setToast("Credit note issued — original cancelled, group notified with your reason.");
            });
          }
        });
        break;
      }
      case "regenerate":
        startTransition(async () => {
          const result = await regenerateStoredDocumentAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("PDF regenerated and re-uploaded.");
        });
        break;
      case "cancel": {
        const willCreditNote = selected.kind === "invoice" && !!selected.officialNo;
        setConfirmState({
          title: "Cancel this document?",
          body: willCreditNote
            ? "This cancels the invoice and issues a linked credit note. Your reason is printed on the credit note and sent to the group, so the accountant knows why."
            : "It will remain in the audit trail. Reversible only by duplicating into a new draft.",
          danger: true,
          confirmLabel: "Yes, cancel",
          prompt: willCreditNote
            ? {
                label: "Reason for cancelling (printed on the credit note)",
                placeholder: "e.g. Wrong amount — corrected on a new invoice.",
                required: true
              }
            : undefined,
          onConfirm: (reason) => {
            if (selected.kind === "invoice" && selected.officialNo) {
              startTransition(async () => {
                const result = await cancelWithCreditNoteAction(selected.id, reason);
                reconcile(result.documents, result.selectedId ?? selected.id);
                setToast("Invoice cancelled — credit note issued with your reason.");
              });
            } else {
              startTransition(async () => {
                const result = await deleteDocumentAction(selected.id);
                reconcile(result.documents, result.selectedId);
                setToast("Document cancelled.");
              });
            }
          }
        });
        break;
      }
      case "whatsapp-marios-resend":
        startTransition(async () => {
          const result = await sendToMariosAction(selected.id, msgOverrides[selected.id]);
          reconcile(result.documents, selected.id);
          setToast(
            result.mariosNotified
              ? "Sent to Marios."
              : "Couldn't confirm the send to Marios — try again."
          );
        });
        break;
      case "whatsapp-marios-edit": {
        // Marios edits the message that rides with the PDF before it's sent.
        // Empty = send just the PDF, no description (his blank-message rule).
        const current = selected;
        const existing = msgOverrides[current.id] ?? "";
        setConfirmState({
          title: "Edit the WhatsApp message",
          body: "This is the text sent with the PDF to Marios / the group. Leave it empty to send just the PDF (no description). Saved for the next send.",
          confirmLabel: "Save message",
          prompt: {
            label: "Message (leave blank to send none)",
            placeholder: existing || "Leave empty to send just the PDF",
            required: false
          },
          onConfirm: (text) => {
            setMsgOverrides((prev) => ({ ...prev, [current.id]: (text ?? "").trim() }));
            setToast("Message saved — it'll be used the next time you send or resend.");
          }
        });
        break;
      }
      case "whatsapp-marios-mute":
        setToast("Notifications muted for this document.");
        break;
      case "client-send-all": {
        const kindWord = selected.kind === "credit" ? "credit note" : selected.kind;
        // Use the recipient on file (the "Edit email" override or the invoice's
        // clientEmail); only fall back to a prompt when none is set.
        const stored = (clientEmailOverrides[selected.id] || selected.clientEmail || "").trim();
        const to = (
          stored ||
          window.prompt(
            `Email this ${kindWord} (${selected.officialNo ?? selected.draftNo ?? ""}) to which address?`,
            ""
          ) ||
          ""
        ).trim();
        if (!to) break;
        // Monthly/yearly invoices ALWAYS CC marios@zyprus.com (Marios's standing rule),
        // alongside the bill-to recipient. One-off invoices go to the bill-to only.
        const isRecurring = !!selected.recurrence && selected.recurrence !== "none";
        const recipients = isRecurring ? [to, "marios@zyprus.com"] : to;
        startTransition(async () => {
          try {
            const result = await sendInvoiceEmailAction(selected.id, recipients, clientMsgOverrides[selected.id] || undefined);
            reconcile(result.documents, selected.id);
            setToast(isRecurring ? `Email sent to ${to} (cc marios@zyprus.com).` : `Email sent to ${to}.`);
          } catch (error) {
            setToast(`Couldn't send email: ${error instanceof Error ? error.message : "please try again"}`);
          }
        });
        break;
      }
      case "client-edit-email": {
        // "Edit email" in the delivery card — set / change the recipient address.
        const current = selected;
        const existing = clientEmailOverrides[current.id] ?? current.clientEmail ?? "";
        setConfirmState({
          title: "Set the recipient email",
          body: "The invoice email is sent to this address. Saved for this invoice; hit “Send email” to deliver it.",
          confirmLabel: "Save email",
          prompt: {
            label: "Client email",
            placeholder: "client@example.com",
            initial: existing,
            required: false
          },
          onConfirm: (text) => {
            setClientEmailOverrides((prev) => ({ ...prev, [current.id]: (text ?? "").trim() }));
            setToast("Recipient email saved — it'll be used on the next send.");
          }
        });
        break;
      }
      case "delete":
        setConfirmState({
          title: `Delete this ${selected.kind === "credit" ? "credit note" : selected.kind}?`,
          body: "It moves to the Deleted view and can be restored from there — nothing is lost.",
          danger: true,
          confirmLabel: "Delete",
          onConfirm: () => {
            startTransition(async () => {
              const result = await deleteDocumentAction(selected.id);
              reconcile(result.documents, result.selectedId);
              setToast("Moved to Deleted — restore it any time from the Deleted view.");
            });
          }
        });
        break;
      case "restore":
        startTransition(async () => {
          const result = await restoreDocumentAction(selected.id);
          reconcile(result.documents, result.selectedId);
          setDeletedDocs((prev) => prev.filter((d) => d.id !== selected.id));
          setFilters((f) => ({ ...f, stage: "all" }));
          setToast("Document restored.");
        });
        break;
      case "client-edit": {
        // Marios edits the message the CLIENT receives with their emailed PDF.
        // Stored per-document and used on the next "Send email". Blank = default body.
        const current = selected;
        const existing = clientMsgOverrides[current.id] ?? "";
        setConfirmState({
          title: "Edit the client message",
          body: "This is the message the client gets with their invoice email. Leave blank to use the default. Saved for the next send.",
          confirmLabel: "Save message",
          prompt: {
            label: "Client message",
            placeholder: "Dear {client}, please find your invoice attached…",
            initial: existing,
            required: false
          },
          onConfirm: (text) => {
            setClientMsgOverrides((prev) => ({ ...prev, [current.id]: (text ?? "").trim() }));
            setToast("Client message saved — it'll be used the next time you email this document.");
          }
        });
        break;
      }
      case "client-schedule":
        setToast("Scheduling UI is staged — send for 09:00 tomorrow (Europe/Nicosia).");
        break;
      case "accounting-resend":
        startTransition(async () => {
          const result = await forwardAccountingAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast(
            result.accountingGroupNotified
              ? "Accounting copy resent over WhatsApp."
              : "Couldn't confirm the accounting resend — try again."
          );
        });
        break;
      case "accounting-configure":
        setSettingsOpen(true);
        break;
      default:
        break;
    }
  }

  function handleCreate(form: ComposerForm) {
    const isEdit = !!form.editingId;
    const input = formToDocumentInput(form);

    startTransition(async () => {
      if (isEdit) {
        const result = await updateDocumentAction(form.editingId as string, input);
        if ("officialNumber" in input && form.officialNo && result.documents.find((d) => d.id === (result.selectedId ?? ""))) {
          const finalResult = await applyOfficialNumberAction(result.selectedId as string, form.officialNo);
          reconcile(finalResult.documents, finalResult.selectedId);
        } else {
          reconcile(result.documents, result.selectedId);
        }
        setToast("Document updated.");
        return;
      }

      // Receipt from the composer: issue it against the chosen existing invoice
      // (marks the invoice paid + creates the linked receipt). Never standalone.
      if (form.kind === "receipt" && form.sourceInvoiceId) {
        const result = await markPaidAndIssueReceiptAction(form.sourceInvoiceId);
        reconcile(result.documents, result.selectedId ?? form.sourceInvoiceId);
        setFilters((f) => ({ ...f, stage: "all" }));
        setToast("Receipt issued.");
        return;
      }

      // Credit note from the composer: issue it against the chosen existing
      // invoice (cancels the invoice + creates the auto-approved credit note).
      // Mirrors the cancel-with-credit-note action; never standalone.
      if (form.kind === "credit" && form.sourceInvoiceId) {
        const result = await cancelWithCreditNoteAction(form.sourceInvoiceId, form.creditReason);
        reconcile(result.documents, result.selectedId ?? form.sourceInvoiceId);
        setFilters((f) => ({ ...f, stage: "credited" }));
        setToast("Credit note issued — original cancelled, group notified.");
        return;
      }

      const created = await createDocumentAction(input);
      const createdId = (created.selectedId ?? created.documents[0]?.id) as string;

      // Create produces a REVIEWABLE draft (R18a). It is NOT auto-approved or
      // auto-sent — the operator reviews it, then approves from the draft CTA,
      // which opens an editable message + sends (handleAct "draft", R18b). This
      // restores the approve → preview → edit-message → send step.
      reconcile(created.documents, createdId);
      setFilters((f) => ({ ...f, stage: "all" }));
      setToast("Draft created — review it, then approve to send.");
    });
  }

  function handlePaletteAction(item: PaletteItem) {
    setPaletteOpen(false);
    if (item.type === "doc" && item.target) {
      setSelectedId(item.target);
      return;
    }
    if (item.type === "action") {
      switch (item.action) {
        case "new-invoice":
          setComposerPrefill(null);
          setComposerOpen(true);
          break;
        case "run-monthly":
          setRunCadence("monthly");
          setRunOpen(true);
          break;
        case "run-yearly":
          setRunCadence("yearly");
          setRunOpen(true);
          break;
        case "filter-marios":
          setFilters({ ...filters, stage: "sent-to-marios" });
          setToast("Filtered to documents needing Marios.");
          break;
        case "filter-unpaid":
          setFilters({ ...filters, stage: "numbered" });
          setToast("Filtered to unpaid issued invoices.");
          break;
        case "open-settings":
          setSettingsOpen(true);
          break;
        case "show-shortcuts":
          setShortcutsOpen(true);
          break;
        case "show-tour":
          setTourOpen(true);
          break;
        case "sign-out":
          signOut();
          break;
      }
    }
  }

  // Recurring batch projects the UPCOMING (next, not-yet-issued) instance of each
  // recurring invoice (R4). The number field is blank — the next instance has no
  // official № until the run materializes it. The rolled description, rolled lines,
  // and advanced issue date are computed ONCE here so the list, the PDF preview,
  // and the create path all consume the SAME values (R15). Monthly rolls the month
  // forward (June → July) via rollDescriptionMonth + addOneMonth; yearly advances
  // the issue date by a year and keeps the description as-is — same upcoming /
  // no-number / editable / email-on-approve behaviour for both cadences (R14).
  // Per-row recipient + delivery message are seeded so the batch can email each
  // invoice on approve (R17).
  const recurringRows = useMemo(() => {
    const build = (
      recurrence: "monthly" | "yearly",
      advance: (stamp: string) => string,
      rollDesc: (text: string) => string
    ) =>
      docs
        .filter((d) => d.kind === "invoice" && d.recurrence === recurrence)
        .map((d) => {
          const sub = (d.lines || []).reduce((s, l) => s + l.qty * l.unitPrice, 0) || Math.abs(d.total);
          const rate = d.vatMode === "no-vat" ? 0 : d.vatRate || 0;
          const total = d.vatMode === "included-vat" ? sub : sub + (sub * rate) / 100;
          const baseDescription =
            d.description || (d.lines || []).map((l) => l.desc).filter(Boolean).join("\n");
          const rolledDescription = baseDescription ? rollDesc(baseDescription) : baseDescription;
          const rolledLines = (d.lines || []).map((l) => ({ ...l, desc: rollDesc(l.desc) }));
          return {
            id: d.id,
            client: d.client,
            net: sub,
            extra: 0,
            // Upcoming instance has no number yet — blank the № column (R4).
            draftNo: "",
            period: rollDesc(d.period || ""),
            sub,
            total,
            // Precomputed (rolled) — consumed verbatim by preview AND create (R15).
            description: rolledDescription,
            lines: rolledLines,
            // Advance the issue date to the upcoming instance (R4/R14).
            issued: d.issued ? advance(d.issued) : d.issued,
            // Client delivery (R17): recipient is filled by the operator in the run
            // overlay (R5); the message defaults to any saved client-message override
            // for the template, editable per upcoming row.
            recipients: undefined as string | undefined,
            message: clientMsgOverrides[d.id] || undefined
          };
        });
    return {
      monthly: build("monthly", addOneMonth, rollDescriptionMonth),
      // Yearly advances the year in BOTH the issue date (addOneYear) and the
      // description text (rollDescriptionYear) so the upcoming instance's PDF
      // shows the new year (e.g. 2026 → 2027), never the prior year (R14/R15).
      yearly: build("yearly", addOneYear, rollDescriptionYear)
    };
  }, [docs, clientMsgOverrides]);
  const monthlyRows = recurringRows[runCadence];

  return (
    <TemplateProvider>
    <div className="app-shell" data-persistence={persistenceMode}>
      <Sidebar operator={operator} docs={docs} onSignOut={signOut}>
        <ListPane docs={viewDocs} selectedId={selectedId} onSelect={setSelectedId} filters={filters} setFilters={setFilters} />
      </Sidebar>
      <div className="app-content">
        <Topbar
          docs={docs}
          onNew={() => {
            setComposerPrefill(null);
            setComposerOpen(true);
          }}
          onPalette={() => setPaletteOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onEditTemplate={() => setTemplateOpen(true)}
          onRefresh={refetchDocuments}
        />
        <div className="workspace">

        <DetailPane
          doc={selected}
          allDocs={docs}
          sharedCc={sharedCc}
          accountingEmail={accountingEmail}
          clientEmail={(selected && (clientEmailOverrides[selected.id] || selected.clientEmail)) || ""}
          clientMsg={(selected && clientMsgOverrides[selected.id]) || ""}
          operator={operator}
          onAct={handleAct}
          onOpenLightbox={setLightboxDoc}
          onUpdateDoc={(id, form) => {
            const sub = form.lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);
            const targetDoc = docs.find((d) => d.id === id);
            if (!targetDoc) return;
            startTransition(async () => {
              const result = await updateDocumentAction(id, {
                kind: targetDoc.kind === "credit" ? "credit-note" : targetDoc.kind,
                clientName: clientById(form.client).name,
                description: form.lines.map((l) => l.desc.trim()).filter(Boolean).join("\n") || form.description || "",
    lineItems: form.lines.map((l) => ({ description: l.desc, quantity: l.qty, unitPrice: l.unitPrice })),
                amount: sub,
                vatMode: form.vatMode,
                issueDate: form.issued,
                dueDate: form.due || undefined,
                // Keep the invoice's existing recurrence on a quiet Save — never
                // silently turn a monthly invoice one-off (which would drop it out
                // of the Monthly filter / run). Mirrors onCorrectResendDoc below.
                recurrence: targetDoc.recurrence ?? "none"
              });
              reconcile(result.documents, id);
              setToast("Invoice updated.");
            });
          }}
          onCorrectResendDoc={(id, form, reason) => {
            const sub = form.lines.reduce((s, l) => s + (l.qty || 0) * (l.unitPrice || 0), 0);
            const targetDoc = docs.find((d) => d.id === id);
            if (!targetDoc) return;
            startTransition(async () => {
              // 1. Save the corrected content (keep the invoice's recurrence so a
              // monthly invoice isn't silently turned into a one-off on edit).
              await updateDocumentAction(id, {
                kind: targetDoc.kind === "credit" ? "credit-note" : targetDoc.kind,
                clientName: clientById(form.client).name,
                description: form.lines.map((l) => l.desc.trim()).filter(Boolean).join("\n") || form.description || "",
                lineItems: form.lines.map((l) => ({ description: l.desc, quantity: l.qty, unitPrice: l.unitPrice })),
                amount: sub,
                vatMode: form.vatMode,
                issueDate: form.issued,
                dueDate: form.due || undefined,
                recurrence: targetDoc.recurrence ?? "none"
              });
              // 2. Resend the corrected invoice to the accounting group + Marios
              // IMMEDIATELY, with a note to ignore the previous version. Keeps the
              // same number/position — no stage change — so it stays in sequence.
              const result = await resendCorrectedInvoiceAction(id, reason);
              reconcile(result.documents, id);
              setToast("Correction sent to the group — previous version superseded.");
              // Pull fresh state so the corrected amount shows without a manual refresh.
              refetchDocuments();
            });
          }}
        />
        </div>
      </div>

      <Composer
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false);
          setComposerPrefill(null);
        }}
        prefill={composerPrefill}
        onCreate={handleCreate}
        invoices={docs}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handlePaletteAction} />
      <PDFLightbox
        doc={lightboxDoc}
        allDocs={batchPreview ?? docs}
        onClose={() => {
          setLightboxDoc(null);
          setBatchPreview(null);
        }}
        onNavigate={(id) => {
          if (batchPreview) return;
          setSelectedId(id);
        }}
      />
      <MonthlyRunOverlay
        open={runOpen}
        rows={monthlyRows}
        cadence={runCadence}
        onClose={() => setRunOpen(false)}
        onApproveAll={(rows) => {
          if (rows.length === 0) return;
          startTransition(async () => {
            let last = null;
            let emailed = 0;
            for (const r of rows) {
              // Materialize next month's concrete invoice from the recurring
              // template. The description, line items and issue date were ALREADY
              // rolled forward ONCE in the monthlyRows mapper (R15) — consume them
              // verbatim here (and after any in-run edits, R5), never re-rolling or
              // fabricating a "Recurring charge" line. recurrence stays "none" so
              // the issued invoice doesn't re-enter next month's run (the recurring
              // template invoice is what keeps the schedule).
              const rolledLines = (r.lines && r.lines.length)
                ? r.lines.map((l) => ({ description: l.desc, quantity: l.qty, unitPrice: l.unitPrice }))
                : undefined;
              last = await createDocumentAction({
                kind: "invoice",
                clientName: clientById(r.client).name,
                description: r.description ?? "",
                lineItems: rolledLines,
                amount: r.sub,
                vatMode: "plus-vat",
                issueDate: r.issued || todayStamp(),
                recurrence: "none"
              });
              // Deliver each materialized invoice to its client (R17). Reuse the
              // single email path (CONTRACT-EMAIL) with the row's recipient(s) and
              // its delivery-message override — no second email path. Best-effort:
              // a delivery hiccup never blocks the rest of the batch.
              const createdId = (last.selectedId ?? last.documents[0]?.id) as string | undefined;
              const recipients = (r.recipients ?? "")
                .split(/[,;\s]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              if (createdId && recipients.length) {
                try {
                  await sendInvoiceEmailAction(
                    createdId,
                    recipients.length === 1 ? recipients[0] : recipients,
                    r.message?.trim() || undefined
                  );
                  emailed += 1;
                } catch (error) {
                  console.error("Monthly-run email failed for", createdId, error);
                }
              }
            }
            if (last) reconcile(last.documents, last.selectedId);
            setRunOpen(false);
            setToast(
              `Created ${rows.length} invoice${rows.length === 1 ? "" : "s"} for next month — descriptions rolled forward` +
                (emailed ? `, emailed ${emailed}.` : ".")
            );
            // Guarantee the freshly created invoices show immediately without a
            // manual refresh (F3).
            refetchDocuments();
          });
        }}
        onPreview={(rows) => {
          const previewDocs: Doc[] = rows.map((r) => {
            // Consume the precomputed (rolled) description + lines VERBATIM — the
            // exact values the create path will use (R15) — so the preview, the
            // list and the materialized invoice never diverge. No fabricated
            // "Recurring charge" line; fall back to a single net line only when the
            // template carried no line items at all.
            const previewLines = (r.lines && r.lines.length)
              ? r.lines.map((l) => ({ desc: l.desc, qty: l.qty, unitPrice: l.unitPrice }))
              : [{ desc: r.description || r.period, qty: 1, unitPrice: r.sub }];
            return {
              id: r.id,
              kind: "invoice" as const,
              stage: "draft" as const,
              // Upcoming instance has no number yet (R4) — blank.
              draftNo: r.draftNo || null,
              officialNo: null,
              client: r.client,
              issued: r.issued || todayStamp(),
              due: "",
              period: r.period,
              vatRate: 19,
              vatMode: "plus-vat" as const,
              lines: previewLines,
              total: r.total,
              description: r.description ?? "",
              timeline: []
            };
          });
          if (previewDocs.length === 0) return;
          setBatchPreview(previewDocs);
          setLightboxDoc(previewDocs[0]);
          setRunOpen(false);
          setToast(`Previewing ${previewDocs.length} invoices — use ← → to flip through the batch.`);
        }}
        onPause={() => {
          setRecurringRuns((r) => r.map((x) => (x.cadence === "Monthly" ? { ...x, paused: true } : x)));
          setRunOpen(false);
          setToast("Monthly run paused. Reactivate from Recurring runs.");
        }}
      />
      <RecurringRunsPanel
        open={recurringPanelOpen}
        onClose={() => setRecurringPanelOpen(false)}
        runs={recurringRuns}
        onTogglePaused={(id) => {
          setRecurringRuns((r) => r.map((x) => (x.id === id ? { ...x, paused: !x.paused } : x)));
          const target = recurringRuns.find((x) => x.id === id);
          setToast(target?.paused ? `${target.cadence} schedule resumed.` : `${target?.cadence ?? "Schedule"} paused.`);
        }}
        onReviewBatch={(id) => {
          setRecurringPanelOpen(false);
          setRunOpen(true);
        }}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        operator={operator}
        sharedCc={sharedCc}
        setSharedCc={setSharedCc}
        accountingEmail={accountingEmail}
        setAccountingEmail={setAccountingEmail}
        autoRoute={autoRoute}
        setAutoRoute={setAutoRoute}
        onSignOut={() => {
          setSettingsOpen(false);
          signOut();
        }}
      />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
      <TemplateEditor
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSaved={() => setToast("Invoice template saved.")}
      />
      <GuidedTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          window.localStorage.setItem("sophia.tour.seen", "1");
        }}
      />
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
    </TemplateProvider>
  );
}
