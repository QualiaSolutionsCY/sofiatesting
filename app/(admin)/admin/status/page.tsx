// Prevent static generation - this page needs real-time data
export const dynamic = "force-dynamic";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function StatusPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="font-bold text-xl tracking-tight md:text-3xl">
          System Status
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          Real-time monitoring of system services and infrastructure.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Monitoring</CardTitle>
          <CardDescription>Health checks and uptime monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[400px] items-center justify-center">
            <p className="text-center text-muted-foreground">
              Analytics feature coming soon
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
