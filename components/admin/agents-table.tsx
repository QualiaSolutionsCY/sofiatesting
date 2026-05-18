"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Power,
  PowerOff,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AgentEditModal } from "@/components/admin/agent-edit-modal";
import { AgentProfileSheet } from "@/components/admin/agent-profile-sheet";
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
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<Agent | null>(null);
  const [agentToToggle, setAgentToToggle] = useState<Agent | null>(null);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);

  const handleRowClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setSheetOpen(true);
  };

  const handleEditClick = (agent: Agent) => {
    setAgentToEdit(agent);
    setEditModalOpen(true);
  };

  const handleSendInvite = async (agent: Agent) => {
    if (agent.userId) {
      toast.error(`${agent.fullName} already has a registered account.`);
      return;
    }
    if (!agent.email) {
      toast.error(`${agent.fullName} has no email address.`);
      return;
    }
    setBusyAgentId(agent.id);
    try {
      const response = await fetch(`/api/admin/agents/${agent.id}/invite`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || `Request failed (${response.status})`
        );
      }
      if (payload.emailed === false && payload.signupUrl) {
        toast.message("Email not configured — copy this link manually", {
          description: payload.signupUrl,
        });
      } else {
        toast.success(`Invite sent to ${agent.email}`);
      }
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send invite"
      );
    } finally {
      setBusyAgentId(null);
    }
  };

  const handleToggleActive = async () => {
    if (!agentToToggle) return;
    const target = agentToToggle;
    setBusyAgentId(target.id);
    try {
      const nextActive = !target.isActive;
      const response = await fetch(`/api/admin/agents/${target.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || `Request failed (${response.status})`
        );
      }
      toast.success(
        nextActive
          ? `Activated ${target.fullName}`
          : `Deactivated ${target.fullName}`
      );
      setAgentToToggle(null);
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update agent"
      );
    } finally {
      setBusyAgentId(null);
    }
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

  const renderPlatformBadges = (agent: Agent) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {agent.registeredAt && (
        <Badge
          className="border-blue-200 bg-blue-50 text-blue-700"
          variant="outline"
        >
          Web
        </Badge>
      )}
      {agent.telegramUserId && (
        <Badge
          className="border-sky-200 bg-sky-50 text-sky-700"
          variant="outline"
        >
          Telegram
        </Badge>
      )}
      {agent.whatsappPhoneNumber && (
        <Badge
          className="border-emerald-200 bg-emerald-50 text-emerald-700"
          variant="outline"
        >
          WhatsApp
        </Badge>
      )}
      {!agent.registeredAt &&
        !agent.telegramUserId &&
        !agent.whatsappPhoneNumber && (
          <span className="text-muted-foreground text-xs">Not linked</span>
        )}
    </div>
  );

  const renderStatus = (agent: Agent) =>
    agent.isActive ? (
      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 text-xs">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 font-medium text-rose-700 text-xs">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
        Inactive
      </span>
    );

  return (
    <>
      {/* Mobile card layout */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground text-sm">
            No agents found
          </div>
        ) : (
          agents.map((agent) => (
            <button
              className="w-full space-y-2.5 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40 active:bg-accent/60"
              key={agent.id}
              onClick={() => handleRowClick(agent)}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{agent.fullName}</div>
                  <div className="truncate text-muted-foreground text-xs">
                    {agent.email}
                  </div>
                </div>
                {renderStatus(agent)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="outline">{agent.region}</Badge>
                <Badge variant="secondary">{agent.role}</Badge>
                {renderPlatformBadges(agent)}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12 pl-4">
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
              <TableHead>Contact</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="py-12 text-center" colSpan={9}>
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
                  <div className="text-muted-foreground text-sm">Loading…</div>
                </TableCell>
              </TableRow>
            ) : agents.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-12 text-center text-muted-foreground"
                  colSpan={9}
                >
                  No agents found
                </TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => (
                <TableRow
                  className="group cursor-pointer transition-colors hover:bg-muted/40"
                  key={agent.id}
                  onClick={() => handleRowClick(agent)}
                >
                  <TableCell
                    className="pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Select ${agent.fullName}`}
                      checked={selectedAgents.has(agent.id)}
                      onCheckedChange={(checked) =>
                        onSelectAgent(agent.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{agent.fullName}</span>
                      {agent.inviteSentAt && !agent.userId && (
                        <span className="text-amber-700 text-xs">
                          Invite sent {formatDistanceToNow(new Date(agent.inviteSentAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 text-sm">
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {agent.email || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      {agent.phoneNumber && (
                        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Phone className="h-3 w-3" />
                          {agent.phoneNumber}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{agent.region}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        agent.role === "management"
                          ? "default"
                          : agent.role === "manager"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {agent.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{renderStatus(agent)}</TableCell>
                  <TableCell>{renderPlatformBadges(agent)}</TableCell>
                  <TableCell>
                    {agent.lastActiveAt ? (
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(agent.lastActiveAt), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          className="h-8 w-8 p-0 opacity-70 group-hover:opacity-100"
                          disabled={busyAgentId === agent.id}
                          size="sm"
                          variant="ghost"
                        >
                          {busyAgentId === agent.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedAgent(agent);
                            setSheetOpen(true);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEditClick(agent)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit agent
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!!agent.userId || !agent.email}
                          onClick={() => handleSendInvite(agent)}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {agent.inviteSentAt ? "Resend invite" : "Send invite"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {agent.isActive ? (
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onClick={() => setAgentToToggle(agent)}
                          >
                            <PowerOff className="mr-2 h-4 w-4" />
                            Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-emerald-700 focus:text-emerald-700"
                            onClick={() => setAgentToToggle(agent)}
                          >
                            <Power className="mr-2 h-4 w-4" />
                            Activate
                          </DropdownMenuItem>
                        )}
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
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
        <div className="text-muted-foreground text-xs sm:text-sm">
          {pagination.total > 0 && (
            <>
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(
                pagination.page * pagination.limit,
                pagination.total
              )}{" "}
              of {pagination.total}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
            size="sm"
            variant="outline"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <div className="text-xs sm:text-sm">
            Page {pagination.page} / {pagination.totalPages || 1}
          </div>
          <Button
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
            size="sm"
            variant="outline"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Toggle Active confirmation */}
      <AlertDialog
        onOpenChange={(open) => !open && setAgentToToggle(null)}
        open={!!agentToToggle}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {agentToToggle?.isActive ? "Deactivate" : "Activate"}{" "}
              {agentToToggle?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {agentToToggle?.isActive
                ? "This agent will lose access to SOPHIA, lead routing and the admin panel until reactivated."
                : "This agent will regain access to SOPHIA, lead routing and the admin panel."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAgentId === agentToToggle?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                agentToToggle?.isActive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              disabled={busyAgentId === agentToToggle?.id}
              onClick={handleToggleActive}
            >
              {busyAgentId === agentToToggle?.id && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {agentToToggle?.isActive ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Agent Profile Sheet */}
      {selectedAgent && (
        <AgentProfileSheet
          agent={selectedAgent}
          onOpenChange={(open) => {
            setSheetOpen(open);
            if (!open) setSelectedAgent(null);
          }}
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
