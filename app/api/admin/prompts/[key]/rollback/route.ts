import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api:admin:prompts:rollback");

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
  replaced_at: string | null;
};

/**
 * POST /api/admin/prompts/[key]/rollback
 * Rollback a prompt to a specific version
 */
export async function POST(
  request: NextRequest,
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
    const body = await request.json();
    const { versionId, updatedBy } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: "Version ID is required" },
        { status: 400 }
      );
    }

    // Get the version to rollback to
    const { data: targetVersion, error: fetchTargetError } = await supabase
      .from("sophia_prompts")
      .select("*")
      .eq("id", versionId)
      .eq("key", key)
      .single();

    if (fetchTargetError || !targetVersion) {
      return NextResponse.json(
        { error: "Target version not found" },
        { status: 404 }
      );
    }

    const target = targetVersion as PromptRow;

    // Get current version
    const { data: currentVersion, error: fetchCurrentError } = await supabase
      .from("sophia_prompts")
      .select("*")
      .eq("key", key)
      .eq("is_current", true)
      .single();

    if (fetchCurrentError || !currentVersion) {
      return NextResponse.json(
        { error: "Current version not found" },
        { status: 404 }
      );
    }

    const current = currentVersion as PromptRow;

    // If target is already current, nothing to do
    if (target.id === current.id) {
      return NextResponse.json(
        { error: "This version is already current" },
        { status: 400 }
      );
    }

    // Mark current as not current
    const { error: updateCurrentError } = await supabase
      .from("sophia_prompts")
      .update({
        is_current: false,
        replaced_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (updateCurrentError) {
      logger.error("Error updating current version", updateCurrentError);
      return NextResponse.json(
        { error: "Failed to rollback" },
        { status: 500 }
      );
    }

    // Create new version with content from target
    const newVersion = (current.version || 1) + 1;
    const { data: newPrompt, error: insertError } = await supabase
      .from("sophia_prompts")
      .insert({
        key: target.key,
        content: target.content,
        category: target.category,
        description: target.description,
        priority: target.priority,
        is_active: true,
        is_current: true,
        version: newVersion,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || "admin (rollback)",
      })
      .select()
      .single();

    if (insertError || !newPrompt) {
      logger.error("Error creating rollback version", insertError);
      // Restore current as current
      await supabase
        .from("sophia_prompts")
        .update({ is_current: true, replaced_at: null })
        .eq("id", current.id);

      return NextResponse.json(
        { error: "Failed to create rollback version" },
        { status: 500 }
      );
    }

    const np = newPrompt as PromptRow;

    return NextResponse.json({
      prompt: {
        id: np.id,
        key: np.key,
        version: np.version,
        updatedAt: np.updated_at,
      },
      message: `Rolled back to version ${target.version} (now version ${np.version})`,
      rolledBackFrom: current.version,
      rolledBackTo: target.version,
    });
  } catch (error) {
    logger.error("Error in rollback endpoint", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
