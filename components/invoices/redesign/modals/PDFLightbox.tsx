"use client";

import { ArrowLeft, ArrowRight, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Doc } from "@/lib/invoices/redesign/types";
import { TemplatePreview } from "../ledger/TemplatePreview";

interface PDFLightboxProps {
  doc: Doc | null;
  allDocs: Doc[];
  onClose: () => void;
  onNavigate?: (id: string) => void;
}

export function PDFLightbox({ doc, allDocs, onClose, onNavigate }: PDFLightboxProps) {
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
        const nextDoc = dir === "next" ? docsWithPdf[idx + 1] : docsWithPdf[idx - 1];
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
      const nextDoc = dir === "next" ? docsWithPdf[idx + 1] : docsWithPdf[idx - 1];
      setDisplayDoc(nextDoc);
      onNavigate?.(nextDoc.id);
      setFlipping(null);
    }, 310);
  };

  const title = displayDoc.kind === "credit" ? "Credit Note" : displayDoc.kind === "receipt" ? "Receipt" : "Invoice";
  const num = displayDoc.officialNo ? `№ ${displayDoc.officialNo}` : displayDoc.draftNo || "—";

  return (
    <div className="binder-backdrop" onClick={onClose}>
      <div className="binder-stage" onClick={(event) => event.stopPropagation()}>
        <div className="binder-bar">
          <p>
            <strong>
              {title} {num}
            </strong>{" "}
            · {displayDoc.pdf || `Sophia draft · ${displayDoc.draftNo}`}
          </p>
          <button type="button" className="icon-button" onClick={() => flipTo("prev")} disabled={!hasPrev} title="Previous document (←)">
            <ArrowLeft size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-button" onClick={() => flipTo("next")} disabled={!hasNext} title="Next document (→)">
            <ArrowRight size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-button" onClick={() => window.print()} title="Print / save as PDF">
            <Download size={15} strokeWidth={1.6} />
          </button>
          <button type="button" className="icon-button" onClick={onClose} title="Close (Esc)">
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>
        <div className="binder-body">
          <div className={`binder-page-wrap ${flipping || ""}`}>
            <div className="binder-page behind" aria-hidden />
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
            <button type="button" className="page-btn" onClick={() => flipTo("prev")} disabled={!hasPrev} aria-label="Previous">
              <ArrowLeft size={14} strokeWidth={1.6} />
            </button>
            <kbd>←</kbd> <kbd>→</kbd> turn page
            <button type="button" className="page-btn" onClick={() => flipTo("next")} disabled={!hasNext} aria-label="Next">
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
