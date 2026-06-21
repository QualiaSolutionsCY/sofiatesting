import { statusLabel } from "@/lib/invoices/format";
import type { ApprovalStatus } from "@/lib/invoices/types/invoice";

export function StatusBadge({
  status,
  large = false,
}: {
  status: ApprovalStatus;
  large?: boolean;
}) {
  return (
    <span className={`status status-${status} ${large ? "status-large" : ""}`}>
      {statusLabel(status)}
    </span>
  );
}
