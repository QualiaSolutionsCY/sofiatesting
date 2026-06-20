"use client";

import { Check, Database, Lock, Mail, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getWhatsAppGroupStatus, type WhatsAppGroupStatus } from "@/lib/invoices/actions/whatsapp-status";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  operator: string;
  sharedCc: string;
  setSharedCc: (value: string) => void;
  accountingEmail: string;
  setAccountingEmail: (value: string) => void;
  autoRoute: boolean;
  setAutoRoute: (value: boolean) => void;
  onSignOut: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  operator,
  sharedCc,
  setSharedCc,
  accountingEmail,
  setAccountingEmail,
  autoRoute,
  setAutoRoute,
  onSignOut
}: SettingsPanelProps) {
  const [cc, setCc] = useState(sharedCc);
  const [auto, setAuto] = useState(autoRoute);
  const [email, setEmail] = useState(accountingEmail);
  const [groupStatus, setGroupStatus] = useState<WhatsAppGroupStatus | null>(null);
  const [groupStatusLoading, setGroupStatusLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setCc(sharedCc);
      setAuto(autoRoute);
      setEmail(accountingEmail);
    }
  }, [open, sharedCc, autoRoute, accountingEmail]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setGroupStatusLoading(true);
    getWhatsAppGroupStatus()
      .then((status) => {
        if (active) setGroupStatus(status);
      })
      .catch(() => {
        if (active) setGroupStatus({ configured: false, connected: false, detail: "Status check failed" });
      })
      .finally(() => {
        if (active) setGroupStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSharedCc(cc);
    setAutoRoute(auto);
    setAccountingEmail(email);
    onClose();
  }

  const labelStyle: React.CSSProperties = {
    fontSize: ".62rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: ".14em",
    fontWeight: 600
  };
  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid var(--rule)",
    borderRadius: "var(--radius)",
    background: "var(--surface-2)",
    fontFamily: "var(--font-mono)"
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="composer" onClick={(event) => event.stopPropagation()} onSubmit={save} style={{ width: "min(620px, 100%)" }}>
        <div className="composer-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Ledger configuration</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={15} strokeWidth={1.6} />
          </button>
        </div>

        <div style={{ marginTop: 22 }}>
          <p className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>
            Delivery defaults
          </p>
          <label style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            <span style={labelStyle}>Shared WhatsApp CC (accounting)</span>
            <input value={cc} onChange={(event) => setCc(event.target.value)} spellCheck={false} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6, marginBottom: 14 }}>
            <span style={labelStyle}>Shared email CC (accounting)</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              spellCheck={false}
              type="email"
              style={inputStyle}
            />
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 0",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)"
            }}
          >
            <span>
              <span style={{ display: "block", fontWeight: 600, color: "var(--ink)" }}>Auto-route runs to Marios</span>
              <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>
                Drafts from monthly runs are sent for review without intermediate confirmation.
              </span>
            </span>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => setAuto(event.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        </div>

        <div style={{ marginTop: 22 }}>
          <p className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>
            Integrations
          </p>
          <div style={{ display: "grid", gap: 0, borderTop: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Database size={14} strokeWidth={1.6} /> Supabase Storage
              </span>
              <span style={{ color: "var(--green-strong)", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>● Connected</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <MessageCircle size={14} strokeWidth={1.6} /> WhatsApp · accounting group
              </span>
              {groupStatusLoading || !groupStatus ? (
                <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                  ● Checking…
                </span>
              ) : groupStatus.connected ? (
                <span style={{ color: "var(--green-strong)", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                  ● Connected{groupStatus.groupName ? ` · ${groupStatus.groupName}` : ""}
                </span>
              ) : (
                <span style={{ color: "var(--amber-strong)", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                  ● {groupStatus.detail ?? "Not connected"}
                </span>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Mail size={14} strokeWidth={1.6} /> Email forwarding
              </span>
              <span style={{ color: "var(--amber-strong)", fontFamily: "var(--font-mono)", fontSize: ".78rem" }}>
                ● Staged · provider TBC
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <p className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>
            Identity
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "1px solid var(--rule)",
              borderBottom: "1px solid var(--rule)"
            }}
          >
            <div>
              <span style={{ display: "block", fontWeight: 600, color: "var(--ink)" }}>{operator}</span>
              <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>Operator · session active</span>
            </div>
            <button type="button" onClick={onSignOut} className="secondary-action">
              <Lock size={13} strokeWidth={1.6} /> Sign out
            </button>
          </div>
        </div>

        <div className="composer-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">
            <Check size={14} strokeWidth={1.6} /> Save settings
          </button>
        </div>
      </form>
    </div>
  );
}
