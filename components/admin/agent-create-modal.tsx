"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AgentForm } from "@/components/admin/agent-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentFormData } from "@/lib/validations/agent";

type AgentCreateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function AgentCreateModal({
  open,
  onOpenChange,
  onSuccess,
}: AgentCreateModalProps) {
  const [, setSubmitting] = useState(false);

  const handleSubmit = async (data: AgentFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || errorData.message || "Failed to create agent"
        );
      }

      toast.success("Agent created successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to create agent");
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>
            Create a new agent account for Zyprus Property Group
          </DialogDescription>
        </DialogHeader>

        <AgentForm
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Create Agent"
        />
      </DialogContent>
    </Dialog>
  );
}
