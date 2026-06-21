"use client";

import { ArrowLeft, ArrowRight, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { downloadDocumentPdf } from "@/lib/invoices/downloads";
import { docToInvoiceDocument } from "@/lib/invoices/redesign/adapter";
import { clientById } from "@/lib/invoices/redesign/data";
import type { Doc } from "@/lib/invoices/redesign/types";
import { TemplatePreview } from "../ledger/TemplatePreview";

interface PDFLightboxProps {
  doc: Doc | null;
  allDocs: Doc[];
  onClose: () => void;
  onNavigate?: (id: string) => void;
}

export function PDFLightbox({
  doc,
  allDocs,
  onClose,
  onNavigate,
}: PDFLightboxProps) {
  const [flipping, setFlipping] = useState<string | null>(null);
  const [displayDoc, setDisplayDoc] = useState<Doc | null>(doc);

  useEffect(() => {
    if (doc) setDisplayDoc(doc);
  }, [doc]);

  useEffect(() => {
    if (!doc || !displayDoc) return;
    const docsWithPdf = (allDocs || []).filter((d) => d.kind !== undefined);
    const idx = docsWithPdf.findIndex((d) => d.id === displayDoc.id);
    const hasPrev = idx > 0;
    const hasNext = idx >= 0 && idx < docsWithPdf.length - 1;

    const flipTo = (dir: "next" | "prev") => {
      if (flipping) return;
      if (dir === "next" && !hasNext) return;
      if (dir === "prev" && !hasPrev) return;
      setFlipping(dir === "next" ? "flipping-next" : "flipping-prev");
      setTimeout(() => {
        const nextDoc =
          dir === "next" ? docsWithPdf[idx + 1] : docsWithPdf[idx - 1];
        setDisplayDoc(nextDoc);
        onNavigate?.(nextDoc.id);
        setFlipping(null);
      }, 310);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") flipTo("next");
      else if (event.key === "ArrowLeft") flipTo("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, displayDoc, flipping, allDocs, onClose, onNavigate]);

  if (!doc || !displayDoc) return null;

  const docsWithPdf = (allDocs || []).filter((d) => d.kind !== undefined);
  const idx = docsWithPdf.findIndex((d) => d.id === displayDoc.id);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < docsWithPdf.length - 1;

  const flipTo = (dir: "next" | "prev") => {
    if (flipping) return;
    if (dir === "next" && !hasNext) return;
    if (dir === "prev" && !hasPrev) return;
    setFlipping(dir === "next" ? "flipping-next" : "flipping-prev");
    setTimeout(() => {
      const nextDoc =
        dir === "next" ? docsWithPdf[idx + 1] : docsWithPdf[idx - 1];
      setDisplayDoc(nextDoc);
      onNavigate?.(nextDoc.id);
      setFlipping(null);
    }, 310);
  };

  const title =
    displayDoc.kind === "credit"
      ? "Credit Note"
      : displayDoc.kind === "receipt"
        ? "Receipt"
        : "Invoice";
  const num = displayDoc.officialNo
    ? `№ ${displayDoc.officialNo}`
    : displayDoc.draftNo || "—";

  return (
    <div className="binder-backdrop" onClick={onClose}>
      <div
        className="binder-stage"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="binder-bar">
          <p>
            <strong>
              {title} {num}
            </strong>{" "}
            · {displayDoc.pdf || `Sophia draft · ${displayDoc.draftNo}`}
          </p>
          <button
            className="icon-button"
            disabled={!hasPrev}
            onClick={() => flipTo("prev")}
            title="Previous document (←)"
            type="button"
          >
            <ArrowLeft size={15} strokeWidth={1.6} />
          </button>
          <button
            className="icon-button"
            disabled={!hasNext}
            onClick={() => flipTo("next")}
            title="Next document (→)"
            type="button"
          >
            <ArrowRight size={15} strokeWidth={1.6} />
          </button>
          <button
            className="icon-button"
            onClick={() =>
              downloadDocumentPdf(
                docToInvoiceDocument(displayDoc, clientById(displayDoc.client))
              )
            }
            title="Download PDF"
            type="button"
          >
            <Download size={15} strokeWidth={1.6} />
          </button>
          <button
            className="icon-button"
            onClick={onClose}
            title="Close (Esc)"
            type="button"
          >
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>
        <div className="binder-body">
          <div className={`binder-page-wrap ${flipping || ""}`}>
            <div aria-hidden className="binder-page behind" />
            <div className="binder-page">
              <TemplatePreview doc={displayDoc} />
            </div>
          </div>
        </div>
        <div className="binder-foot">
          <span>
            A4 · Print-ready · page {idx + 1} of {docsWithPdf.length}
          </span>
          <span className="center">
            <button
              aria-label="Previous"
              className="page-btn"
              disabled={!hasPrev}
              onClick={() => flipTo("prev")}
              type="button"
            >
              <ArrowLeft size={14} strokeWidth={1.6} />
            </button>
            <kbd>←</kbd> <kbd>→</kbd> turn page
            <button
              aria-label="Next"
              className="page-btn"
              disabled={!hasNext}
              onClick={() => flipTo("next")}
              type="button"
            >
              <ArrowRight size={14} strokeWidth={1.6} />
            </button>
          </span>
          <span>
            Press <kbd>ESC</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
