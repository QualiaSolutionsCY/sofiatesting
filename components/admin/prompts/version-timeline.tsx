"use client";

import { Check, Clock, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Version = {
  id: string;
  version: number;
  contentSize: number;
  contentPreview: string;
  isActive: boolean;
  isCurrent: boolean;
  updatedAt: string;
  updatedBy: string | null;
  replacedAt: string | null;
};

type VersionTimelineProps = {
  promptKey: string;
  versions: Version[];
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function VersionTimeline({ promptKey, versions }: VersionTimelineProps) {
  const router = useRouter();
  const [rollbackTarget, setRollbackTarget] = useState<Version | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const handleRollback = async () => {
    if (!rollbackTarget) return;

    setIsRollingBack(true);
    try {
      const response = await fetch(`/api/admin/prompts/${promptKey}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: rollbackTarget.id,
          updatedBy: "admin (rollback)",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to rollback");
      }

      const data = await response.json();
      toast.success(data.message);
      setRollbackTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rollback"
      );
    } finally {
      setIsRollingBack(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Version History</h2>
            <p className="text-muted-foreground text-sm">
              {versions.length} version{versions.length !== 1 ? "s" : ""}{" "}
              recorded
            </p>
          </div>
          <Button
            onClick={() => router.push(`/admin/prompts/${promptKey}`)}
            size="sm"
            variant="outline"
          >
            Back to Editor
          </Button>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-0 bottom-0 left-5 w-px bg-border" />

          {/* Version items */}
          <div className="space-y-4">
            {versions.map((version, index) => (
              <div className="relative flex gap-4" key={version.id}>
                {/* Timeline dot */}
                <div
                  className={cn(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2",
                    version.isCurrent
                      ? "border-green-500 bg-green-100 dark:bg-green-900"
                      : "border-muted bg-background"
                  )}
                >
                  {version.isCurrent ? (
                    <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                {/* Content card */}
                <Card
                  className={cn(
                    "flex-1 p-4",
                    version.isCurrent && "ring-2 ring-green-500"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Version {version.version}
                        </span>
                        {version.isCurrent && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Current
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-sm">
                          {formatBytes(version.contentSize)}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {formatDate(version.updatedAt)}
                        {version.updatedBy && ` by ${version.updatedBy}`}
                      </div>
                    </div>
                    {!version.isCurrent && index > 0 && (
                      <Button
                        onClick={() => setRollbackTarget(version)}
                        size="sm"
                        variant="ghost"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rollback
                      </Button>
                    )}
                  </div>

                  {/* Content preview */}
                  <div className="mt-3 rounded bg-muted/50 p-3">
                    <pre className="overflow-hidden text-ellipsis whitespace-pre-wrap font-mono text-muted-foreground text-xs">
                      {version.contentPreview}
                    </pre>
                  </div>

                  {version.replacedAt && (
                    <div className="mt-2 text-muted-foreground text-xs">
                      Replaced: {formatDate(version.replacedAt)}
                    </div>
                  )}
                </Card>
              </div>
            ))}
          </div>
        </div>

        {versions.length === 0 && (
          <Card className="p-8 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-medium text-lg">No version history</h3>
            <p className="mt-2 text-muted-foreground text-sm">
              Version history will appear here after the first edit.
            </p>
          </Card>
        )}
      </div>

      {/* Rollback confirmation dialog */}
      <AlertDialog
        onOpenChange={() => setRollbackTarget(null)}
        open={!!rollbackTarget}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rollback to Version {rollbackTarget?.version}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version with the content from version{" "}
              {rollbackTarget?.version}. The current version will be preserved
              in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRollingBack}
              onClick={handleRollback}
            >
              {isRollingBack && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
