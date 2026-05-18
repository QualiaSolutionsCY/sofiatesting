import "server-only";

import { Suspense } from "react";

export const dynamic = "force-dynamic";

import { MailQuestion, Users, UserCheck } from "lucide-react";
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

  // Build query for the table (respects filters)
  let query = supabase
    .from("agents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (searchParams.region) {
    query = query.eq("region", searchParams.region.toLowerCase());
  }
  if (searchParams.role) {
    query = query.eq("role", searchParams.role);
  }
  if (searchParams.isActive !== undefined) {
    query = query.eq("is_active", searchParams.isActive === "true");
  }
  if (searchParams.search) {
    query = query.or(
      `full_name.ilike.%${searchParams.search}%,communication_email.ilike.%${searchParams.search}%`
    );
  }

  // Metric counts are registry-wide and independent of the table filters
  // so the cards don't silently change when the operator filters the table.
  const [
    listResult,
    { count: totalCount },
    { count: activeCount },
    { count: telegramLinkedCount },
  ] = await Promise.all([
    query,
    supabase.from("agents").select("*", { count: "exact", head: true }),
    supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .not("telegram_user_id", "is", null),
  ]);

  const { data: agents, count, error } = listResult;

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

  const total = totalCount ?? 0;
  const telegramLinked = telegramLinkedCount ?? 0;

  return {
    agents: transformedAgents,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
    metrics: {
      total,
      active: activeCount ?? 0,
      telegramLinked,
      pendingTelegram: Math.max(0, total - telegramLinked),
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
      metrics: { total: 0, active: 0, telegramLinked: 0, pendingTelegram: 0 },
      error: null,
    };
  }

  const inactiveCount = Math.max(
    0,
    (data.metrics.total || 0) - (data.metrics.active || 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
          Agents
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage Zyprus agents across web, WhatsApp and Telegram.
        </p>
      </div>

      <Suspense fallback={<MetricsSkeleton />}>
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            accent="from-slate-500/15 to-slate-500/0"
            icon={<Users className="h-4 w-4 text-slate-600" />}
            label="Total agents"
            tone="text-foreground"
            value={data.metrics.total}
          />
          <MetricCard
            accent="from-emerald-500/20 to-emerald-500/0"
            icon={<UserCheck className="h-4 w-4 text-emerald-600" />}
            label="Active"
            sublabel={
              inactiveCount > 0
                ? `${inactiveCount} inactive`
                : `of ${data.metrics.total}`
            }
            tone="text-emerald-700"
            value={data.metrics.active}
          />
          <MetricCard
            accent="from-amber-500/20 to-amber-500/0"
            icon={<MailQuestion className="h-4 w-4 text-amber-600" />}
            label="Pending Telegram link"
            sublabel={`${data.metrics.telegramLinked} linked`}
            tone="text-amber-700"
            value={data.metrics.pendingTelegram}
          />
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

function MetricCard({
  label,
  value,
  icon,
  accent,
  tone,
  sublabel,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  tone: string;
  sublabel?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`}
      />
      <div className="relative flex items-center justify-between gap-3 p-5">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {label}
          </span>
          <div className="flex items-baseline gap-2">
            <span className={`font-semibold text-3xl ${tone}`}>{value}</span>
            {sublabel && (
              <span className="text-muted-foreground text-xs">{sublabel}</span>
            )}
          </div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 ring-1 ring-border">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card className="p-5" key={i}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}
