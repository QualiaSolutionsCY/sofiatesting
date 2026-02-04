"use client";

import { FileText, Clock, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Prompt = {
  id: string;
  key: string;
  category: string;
  description: string | null;
  priority: number | null;
  version: number;
  contentSize: number;
  updatedAt: string;
  updatedBy: string | null;
};

type PromptListProps = {
  prompts: Prompt[];
  onRefresh?: () => void;
  isLoading?: boolean;
};

const categoryColors: Record<string, string> = {
  core: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  behaviors: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  knowledge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  templates: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? "just now" : `${diffMinutes}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
};

export function PromptList({ prompts, onRefresh, isLoading }: PromptListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">SOPHIA Prompts</h2>
          <p className="text-muted-foreground text-sm">
            Edit prompt sections that control SOPHIA&apos;s behavior
          </p>
        </div>
        {onRefresh && (
          <Button
            disabled={isLoading}
            onClick={onRefresh}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {prompts.map((prompt) => (
          <Link href={`/admin/prompts/${prompt.key}`} key={prompt.id}>
            <Card className="p-4 transition-colors hover:bg-muted/50">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium">{prompt.key}</h3>
                    {prompt.description && (
                      <p className="mt-1 text-muted-foreground text-sm line-clamp-2">
                        {prompt.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          "text-xs",
                          categoryColors[prompt.category] || "bg-gray-100"
                        )}
                        variant="secondary"
                      >
                        {prompt.category}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        v{prompt.version}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatBytes(prompt.contentSize)}
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                <span>Updated {formatDate(prompt.updatedAt)}</span>
                {prompt.updatedBy && (
                  <span className="text-muted-foreground/70">
                    by {prompt.updatedBy}
                  </span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {prompts.length === 0 && (
        <Card className="p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-medium text-lg">No prompts found</h3>
          <p className="mt-2 text-muted-foreground text-sm">
            Check that the sophia_prompts table is properly configured.
          </p>
        </Card>
      )}
    </div>
  );
}
