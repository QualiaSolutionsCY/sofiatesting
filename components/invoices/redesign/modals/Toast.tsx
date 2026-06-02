"use client";

import { Check } from "lucide-react";
import { useEffect } from "react";

interface ToastProps {
  message: string;
  onDone: () => void;
}

export function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--ink)",
        color: "var(--paper)",
        padding: "10px 18px",
        borderRadius: "var(--radius)",
        fontSize: ".88rem",
        fontWeight: 500,
        boxShadow: "var(--shadow-lg)",
        zIndex: 100,
        display: "flex",
        gap: 10,
        alignItems: "center",
        animation: "toast-rise 360ms cubic-bezier(.2,.9,.25,1.1) both"
      }}
    >
      <Check size={14} strokeWidth={1.6} /> {message}
    </div>
  );
}
