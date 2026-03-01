import "server-only";

import { Suspense } from "react";

export const dynamic = "force-dynamic";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { AgentsRegistryClient } from "./page-client";

type PageProps = {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    region?: string;
    role?: string;
    isActive?: string;
    search?: string;
  }>;
};

type SearchParams = {
  page?: string;
  limit?: string;
  region?: string;
  role?: string;
  isActive?: string;
  search?: string;
};

type AgentRow = {
  id: string;
  full_name: string;
  mobile: string | null;
  communication_email: string | null;
  listing_owner_email: string | null;
  region: string | null;
  role: string | null;
  can_upload: boolean;
  telegram_user_id: number | null;
  is_active: boolean;
  can_receive_leads: boolean;
  zyprus_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  whatsapp_phone_number: string | null;
  last_active_at: string | null;
  invite_sent_at: string | null;
  invite_token: string | null;
  notes: string | null;
  user_id: string | null;
};

async function getAgentsData(searchParams: SearchParams) {
  const page = Number.parseInt(searchParams.page || "1", 10);
  const limit = Number.parseInt(searchParams.limit || "50", 10);
  const offset = (page - 1) * limit;

  const supabase = getAdminSupabase();

  // Build query
  let query = supabase
    .from("agents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (searchParams.region) {
    query = query.eq("region", searchParams.region.toLowerCase());
  }
  if (searchParams.isActive !== undefined) {
    query = query.eq("is_active", searchParams.isActive === "true");
  }

  const { data: agents, count, error } = await query;

  if (error) {
    throw new Error(
      `Supabase query error: ${error.message} (code: ${error.code})`
    );
  }

  // Transform to match expected format
  const transformedAgents = (agents as AgentRow[]).map((a) => ({
    id: a.id,
    userId: a.user_id,
    fullName: a.full_name,
    email: a.communication_email || "",
    phoneNumber: a.mobile,
    region: a.region
      ? a.region.charAt(0).toUpperCase() + a.region.slice(1)
      : "Unknown",
    role: a.role || "agent",
    isActive: a.is_active ?? true,
    canReceiveLeads: a.can_receive_leads ?? true,
    telegramUserId: a.telegram_user_id?.toString() || null,
    whatsappPhoneNumber: a.whatsapp_phone_number,
    lastActiveAt: a.last_active_at ? new Date(a.last_active_at) : null,
    registeredAt: a.telegram_user_id ? new Date(a.created_at) : null,
    inviteSentAt: a.invite_sent_at ? new Date(a.invite_sent_at) : null,
    inviteToken: a.invite_token,
    notes: a.notes,
    createdAt: new Date(a.created_at),
    updatedAt: a.updated_at ? new Date(a.updated_at) : new Date(a.created_at),
  }));

  // Get metrics
  const { count: activeCount } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: pendingCount } = await supabase
    .from("agents")
    .select("*", { count: "exact", head: true })
    .is("telegram_user_id", null);

  return {
    agents: transformedAgents,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
    metrics: {
      total: count || 0,
      active: activeCount || 0,
      pending: pendingCount || 0,
    },
    error: null,
  };
}

export default async function AgentsRegistryPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let data: Awaited<ReturnType<typeof getAgentsData>>;
  try {
    data = await getAgentsData(params);
  } catch {
    data = {
      agents: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      metrics: { total: 0, active: 0, pending: 0 },
      error: null,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Agents Registry</h1>
          <p className="text-muted-foreground">
            Manage Zyprus real estate agents across all platforms
          </p>
        </div>
      </div>

      <Suspense fallback={<MetricsSkeleton />}>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-muted-foreground text-sm">
                Total Agents
              </span>
              <span className="font-bold text-3xl">{data.metrics.total}</span>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-muted-foreground text-sm">
                Active Agents
              </span>
              <span className="font-bold text-3xl text-green-600">
                {data.metrics.active}
              </span>
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-muted-foreground text-sm">
                Pending Registration
              </span>
              <span className="font-bold text-3xl text-orange-600">
                {data.metrics.pending}
              </span>
            </div>
          </Card>
        </div>
      </Suspense>

      <AgentsRegistryClient
        initialAgents={data.agents}
        initialPagination={data.pagination}
        searchParams={params}
      />
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card className="p-6" key={i}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}
