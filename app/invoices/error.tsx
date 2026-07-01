"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for /invoices. Contains any render or data error to
 * THIS route with a friendly, recoverable message and a Try-again, instead of
 * letting it escalate to the app-wide app/global-error.tsx ("Something went
 * wrong") — which is the full-page error Marios hit around logout. `reset()`
 * re-renders the segment (re-running the server load), so a transient failure
 * recovers without a hard refresh.
 */
export default function InvoicesError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Invoices route error", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
        background: "#fff"
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem", color: "#111827" }}>
          The ledger hit a snag
        </h1>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem", lineHeight: 1.5 }}>
          Something interrupted the invoices page. This is usually temporary — your
          invoices are safe. Try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.6rem 1.6rem",
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
