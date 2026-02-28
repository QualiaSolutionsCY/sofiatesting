"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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

type BulkActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onSuccess: () => void;
};

interface BulkSendInvitesDialogProps extends BulkActionDialogProps {}

export function BulkSendInvitesDialog({
  open,
  onOpenChange,
  selectedCount,
  onSuccess,
}: BulkSendInvitesDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // API call will be implemented when backend is ready
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      toast.success(
        `Successfully sent invites to ${selectedCount} agent${selectedCount > 1 ? "s" : ""}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to send invites");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Send Invites to {selectedCount} Agent{selectedCount > 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will send email invitations to all selected agents who haven't
            registered yet. They will receive a personalized link to set up
            their account.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Only agents without existing accounts will receive invitations.
            Agents with registered accounts will be skipped.
          </AlertDescription>
        </Alert>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={loading} onClick={handleConfirm}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send {selectedCount} Invite{selectedCount > 1 ? "s" : ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface BulkDeactivateDialogProps extends BulkActionDialogProps {}

export function BulkDeactivateDialog({
  open,
  onOpenChange,
  selectedCount,
  onSuccess,
}: BulkDeactivateDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      // API call will be implemented when backend is ready
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call
      toast.success(
        `Successfully deactivated ${selectedCount} agent${selectedCount > 1 ? "s" : ""}`
      );
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to deactivate agents");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Deactivate {selectedCount} Agent{selectedCount > 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action will deactivate the selected agents. They will no longer
            be able to access SOPHIA until they are reactivated by an
            administrator.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Deactivated agents will lose access immediately. Their data and
            conversations will be preserved. You can reactivate them at any
            time.
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
            Deactivate {selectedCount} Agent{selectedCount > 1 ? "s" : ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
