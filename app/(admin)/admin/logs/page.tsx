// Prevent static generation - this page needs real-time data
export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = {
  searchParams: Promise<{
    page?: string;
    agentType?: string;
    status?: string;
    search?: string;
  }>;
};

export default async function LogsPage({ searchParams }: PageProps) {
  await searchParams;

  return (
    <div className="space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-3xl tracking-tight">Agent Logs</h2>
          <p className="text-muted-foreground">
            Detailed execution logs of all agent interactions.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution History</CardTitle>
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
