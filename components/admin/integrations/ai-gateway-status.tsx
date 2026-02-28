import { Brain, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AIGatewayStatus() {
  const hasAIGatewayKey = !!process.env.AI_GATEWAY_API_KEY;

  // AI Gateway is MANDATORY - application won't work without it
  const isHealthy = hasAIGatewayKey;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Gateway (Vercel)
        </CardTitle>
        {isHealthy ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAIGatewayKey ? (
          <>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Configuration</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="default">Active</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-mono">Vercel AI Gateway</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold text-sm">Available Models</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Claude Haiku 4.5</span>
                  <Badge className="text-xs" variant="outline">
                    Default
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Claude Sonnet 4.5</span>
                  <Badge className="text-xs" variant="outline">
                    Premium
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>GPT-4o Mini</span>
                  <Badge className="text-xs" variant="outline">
                    Budget
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold text-sm">Features</h4>
              <ul className="space-y-1 text-muted-foreground text-xs">
                <li>✓ Streaming responses (Server-Sent Events)</li>
                <li>✓ Tool execution (Cyprus calculators)</li>
                <li>✓ Prompt caching (Anthropic models)</li>
                <li>✓ Token tracking and analytics</li>
                <li>✓ Rate limiting per user type</li>
              </ul>
            </div>
          </>
        ) : (
          <div className="rounded bg-destructive/10 p-4">
            <p className="font-semibold text-destructive text-sm">
              CRITICAL: AI Gateway is not configured!
            </p>
            <p className="mt-1 text-destructive text-xs">
              SOPHIA requires AI_GATEWAY_API_KEY to function. The application
              will not work without this configuration.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
