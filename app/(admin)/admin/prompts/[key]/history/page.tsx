import "server-only";

import { notFound } from "next/navigation";
import { VersionTimeline } from "@/components/admin/prompts/version-timeline";
import { getAdminSupabase } from "@/lib/supabase/admin";

type PromptRow = {
  id: string;
  key: string;
  content: string;
  category: string;
  is_active: boolean;
  is_current: boolean;
  version: number;
  updated_at: string;
  updated_by: string | null;
  replaced_at: string | null;
};

type PageProps = {
  params: Promise<{ key: string }>;
};

async function getVersionHistory(key: string) {
  const supabase = getAdminSupabase();

  const { data: versions, error } = await supabase
    .from("sophia_prompts")
    .select("*")
    .eq("key", key)
    .order("version", { ascending: false })
    .limit(20);

  if (error || !versions || versions.length === 0) {
    return null;
  }

  return (versions as PromptRow[]).map((v) => ({
    id: v.id,
    version: v.version,
    contentSize: v.content?.length || 0,
    contentPreview: v.content?.substring(0, 200) + (v.content?.length > 200 ? "..." : ""),
    isActive: v.is_active,
    isCurrent: v.is_current,
    updatedAt: v.updated_at,
    updatedBy: v.updated_by,
    replacedAt: v.replaced_at,
  }));
}

export default async function PromptHistoryPage({ params }: PageProps) {
  const { key } = await params;
  const versions = await getVersionHistory(key);

  if (!versions) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-3xl tracking-tight">{key}</h1>
        <p className="text-muted-foreground">
          Version history and rollback options
        </p>
      </div>

      <VersionTimeline promptKey={key} versions={versions} />
    </div>
  );
}
