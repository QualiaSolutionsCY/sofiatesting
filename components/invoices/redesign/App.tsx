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
  loadDocumentsAction,
  markPaidAndIssueReceiptAction,
  queueClientEmailAction,
  regenerateStoredDocumentAction,
  sendToMariosAction,
  updateDocumentAction
} from "@/lib/invoices/actions/documents";
import { invoicesToDocs } from "@/lib/invoices/redesign/adapter";
import { RECURRING, clientById, nowStamp, replaceClientRegistry, todayStamp } from "@/lib/invoices/redesign/data";
import type {
  Client,
  ComposerForm,
  ConfirmState,
  Doc,
  DocKind,
  Filters,
  PaletteItem,
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
    description: form.description || form.lines[0]?.desc || "",
    amount: sub,
    vatMode: vatRateToMode(form.vatRate),
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [lightboxDoc, setLightboxDoc] = useState<Doc | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false);
  const [recurringRuns, setRecurringRuns] = useState(RECURRING);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [toast, setToast] = useState("");
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

  function reconcile(invoices: InvoiceDocument[], selectId?: string) {
    const { docs: nextDocs, clients: nextClients } = invoicesToDocs(invoices);
    replaceClientRegistry(nextClients);
    setDocs(nextDocs);
    if (selectId) setSelectedId(selectId);
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

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  const advanceStageLocal = (id: string, nextStage: Stage, extras: Partial<Doc> = {}) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...extras, stage: nextStage } : d)));
  };

  const appendEvent = (doc: Doc, event: TimelineEvent): TimelineEvent[] => [...(doc.timeline ?? []), event];

  function handleAct(stageOrAction: string) {
    if (!selected) return;
    switch (stageOrAction) {
      case "draft":
        startTransition(async () => {
          const result = await sendToMariosAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("Draft sent to Marios via WhatsApp.");
        });
        break;
      case "sent-to-marios":
        startTransition(async () => {
          const result = await sendToMariosAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("Resent to Marios — bumped in CSC Review group.");
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
        startTransition(async () => {
          const result = await markPaidAndIssueReceiptAction(selected.id);
          reconcile(result.documents, result.selectedId ?? selected.id);
          setToast("Marked paid · receipt generated and sent.");
        });
        break;
      case "sent-to-accounting":
        setLightboxDoc(selected);
        break;
      case "credited": {
        const linked = docs.find((d) => d.id === selected.creditedBy);
        if (linked) setSelectedId(linked.id);
        setToast("Opened linked credit note.");
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
        window.print();
        break;
      case "copy-link":
        navigator.clipboard?.writeText(`sophia://document/${selected.id}`).catch(() => {});
        setToast("Document link copied to clipboard.");
        break;
      case "download":
        setToast(`Downloading ${selected.pdf || "draft PDF"}…`);
        break;
      case "credit": {
        // Credit notes are only ever created from an existing invoice — never from scratch.
        if (selected.kind !== "invoice" || !selected.officialNo) {
          setToast("Credit notes can only be issued from a numbered invoice.");
          break;
        }
        setConfirmState({
          title: "Issue a credit note?",
          body: `This creates a credit note that cancels invoice ${selected.officialNo ? "№ " + selected.officialNo : selected.draftNo} in full and links the two.`,
          confirmLabel: "Issue credit note",
          onConfirm: () => {
            startTransition(async () => {
              const result = await cancelWithCreditNoteAction(selected.id);
              reconcile(result.documents, result.selectedId ?? selected.id);
              setToast("Credit note issued against the invoice.");
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
      case "cancel":
        setConfirmState({
          title: "Cancel this document?",
          body: "It will remain in the audit trail. Reversible only by duplicating into a new draft.",
          danger: true,
          confirmLabel: "Yes, cancel",
          onConfirm: () => {
            if (selected.kind === "invoice" && selected.officialNo) {
              startTransition(async () => {
                const result = await cancelWithCreditNoteAction(selected.id);
                reconcile(result.documents, result.selectedId ?? selected.id);
                setToast("Invoice cancelled with linked credit note.");
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
      case "whatsapp-marios-resend":
        startTransition(async () => {
          const result = await sendToMariosAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("Bumped Marios in the CSC Review group.");
        });
        break;
      case "whatsapp-marios-edit":
        setToast("Message editor coming next — opens for the WhatsApp draft to Marios.");
        break;
      case "whatsapp-marios-mute":
        setToast("Notifications muted for this document.");
        break;
      case "client-send-all":
        startTransition(async () => {
          const result = await queueClientEmailAction(selected.id, sharedCc);
          reconcile(result.documents, selected.id);
          setToast(`WhatsApp + Email queued for ${clientById(selected.client).name}.`);
        });
        break;
      case "client-edit":
        setToast("Message editor for client WhatsApp + email is staged.");
        break;
      case "client-schedule":
        setToast("Scheduling UI is staged — send for 09:00 tomorrow (Europe/Nicosia).");
        break;
      case "accounting-resend":
        startTransition(async () => {
          const result = await forwardAccountingAction(selected.id);
          reconcile(result.documents, selected.id);
          setToast("Accounting CC resent (WhatsApp + Email).");
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
      const result = isEdit
        ? await updateDocumentAction(form.editingId as string, input)
        : await createDocumentAction(input);

      if ("officialNumber" in input && form.officialNo && result.documents.find((d) => d.id === (result.selectedId ?? ""))) {
        const finalResult = await applyOfficialNumberAction(result.selectedId as string, form.officialNo);
        reconcile(finalResult.documents, finalResult.selectedId);
      } else {
        reconcile(result.documents, result.selectedId);
      }
      setToast(isEdit ? "Document updated." : "Draft prepared. Awaiting hand-off to Marios.");
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

  return (
    <div className="app-shell" data-persistence={persistenceMode}>
      <Sidebar operator={operator} docs={docs} onSignOut={signOut}>
        <ListPane docs={docs} selectedId={selectedId} onSelect={setSelectedId} filters={filters} setFilters={setFilters} />
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
        />
        <div className="workspace">

        <DetailPane
          doc={selected}
          allDocs={docs}
          sharedCc={sharedCc}
          accountingEmail={accountingEmail}
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
                description: form.description || form.lines[0]?.desc || "",
                amount: sub,
                vatMode: form.vatMode,
                issueDate: form.issued,
                dueDate: form.due || undefined,
                recurrence: targetDoc.kind === "credit" ? "none" : "none"
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
              // 1. Save the corrected content
              await updateDocumentAction(id, {
                kind: targetDoc.kind === "credit" ? "credit-note" : targetDoc.kind,
                clientName: clientById(form.client).name,
                description: form.description || form.lines[0]?.desc || "",
                amount: sub,
                vatMode: form.vatMode,
                issueDate: form.issued,
                dueDate: form.due || undefined,
                recurrence: "none"
              });
              // 2. Mark as corrected-resend with reason + queue outbox
              const result = await correctResendAction(id, reason);
              reconcile(result.documents, id);
              setToast(`Correction queued — accounting + client will receive the updated ${targetDoc.kind === "credit" ? "credit note" : "invoice"}.`);
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
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handlePaletteAction} />
      <PDFLightbox doc={lightboxDoc} allDocs={docs} onClose={() => setLightboxDoc(null)} onNavigate={setSelectedId} />
      <MonthlyRunOverlay
        open={runOpen}
        onClose={() => setRunOpen(false)}
        onApproveAll={(rows) => setToast(`Sent ${rows.length} drafts to Marios. He'll review in the CSC Review group.`)}
        onPreview={(rows) => setToast(`Generated a ${rows.length}-page PDF batch preview.`)}
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
      <GuidedTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false);
          window.localStorage.setItem("sophia.tour.seen", "1");
        }}
      />
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
