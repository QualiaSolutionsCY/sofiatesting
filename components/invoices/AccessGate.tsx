"use client";

import { LockKeyhole } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  type AccessUser,
  accessUsers,
  findAccessUser,
} from "@/lib/invoices/access";

export function AccessGate({
  onAccess,
}: {
  onAccess: (user: AccessUser) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = findAccessUser(code);
    if (!user) {
      setError("Access code not recognized.");
      return;
    }
    onAccess(user);
  }

  return (
    <main className="access-shell">
      <form className="access-panel" onSubmit={submit}>
        <span className="access-icon">
          <LockKeyhole size={24} />
        </span>
        <p className="eyebrow">Sophia invoice access</p>
        <h1>Enter access code</h1>
        <p className="access-lede">
          Marios review · month-end run · accounting ready
        </p>
        <input
          aria-label="Access code"
          onChange={(event) => setCode(event.target.value)}
          placeholder="MARIOS-2026"
          value={code}
        />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-action" type="submit">
          Open dashboard
        </button>
        <p className="access-hint">
          Configured MVP users:{" "}
          {accessUsers.map((user) => user.name).join(", ")}.
        </p>
      </form>
    </main>
  );
}
