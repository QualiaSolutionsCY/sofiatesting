"use client";

import {
  Archive,
  CheckCircle2,
  Command,
  Database,
  Download,
  FileCheck2,
  FilePenLine,
  FilePlus2,
  Mail,
  MessageSquareText,
  Send,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  applyOfficialNumberAction,
  approveDocumentAction,
  cancelWithCreditNoteAction,
  cancelDeliveryAction,
  correctResendAction,
  createDocumentAction,
  deleteDocumentAction,
  forwardAccountingAction,
  loadDeliveryRecordsAction,
  markPaidAndIssueReceiptAction,
  queueClientEmailAction,
  regenerateStoredDocumentAction,
  retrieveStoredDocumentAction,
  retryDeliveryAction,
  sendToMariosAction,
  storeDocumentPdfAction,
  updateDashboardControlsAction,
  updateDocumentAction,
  type DocumentsActionResult
} from "@/lib/invoices/actions/documents";
import { type AccessUser } from "@/lib/invoices/access";
import {
  documentMatchesInvoiceNumberSearch,
  ensureInvoiceDashboardPeriod,
  type DocumentInput,
  type DashboardDocumentControls
} from "@/lib/invoices/document-actions";
import { downloadBackupJson, downloadDocumentsZip } from "@/lib/invoices/downloads";
import type { DeliveryRecord } from "@/lib/invoices/types/deliveries";
import type { DocumentFilters, InvoiceDocument, SummaryMetric } from "@/lib/invoices/types/invoice";
import { AccessGate } from "./AccessGate";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { DocumentComposer } from "./DocumentComposer";
import { DocumentDetail } from "./DocumentDetail";
import { DocumentList } from "./DocumentList";
import { RecurrenceRunPanel } from "./RecurrenceRunPanel";
import type { ComposerMode } from "./types";

const defaultFilters: DocumentFilters = {
  kind: "all",
  status: "all",
  recurrence: "all",
  paymentStatus: "all",
  search: "",
  clientSearch: "",
  dateFrom: "",
  dateTo: ""
};

