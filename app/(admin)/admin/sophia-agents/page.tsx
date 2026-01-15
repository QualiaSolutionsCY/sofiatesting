"use client";

import { format } from "date-fns";
import {
  CheckCircle2,
  Edit,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SophiaAgent = {
  id: string;
  full_name: string;
  mobile: string;
  communication_email: string;
  listing_owner_email: string | null;
  region: "paphos" | "limassol" | "larnaca" | "nicosia" | "famagusta" | "all";
  role: "management" | "manager" | "agent";
  can_upload: boolean;
  is_active: boolean;
  can_receive_leads: boolean;
  telegram_user_id: number | null;
  created_at: string;
};

type AgentUploadStats = {
  agent_id: string;
  agent_name: string;
  total_uploads: number;
  successful_uploads: number;
  failed_uploads: number;
  last_upload_at: string | null;
  upload_history: {
    id: string;
    property_name: string;
    status: string;
    created_at: string;
  }[];
};

const REGIONS = [
  { value: "paphos", label: "Paphos" },
  { value: "limassol", label: "Limassol" },
  { value: "larnaca", label: "Larnaca" },
  { value: "nicosia", label: "Nicosia" },
  { value: "famagusta", label: "Famagusta" },
  { value: "all", label: "All Regions" },
] as const;

const ROLES = [
  { value: "management", label: "Management" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
] as const;

const roleColors = {
  management: "bg-purple-500",
  manager: "bg-blue-500",
  agent: "bg-gray-500",
};

export default function SophiaAgentsPage() {
  const [agents, setAgents] = useState<SophiaAgent[]>([]);
  const [uploadStats, setUploadStats] = useState<AgentUploadStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SophiaAgent | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    mobile: "",
    communication_email: "",
    listing_owner_email: "",
    region: "limassol" as SophiaAgent["region"],
    role: "agent" as SophiaAgent["role"],
    can_upload: true,
    is_active: true,
    can_receive_leads: true,
  });

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sophia-agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents);
        setUploadStats(data.uploadStats || []);
      } else {
        toast.error("Failed to fetch agents");
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
      toast.error("Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreateAgent = async () => {
    try {
      const res = await fetch("/api/admin/sophia-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success("Agent added successfully");
        setIsCreateDialogOpen(false);
        resetForm();
        fetchAgents();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create agent");
      }
    } catch {
      toast.error("Failed to create agent");
    }
  };

  const handleUpdateAgent = async () => {
    if (!selectedAgent) return;

    try {
      const res = await fetch(`/api/admin/sophia-agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success("Agent updated successfully");
        setIsEditDialogOpen(false);
        setSelectedAgent(null);
        fetchAgents();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update agent");
      }
    } catch {
      toast.error("Failed to update agent");
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedAgent) return;

    try {
      const res = await fetch(`/api/admin/sophia-agents/${selectedAgent.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("Agent removed successfully");
        setIsDeleteDialogOpen(false);
        setSelectedAgent(null);
        fetchAgents();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete agent");
      }
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  const handleToggleActive = async (agent: SophiaAgent) => {
    try {
      const res = await fetch(`/api/admin/sophia-agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !agent.is_active }),
      });

      if (res.ok) {
        toast.success(agent.is_active ? "Agent deactivated" : "Agent activated");
        fetchAgents();
      }
    } catch {
      toast.error("Failed to update agent status");
    }
  };

  const handleToggleUpload = async (agent: SophiaAgent) => {
    try {
      const res = await fetch(`/api/admin/sophia-agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_upload: !agent.can_upload }),
      });

      if (res.ok) {
        toast.success(
          agent.can_upload
            ? "Upload permission revoked"
            : "Upload permission granted"
        );
        fetchAgents();
      }
    } catch {
      toast.error("Failed to update upload permission");
    }
  };

  const openEditDialog = (agent: SophiaAgent) => {
    setSelectedAgent(agent);
    setFormData({
      full_name: agent.full_name,
      mobile: agent.mobile,
      communication_email: agent.communication_email,
      listing_owner_email: agent.listing_owner_email || "",
      region: agent.region,
      role: agent.role,
      can_upload: agent.can_upload,
      is_active: agent.is_active,
      can_receive_leads: agent.can_receive_leads,
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      full_name: "",
      mobile: "",
      communication_email: "",
      listing_owner_email: "",
      region: "limassol",
      role: "agent",
      can_upload: true,
      is_active: true,
      can_receive_leads: true,
    });
  };

  // Stats calculations
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.is_active).length;
  const agentsWithUpload = agents.filter((a) => a.can_upload).length;
  const agentsByRegion = agents.reduce(
    (acc, agent) => {
      acc[agent.region] = (acc[agent.region] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Sophia WhatsApp Agents</h1>
          <p className="text-muted-foreground">
            Manage agents authorized to use SOPHIA on WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAgents} size="icon" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Agent
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{totalAgents}</div>
            <p className="text-muted-foreground text-xs">Registered agents</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Active Agents</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{activeAgents}</div>
            <p className="text-muted-foreground text-xs">
              {totalAgents > 0
                ? Math.round((activeAgents / totalAgents) * 100)
                : 0}
              % active
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Upload Permission
            </CardTitle>
            <Upload className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{agentsWithUpload}</div>
            <p className="text-muted-foreground text-xs">Can upload listings</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Top Region</CardTitle>
            <Users className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl capitalize">
              {Object.entries(agentsByRegion).sort(
                ([, a], [, b]) => b - a
              )[0]?.[0] || "N/A"}
            </div>
            <p className="text-muted-foreground text-xs">Most agents</p>
          </CardContent>
        </Card>
      </div>

      <Tabs className="space-y-4" defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agent List</TabsTrigger>
          <TabsTrigger value="stats">Upload Stats</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="agents">
          <Card>
            <CardHeader>
              <CardTitle>Registered Agents</CardTitle>
              <CardDescription>
                Agents authorized to interact with SOPHIA via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Upload</TableHead>
                    <TableHead>Telegram</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        className="py-8 text-center text-muted-foreground"
                        colSpan={8}
                      >
                        No agents found. Add your first agent.
                      </TableCell>
                    </TableRow>
                  ) : (
                    agents.map((agent) => (
                      <TableRow key={agent.id}>
                        <TableCell className="font-medium">
                          {agent.full_name}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {agent.mobile}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {agent.communication_email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {agent.region}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`${roleColors[agent.role]} text-white`}
                            variant="secondary"
                          >
                            {agent.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {agent.is_active ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">Inactive</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={agent.can_upload}
                            onCheckedChange={() => handleToggleUpload(agent)}
                          />
                        </TableCell>
                        <TableCell>
                          {agent.telegram_user_id ? (
                            <Badge variant="default" className="text-xs">
                              Linked
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              Not linked
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => openEditDialog(agent)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(agent)}
                              >
                                {agent.is_active ? (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedAgent(agent);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="stats">
          <Card>
            <CardHeader>
              <CardTitle>Upload Statistics</CardTitle>
              <CardDescription>
                Track who uploaded what and when
              </CardDescription>
            </CardHeader>
            <CardContent>
              {uploadStats.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No upload statistics available yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Total Uploads</TableHead>
                      <TableHead>Successful</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Last Upload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadStats.map((stat) => (
                      <TableRow key={stat.agent_id}>
                        <TableCell className="font-medium">
                          {stat.agent_name}
                        </TableCell>
                        <TableCell>{stat.total_uploads}</TableCell>
                        <TableCell className="text-green-600">
                          {stat.successful_uploads}
                        </TableCell>
                        <TableCell className="text-red-600">
                          {stat.failed_uploads}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              stat.total_uploads > 0 &&
                              stat.successful_uploads / stat.total_uploads >= 0.8
                                ? "default"
                                : "secondary"
                            }
                          >
                            {stat.total_uploads > 0
                              ? Math.round(
                                  (stat.successful_uploads / stat.total_uploads) *
                                    100
                                )
                              : 0}
                            %
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {stat.last_upload_at
                            ? format(
                                new Date(stat.last_upload_at),
                                "MMM d, HH:mm"
                              )
                            : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Agent Dialog */}
      <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Agent</DialogTitle>
            <DialogDescription>
              Add a new agent to the SOPHIA WhatsApp authorized list
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                placeholder="Enter agent's full name"
                value={formData.full_name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mobile">Mobile *</Label>
              <Input
                id="mobile"
                onChange={(e) =>
                  setFormData({ ...formData, mobile: e.target.value })
                }
                placeholder="+357 XX XXX XXX"
                value={formData.mobile}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="communication_email">Email *</Label>
              <Input
                id="communication_email"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    communication_email: e.target.value,
                  })
                }
                placeholder="agent@zyprus.com"
                type="email"
                value={formData.communication_email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="listing_owner_email">
                Listing Owner Email (optional)
              </Label>
              <Input
                id="listing_owner_email"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    listing_owner_email: e.target.value,
                  })
                }
                placeholder="Different email for listing ownership"
                type="email"
                value={formData.listing_owner_email}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Region *</Label>
                <Select
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      region: value as SophiaAgent["region"],
                    })
                  }
                  value={formData.region}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Role *</Label>
                <Select
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      role: value as SophiaAgent["role"],
                    })
                  }
                  value={formData.role}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label htmlFor="can_upload">Upload Permission</Label>
                <span className="text-muted-foreground text-xs">
                  Can upload property listings
                </span>
              </div>
              <Switch
                checked={formData.can_upload}
                id="can_upload"
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, can_upload: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label htmlFor="can_receive_leads">Receive Leads</Label>
                <span className="text-muted-foreground text-xs">
                  Can receive forwarded leads
                </span>
              </div>
              <Switch
                checked={formData.can_receive_leads}
                id="can_receive_leads"
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, can_receive_leads: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !formData.full_name ||
                !formData.mobile ||
                !formData.communication_email
              }
              onClick={handleCreateAgent}
            >
              Add Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Dialog */}
      <Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>
              Update agent information and permissions
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit_full_name">Full Name *</Label>
              <Input
                id="edit_full_name"
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                value={formData.full_name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_mobile">Mobile *</Label>
              <Input
                id="edit_mobile"
                onChange={(e) =>
                  setFormData({ ...formData, mobile: e.target.value })
                }
                value={formData.mobile}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_communication_email">Email *</Label>
              <Input
                id="edit_communication_email"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    communication_email: e.target.value,
                  })
                }
                type="email"
                value={formData.communication_email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit_listing_owner_email">
                Listing Owner Email
              </Label>
              <Input
                id="edit_listing_owner_email"
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    listing_owner_email: e.target.value,
                  })
                }
                type="email"
                value={formData.listing_owner_email}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Region *</Label>
                <Select
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      region: value as SophiaAgent["region"],
                    })
                  }
                  value={formData.region}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONS.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Role *</Label>
                <Select
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      role: value as SophiaAgent["role"],
                    })
                  }
                  value={formData.role}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit_is_active">Active Status</Label>
              <Switch
                checked={formData.is_active}
                id="edit_is_active"
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit_can_upload">Upload Permission</Label>
              <Switch
                checked={formData.can_upload}
                id="edit_can_upload"
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, can_upload: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit_can_receive_leads">Receive Leads</Label>
              <Switch
                checked={formData.can_receive_leads}
                id="edit_can_receive_leads"
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, can_receive_leads: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsEditDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateAgent}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedAgent?.full_name} from
              the SOPHIA authorized list? They will no longer be able to use
              SOPHIA via WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedAgent(null);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleDeleteAgent} variant="destructive">
              Remove Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
