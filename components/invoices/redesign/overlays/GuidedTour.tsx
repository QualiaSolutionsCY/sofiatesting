"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

interface TourStep {
  target: string;
  title: string;
  body: string;
  position: "below" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: ".sophia-briefing",
    title: "Meet Iam Sophia",
    body: "Sophia prepares your drafts each morning, flags duplicates, and routes them to Marios. She's working below — this is her brief.",
    position: "below"
  },
  {
    target: ".list-pane",
    title: "Marios reviews",
    body: "Every draft lands here. Click any row to see it. Stage chips on the right show where each one is in the cycle.",
    position: "right"
  },
  {
    target: ".command-band",
    title: "One decision at a time",
    body: "The big button always reflects what to do next — Send to Marios, Approve, Number, Mark Paid. Click and the cycle advances.",
    position: "below"
  },
  {
    target: ".sophia-mark",
    title: "Done — give it a try",
    body: "Press ⌘K to find anything, N to start a new draft, ? for shortcuts. Or just click around.",
    position: "below"
  }
];

interface GuidedTourProps {
  open: boolean;
  onClose: () => void;
}

export function GuidedTour({ open, onClose }: GuidedTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const computePositions = (idx: number) => {
    const spec = TOUR_STEPS[idx];
    if (!spec) return;
    const el = document.querySelector(spec.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const padding = 10;
    setRect({
      top: r.top - padding,
      left: r.left - padding,
      width: r.width + padding * 2,
      height: r.height + padding * 2
    });

    const cardW = Math.min(420, window.innerWidth - 32);
    const cardH = 200;
    const gap = 18;
    let top: number;
    let left: number;
    if (spec.position === "right") {
      top = Math.min(window.innerHeight - cardH - 16, Math.max(16, r.top));
      left = r.right + gap;
      if (left + cardW > window.innerWidth - 16) {
        left = Math.max(16, r.left - cardW - gap);
      }
    } else {
      top = r.bottom + gap;
      left = r.left;
      if (top + cardH > window.innerHeight - 16) {
        top = Math.max(16, r.top - cardH - gap);
      }
      if (left + cardW > window.innerWidth - 16) {
        left = window.innerWidth - cardW - 16;
      }
      left = Math.max(16, left);
    }
    setCardPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePositions(step);
    const onResize = () => computePositions(step);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, step]);

  const next = () => {
    if (step >= TOUR_STEPS.length - 1) onClose();
    else setStep(step + 1);
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" || event.key === "Enter") next();
      else if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  if (!open) return null;

  const spec = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      <div className="tour-shroud" onClick={onClose} />
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : null}
      <div className="tour-card" style={{ top: cardPos.top, left: cardPos.left }}>
        <div className="step-meta">
          <span className="step-num">
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button type="button" className="step-skip" onClick={onClose}>
            Skip tour ↵
          </button>
        </div>
        <h4>{spec.title}</h4>
        <p>{spec.body}</p>
        <div className="step-foot">
          <div className="dots">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`dot ${i === step ? "is-active" : ""}`} />
            ))}
          </div>
          <div className="step-actions">
            {step > 0 ? (
              <button type="button" className="tour-btn ghost" onClick={prev}>
                Back
              </button>
            ) : null}
            <button type="button" className="tour-btn" onClick={next}>
              {isLast ? "Finish" : "Next"} <ArrowRight size={12} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
