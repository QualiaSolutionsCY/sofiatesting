"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Mail,
  MoreHorizontal,
  Phone,
  Trash2,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AgentEditModal } from "@/components/admin/agent-edit-modal";
import { AgentProfileSheet } from "@/components/admin/agent-profile-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

type AgentsTableProps = {
  agents: Agent[];
  pagination: Pagination;
  loading: boolean;
  selectedAgents: Set<string>;
  onSelectAgent: (agentId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onRefresh: () => void;
};

export function AgentsTable({
  agents,
  pagination,
  loading,
  selectedAgents,
  onSelectAgent,
  onSelectAll,
  onRefresh,
}: AgentsTableProps) {
  const router = useRouter();
  const [selectedAgent] = useState<Agent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);

  const handleRowClick = (agent: Agent) => {
    router.push(`/admin/agents-registry/${agent.id}`);
  };

  const handleEditClick = (agent: Agent) => {
    setAgentToEdit(agent);
    setEditModalOpen(true);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", newPage.toString());
    router.push(`?${params.toString()}`);
  };

  const allSelected =
    agents.length > 0 && selectedAgents.size === agents.length;
  const someSelected =
    selectedAgents.size > 0 && selectedAgents.size < agents.length;

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="Select all agents"
                  checked={allSelected}
                  className={
                    someSelected ? "data-[state=checked]:bg-primary/50" : ""
                  }
                  onCheckedChange={(checked) => onSelectAll(checked === true)}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="py-8 text-center" colSpan={9}>
                  Loading...
                </TableCell>
              </TableRow>
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={9}
                >
                  No agents found
                </TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => (
                <TableRow
                  className="cursor-pointer hover:bg-muted/50"
                  key={agent.id}
                  onClick={() => handleRowClick(agent)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${agent.fullName}`}
                      checked={selectedAgents.has(agent.id)}
                      onCheckedChange={(checked) =>
                        onSelectAgent(agent.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {agent.fullName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {agent.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {agent.phoneNumber ? (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {agent.phoneNumber}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{agent.region}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        agent.role === "CEO"
                          ? "default"
                          : agent.role.startsWith("Manager")
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {agent.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {agent.isActive ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">Inactive</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {agent.registeredAt && (
                        <Badge className="text-xs" variant="default">
                          Web
                        </Badge>
                      )}
                      {agent.telegramUserId && (
                        <Badge className="text-xs" variant="secondary">
                          Telegram
                        </Badge>
                      )}
                      {agent.whatsappPhoneNumber && (
                        <Badge className="text-xs" variant="secondary">
                          WhatsApp
                        </Badge>
                      )}
                      {!agent.registeredAt &&
                        !agent.telegramUserId &&
                        !agent.whatsappPhoneNumber && (
                          <span className="text-muted-foreground text-sm">
                            None
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="h-8 w-8 p-0"
                          size="sm"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleRowClick(agent)}>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEditClick(agent)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Agent
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Mail className="mr-2 h-4 w-4" />
                          Send Invite
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
          {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
          {pagination.total} agents
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="text-sm">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <Button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
            size="sm"
            variant="outline"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Agent Profile Sheet */}
      {selectedAgent && (
        <AgentProfileSheet
          agent={selectedAgent}
          onOpenChange={setSheetOpen}
          onRefresh={onRefresh}
          open={sheetOpen}
        />
      )}

      {/* Agent Edit Modal */}
      {agentToEdit && (
        <AgentEditModal
          agent={agentToEdit}
          onOpenChange={setEditModalOpen}
          onSuccess={() => {
            onRefresh();
            setAgentToEdit(null);
          }}
          open={editModalOpen}
        />
      )}
    </>
  );
}
