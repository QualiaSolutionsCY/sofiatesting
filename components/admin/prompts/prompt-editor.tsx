"use client";

import { History, Loader2, Save, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Prompt = {
  id: string;
  key: string;
  content: string;
  category: string;
  description: string | null;
  priority: number | null;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

type PromptEditorProps = {
  prompt: Prompt;
};

export function PromptEditor({ prompt }: PromptEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState(prompt.content);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const newContent = value || "";
      setContent(newContent);
      setHasChanges(newContent !== prompt.content);
    },
    [prompt.content]
  );

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/prompts/${prompt.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          updatedBy: "admin",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save");
      }

      const data = await response.json();
      toast.success(`Saved as version ${data.prompt.version}`);
      setHasChanges(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setContent(prompt.content);
    setHasChanges(false);
    toast.info("Changes discarded");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-2xl">{prompt.key}</h1>
            <Badge variant="secondary">{prompt.category}</Badge>
            <Badge variant="outline">v{prompt.version}</Badge>
          </div>
          {prompt.description && (
            <p className="mt-1 text-muted-foreground">{prompt.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => router.push(`/admin/prompts/${prompt.key}/history`)}
            size="sm"
            variant="outline"
          >
            <History className="mr-2 h-4 w-4" />
            History
          </Button>
          {hasChanges && (
            <Button onClick={handleDiscard} size="sm" variant="ghost">
              <Undo2 className="mr-2 h-4 w-4" />
              Discard
            </Button>
          )}
          <Button
            disabled={!hasChanges || isSaving}
            onClick={handleSave}
            size="sm"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Status bar */}
      {hasChanges && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          You have unsaved changes
        </div>
      )}

      {/* Editor */}
      <Card className="overflow-hidden">
        <Editor
          defaultLanguage="markdown"
          height="70vh"
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            renderWhitespace: "selection",
            padding: { top: 16, bottom: 16 },
          }}
          theme="vs-dark"
          value={content}
        />
      </Card>

      {/* Footer info */}
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <div>
          Last updated: {new Date(prompt.updatedAt).toLocaleString()}
          {prompt.updatedBy && ` by ${prompt.updatedBy}`}
        </div>
        <div>{content.length.toLocaleString()} characters</div>
      </div>
    </div>
  );
}