export function InvoiceDashboard({
  initialDocuments,
  persistenceMode,
  initialDeliveries = []
}: {
  initialDocuments: InvoiceDocument[];
  persistenceMode: "supabase" | "fallback";
  initialDeliveries?: DeliveryRecord[];
}) {
  const [user, setUser] = useState<AccessUser | null>(null);
  const [documents, setDocuments] = useState<InvoiceDocument[]>(() =>
    initialDocuments.map(ensureInvoiceDashboardPeriod)
  );
  const [activePersistenceMode, setActivePersistenceMode] = useState(persistenceMode);
  const [filters, setFilters] = useState<DocumentFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState(initialDocuments[0]?.id ?? "");
  const [composerMode, setComposerMode] = useState<ComposerMode>("closed");
  const [sharedCcEmail, setSharedCcEmail] = useState("");
  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>(initialDeliveries);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filteredDocuments = useMemo(() => filterDocuments(documents, filters), [documents, filters]);

  const selectedDocument =
    documents.find((document) => document.id === selectedId) ?? filteredDocuments[0] ?? documents[0];

  const metrics = useMemo<SummaryMetric[]>(() => createMetrics(documents), [documents]);

  function reconcile(result: DocumentsActionResult) {
    setDocuments(result.documents.map(ensureInvoiceDashboardPeriod));
    setActivePersistenceMode(result.persistenceMode);
    if (result.selectedId) setSelectedId(result.selectedId);
    if (result.deliveries) setDeliveryRecords(result.deliveries);
  }

  useEffect(() => {
    if (!selectedDocument?.id) {
      setDeliveryRecords([]);
      return;
    }
    let active = true;
    startTransition(async () => {
      const deliveries = await loadDeliveryRecordsAction(selectedDocument.id);
      if (active) setDeliveryRecords(deliveries);
    });
    return () => {
      active = false;
    };
  }, [selectedDocument?.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isPaletteShortcut) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSaveDocument(input: DocumentInput) {
    startTransition(async () => {
      const result =
        composerMode === "edit" && selectedDocument
          ? await updateDocumentAction(selectedDocument.id, input)
          : await createDocumentAction(input);
      reconcile(result);
      setComposerMode("closed");
    });
  }

  function handleDashboardControlChange(id: string, input: DashboardDocumentControls) {
    startTransition(async () => {
      reconcile(await updateDashboardControlsAction(id, input));
    });
  }

  function handlePaidReceipt(invoice: InvoiceDocument) {
    if (invoice.kind !== "invoice") return;
    startTransition(async () => {
      reconcile(await markPaidAndIssueReceiptAction(invoice.id));
    });
  }

  function handleCancelWithCreditNote(invoice: InvoiceDocument) {
    if (invoice.kind !== "invoice") return;
    startTransition(async () => {
      reconcile(await cancelWithCreditNoteAction(invoice.id));
    });
  }

  function handleDeleteDocument(document: InvoiceDocument) {
    const confirmed = window.confirm(`Delete ${document.draftNumber}? This cannot be undone.`);
    if (!confirmed) return;

    startTransition(async () => {
      reconcile(await deleteDocumentAction(document.id));
    });
  }

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [
      {
        id: "new-document",
        label: "New document",
        hint: "Open the Sophia draft composer",
        group: "actions",
        icon: <FilePlus2 size={14} />,
        shortcut: "N",
        onRun: () => setComposerMode("create")
      },
      {
        id: "backup-json",
        label: "Download backup JSON",
        hint: "Snapshot every document into a single JSON",
        group: "actions",
        icon: <Archive size={14} />,
        onRun: () => downloadBackupJson(documents)
      },
      {
        id: "download-zip",
        label: "Download document ZIP",
        hint: "Bundle all generated PDFs into a single archive",
        group: "actions",
        icon: <Download size={14} />,
        onRun: () => downloadDocumentsZip(documents)
      }
    ];

    if (selectedDocument) {
      commands.push(
        {
          id: "edit-selected",
          label: `Edit ${selectedDocument.clientName}`,
          hint: "Open the selected document in the composer",
          group: "actions",
          icon: <FilePenLine size={14} />,
          onRun: () => setComposerMode("edit")
        },
        {
          id: "send-marios",
          label: "Send draft to Marios",
          hint: "Move selected document into Marios review",
          group: "actions",
          icon: <Send size={14} />,
          onRun: () =>
            startTransition(async () => reconcile(await sendToMariosAction(selectedDocument.id)))
        },
        {
          id: "approve-selected",
          label: "Approve selected",
          hint: "Confirms the draft can move into official numbering",
          group: "actions",
          icon: <CheckCircle2 size={14} />,
          onRun: () =>
            startTransition(async () => reconcile(await approveDocumentAction(selectedDocument.id)))
        },
        {
          id: "forward-accounting",
          label: "Forward to accounting",
          hint: "Queue the accounting handoff copy",
          group: "actions",
          icon: <MessageSquareText size={14} />,
          onRun: () =>
            startTransition(async () =>
              reconcile(await forwardAccountingAction(selectedDocument.id))
            )
        },
        {
          id: "email-client",
          label: "Email client with shared CC",
          hint: "Queue the client email + CC",
          group: "actions",
          icon: <Mail size={14} />,
          onRun: () =>
            startTransition(async () =>
              reconcile(await queueClientEmailAction(selectedDocument.id, sharedCcEmail))
            )
        },
        {
          id: "store-pdf",
          label: "Store PDF in Supabase",
          hint: "Upload the latest rendered PDF to storage",
          group: "actions",
          icon: <Database size={14} />,
          onRun: () =>
            startTransition(async () => reconcile(await storeDocumentPdfAction(selectedDocument.id)))
        }
      );

      if (selectedDocument.kind === "invoice") {
        commands.push({
          id: "mark-paid",
          label: "Mark paid · issue receipt",
          hint: "Flip selected invoice to paid and queue a receipt",
          group: "actions",
          icon: <FileCheck2 size={14} />,
          onRun: () => handlePaidReceipt(selectedDocument)
        });
      }
    }

    documents.slice(0, 8).forEach((document) => {
      commands.push({
        id: `doc-${document.id}`,
        label: document.clientName,
        hint: `${document.officialNumber ?? document.draftNumber} · ${document.status.replaceAll("-", " ")}`,
        group: "documents",
        icon: <FileCheck2 size={14} />,
        onRun: () => setSelectedId(document.id)
      });
    });

    return commands;
  }, [documents, selectedDocument, sharedCcEmail]);

  if (!user) {
    return <AccessGate onAccess={setUser} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">Zyprus invoice command</p>
          <h1>Sophia Invoice OS</h1>
          <p className="topbar-subtitle">May run · Marios review · accounting handoff</p>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <Command size={14} />
            <span>Search or run a command</span>
            <kbd>⌘K</kbd>
          </button>
          <span className="integration-pill" title="Current operator">
            <UserCheck size={14} />
            {user.name}
          </span>
          <span className="integration-pill" title="Persistence mode">
            <Database size={14} />
            {activePersistenceMode === "supabase" ? "Supabase live" : "Fallback storage"}
          </span>
          <button
            type="button"
            className="secondary-action"
            onClick={() => downloadBackupJson(documents)}
            title="Download a JSON snapshot of every document"
          >
            <Archive size={14} />
            Backup
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => downloadDocumentsZip(documents)}
            title="Download every generated PDF as a ZIP"
          >
            <Download size={14} />
            ZIP
          </button>
          <button className="primary-action" type="button" onClick={() => setComposerMode("create")}>
            <FilePlus2 size={14} />
            New document
          </button>
        </div>
      </header>

      <section className="run-command-strip" aria-label="Invoice run command summary">
        <div className="metrics" aria-label="Document status summary">
          {metrics.map((metric) => (
            <div className={`metric metric-${metric.tone}`} key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
        <section className="shared-cc-panel" aria-label="Shared monthly invoice CC email">
          <div>
            <p className="eyebrow">Shared CC for monthly invoices</p>
            <p className="shared-cc-hint">Applied to every client email queued from the detail pane.</p>
          </div>
          <label>
            <span>CC email</span>
            <input
              type="email"
              value={sharedCcEmail}
              onChange={(event) => setSharedCcEmail(event.target.value)}
              placeholder="marios@zyprus.com"
            />
          </label>
        </section>
      </section>

      <section className="workspace">
        <div className="ledger-column">
          <DocumentList
            documents={filteredDocuments}
            filters={filters}
            selectedId={selectedDocument?.id ?? ""}
            onFilterChange={setFilters}
            onSelect={setSelectedId}
          />

          <RecurrenceRunPanel documents={documents} isPending={false} />
        </div>

        {selectedDocument ? (
          <DocumentDetail
            document={selectedDocument}
            deliveryRecords={deliveryRecords}
            onEdit={() => setComposerMode("edit")}
            onSendToMarios={() =>
              startTransition(async () => {
                reconcile(await sendToMariosAction(selectedDocument.id));
              })
            }
            onApprove={() =>
              startTransition(async () => {
                reconcile(await approveDocumentAction(selectedDocument.id));
              })
            }
            onApplyOfficialNumber={(number) =>
              startTransition(async () => {
                reconcile(await applyOfficialNumberAction(selectedDocument.id, number));
              })
            }
            onStorePdf={() =>
              startTransition(async () => {
                reconcile(await storeDocumentPdfAction(selectedDocument.id));
              })
            }
            onRetrievePdf={() =>
              startTransition(async () => {
                reconcile(await retrieveStoredDocumentAction(selectedDocument.id));
              })
            }
            onRegeneratePdf={() =>
              startTransition(async () => {
                reconcile(await regenerateStoredDocumentAction(selectedDocument.id));
              })
            }
            onForwardAccounting={() =>
              startTransition(async () => {
                reconcile(await forwardAccountingAction(selectedDocument.id));
              })
            }
            onCorrectResend={(reason) =>
              startTransition(async () => {
                reconcile(await correctResendAction(selectedDocument.id, reason));
              })
            }
            onQueueClientEmail={() =>
              startTransition(async () => {
                reconcile(await queueClientEmailAction(selectedDocument.id, sharedCcEmail));
              })
            }
            onRetryDelivery={(queueItemId) =>
              startTransition(async () => {
                reconcile(await retryDeliveryAction(selectedDocument.id, queueItemId));
              })
            }
            onCancelDelivery={(queueItemId) =>
              startTransition(async () => {
                reconcile(await cancelDeliveryAction(selectedDocument.id, queueItemId));
              })
            }
            onMarkPaidAndIssueReceipt={() => handlePaidReceipt(selectedDocument)}
            onCancelWithCreditNote={() => handleCancelWithCreditNote(selectedDocument)}
            onDelete={() => handleDeleteDocument(selectedDocument)}
            onDashboardControlChange={handleDashboardControlChange}
            sharedCcEmail={sharedCcEmail}
          />
        ) : (
          <div className="empty-state">
            No documents match this filter. Clear the filters or create a new Sophia draft.
          </div>
        )}
      </section>

      {composerMode !== "closed" ? (
        <DocumentComposer
          mode={composerMode}
          document={composerMode === "edit" ? selectedDocument : undefined}
          onClose={() => setComposerMode("closed")}
          onSave={handleSaveDocument}
        />
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />
    </main>
  );
}

export function filterDocuments(documents: InvoiceDocument[], filters: DocumentFilters) {
  return documents.filter((document) => {
    const matchesKind = filters.kind === "all" || document.kind === filters.kind;
    const matchesStatus = filters.status === "all" || document.status === filters.status;
    const matchesRecurrence =
      filters.recurrence === "all" || document.recurrence === filters.recurrence;
    const matchesPayment =
      filters.paymentStatus === "all" || document.paymentStatus === filters.paymentStatus;
    const matchesSearch = documentMatchesInvoiceNumberSearch(document, filters.search);
    const matchesClient =
      !filters.clientSearch.trim() ||
      document.clientName.toLowerCase().includes(filters.clientSearch.trim().toLowerCase());
    const matchesDateFrom = !filters.dateFrom || document.issueDate >= filters.dateFrom;
    const matchesDateTo = !filters.dateTo || document.issueDate <= filters.dateTo;

    return (
      matchesKind &&
      matchesStatus &&
      matchesRecurrence &&
      matchesPayment &&
      matchesSearch &&
      matchesClient &&
      matchesDateFrom &&
      matchesDateTo
    );
  });
}

function createMetrics(documents: InvoiceDocument[]): SummaryMetric[] {
  const pendingMarios = documents.filter((document) => document.status === "sent-to-marios").length;
  const missingCommissionPerson = documents.filter(
    (document) => document.requiresCommissionPerson && !document.commissionPersonName
  ).length;
  const needsRegeneration = documents.filter(
    (document) => document.storageStatus === "needs-regeneration"
  ).length;

  const metrics: SummaryMetric[] = [
    { label: "Documents", value: String(documents.length), tone: "neutral" }
  ];
  if (pendingMarios > 0) {
    metrics.push({ label: "With Marios", value: String(pendingMarios), tone: "attention" });
  }
  if (needsRegeneration > 0) {
    metrics.push({ label: "Needs regeneration", value: String(needsRegeneration), tone: "warning" });
  }
  if (missingCommissionPerson > 0) {
    metrics.push({
      label: "Missing commission person",
      value: String(missingCommissionPerson),
      tone: "warning"
    });
  }
  return metrics;
}
