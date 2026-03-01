import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function SystemHealthCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-center text-muted-foreground text-sm">
            Analytics feature coming soon
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
