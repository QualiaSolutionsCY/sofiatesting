"use client";

import { format, subDays } from "date-fns";
import {
  Activity,
  MessageSquare,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#0088fe",
  "#00c49f",
];

type Stats = {
  totalAdminUsers: number;
  totalSophiaUsers: number;
  totalAgents: number;
  activeAgents: number;
  totalMessages: number;
  totalTelegramMessages: number;
  totalLeads: number;
  activityData: { name: string; total: number }[];
  topUsers: {
    name: string | null;
    phone_number: string;
    total_messages: number;
    last_contact: string;
  }[];
  regionalStats: { name: string; value: number }[];
};

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          toast.error("Failed to fetch stats");
        }
      } catch (error) {
        console.error("Error:", error);
        toast.error("Failed to fetch stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  const engagementRate =
    stats.totalAgents > 0
      ? Math.round((stats.activeAgents / stats.totalAgents) * 100)
      : 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time insights and performance metrics
          </p>
        </div>
        <Select onValueChange={setTimeRange} value={timeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {stats.totalMessages.toLocaleString()}
            </div>
            <p className="text-muted-foreground text-xs">
              WhatsApp conversations
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Active Users</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.totalSophiaUsers}</div>
            <p className="text-muted-foreground text-xs">
              WhatsApp users engaged
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              Agent Engagement
            </CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{engagementRate}%</div>
            <p className="text-muted-foreground text-xs">
              {stats.activeAgents}/{stats.totalAgents} agents active
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Leads</CardTitle>
            <Zap className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.totalLeads}</div>
            <p className="text-muted-foreground text-xs">
              Telegram lead forwards
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Message Activity
            </CardTitle>
            <CardDescription>Messages per day this week</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer height={300} width="100%">
              <BarChart data={stats.activityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#8884d8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Regional Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Distribution by Region</CardTitle>
            <CardDescription>Active agents per region</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer height={300} width="100%">
              <PieChart>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={stats.regionalStats}
                  dataKey="value"
                  innerRadius={60}
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                  nameKey="name"
                  outerRadius={100}
                >
                  {stats.regionalStats.map((_, index) => (
                    <Cell
                      fill={COLORS[index % COLORS.length]}
                      key={`cell-${index}`}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Users & Activity Timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle>Top Active Users</CardTitle>
            <CardDescription>Users with most messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topUsers.map((user, index) => (
                <div
                  className="flex items-center justify-between"
                  key={user.phone_number}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-white ${
                        index === 0
                          ? "bg-yellow-500"
                          : index === 1
                            ? "bg-gray-400"
                            : index === 2
                              ? "bg-amber-600"
                              : "bg-blue-500"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">
                        {user.name || "Unknown User"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {user.phone_number}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">
                      {user.total_messages} msgs
                    </Badge>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {format(new Date(user.last_contact), "MMM d")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>System Overview</CardTitle>
            <CardDescription>Key system metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>WhatsApp Bot</span>
                </div>
                <Badge variant="default">Online</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span>Telegram Bot</span>
                </div>
                <Badge variant="secondary">Disabled</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>AI Gateway</span>
                </div>
                <Badge variant="default">Operational</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>Supabase</span>
                </div>
                <Badge variant="default">Connected</Badge>
              </div>
              <div className="mt-6 border-t pt-4">
                <p className="mb-2 font-medium text-sm">Platform Breakdown</p>
                <div className="flex gap-4">
                  <div className="flex-1 rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
                    <p className="font-bold text-2xl text-blue-600">
                      {stats.totalMessages}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      WhatsApp Messages
                    </p>
                  </div>
                  <div className="flex-1 rounded-lg bg-purple-50 p-3 dark:bg-purple-950">
                    <p className="font-bold text-2xl text-purple-600">
                      {stats.totalTelegramMessages}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Telegram Messages
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
