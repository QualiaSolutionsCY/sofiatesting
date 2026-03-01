import { Bot, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function AgentMetrics() {
  const metrics = [
    {
      title: "Total Executions (24h)",
      value: "0",
      description: "Agent interactions",
      icon: Bot,
    },
    {
      title: "Success Rate",
      value: "0.0%",
      description: "0 successful",
      icon: CheckCircle2,
    },
    {
      title: "Avg Duration",
      value: "0ms",
      description: "Last 24 hours",
      icon: Clock,
    },
    {
      title: "Failures (24h)",
      value: "0",
      description: "Error executions",
      icon: XCircle,
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
