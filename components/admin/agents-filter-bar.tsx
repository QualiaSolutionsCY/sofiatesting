"use client";

import debounce from "lodash/debounce";
import {
  CheckCircle2,
  Download,
  Mail,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AgentCreateModal } from "@/components/admin/agent-create-modal";
import {
  BulkActivateDialog,
  BulkDeactivateDialog,
  BulkPermanentDeleteDialog,
  BulkSendInvitesDialog,
} from "@/components/admin/bulk-action-dialogs";

const ImportAgentsModal = dynamic(
  () =>
    import("@/components/admin/import-agents-modal").then((mod) => ({
      default: mod.ImportAgentsModal,
    })),
  { ssr: false }
);

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AgentsFilterBarProps = {
  searchParams: {
    page?: string;
    limit?: string;
    region?: string;
    role?: string;
    isActive?: string;
    search?: string;
  };
  onRefresh: () => void;
  selectedIds: string[];
  onExportCSV?: () => void;
  onClearSelection?: () => void;
};

const REGIONS = [
  "All",
  "Limassol",
  "Paphos",
  "Larnaca",
  "Famagusta",
  "Nicosia",
];
const ROLES = [
  { value: "all", label: "All Roles" },
  { value: "agent", label: "Agent" },
  { value: "manager", label: "Manager" },
  { value: "management", label: "Management" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export function AgentsFilterBar({
  searchParams,
  onRefresh,
  selectedIds,
  onExportCSV,
  onClearSelection,
}: AgentsFilterBarProps) {
  const router = useRouter();
  const selectedCount = selectedIds.length;
  const [searchValue, setSearchValue] = useState(searchParams.search || "");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sendInvitesDialogOpen, setSendInvitesDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [permanentDeleteDialogOpen, setPermanentDeleteDialogOpen] =
    useState(false);

  const handleBulkSuccess = () => {
    onRefresh();
    onClearSelection?.();
  };

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      const params = new URLSearchParams(window.location.search);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      params.set("page", "1"); // Reset to first page on search
      router.push(`?${params.toString()}`);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(searchValue);
  }, [searchValue, debouncedSearch]);

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === "all" || value === "All") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set("page", "1"); // Reset to first page on filter change
    router.push(`?${params.toString()}`);
  };

  const handleClearFilters = () => {
    setSearchValue("");
    router.push("/admin/agents-registry");
  };

  return (
    <div className="space-y-4">
      {/* Top action bar: primary CTAs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setCreateModalOpen(true)} size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add agent
          </Button>
          <Button
            onClick={() => setImportModalOpen(true)}
            size="sm"
            variant="outline"
          >
            <Download className="mr-2 h-4 w-4" />
            Import from Excel
          </Button>
        </div>
        <Button
          aria-label="Refresh"
          onClick={onRefresh}
          size="sm"
          variant="outline"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border bg-card/40 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by name or email…"
              value={searchValue}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            onValueChange={(value) => handleFilterChange("region", value)}
            value={searchParams.region || "All"}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((region) => (
                <SelectItem key={region} value={region}>
                  {region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => handleFilterChange("role", value)}
            value={searchParams.role || "all"}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            onValueChange={(value) => handleFilterChange("isActive", value)}
            value={searchParams.isActive || "all"}
          >
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            className="w-full sm:w-auto"
            onClick={handleClearFilters}
            size="sm"
            variant="outline"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary text-xs">
              {selectedCount}
            </div>
            <div className="font-medium text-sm">
              agent{selectedCount === 1 ? "" : "s"} selected
            </div>
            {onClearSelection && (
              <button
                className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
                onClick={onClearSelection}
                type="button"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setSendInvitesDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <Mail className="mr-2 h-4 w-4" />
              Send invites
            </Button>
            <Button onClick={onExportCSV} size="sm" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => setActivateDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
              Activate
            </Button>
            <Button
              className="text-red-600 hover:text-red-700"
              onClick={() => setDeactivateDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Deactivate
            </Button>
            <Button
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setPermanentDeleteDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete permanently
            </Button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ImportAgentsModal
        onOpenChange={setImportModalOpen}
        onSuccess={onRefresh}
        open={importModalOpen}
      />

      {/* Create Modal */}
      <AgentCreateModal
        onOpenChange={setCreateModalOpen}
        onSuccess={onRefresh}
        open={createModalOpen}
      />

      {/* Bulk Action Dialogs */}
      <BulkSendInvitesDialog
        onOpenChange={setSendInvitesDialogOpen}
        onSuccess={handleBulkSuccess}
        open={sendInvitesDialogOpen}
        selectedIds={selectedIds}
      />

      <BulkDeactivateDialog
        onOpenChange={setDeactivateDialogOpen}
        onSuccess={handleBulkSuccess}
        open={deactivateDialogOpen}
        selectedIds={selectedIds}
      />

      <BulkActivateDialog
        onOpenChange={setActivateDialogOpen}
        onSuccess={handleBulkSuccess}
        open={activateDialogOpen}
        selectedIds={selectedIds}
      />

      <BulkPermanentDeleteDialog
        onOpenChange={setPermanentDeleteDialogOpen}
        onSuccess={handleBulkSuccess}
        open={permanentDeleteDialogOpen}
        selectedIds={selectedIds}
      />
    </div>
  );
}
