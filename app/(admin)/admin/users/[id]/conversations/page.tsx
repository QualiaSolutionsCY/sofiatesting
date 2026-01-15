"use client";

import { format } from "date-fns";
import { ArrowLeft, Bot, Download, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type Conversation = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  importance: number;
  topics: string[];
};

type UserProfile = {
  id: string;
  phone_number: string;
  name: string | null;
  preferred_language: string;
  communication_style: string;
  total_messages: number;
  first_contact: string;
  last_contact: string;
};

export default function UserConversationsPage() {
  const params = useParams();
  const userId = params.id as string;

  const [user, setUser] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/sophia-users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setConversations(data.conversations);
        } else {
          toast.error("Failed to fetch user data");
        }
      } catch (error) {
        console.error("Error:", error);
        toast.error("Failed to fetch user data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const exportConversations = () => {
    if (!user || conversations.length === 0) {
      return;
    }

    const exportData = conversations.map((c) => ({
      timestamp: c.created_at,
      role: c.role,
      message: c.content,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations-${user.phone_number}-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conversations exported");
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">User not found</p>
        <Button asChild variant="outline">
          <Link href="/admin/users">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Users
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild size="icon" variant="ghost">
            <Link href="/admin/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-bold text-2xl">
              {user.name || "Unknown User"}
            </h1>
            <p className="text-muted-foreground">{user.phone_number}</p>
          </div>
        </div>
        <Button onClick={exportConversations} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-muted-foreground text-sm">Phone</p>
              <p className="font-medium">{user.phone_number}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Language</p>
              <Badge variant="outline">
                {user.preferred_language.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Style</p>
              <Badge variant="secondary">{user.communication_style}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Messages</p>
              <p className="font-bold text-2xl">{user.total_messages}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">First Contact</p>
              <p className="font-medium">
                {format(new Date(user.first_contact), "PPp")}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Last Contact</p>
              <p className="font-medium">
                {format(new Date(user.last_contact), "PPp")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Conversations */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversation History
            </CardTitle>
            <CardDescription>
              {conversations.length} messages in memory
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {conversations.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">
                    No conversation history found
                  </p>
                ) : (
                  conversations.map((msg) => (
                    <div
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row" : "flex-row-reverse"}`}
                      key={msg.id}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          msg.role === "user"
                            ? "bg-blue-100 text-blue-600"
                            : "bg-purple-100 text-purple-600"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`flex-1 rounded-lg p-3 ${
                          msg.role === "user"
                            ? "bg-blue-50 dark:bg-blue-950"
                            : "bg-purple-50 dark:bg-purple-950"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium text-sm">
                            {msg.role === "user" ? "User" : "SOPHIA"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(msg.created_at), "MMM d, HH:mm")}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">
                          {msg.content}
                        </p>
                        {msg.topics && msg.topics.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {msg.topics.map((topic, i) => (
                              <Badge
                                className="text-[10px]"
                                key={i}
                                variant="outline"
                              >
                                {topic}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
