"use client";

import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type PermanentDeleteAgentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  agentName: string;
  onSuccess: () => void;
};

export function PermanentDeleteAgentDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
  onSuccess,
}: PermanentDeleteAgentDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const isConfirmed = confirmText === agentName;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/agents/${agentId}?permanent=true`,
        { method: "DELETE" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || `Request failed (${response.status})`
        );
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete agent"
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
            Permanently delete agent
          </DialogTitle>
          <DialogDescription>
            This will permanently delete{" "}
            <span className="font-semibold text-foreground">{agentName}</span>{" "}
            and all their related data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            All chat history, analytics, lead assignments, and listing records
            associated with this agent will be removed or unlinked.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="confirm-name">
            Type{" "}
            <span className="font-mono font-semibold text-destructive">
              {agentName}
            </span>{" "}
            to confirm
          </Label>
          <Input
            autoComplete="off"
            disabled={loading}
            id="confirm-name"
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={agentName}
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
            onClick={handleDelete}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
