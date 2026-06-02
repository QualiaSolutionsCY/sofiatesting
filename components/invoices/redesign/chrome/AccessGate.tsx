"use client";

import { ArrowRight, Lock } from "lucide-react";
import { useState } from "react";

interface AccessGateProps {
  onEnter: (code: string) => void;
}

const VALID = ["MARIOS-2026", "CHARALAMBOUS-2026", "ZYPRUS-OPS"];

export function AccessGate({ onEnter }: AccessGateProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = code.trim().toUpperCase();
    if (VALID.includes(value)) {
      setError("");
      onEnter(value);
    } else if (value) {
      setError("That access code isn't recognised. Try MARIOS-2026.");
    }
  }

  return (
    <div className="access-shell">
      <div className="access-panel">
        <div className="access-icon">
          <Lock size={22} strokeWidth={1.6} />
        </div>
        <p className="eyebrow">Sophia Invoice</p>
        <h1 style={{ fontFamily: "var(--serif)", fontWeight: 500, letterSpacing: "-0.02em" }}>Welcome back</h1>
        <p className="access-lede">
          Marios, Charalambous, and the duty colleague can sign in here. Enter your access code to open invoices.
        </p>
        <form onSubmit={submit}>
          {error ? <p className="form-error">{error}</p> : null}
          <input
            autoFocus
            type="text"
            value={code}
            placeholder="ACCESS-CODE"
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="primary-action" type="submit">
            <ArrowRight size={14} strokeWidth={1.6} /> Sign in
          </button>
        </form>
        <p className="access-hint">
          Try <strong style={{ fontFamily: "var(--font-mono)" }}>MARIOS-2026</strong>
        </p>
      </div>
    </div>
  );
}
