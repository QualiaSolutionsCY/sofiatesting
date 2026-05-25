"use client";

import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BulkActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
};

async function callBulkAction(
  action: "send-invite" | "deactivate" | "activate" | "permanent-delete",
  ids: string[]
) {
  const response = await fetch("/api/admin/agents/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ids }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error ||
        payload.message ||
        `Bulk action failed (${response.status})`
    );
  }
  return payload as {
    success: boolean;
    affected?: number;
    sent?: number;
    skipped?: number;
    failed?: number;
  };
}

export function BulkSendInvitesDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BulkActionDialogProps) {
  const [loading, setLoading] = useState(false);
  const selectedCount = selectedIds.length;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await callBulkAction("send-invite", selectedIds);
      const sent = result.sent ?? 0;
      const skipped = result.skipped ?? 0;
      const failed = result.failed ?? 0;
      if (sent > 0) {
        toast.success(
          `Sent ${sent} invite${sent === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}${failed ? ` · failed ${failed}` : ""}`
        );
      } else if (skipped > 0 && failed === 0) {
        toast.message(
          `All ${skipped} skipped (already registered or no email).`
        );
      } else if (failed > 0) {
        toast.error(
          `${failed} invite${failed === 1 ? "" : "s"} failed to send.`
        );
      } else {
        toast.success("Done.");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send invites"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Send invites to {selectedCount} agent
            {selectedCount === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Each selected agent without a registered account will receive an
            email with a personalised sign-up link.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Agents who are already registered or who have no email on file will
            be skipped automatically.
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={handleConfirm}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send {selectedCount} invite{selectedCount === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkDeactivateDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BulkActionDialogProps) {
  const [loading, setLoading] = useState(false);
  const selectedCount = selectedIds.length;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await callBulkAction("deactivate", selectedIds);
      toast.success(
        `Deactivated ${result.affected ?? selectedCount} agent${(result.affected ?? selectedCount) === 1 ? "" : "s"}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to deactivate agents"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Deactivate {selectedCount} agent{selectedCount === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Selected agents will lose access to SOPHIA immediately. Their data
            and conversations are preserved and they can be re-activated at any
            time.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This affects lead routing, WhatsApp, Telegram and the admin panel.
            Reactivate by editing the agent or running the bulk activate action.
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={loading}
            onClick={handleConfirm}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deactivate {selectedCount} agent{selectedCount === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkActivateDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BulkActionDialogProps) {
  const [loading, setLoading] = useState(false);
  const selectedCount = selectedIds.length;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const result = await callBulkAction("activate", selectedIds);
      toast.success(
        `Activated ${result.affected ?? selectedCount} agent${(result.affected ?? selectedCount) === 1 ? "" : "s"}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to activate agents"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Activate {selectedCount} agent{selectedCount === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Selected agents will regain access to SOPHIA, lead routing and the
            admin panel.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={handleConfirm}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activate {selectedCount} agent{selectedCount === 1 ? "" : "s"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkPermanentDeleteDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BulkActionDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedCount = selectedIds.length;

  const isConfirmed = confirmText === "DELETE";

  const handleConfirm = async () => {
    if (!isConfirmed) return;
    setLoading(true);
    try {
      const result = await callBulkAction("permanent-delete", selectedIds);
      toast.success(
        `Permanently deleted ${result.affected ?? selectedCount} agent${(result.affected ?? selectedCount) === 1 ? "" : "s"}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to permanently delete agents"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmText("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Permanently delete {selectedCount} agent
            {selectedCount === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This will permanently delete the selected agent
            {selectedCount === 1 ? "" : "s"} and all their related data. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            All chat history, analytics, lead assignments, and listing records
            associated with these agents will be removed or unlinked.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="confirm-bulk-delete">
            Type{" "}
            <span className="font-mono font-semibold text-destructive">
              DELETE
            </span>{" "}
            to confirm
          </Label>
          <Input
            autoComplete="off"
            disabled={loading}
            id="confirm-bulk-delete"
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            value={confirmText}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={loading}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!isConfirmed || loading}
            onClick={handleConfirm}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete {selectedCount} agent{selectedCount === 1 ? "" : "s"}{" "}
            permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
