"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import type { Doc } from "@/lib/invoices/redesign/types";

interface SidebarProps {
  operator: string;
  docs: Doc[];
  onSignOut: () => void;
  children?: ReactNode;
}

export function Sidebar({ operator, docs, onSignOut, children }: SidebarProps) {
  const reviewCount = docs.filter((d) => d.stage === "sent-to-marios" || d.stage === "correction-needed").length;
  const operatorFirst = operator.split(" ")[0] || "Operator";
  const operatorInitial = operatorFirst.slice(0, 1).toUpperCase();

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <span className="sidebar-mark" aria-hidden>S</span>
        <div>
          <strong>Sophia</strong>
          <span>Invoice</span>
        </div>
      </div>

      <div className="sidebar-section-head">
        <span>Invoices</span>
        {reviewCount > 0 ? <em className="sidebar-badge">{reviewCount}</em> : null}
      </div>

      <div className="sidebar-list" role="navigation" aria-label="Invoices">
        {children}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-operator" title={operator}>
          <span className="sidebar-operator-avatar" aria-hidden>{operatorInitial}</span>
          <div>
            <strong>{operatorFirst}</strong>
            <span>Signed in</span>
          </div>
        </div>
        <button type="button" className="sidebar-signout" onClick={onSignOut} aria-label="Sign out">
          <LogOut size={14} strokeWidth={1.7} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
