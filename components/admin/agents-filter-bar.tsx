"use client";

import debounce from "lodash/debounce";
import { Download, Mail, RefreshCw, Search, UserPlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AgentCreateModal } from "@/components/admin/agent-create-modal";
import {
  BulkDeactivateDialog,
  BulkSendInvitesDialog,
} from "@/components/admin/bulk-action-dialogs";

const ImportAgentsModal = dynamic(() => import("@/components/admin/import-agents-modal").then((mod) => ({ default: mod.ImportAgentsModal })), { ssr: false });
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
  selectedCount: number;
  onExportCSV?: () => void;
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
  "All",
  "Normal Agent",
  "Manager Limassol",
  "Manager Paphos",
  "Manager Larnaca",
  "Manager Famagusta",
  "Manager Nicosia",
  "CEO",
  "Listing Admin",
];
const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export function AgentsFilterBar({
  searchParams,
  onRefresh,
  selectedCount,
  onExportCSV,
}: AgentsFilterBarProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(searchParams.search || "");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sendInvitesDialogOpen, setSendInvitesDialogOpen] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

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
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search by name or email..."
            value={searchValue}
          />
        </div>

        <Select
          onValueChange={(value) => handleFilterChange("region", value)}
          value={searchParams.region || "All"}
        >
          <SelectTrigger className="w-[180px]">
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
          value={searchParams.role || "All"}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) => handleFilterChange("isActive", value)}
          value={searchParams.isActive || "all"}
        >
          <SelectTrigger className="w-[150px]">
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

        <Button onClick={handleClearFilters} size="sm" variant="outline">
          Clear Filters
        </Button>

        <Button onClick={onRefresh} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-4">
          <div className="font-medium text-sm">
            {selectedCount} agent{selectedCount > 1 ? "s" : ""} selected
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setSendInvitesDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              <Mail className="mr-2 h-4 w-4" />
              Send Invites
            </Button>
            <Button onClick={onExportCSV} size="sm" variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              className="text-red-600"
              onClick={() => setDeactivateDialogOpen(true)}
              size="sm"
              variant="outline"
            >
              Deactivate
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button onClick={() => setCreateModalOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add New Agent
        </Button>
        <Button onClick={() => setImportModalOpen(true)} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Import from Excel
        </Button>
      </div>

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
        onSuccess={onRefresh}
        open={sendInvitesDialogOpen}
        selectedCount={selectedCount}
      />

      <BulkDeactivateDialog
        onOpenChange={setDeactivateDialogOpen}
        onSuccess={onRefresh}
        open={deactivateDialogOpen}
        selectedCount={selectedCount}
      />
    </div>
  );
}
