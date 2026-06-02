import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { documentKindLabel, getDisplayNumber, recurrenceLabel } from "@/lib/invoices/format";
import type { InvoiceDocument, Recurrence } from "@/lib/invoices/types/invoice";

const recurrenceKinds: Recurrence[] = ["monthly", "yearly"];

type RunDecision = "waiting" | "review" | "proceed" | "reminded";

export function RecurrenceRunPanel({
  documents,
  isPending
}: {
  documents: InvoiceDocument[];
  isPending: boolean;
}) {
  const recurring = documents.filter((document) => document.recurrence !== "none");
  const [decision, setDecision] = useState<RunDecision>("waiting");
  const [autoProceed, setAutoProceed] = useState(false);

  return (
    <section className="recurrence-panel" aria-label="Recurring invoice runs">
      <div className="recurrence-heading">
        <CalendarClock size={18} />
        <div>
          <p className="eyebrow">Recurring runs</p>
          <h2>Monthly and yearly invoice queue</h2>
        </div>
      </div>
      <div className="monthly-gate">
        <div>
          <span>Monthly flow</span>
          <strong>
            {decision === "waiting"
              ? "Review or proceed?"
              : decision === "review"
                ? "Waiting for review"
                : decision === "reminded"
                  ? "Reminder queued"
                  : "Proceeding with approved run"}
          </strong>
        </div>
        <div className="monthly-gate-actions">
          <button type="button" onClick={() => setDecision("review")} disabled={isPending}>
            Review
          </button>
          <button type="button" onClick={() => setDecision("proceed")} disabled={isPending}>
            Proceed
          </button>
          <button type="button" onClick={() => setDecision("reminded")} disabled={isPending}>
            Remind
          </button>
          <label>
            <input
              type="checkbox"
              checked={autoProceed}
              onChange={(event) => setAutoProceed(event.target.checked)}
            />
            Auto-proceed after confidence
          </label>
        </div>
      </div>
      <div className="recurrence-grid">
        {recurrenceKinds.map((recurrence) => {
          const runDocuments = recurring.filter((document) => document.recurrence === recurrence);

          return (
            <div className="recurrence-run" key={recurrence}>
              <div>
                <span>{recurrenceLabel(recurrence)}</span>
                <strong>{runDocuments.length}</strong>
              </div>
              {runDocuments.length > 0 ? (
                <ul>
                  {runDocuments.map((document) => (
                    <li key={document.id}>
                      {document.clientName} · {documentKindLabel(document.kind)} {getDisplayNumber(document)}
                      {document.recurrenceDay ? ` · day ${document.recurrenceDay}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No active {recurrenceLabel(recurrence).toLowerCase()} documents.</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
