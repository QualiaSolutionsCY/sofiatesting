"use client";

import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { AgentsFilterBar } from "@/components/admin/agents-filter-bar";
import { AgentsTable } from "@/components/admin/agents-table";

type Agent = {
  id: string;
  userId: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  region: string;
  role: string;
  isActive: boolean;
  canReceiveLeads: boolean;
  telegramUserId: string | null;
  whatsappPhoneNumber: string | null;
  lastActiveAt: Date | null;
  registeredAt: Date | null;
  inviteSentAt: Date | null;
  inviteToken: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type AgentsRegistryClientProps = {
  initialAgents: Agent[];
  initialPagination: Pagination;
  searchParams: {
    page?: string;
    limit?: string;
    region?: string;
    role?: string;
    isActive?: string;
    search?: string;
  };
};

export function AgentsRegistryClient({
  initialAgents,
  initialPagination,
  searchParams,
}: AgentsRegistryClientProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [pagination, setPagination] = useState<Pagination>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        searchParams as Record<string, string>
      );
      const response = await fetch(`/api/admin/agents?${params.toString()}`);
      const data = await response.json();
      setAgents(data.agents);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error refreshing agents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAgent = (agentId: string, selected: boolean) => {
    const newSelection = new Set(selectedAgents);
    if (selected) {
      newSelection.add(agentId);
    } else {
      newSelection.delete(agentId);
    }
    setSelectedAgents(newSelection);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedAgents(new Set(agents.map((a) => a.id)));
    } else {
      setSelectedAgents(new Set());
    }
  };

  const handleExportCSV = () => {
    try {
      // Get agents to export (selected or all filtered)
      const agentsToExport =
        selectedAgents.size > 0
          ? agents.filter((a) => selectedAgents.has(a.id))
          : agents;

      if (agentsToExport.length === 0) {
        toast.error("No agents to export");
        return;
      }

      // Convert to CSV
      const headers = [
        "Full Name",
        "Email",
        "Phone Number",
        "Region",
        "Role",
        "Status",
        "Telegram Linked",
        "WhatsApp Linked",
        "Web Account",
        "Last Active",
        "Created At",
        "Notes",
      ];

      const rows = agentsToExport.map((agent) => [
        agent.fullName,
        agent.email,
        agent.phoneNumber || "",
        agent.region,
        agent.role,
        agent.isActive ? "Active" : "Inactive",
        agent.telegramUserId ? "Yes" : "No",
        agent.whatsappPhoneNumber ? "Yes" : "No",
        agent.registeredAt ? "Registered" : "Not Registered",
        agent.lastActiveAt ? format(new Date(agent.lastActiveAt), "PPP p") : "",
        format(new Date(agent.createdAt), "PPP"),
        agent.notes || "",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((cell) => `"${cell.toString().replace(/"/g, '""')}"`)
            .join(",")
        ),
      ].join("\n");

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `zyprus-agents-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${agentsToExport.length} agent${agentsToExport.length > 1 ? "s" : ""} to CSV`
      );

      // Clear selection after export
      if (selectedAgents.size > 0) {
        setSelectedAgents(new Set());
      }
    } catch (error: any) {
      console.error("Error exporting CSV:", error);
      toast.error("Failed to export CSV");
    }
  };

  return (
    <div className="space-y-4">
      <AgentsFilterBar
        onClearSelection={() => setSelectedAgents(new Set())}
        onExportCSV={handleExportCSV}
        onRefresh={handleRefresh}
        searchParams={searchParams}
        selectedIds={Array.from(selectedAgents)}
      />

      <AgentsTable
        agents={agents}
        loading={loading}
        onRefresh={handleRefresh}
        onSelectAgent={handleSelectAgent}
        onSelectAll={handleSelectAll}
        pagination={pagination}
        selectedAgents={selectedAgents}
      />
    </div>
  );
}
