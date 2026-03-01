"use client";

import { format } from "date-fns";
import {
  CheckCircle2,
  Edit,
  Mail,
  MapPin,
  Phone,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgentEditModal } from "@/components/admin/agent-edit-modal";
import {
  LinkTelegramModal,
  LinkWhatsAppModal,
} from "@/components/admin/platform-link-modals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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

type AgentStats = {
  totalSessions: number;
  totalMessages: number;
  totalDocuments: number;
  totalCalculations: number;
  totalListings: number;
  totalTokens: number;
  totalCost: string;
  platforms: {
    web: number;
    telegram: number;
    whatsapp: number;
  };
};

type AgentProfileSheetProps = {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
};

export function AgentProfileSheet({
  agent,
  open,
  onOpenChange,
  onRefresh,
}: AgentProfileSheetProps) {
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [, setLoading] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);

  const fetchAgentStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/agents/${agent.id}`);
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Error fetching agent stats:", error);
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    if (open && agent) {
      fetchAgentStats();
    }
  }, [open, agent, fetchAgentStats]);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-2xl">{agent.fullName}</SheetTitle>
              <SheetDescription>
                {agent.role} • {agent.region}
              </SheetDescription>
            </div>
            {agent.isActive ? (
              <Badge className="flex items-center gap-1" variant="default">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge className="flex items-center gap-1" variant="destructive">
                <XCircle className="h-3 w-3" />
                Inactive
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Contact Information */}
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{agent.email}</span>
              </div>
              {agent.phoneNumber && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{agent.phoneNumber}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{agent.region}</span>
              </div>
            </div>
          </Card>

          {/* Platform Connections */}
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">Platform Connections</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Web Account
                </span>
                {agent.registeredAt ? (
                  <Badge variant="default">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Not Registered</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Telegram</span>
                {agent.telegramUserId ? (
                  <Button
                    onClick={() => setTelegramModalOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Badge className="mr-2" variant="default">
                      Connected
                    </Badge>
                    Manage
                  </Button>
                ) : (
                  <Button
                    onClick={() => setTelegramModalOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    Link Account
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">WhatsApp</span>
                {agent.whatsappPhoneNumber ? (
                  <Button
                    onClick={() => setWhatsappModalOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Badge className="mr-2" variant="default">
                      Connected
                    </Badge>
                    Manage
                  </Button>
                ) : (
                  <Button
                    onClick={() => setWhatsappModalOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    Link Account
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Activity Statistics */}
          {stats && (
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Activity Statistics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-bold text-2xl">
                    {stats.totalSessions}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Total Sessions
                  </div>
                </div>
                <div>
                  <div className="font-bold text-2xl">
                    {stats.totalMessages}
                  </div>
                  <div className="text-muted-foreground text-sm">Messages</div>
                </div>
                <div>
                  <div className="font-bold text-2xl">
                    {stats.totalDocuments}
                  </div>
                  <div className="text-muted-foreground text-sm">Documents</div>
                </div>
                <div>
                  <div className="font-bold text-2xl">
                    {stats.totalCalculations}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Calculations
                  </div>
                </div>
                <div>
                  <div className="font-bold text-2xl">
                    {stats.totalListings}
                  </div>
                  <div className="text-muted-foreground text-sm">Listings</div>
                </div>
                <div>
                  <div className="font-bold text-2xl">${stats.totalCost}</div>
                  <div className="text-muted-foreground text-sm">
                    Total Cost
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Timestamps */}
          <Card className="p-4">
            <h3 className="mb-3 font-semibold">Timestamps</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">Created</span>
                <span className="text-sm">
                  {format(new Date(agent.createdAt), "PPP")}
                </span>
              </div>
              {agent.registeredAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Registered
                  </span>
                  <span className="text-sm">
                    {format(new Date(agent.registeredAt), "PPP")}
                  </span>
                </div>
              )}
              {agent.lastActiveAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Last Active
                  </span>
                  <span className="text-sm">
                    {format(new Date(agent.lastActiveAt), "PPP p")}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Notes */}
          {agent.notes && (
            <Card className="p-4">
              <h3 className="mb-3 font-semibold">Notes</h3>
              <p className="text-muted-foreground text-sm">{agent.notes}</p>
            </Card>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={() => setEditModalOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Agent
            </Button>
            <Button variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Send Invite
            </Button>
            <Button className="text-red-600" variant="outline">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>

      {/* Agent Edit Modal */}
      <AgentEditModal
        agent={agent}
        onOpenChange={setEditModalOpen}
        onSuccess={() => {
          onRefresh();
          fetchAgentStats(); // Refresh stats after edit
        }}
        open={editModalOpen}
      />

      {/* Platform Linking Modals */}
      <LinkTelegramModal
        agentId={agent.id}
        agentName={agent.fullName}
        currentTelegramUserId={agent.telegramUserId}
        onOpenChange={setTelegramModalOpen}
        onSuccess={() => {
          onRefresh();
          fetchAgentStats();
        }}
        open={telegramModalOpen}
      />

      <LinkWhatsAppModal
        agentId={agent.id}
        agentName={agent.fullName}
        currentWhatsAppPhone={agent.whatsappPhoneNumber}
        onOpenChange={setWhatsappModalOpen}
        onSuccess={() => {
          onRefresh();
          fetchAgentStats();
        }}
        open={whatsappModalOpen}
      />
    </Sheet>
  );
}
