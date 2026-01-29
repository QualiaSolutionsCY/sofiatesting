// Prevent static generation - this page needs real-time data
export const dynamic = "force-dynamic";

import { format, subHours, startOfHour } from "date-fns";
import { desc, gte, sql } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { OverviewChart } from "@/components/admin/charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { systemHealthLog } from "@/lib/db/schema";

async function getStatusData() {
  // Get latest status for each service
  const services = [
    "telegram",
    "whatsapp",
    "zyprus",
    "ai_gateway",
    "database",
    "redis",
  ];

  const latestStatus = await Promise.all(
    services.map(async (service) => {
      const [log] = await db
        .select()
        .from(systemHealthLog)
        .where(sql`${systemHealthLog.service} = ${service}`)
        .orderBy(desc(systemHealthLog.timestamp))
        .limit(1);

      return {
        service,
        status: log?.status || "unknown",
        latency: log?.responseTimeMs || 0,
        lastChecked: log?.timestamp || new Date(),
      };
    })
  );

  // Get real hourly uptime data from past 24 hours
  const twentyFourHoursAgo = subHours(new Date(), 24);
  const hourlyLogs = await db
    .select({
      hour: sql<string>`date_trunc('hour', ${systemHealthLog.timestamp})`,
      totalChecks: sql<number>`count(*)`,
      healthyChecks: sql<number>`sum(case when ${systemHealthLog.status} = 'healthy' then 1 else 0 end)`,
    })
    .from(systemHealthLog)
    .where(gte(systemHealthLog.timestamp, twentyFourHoursAgo))
    .groupBy(sql`date_trunc('hour', ${systemHealthLog.timestamp})`)
    .orderBy(sql`date_trunc('hour', ${systemHealthLog.timestamp})`);

  // Convert to chart format with uptime percentage
  const uptimeData = hourlyLogs.length > 0
    ? hourlyLogs.map((log) => ({
        name: format(new Date(log.hour), "HH:00"),
        total: log.totalChecks > 0 ? (log.healthyChecks / log.totalChecks) * 100 : 0,
      }))
    : // Fallback: show empty data if no logs exist yet
      Array.from({ length: 24 }, (_, i) => ({
        name: format(subHours(startOfHour(new Date()), 23 - i), "HH:00"),
        total: 0,
      }));

  return { latestStatus, uptimeData };
}

export default async function StatusPage() {
  const { latestStatus, uptimeData } = await getStatusData();

  return (
    <div className="space-y-6 p-8 pt-6">
      <div>
        <h2 className="font-bold text-3xl tracking-tight">System Status</h2>
        <p className="text-muted-foreground">
          Real-time monitoring of system services and infrastructure.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {latestStatus.map((item) => (
          <Card className="border-l-4 border-l-primary" key={item.service}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-medium text-sm capitalize">
                {item.service.replace("_", " ")}
              </CardTitle>
              {item.status === "healthy" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : item.status === "degraded" ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="font-bold text-2xl capitalize">{item.status}</div>
              <p className="mt-1 text-muted-foreground text-xs">
                Latency: {item.latency}ms
              </p>
              <p className="text-muted-foreground text-xs">
                Last checked: {format(new Date(item.lastChecked), "HH:mm:ss")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <OverviewChart
          data={uptimeData}
          description="Average system availability percentage"
          title="System Uptime (24h)"
        />

        <Card>
          <CardHeader>
            <CardTitle>Incidents</CardTitle>
            <CardDescription>Recent system alerts and outages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-8 text-center text-muted-foreground">
              No active incidents reported.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
