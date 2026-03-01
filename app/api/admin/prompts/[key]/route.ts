import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth } from "@/lib/auth/admin";
import { createLogger } from "@/lib/logger";
import { getAdminSupabase } from "@/lib/supabase/admin";

const logger = createLogger("api:admin:prompts:key");

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
 * GET /api/admin/prompts/[key]
 * Get a specific prompt by key with full content
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

    const { data: prompt, error } = await getAdminSupabase()
      .from("sophia_prompts")
      .select("*")
      .eq("key", key)
      .eq("is_current", true)
      .single();

    if (error || !prompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    const p = prompt as PromptRow;

    return NextResponse.json({
      prompt: {
        id: p.id,
        key: p.key,
        content: p.content,
        category: p.category,
        description: p.description,
        priority: p.priority,
        version: p.version,
        isActive: p.is_active,
        isCurrent: p.is_current,
        updatedAt: p.updated_at,
        updatedBy: p.updated_by,
        createdAt: p.created_at,
      },
    });
  } catch (error) {
    logger.error("Error fetching prompt", error);
    return NextResponse.json(
      {
        error: "Failed to fetch prompt",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

const updatePromptSchema = z.object({
  content: z.string().min(1, "Content is required"),
  updatedBy: z.string().optional(),
});

/**
 * PUT /api/admin/prompts/[key]
 * Update a prompt's content (creates new version)
 */
export async function PUT(
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

    // Validate request body with Zod
    const parseResult = updatePromptSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parseResult.error.format()
        },
        { status: 400 }
      );
    }

    const { content, updatedBy } = parseResult.data;

    // SEC-06: Reject oversized prompt content (50KB limit)
    const MAX_PROMPT_SIZE = 50 * 1024; // 50KB
    if (new TextEncoder().encode(content).byteLength > MAX_PROMPT_SIZE) {
      return NextResponse.json(
        { error: "Prompt content exceeds maximum size of 50KB" },
        { status: 413 }
      );
    }

    // Get current prompt
    const { data: currentPrompt, error: fetchError } = await getAdminSupabase()
      .from("sophia_prompts")
      .select("*")
      .eq("key", key)
      .eq("is_current", true)
      .single();

    if (fetchError || !currentPrompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    const current = currentPrompt as PromptRow;

    // Mark current version as not current
    const { error: updateOldError } = await getAdminSupabase()
      .from("sophia_prompts")
      .update({
        is_current: false,
        replaced_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (updateOldError) {
      logger.error("Error marking old version", updateOldError);
      return NextResponse.json(
        { error: "Failed to update prompt" },
        { status: 500 }
      );
    }

    // Create new version
    const { data: newPrompt, error: insertError } = await getAdminSupabase()
      .from("sophia_prompts")
      .insert({
        key: current.key,
        content,
        category: current.category,
        description: current.description,
        priority: current.priority,
        is_active: true,
        is_current: true,
        version: (current.version || 1) + 1,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || "admin",
      })
      .select()
      .single();

    if (insertError || !newPrompt) {
      logger.error("Error creating new version", insertError);
      // Rollback: restore old version as current
      await getAdminSupabase()
        .from("sophia_prompts")
        .update({ is_current: true, replaced_at: null })
        .eq("id", current.id);

      return NextResponse.json(
        { error: "Failed to create new version" },
        { status: 500 }
      );
    }

    const np = newPrompt as PromptRow;

    return NextResponse.json({
      prompt: {
        id: np.id,
        key: np.key,
        content: np.content,
        category: np.category,
        version: np.version,
        updatedAt: np.updated_at,
        updatedBy: np.updated_by,
      },
      message: `Prompt updated to version ${np.version}`,
    });
  } catch (error) {
    logger.error("Error updating prompt", error);
    return NextResponse.json(
      {
        error: "Failed to update prompt",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
