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
  const reviewCount = docs.filter(
    (d) => d.stage === "sent-to-marios" || d.stage === "correction-needed"
  ).length;
  const operatorFirst = operator.split(" ")[0] || "Operator";
  const operatorInitial = operatorFirst.slice(0, 1).toUpperCase();

  return (
    <aside aria-label="Primary navigation" className="sidebar">
      <div className="sidebar-brand">
        <span aria-hidden className="sidebar-mark">
          S
        </span>
        <div>
          <strong>Iam Sophia</strong>
          <span>Invoice</span>
        </div>
      </div>

      <div className="sidebar-section-head">
        <span>Invoices</span>
        {reviewCount > 0 ? (
          <em className="sidebar-badge">{reviewCount}</em>
        ) : null}
      </div>

      <div aria-label="Invoices" className="sidebar-list" role="navigation">
        {children}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-operator" title={operator}>
          <span aria-hidden className="sidebar-operator-avatar">
            {operatorInitial}
          </span>
          <div>
            <strong>{operatorFirst}</strong>
            <span>Signed in</span>
          </div>
        </div>
        <button
          aria-label="Sign out"
          className="sidebar-signout"
          onClick={onSignOut}
          type="button"
        >
          <LogOut aria-hidden size={14} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}
