import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FileMinus,
  Hash,
  Pencil,
  Receipt as ReceiptIcon,
  RefreshCw,
  Send
} from "lucide-react";
import type { ReactNode } from "react";
import type { Doc, Stage } from "./types";

export const WORKFLOW = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Marios" },
  { id: "number", label: "Number" },
  { id: "deliver", label: "Deliver & Pay" }
];

export function stageToStep(stage: Stage): number {
  if (stage === "draft") return 0;
  if (stage === "sent-to-marios" || stage === "correction-needed" || stage === "corrected-resend") return 1;
  if (stage === "approved") return 2;
  if (stage === "numbered" || stage === "sent-to-accounting" || stage === "credited") return 3;
  return 0;
}

export function stageRailTone(stage: Stage): "warning" | "success" | "attention" | "neutral" {
  if (stage === "correction-needed" || stage === "corrected-resend" || stage === "cancelled") return "warning";
  if (stage === "sent-to-accounting" || stage === "credited") return "success";
  if (stage === "approved" || stage === "numbered" || stage === "sent-to-marios") return "attention";
  return "neutral";
}

export function stageHeadline(stage: Stage): { title: string; body: string } {
  switch (stage) {
    case "draft":
      return { title: "Draft awaiting hand-off", body: "Sophia prepared this draft. Send it to Marios to begin the approval cycle." };
    case "sent-to-marios":
      return { title: "With Marios — awaiting decision", body: "Marios was pinged via WhatsApp. No reply yet. You can resend or attach a note." };
    case "correction-needed":
      return { title: "Marios asked for changes", body: "Read the correction reason in the Document tab. Fix, then resend." };
    case "corrected-resend":
      return { title: "Corrected — resent to Marios", body: "Marios will see the new version with a 'corrected' tag. Awaiting decision." };
    case "approved":
      return { title: "Approved — ready for numbering", body: "Marios said yes. Assign the next official sequence number to lock it." };
    case "numbered":
      return { title: "Numbered & delivered", body: "Document carries an official number. Awaiting payment confirmation." };
    case "sent-to-accounting":
      return { title: "Paid · receipt sent to accounting", body: "Cycle complete. Receipt was issued and hand-off is logged." };
    case "credited":
      return { title: "Credited — invoice no longer collectable", body: "A credit note was issued against this invoice. The credit note is the active document." };
    case "cancelled":
      return { title: "Cancelled before numbering", body: "Document was voided before receiving an official number. No accounting impact." };
    default:
      return { title: "—", body: "—" };
  }
}

export function stampFor(stage: Stage): { label: string; cls: string } | null {
  switch (stage) {
    case "draft": return { label: "Draft", cls: "is-draft" };
    case "sent-to-marios": return { label: "For review", cls: "" };
    case "correction-needed": return { label: "Correct", cls: "" };
    case "corrected-resend": return { label: "Resent", cls: "" };
    case "approved": return { label: "Approved", cls: "is-approved" };
    case "numbered": return { label: "Numbered", cls: "is-approved" };
    case "sent-to-accounting": return { label: "Paid", cls: "is-paid" };
    case "credited": return { label: "Credited", cls: "is-credited" };
    case "cancelled": return { label: "Void", cls: "is-cancelled" };
    default: return null;
  }
}

export function nextNumber(doc: Doc): string {
  if (doc.kind === "credit") return "10097";
  return "11425";
}

export interface PrimaryActionSpec {
  icon: ReactNode;
  label: string;
  small: string;
}

export function primaryAction(stage: Stage, doc: Doc): PrimaryActionSpec {
  switch (stage) {
    case "draft":
      return { icon: <Send size={18} strokeWidth={1.6} />, label: "Approve & send to accounting", small: "Assigns official № and posts to the accounting group · mark paid separately" };
    case "sent-to-marios":
      return { icon: <RefreshCw size={18} strokeWidth={1.6} />, label: "Resend to Marios", small: "Bumps Marios directly on WhatsApp" };
    case "correction-needed":
      return { icon: <Pencil size={18} strokeWidth={1.6} />, label: "Correct & resend", small: "Opens composer with the original lines + Marios's reason" };
    case "corrected-resend":
      return { icon: <RefreshCw size={18} strokeWidth={1.6} />, label: "Resend correction", small: "Bumps Marios. Awaiting decision." };
    case "approved":
      return { icon: <Hash size={18} strokeWidth={1.6} />, label: "Assign official number", small: `Next in sequence: ${nextNumber(doc)}` };
    case "numbered":
      return { icon: <CheckCircle2 size={18} strokeWidth={1.6} />, label: "Mark as paid → issue receipt", small: "Generates a receipt PDF and sends to accounting" };
    case "sent-to-accounting":
      return { icon: <ReceiptIcon size={18} strokeWidth={1.6} />, label: "Open issued receipt", small: doc.receiptPdf || `Receipt ${doc.receiptNo || "—"}` };
    case "credited":
      return { icon: <FileMinus size={18} strokeWidth={1.6} />, label: "Open linked credit note", small: "Jump to the credit document" };
    case "cancelled":
      return { icon: <Copy size={18} strokeWidth={1.6} />, label: "Duplicate as new draft", small: "Use this as a starting point — original stays cancelled" };
    default:
      return { icon: <ArrowRight size={18} strokeWidth={1.6} />, label: "—", small: "" };
  }
}
