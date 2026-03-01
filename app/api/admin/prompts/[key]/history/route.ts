import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:prompts:history");

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
  replaced_at: string | null;
};

/**
 * GET /api/admin/prompts/[key]/history
 * Get version history for a specific prompt
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> }
) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { key } = await context.params;

    const { data: versions, error } = await getAdminSupabase()
      .from("sophia_prompts")
      .select("*")
      .eq("key", key)
      .order("version", { ascending: false })
      .limit(20);

    if (error) {
      logger.error("Error fetching prompt history", error);
      return NextResponse.json(
        { error: "Failed to fetch history" },
        { status: 500 }
      );
    }

    if (!versions || versions.length === 0) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const formattedVersions = (versions as PromptRow[]).map((v) => ({
      id: v.id,
      version: v.version,
      contentSize: v.content?.length || 0,
      contentPreview:
        v.content?.substring(0, 200) + (v.content?.length > 200 ? "..." : ""),
      isActive: v.is_active,
      isCurrent: v.is_current,
      updatedAt: v.updated_at,
      updatedBy: v.updated_by,
      replacedAt: v.replaced_at,
    }));

    return NextResponse.json({
      key,
      versions: formattedVersions,
      totalVersions: formattedVersions.length,
    });
  } catch (error) {
    logger.error("Error in history endpoint", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
