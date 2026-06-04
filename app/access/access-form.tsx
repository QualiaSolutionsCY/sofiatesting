"use client";

import { ArrowRight, Lock } from "lucide-react";
import { useActionState } from "react";
import { type AccessState, submitAccessCode } from "./actions";

export function AccessForm({ scope, callbackUrl }: { scope: string; callbackUrl: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(submitAccessCode, null);
  const area = scope === "invoices" ? "Invoices" : "Admin";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b0d10",
        color: "#e6e9ee",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: 24,
      }}
    >
      <form
        action={action}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#13161b",
          border: "1px solid #232a33",
          borderRadius: 14,
          padding: "32px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "#1b212a",
            border: "1px solid #2a323d",
            marginBottom: 18,
          }}
        >
          <Lock size={20} strokeWidth={1.7} />
        </div>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b8794" }}>
          Sophia · {area}
        </p>
        <h1 style={{ margin: "6px 0 6px", fontSize: 22, fontWeight: 600 }}>Enter access code</h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, color: "#9aa4b1" }}>
          Enter the {area.toLowerCase()} access code to continue.
        </p>

        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        {state?.error ? (
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 13,
              color: "#ff8a8a",
              background: "#2a1416",
              border: "1px solid #4a2226",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {state.error}
          </p>
        ) : null}

        <input
          autoFocus
          name="code"
          type="password"
          placeholder="ACCESS-CODE"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 15,
            letterSpacing: "0.06em",
            color: "#e6e9ee",
            background: "#0e1115",
            border: "1px solid #2a323d",
            borderRadius: 10,
            outline: "none",
            marginBottom: 14,
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 14px",
            fontSize: 15,
            fontWeight: 600,
            color: "#0b0d10",
            background: pending ? "#7b8794" : "#e6e9ee",
            border: "none",
            borderRadius: 10,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Checking…" : "Continue"}
          {!pending ? <ArrowRight size={15} strokeWidth={2} /> : null}
        </button>
      </form>
    </div>
  );
}
