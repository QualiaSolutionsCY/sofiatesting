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

type AgentEditModalProps = {
  agent: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    region: string;
    role: string;
    isActive: boolean;
    notes: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function AgentEditModal({
  agent,
  open,
  onOpenChange,
  onSuccess,
}: AgentEditModalProps) {
  const [, setSubmitting] = useState(false);

  const handleSubmit = async (data: AgentFormData) => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update agent");
      }

      toast.success("Agent updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update agent");
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Update agent information for {agent.fullName}
          </DialogDescription>
        </DialogHeader>

        <AgentForm
          initialData={{
            fullName: agent.fullName,
            email: agent.email,
            phoneNumber: agent.phoneNumber || "",
            region: agent.region as any,
            role: agent.role as any,
            isActive: agent.isActive,
            notes: agent.notes || "",
          }}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel="Update Agent"
        />
      </DialogContent>
    </Dialog>
  );
}
