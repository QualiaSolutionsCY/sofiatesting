import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function AgentExecutionTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Agent Executions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-[300px] items-center justify-center">
          <p className="text-center text-muted-foreground text-sm">
            Analytics feature coming soon
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
