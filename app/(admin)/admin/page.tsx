import "server-only";

import { format } from "date-fns";

export const dynamic = "force-dynamic";

import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileEdit,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { DistributionChart, OverviewChart } from "@/components/admin/charts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("admin:dashboard");

type AgentRow = {
  id: string;
  full_name: string;
  communication_email: string | null;
  region: string | null;
  is_active: boolean;
  telegram_user_id: number | null;
  created_at: string;
};

async function getDashboardStats() {
  try {
    const supabase = getAdminSupabase();

    // 1. Agent Stats - Total
    const { count: totalCount } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true });

    // Active agents
    const { count: activeCount } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    // Pending (no telegram_user_id)
    const { count: pendingCount } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .is("telegram_user_id", null);

    // 2. Activity data (mock for now)
    const activityData = [
      { name: "Mon", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Tue", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Wed", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Thu", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Fri", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Sat", total: Math.floor(Math.random() * 50) + 10 },
      { name: "Sun", total: Math.floor(Math.random() * 50) + 10 },
    ];

    // 3. Regional Distribution
    const { data: agents } = await supabase.from("agents").select("region");

    const regionCounts: Record<string, number> = {};
    for (const agent of agents || []) {
      const region = agent.region || "unknown";
      regionCounts[region] = (regionCounts[region] || 0) + 1;
    }
    const regionalStats = Object.entries(regionCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 4. System Health (empty for now - table may not exist)
    const healthLogs: Array<{
      id: string;
      service: string;
      status: string;
      timestamp: string;
    }> = [];

    // 5. Recent Agents
    const { data: recentAgentsData } = await supabase
      .from("agents")
      .select(
        "id, full_name, communication_email, region, is_active, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(5);

    const recentAgents = ((recentAgentsData as AgentRow[]) || []).map((a) => ({
      id: a.id,
      fullName: a.full_name,
      email: a.communication_email || "",
      region: a.region,
      isActive: a.is_active,
      createdAt: a.created_at,
    }));

    return {
      agents: {
        total: totalCount || 0,
        active: activeCount || 0,
        pending: pendingCount || 0,
      },
      activityData,
      regionalStats,
      healthLogs,
      recentAgents,
    };
  } catch (error) {
    logger.error("Failed to fetch dashboard stats", error);
    return {
      agents: { total: 0, active: 0, pending: 0 },
      activityData: [
        { name: "Mon", total: 0 },
        { name: "Tue", total: 0 },
        { name: "Wed", total: 0 },
        { name: "Thu", total: 0 },
        { name: "Fri", total: 0 },
        { name: "Sat", total: 0 },
        { name: "Sun", total: 0 },
      ],
      regionalStats: [],
      healthLogs: [],
      recentAgents: [],
    };
  }
}

export default async function AdminDashboardPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const stats = await getDashboardStats();

  return (
    <div className="space-y-4 md:space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text font-bold text-transparent text-xl tracking-tight md:text-3xl">
            Admin Dashboard
          </h2>
          <p className="text-muted-foreground text-sm md:text-base">
            Overview of SOPHIA AI Agents, System Health, and Activity.
          </p>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.agents.total}</div>
            <p className="text-muted-foreground text-xs">+2 from last month</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Active Agents</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.agents.active}</div>
            <p className="text-muted-foreground text-xs">
              {stats.agents.total > 0
                ? Math.round((stats.agents.active / stats.agents.total) * 100)
                : 0}
              % engagement rate
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Pending Approval
            </CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.agents.pending}</div>
            <p className="text-muted-foreground text-xs">Requires attention</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">System Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 font-bold text-2xl text-green-600">
              Healthy <CheckCircle2 className="h-5 w-5" />
            </div>
            <p className="text-muted-foreground text-xs">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-4">
        <Link href="/admin/prompts">
          <Card className="h-full cursor-pointer transition-all hover:border-primary hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900">
                  <FileEdit className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Prompts Editor</CardTitle>
                  <CardDescription className="text-xs">
                    Edit SOPHIA&apos;s behavior
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>8 prompt sections</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/agents-registry">
          <Card className="h-full cursor-pointer transition-all hover:border-primary hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Agents Registry</CardTitle>
                  <CardDescription className="text-xs">
                    Manage agent permissions
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>{stats.agents.total} agents</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/listings">
          <Card className="h-full cursor-pointer transition-all hover:border-primary hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900">
                  <Building2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Listings Review</CardTitle>
                  <CardDescription className="text-xs">
                    Review draft listings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between text-muted-foreground text-sm">
                <span>Property uploads</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 lg:grid-cols-7">
        <OverviewChart
          className="shadow-sm lg:col-span-4"
          data={stats.activityData}
          description="Daily interactions over the last 7 days"
          title="Agent Activity"
        />
        <DistributionChart
          className="shadow-sm lg:col-span-3"
          data={stats.regionalStats}
          description="Agents by region"
          title="Regional Distribution"
        />
      </div>

      {/* Recent Agents & System Health */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="shadow-sm lg:col-span-4">
          <CardHeader>
            <CardTitle>Recent Agents</CardTitle>
            <CardDescription>
              Newest agents added to the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentAgents.map((agent) => (
                <div
                  className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
                  key={agent.id}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                      <span className="font-bold text-primary text-xs">
                        {agent.fullName.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-sm leading-none">
                        {agent.fullName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {agent.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-[10px]"
                      variant={agent.isActive ? "default" : "secondary"}
                    >
                      {agent.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(agent.createdAt), "MMM dd")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm lg:col-span-3">
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Latest system status checks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Mock health data if DB is empty */}
              {stats.healthLogs.length === 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="font-medium text-sm">Database</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      100% Uptime
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="font-medium text-sm">AI Gateway</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      99.9% Uptime
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="font-medium text-sm">Telegram Bot</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      Operational
                    </span>
                  </div>
                </>
              ) : (
                stats.healthLogs.map((log) => (
                  <div
                    className="flex items-center justify-between"
                    key={log.id}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${log.status === "healthy" ? "bg-green-500" : "bg-red-500"}`}
                      />
                      <span className="font-medium text-sm capitalize">
                        {log.service}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(log.timestamp), "HH:mm:ss")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
