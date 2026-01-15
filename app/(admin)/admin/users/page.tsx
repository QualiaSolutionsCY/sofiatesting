"use client";

import { format } from "date-fns";
import {
  Edit,
  Eye,
  MoreHorizontal,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "superadmin" | "admin" | "viewer";
  is_active: boolean;
  permissions: Record<string, boolean>;
  last_login: string | null;
  created_at: string;
  updated_at: string;
};

type SophiaUser = {
  id: string;
  phone_number: string;
  name: string | null;
  preferred_language: string;
  communication_style: string;
  total_messages: number;
  first_contact: string;
  last_contact: string;
};

const roleColors = {
  superadmin: "bg-purple-500",
  admin: "bg-blue-500",
  viewer: "bg-gray-500",
};

export default function UsersPage() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [sophiaUsers, setSophiaUsers] = useState<SophiaUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedSophiaUser, setSelectedSophiaUser] =
    useState<SophiaUser | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    role: "viewer" as "superadmin" | "admin" | "viewer",
  });

  const fetchUsers = useCallback(async () => {
    try {
      const [adminRes, sophiaRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/sophia-users"),
      ]);

      if (adminRes.ok) {
        const data = await adminRes.json();
        setAdminUsers(data);
      }

      if (sophiaRes.ok) {
        const data = await sophiaRes.json();
        setSophiaUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async () => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success("User created successfully");
        setIsCreateDialogOpen(false);
        setFormData({ email: "", name: "", role: "viewer" });
        fetchUsers();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create user");
      }
    } catch {
      toast.error("Failed to create user");
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast.success("User updated successfully");
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to update user");
      }
    } catch {
      toast.error("Failed to update user");
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("User deleted successfully");
        setIsDeleteDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const handleDeleteSophiaUser = async () => {
    if (!selectedSophiaUser) {
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/sophia-users/${selectedSophiaUser.id}`,
        {
          method: "DELETE",
        }
      );

      if (res.ok) {
        toast.success("User and conversations deleted");
        setIsDeleteDialogOpen(false);
        setSelectedSophiaUser(null);
        fetchUsers();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !user.is_active }),
      });

      if (res.ok) {
        toast.success(
          user.is_active ? "User deactivated" : "User activated"
        );
        fetchUsers();
      }
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const openEditDialog = (user: AdminUser) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setIsEditDialogOpen(true);
  };

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
          <h1 className="font-bold text-3xl">User Management</h1>
          <p className="text-muted-foreground">
            Manage admin users and view WhatsApp users
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Admin User
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Admin Users</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{adminUsers.length}</div>
            <p className="text-muted-foreground text-xs">
              {adminUsers.filter((u) => u.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">WhatsApp Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{sophiaUsers.length}</div>
            <p className="text-muted-foreground text-xs">
              Total conversations
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Messages</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {sophiaUsers.reduce((acc, u) => acc + u.total_messages, 0)}
            </div>
            <p className="text-muted-foreground text-xs">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Superadmins</CardTitle>
            <Shield className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {adminUsers.filter((u) => u.role === "superadmin").length}
            </div>
            <p className="text-muted-foreground text-xs">Full access</p>
          </CardContent>
        </Card>
      </div>

      <Tabs className="space-y-4" defaultValue="admin">
        <TabsList>
          <TabsTrigger value="admin">Admin Users</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp Users</TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="admin">
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>
                Users with access to this admin panel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge
                          className={`${roleColors[user.role]} text-white`}
                          variant="secondary"
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.is_active ? "default" : "secondary"}
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEditDialog(user)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.is_active ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-4" value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle>WhatsApp Users</CardTitle>
              <CardDescription>
                Users who have interacted with SOPHIA via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>First Contact</TableHead>
                    <TableHead>Last Contact</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sophiaUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.name || "Unknown"}
                      </TableCell>
                      <TableCell>{user.phone_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {user.preferred_language.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">
                          {user.total_messages}
                        </span>
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.first_contact), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.last_contact), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <a
                                href={`/admin/users/${user.id}/conversations`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Conversations
                              </a>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setSelectedSophiaUser(user);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete User & Data
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Admin User</DialogTitle>
            <DialogDescription>
              Create a new admin user with access to this panel
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter name"
                value={formData.name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="Enter email"
                type="email"
                value={formData.email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    role: value as "superadmin" | "admin" | "viewer",
                  })
                }
                value={formData.role}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsCreateDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog onOpenChange={setIsEditDialogOpen} open={isEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Admin User</DialogTitle>
            <DialogDescription>Update user information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                value={formData.name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                type="email"
                value={formData.email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    role: value as "superadmin" | "admin" | "viewer",
                  })
                }
                value={formData.role}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsEditDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateUser}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              {selectedUser
                ? `Are you sure you want to delete ${selectedUser.name}? This action cannot be undone.`
                : selectedSophiaUser
                  ? `Are you sure you want to delete ${selectedSophiaUser.name || selectedSophiaUser.phone_number} and all their conversation history? This action cannot be undone.`
                  : "Are you sure you want to delete this user?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedUser(null);
                setSelectedSophiaUser(null);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={
                selectedUser ? handleDeleteUser : handleDeleteSophiaUser
              }
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
