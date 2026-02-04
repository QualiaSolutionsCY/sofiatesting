import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:prompts");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

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

/**
 * GET /api/admin/prompts
 * Get all active prompts with their metadata
 */
export async function GET(_request: NextRequest) {
  const adminCheck = await checkAdminAuth();
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: adminCheck.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { data: prompts, error } = await supabase
      .from("sophia_prompts")
      .select("*")
      .eq("is_active", true)
      .eq("is_current", true)
      .order("priority", { ascending: true });

    if (error) {
      logger.error("Error fetching prompts", error);
      return NextResponse.json(
        { error: "Failed to fetch prompts", details: error.message },
        { status: 500 }
      );
    }

    // Add content size and formatted data
    const formattedPrompts = (prompts as PromptRow[]).map((p) => ({
      id: p.id,
      key: p.key,
      category: p.category,
      description: p.description,
      priority: p.priority,
      version: p.version,
      isActive: p.is_active,
      isCurrent: p.is_current,
      contentSize: p.content?.length || 0,
      updatedAt: p.updated_at,
      updatedBy: p.updated_by,
    }));

    return NextResponse.json({ prompts: formattedPrompts });
  } catch (error) {
    logger.error("Error in prompts endpoint", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
