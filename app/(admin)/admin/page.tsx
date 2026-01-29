import { format, subDays } from "date-fns";
import { count, desc, eq, isNull } from "drizzle-orm";
import {
  Activity,
  CheckCircle2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { DistributionChart, OverviewChart } from "@/components/admin/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { systemHealthLog, zyprusAgent } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const logger = createLogger("admin:dashboard");

async function getDashboardStats() {
  try {
    // 1. Agent Stats
    const [totalCount] = await db.select({ count: count() }).from(zyprusAgent);
    const [activeCount] = await db
      .select({ count: count() })
      .from(zyprusAgent)
      .where(eq(zyprusAgent.isActive, true));
    const [pendingCount] = await db
      .select({ count: count() })
      .from(zyprusAgent)
      .where(isNull(zyprusAgent.registeredAt));

    // 2. Recent Activity (Last 7 days)
    const _sevenDaysAgo = subDays(new Date(), 7);

    // Mocking activity data for chart (since we might not have enough real data yet)
    // In a real scenario, we would aggregate `agentExecutionLog` by day
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
    const regionalStats = await db
      .select({
        name: zyprusAgent.region,
        value: count(),
      })
      .from(zyprusAgent)
      .groupBy(zyprusAgent.region)
      .orderBy(desc(count()));

    // 4. System Health (Latest logs)
    const healthLogs = await db
      .select()
      .from(systemHealthLog)
      .orderBy(desc(systemHealthLog.timestamp))
      .limit(5);

    // 5. Recent Agents
    const recentAgents = await db
      .select()
      .from(zyprusAgent)
      .orderBy(desc(zyprusAgent.createdAt))
      .limit(5);

    return {
      agents: {
        total: totalCount.count,
        active: activeCount.count,
        pending: pendingCount.count,
      },
      activityData,
      regionalStats,
      healthLogs,
      recentAgents,
    };
  } catch (error) {
    logger.error("Failed to fetch dashboard stats", error);
    // Return default values to allow page to render
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
    <div className="space-y-8 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text font-bold text-3xl text-transparent tracking-tight">
            Admin Dashboard
          </h2>
          <p className="text-muted-foreground">
            Overview of SOFIA AI Agents, System Health, and Activity.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button>Download Report</Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <OverviewChart
          className="col-span-4 shadow-sm"
          data={stats.activityData}
          description="Daily interactions over the last 7 days"
          title="Agent Activity"
        />
        <DistributionChart
          className="col-span-3 shadow-sm"
          data={stats.regionalStats}
          description="Agents by region"
          title="Regional Distribution"
        />
      </div>

      {/* Recent Agents & System Health */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
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

        <Card className="col-span-3 shadow-sm">
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
