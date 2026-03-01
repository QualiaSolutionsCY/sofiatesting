import { gte, isNull, sql } from "drizzle-orm";
import { FileText, Home, MessageSquare, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import {
  message,
  propertyListing,
  user,
} from "@/lib/db/schema";

type DashboardOverviewProps = {
  userId: string;
};

export async function DashboardOverview({
  userId: _userId,
}: DashboardOverviewProps) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get metrics in parallel
  const [
    totalMessages,
    totalListings,
    totalUsers,
    messagesLast30Days,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(message)
      .then((r) => r[0]?.count || 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(propertyListing)
      .where(isNull(propertyListing.deletedAt))
      .then((r) => r[0]?.count || 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .then((r) => r[0]?.count || 0),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(message)
      .where(gte(message.createdAt, thirtyDaysAgo))
      .then((r) => r[0]?.count || 0),
  ]);

  const metrics = [
    {
      title: "Total Messages",
      value: totalMessages.toLocaleString(),
      description: `${messagesLast30Days.toLocaleString()} in last 30 days`,
      icon: MessageSquare,
    },
    {
      title: "Documents Generated",
      value: "0",
      description: "0 in last 30 days",
      icon: FileText,
    },
    {
      title: "Property Listings",
      value: totalListings.toLocaleString(),
      description: "Active listings",
      icon: Home,
    },
    {
      title: "Total Users",
      value: totalUsers.toLocaleString(),
      description: "Registered users",
      icon: Users,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">
              {metric.title}
            </CardTitle>
            <metric.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{metric.value}</div>
            <p className="text-muted-foreground text-xs">
              {metric.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
