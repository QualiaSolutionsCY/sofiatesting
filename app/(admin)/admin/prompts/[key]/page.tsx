import { notFound } from "next/navigation";
import { PromptEditor } from "@/components/admin/prompts/prompt-editor";
import { getAdminSupabase } from "@/lib/supabase/admin";

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
  created_at: string;
};

type PageProps = {
  params: Promise<{ key: string }>;
};

async function getPrompt(key: string) {
  const supabase = getAdminSupabase();

  const { data: prompt, error } = await supabase
    .from("sophia_prompts")
    .select("*")
    .eq("key", key)
    .eq("is_current", true)
    .single();

  if (error || !prompt) {
    return null;
  }

  const p = prompt as PromptRow;
  return {
    id: p.id,
    key: p.key,
    content: p.content,
    category: p.category,
    description: p.description,
    priority: p.priority,
    version: p.version,
    updatedAt: p.updated_at,
    updatedBy: p.updated_by,
  };
}

export default async function PromptEditPage({ params }: PageProps) {
  const { key } = await params;
  const prompt = await getPrompt(key);

  if (!prompt) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PromptEditor prompt={prompt} />
    </div>
  );
}
