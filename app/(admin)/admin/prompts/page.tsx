import { createLogger } from "@/lib/logger";
import { PromptList } from "@/components/admin/prompts/prompt-list";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("admin:prompts");

type PromptRow = {
  id: string;
  key: string;
  content: string;
  category: string;
  description: string | null;
  priority: number | null;
  is_active: boolean;
  is_current: boolean;
  version: number;
  updated_at: string;
  updated_by: string | null;
};

async function getPrompts() {
  const supabase = getAdminSupabase();

  const { data: prompts, error } = await supabase
    .from("sophia_prompts")
    .select("*")
    .eq("is_active", true)
    .eq("is_current", true)
    .order("priority", { ascending: true });

  if (error) {
    logger.error("Error fetching prompts", error);
    return [];
  }

  return (prompts as PromptRow[]).map((p) => ({
    id: p.id,
    key: p.key,
    category: p.category,
    description: p.description,
    priority: p.priority,
    version: p.version,
    contentSize: p.content?.length || 0,
    updatedAt: p.updated_at,
    updatedBy: p.updated_by,
  }));
}

export default async function PromptsPage() {
  const prompts = await getPrompts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-3xl tracking-tight">Prompts Editor</h1>
          <p className="text-muted-foreground">
            Manage SOPHIA&apos;s system prompts and behaviors
          </p>
        </div>
      </div>

      <PromptList prompts={prompts} />
    </div>
  );
}
