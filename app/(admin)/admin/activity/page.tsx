import "server-only";

// Prevent static generation - this page needs real-time data
export const dynamic = "force-dynamic";

import { format, formatDistanceToNow } from "date-fns";
import { Smartphone, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAdminSupabase } from "@/lib/supabase/admin";

async function getActivityData() {
  const supabase = getAdminSupabase();

  // 1. Get Online Agents (active in last 15 minutes) - checking whatsapp_analytics instead
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Since we don't have last_active_at populated, we'll show recently active agents from whatsapp_analytics
  const { data: recentActivity } = await supabase
    .from("whatsapp_analytics")
    .select("agent_id, phone_number, created_at")
    .gte("created_at", fifteenMinutesAgo)
    .order("created_at", { ascending: false });

  // Get unique agent IDs from recent activity
  const activeAgentIds = [...new Set((recentActivity || []).map(a => a.agent_id).filter(Boolean))];

  let onlineAgents: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string | null;
    region: string | null;
    lastActiveAt: string | null;
  }> = [];

  if (activeAgentIds.length > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id, full_name, communication_email, region, role")
      .in("id", activeAgentIds);

    onlineAgents = (agents || []).map((a) => ({
      id: a.id,
      fullName: a.full_name,
      email: a.communication_email || "",
      role: a.role,
      region: a.region,
      lastActiveAt: recentActivity?.find(r => r.agent_id === a.id)?.created_at || null,
    }));
  }

  // 2. Get Recent WhatsApp Messages from chat_history (has actual message content)
  const { data: chatMessages } = await supabase
    .from("chat_history")
    .select("id, role, parts, created_at, phone_number")
    .order("created_at", { ascending: false })
    .limit(50);

  const formattedMessages = (chatMessages || []).map((msg) => {
    // Extract text from parts array
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const textPart = parts.find((p: any) => p.text)?.text || "";
    // Skip empty messages or system messages
    const displayText = textPart.trim() || (msg.role === "user" ? "[Media/Attachment]" : "");

    return {
      id: msg.id,
      action: msg.role === "user" ? "message_received" : "message_sent",
      timestamp: msg.created_at,
      metadata: {
        from: msg.phone_number || "Unknown",
        message: displayText,
      },
    };
  }).filter((msg) => msg.metadata.message !== ""); // Filter out empty messages

  return { onlineAgents, recentMessages: formattedMessages };
}

export default async function ActivityPage() {
  const { onlineAgents, recentMessages } = await getActivityData();

  return (
    <div className="space-y-6 p-8 pt-6">
      <div>
        <h2 className="font-bold text-3xl tracking-tight">Live Activity</h2>
        <p className="text-muted-foreground">
          Real-time monitoring of agent presence and WhatsApp conversations.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Online Agents Column */}
        <Card className="h-[calc(100vh-200px)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Online Agents
              <Badge className="ml-2" variant="secondary">
                {onlineAgents.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Agents active in the last 15 minutes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-300px)] pr-4">
              {onlineAgents.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No agents currently online.
                </div>
              ) : (
                <div className="space-y-4">
                  {onlineAgents.map((agent) => (
                    <div
                      className="flex items-center justify-between rounded-lg border bg-card/50 p-4"
                      key={agent.id}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarImage
                            src={`https://avatar.vercel.sh/${agent.email}`}
                          />
                          <AvatarFallback>
                            {agent.fullName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{agent.fullName}</p>
                          <p className="text-muted-foreground text-sm">
                            {agent.role} • {agent.region}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 font-medium text-green-500 text-sm">
                          <span className="relative mr-1 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                          </span>
                          Online
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {agent.lastActiveAt
                            ? formatDistanceToNow(
                                new Date(agent.lastActiveAt),
                                { addSuffix: true }
                              )
                            : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* WhatsApp Feed Column */}
        <Card className="h-[calc(100vh-200px)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              WhatsApp Feed
            </CardTitle>
            <CardDescription>Live conversation stream</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-300px)] pr-4">
              {recentMessages.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No recent WhatsApp messages.
                </div>
              ) : (
                <div className="space-y-4">
                  {recentMessages.map((msg) => {
                    const metadata = msg.metadata as { from?: string; message?: string };
                    const isReceived = msg.action === "message_received";

                    return (
                      <div
                        className={`flex ${isReceived ? "justify-start" : "justify-end"}`}
                        key={msg.id}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            isReceived
                              ? "rounded-tl-none bg-muted text-foreground"
                              : "rounded-tr-none bg-primary text-primary-foreground"
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-medium text-xs opacity-70">
                              {isReceived
                                ? metadata?.from || "Unknown"
                                : "Sophia AI"}
                            </span>
                            <span className="text-[10px] opacity-50">
                              {format(new Date(msg.timestamp), "HH:mm")}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {metadata?.message || "-"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
