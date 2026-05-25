/**
 * Prompt Optimizer Edge Function (Autoresearch Pattern)
 *
 * Self-improving prompt optimization for Sophia.
 * Runs on pg_cron every 6 hours. Three phases:
 *   1. HARVEST — evaluate active experiments with enough data
 *   2. GENERATE — create new challengers for underperforming prompts
 *   3. DEPLOY — push challengers to sophia_prompts with versioning
 *
 * Inspired by Karpathy's autoresearch: baseline → challenger → measure → keep winner → repeat
 *
 * Deploy: supabase functions deploy prompt-optimizer --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
 */

import { getSupabaseAdmin } from "../_shared/db.ts";
import { LogCategory, logger } from "../sophia-bot/utils/logger.ts";

const supabase = getSupabaseAdmin();
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const OPTIMIZER_MODEL = "google/gemini-2.0-flash-001";

// Skip list loaded from DB
let skipKeys: Set<string> | null = null;

async function getSkipList(): Promise<Set<string>> {
  if (skipKeys) return skipKeys;
  const { data } = await supabase
    .from("sophia_experiment_skip_list")
    .select("key");
  skipKeys = new Set((data || []).map((r: { key: string }) => r.key));
  return skipKeys;
}

// ============================================================
// PHASE 1: HARVEST — Evaluate active experiments
// ============================================================

interface ExperimentRow {
  id: string;
  target_key: string;
  baseline_version: number;
  challenger_version: number;
  hypothesis: string;
  min_sessions: number;
  min_improvement: number;
  generation: number;
  created_at: string;
}

async function harvest(): Promise<number> {
  const { data: experiments } = await supabase
    .from("sophia_experiments")
    .select("*")
    .eq("status", "active");

  if (!experiments || experiments.length === 0) {
    logger.info("[Optimizer] No active experiments to harvest", {
      category: LogCategory.GENERAL,
    });
    return 0;
  }

  let completed = 0;

  for (const exp of experiments as ExperimentRow[]) {
    // Count sessions:
    // - Baseline = messages sent BEFORE experiment started (no experiment_id, using same event types)
    // - Challenger = messages tagged with this experiment's ID
    const [baselineResult, challengerResult] = await Promise.all([
      supabase
        .from("whatsapp_analytics")
        .select("id", { count: "exact", head: true })
        .is("experiment_id", null)
        .eq("event_type", "message_sent")
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        )
        .lt("created_at", exp.created_at),
      supabase
        .from("whatsapp_analytics")
        .select("id", { count: "exact", head: true })
        .eq("experiment_id", exp.id)
        .eq("experiment_variant", "challenger"),
    ]);

    const baselineSessions = baselineResult.count || 0;
    const challengerSessions = challengerResult.count || 0;
    const totalSessions = baselineSessions + challengerSessions;

    // Update session counts
    await supabase
      .from("sophia_experiments")
      .update({
        baseline_sessions: baselineSessions,
        challenger_sessions: challengerSessions,
      })
      .eq("id", exp.id);

    // Not enough data yet
    if (totalSessions < exp.min_sessions) {
      logger.info(
        `[Optimizer] Experiment ${exp.id} needs more data: ${totalSessions}/${exp.min_sessions}`,
        { category: LogCategory.GENERAL }
      );
      continue;
    }

    // Calculate primary metric: average messages-to-complete for tool_used events
    const metrics = await calculateMetrics(exp.id);

    if (!metrics) {
      logger.warn(`[Optimizer] Could not calculate metrics for ${exp.id}`, {
        category: LogCategory.GENERAL,
      });
      continue;
    }

    // Determine winner
    const { winner, reason } = determineWinner(metrics, exp.min_improvement);

    // If baseline wins, revert challenger prompt
    if (winner === "baseline") {
      await revertChallenger(exp);
    }

    // Log learnings
    const learnings = `Target: ${exp.target_key} | Hypothesis: ${exp.hypothesis} | Result: ${winner} won (${reason}). Baseline metric: ${metrics.baselineAvg?.toFixed(2)}, Challenger metric: ${metrics.challengerAvg?.toFixed(2)}`;

    await supabase.from("sophia_experiment_learnings").insert({
      experiment_id: exp.id,
      target_key: exp.target_key,
      category: winner === "challenger" ? "what_works" : "what_doesnt",
      learning: learnings,
      generation: exp.generation,
    });

    // Mark experiment as completed
    await supabase
      .from("sophia_experiments")
      .update({
        status: "completed",
        winner,
        win_reason: reason,
        learnings,
        baseline_metric: metrics.baselineAvg,
        challenger_metric: metrics.challengerAvg,
        baseline_secondary: metrics.baselineErrorRate,
        challenger_secondary: metrics.challengerErrorRate,
        completed_at: new Date().toISOString(),
      })
      .eq("id", exp.id);

    logger.info(
      `[Optimizer] Experiment ${exp.id} completed: ${winner} wins (${reason})`,
      { category: LogCategory.GENERAL }
    );
    completed++;
  }

  return completed;
}

interface Metrics {
  baselineAvg: number | null;
  challengerAvg: number | null;
  baselineErrorRate: number | null;
  challengerErrorRate: number | null;
}

async function calculateMetrics(experimentId: string): Promise<Metrics | null> {
  // Get experiment creation date for baseline window
  const { data: exp } = await supabase
    .from("sophia_experiments")
    .select("created_at")
    .eq("id", experimentId)
    .single();

  if (!exp) return null;

  // Baseline = messages sent in the 7 days BEFORE experiment started (no experiment_id)
  const baselineStart = new Date(
    new Date(exp.created_at).getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: baseline } = await supabase
    .from("whatsapp_analytics")
    .select("event_type, response_time_ms, phone_number")
    .is("experiment_id", null)
    .gte("created_at", baselineStart)
    .lt("created_at", exp.created_at);

  // Challenger = messages tagged with this experiment
  const { data: challenger } = await supabase
    .from("whatsapp_analytics")
    .select("event_type, response_time_ms, phone_number")
    .eq("experiment_id", experimentId)
    .eq("experiment_variant", "challenger");

  if (
    (!baseline || baseline.length === 0) &&
    (!challenger || challenger.length === 0)
  )
    return null;

  // Primary metric: average response time (lower is better)
  const avgResponseTime = (
    rows: Array<{ response_time_ms: number | null }>
  ) => {
    const valid = rows.filter((r) => r.response_time_ms != null);
    if (valid.length === 0) return null;
    return (
      valid.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) /
      valid.length
    );
  };

  // Secondary metric: error rate (lower is better)
  const errorRate = (rows: Array<{ event_type: string }>) => {
    if (rows.length === 0) return null;
    const errors = rows.filter((r) => r.event_type === "error").length;
    return errors / rows.length;
  };

  return {
    baselineAvg: avgResponseTime(baseline),
    challengerAvg: avgResponseTime(challenger),
    baselineErrorRate: errorRate(baseline),
    challengerErrorRate: errorRate(challenger),
  };
}

function determineWinner(
  metrics: Metrics,
  minImprovement: number
): { winner: string; reason: string } {
  // If we don't have metrics for either, baseline wins by default
  if (metrics.baselineAvg == null || metrics.challengerAvg == null) {
    return {
      winner: "baseline",
      reason: "Insufficient metric data for comparison",
    };
  }

  // Lower response time is better
  const improvement =
    (metrics.baselineAvg - metrics.challengerAvg) / metrics.baselineAvg;

  if (improvement >= minImprovement) {
    return {
      winner: "challenger",
      reason: `Challenger ${(improvement * 100).toFixed(1)}% faster (threshold: ${(minImprovement * 100).toFixed(0)}%)`,
    };
  }

  // Check if challenger is significantly worse
  if (improvement < -minImprovement) {
    return {
      winner: "baseline",
      reason: `Challenger ${(Math.abs(improvement) * 100).toFixed(1)}% slower`,
    };
  }

  // Within noise margin — baseline wins (conservative)
  return {
    winner: "baseline",
    reason: `No significant difference (${(improvement * 100).toFixed(1)}% change, threshold: ${(minImprovement * 100).toFixed(0)}%)`,
  };
}

async function revertChallenger(exp: ExperimentRow): Promise<void> {
  // Get the current prompt to check if challenger is active
  const { data: currentPrompt } = await supabase
    .from("sophia_prompts")
    .select("version")
    .eq("key", exp.target_key)
    .eq("is_current", true)
    .single();

  if (currentPrompt && currentPrompt.version === exp.challenger_version) {
    // Rollback to baseline version content
    const { data: baselinePrompt } = await supabase
      .from("sophia_prompts")
      .select("content, priority, category, description")
      .eq("key", exp.target_key)
      .eq("version", exp.baseline_version)
      .single();

    if (baselinePrompt) {
      // Mark current as not current
      await supabase
        .from("sophia_prompts")
        .update({
          is_current: false,
          replaced_at: new Date().toISOString(),
        })
        .eq("key", exp.target_key)
        .eq("is_current", true);

      // Insert new version with baseline content
      const newVersion = exp.challenger_version + 1;
      await supabase.from("sophia_prompts").insert({
        key: exp.target_key,
        content: baselinePrompt.content,
        category: baselinePrompt.category,
        description: baselinePrompt.description,
        priority: baselinePrompt.priority,
        is_active: true,
        is_current: true,
        version: newVersion,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: `autoresearch:revert:${exp.id}`,
      });

      logger.info(
        `[Optimizer] Reverted ${exp.target_key} from v${exp.challenger_version} to baseline content (now v${newVersion})`,
        { category: LogCategory.GENERAL }
      );
    }
  }
}

// ============================================================
// PHASE 2: GENERATE — Create new challengers via LLM
// ============================================================

async function generate(): Promise<number> {
  const skip = await getSkipList();

  // Find prompt keys without active experiments
  const { data: activeExps } = await supabase
    .from("sophia_experiments")
    .select("target_key")
    .eq("status", "active");

  const activeKeys = new Set(
    (activeExps || []).map((e: { target_key: string }) => e.target_key)
  );

  // Get all optimizable prompt keys
  const { data: prompts } = await supabase
    .from("sophia_prompts")
    .select("key, content, version, priority")
    .eq("is_active", true)
    .eq("is_current", true)
    .order("priority", { ascending: true });

  if (!prompts) return 0;

  // Filter to eligible targets
  const eligible = prompts.filter(
    (p: { key: string }) => !skip.has(p.key) && !activeKeys.has(p.key)
  );

  if (eligible.length === 0) {
    logger.info("[Optimizer] No eligible targets for new experiments", {
      category: LogCategory.GENERAL,
    });
    return 0;
  }

  // Load accumulated learnings
  const { data: learnings } = await supabase
    .from("sophia_experiment_learnings")
    .select("target_key, category, learning")
    .order("created_at", { ascending: false })
    .limit(50);

  const learningsContext = (learnings || [])
    .map(
      (l: { target_key: string; category: string; learning: string }) =>
        `[${l.category}] ${l.target_key}: ${l.learning}`
    )
    .join("\n");

  // Get experiment count per target for generation tracking
  const { data: expCounts } = await supabase
    .from("sophia_experiments")
    .select("target_key")
    .eq("status", "completed");

  const generationCounts = new Map<string, number>();
  for (const e of expCounts || []) {
    const count = generationCounts.get(e.target_key) || 0;
    generationCounts.set(e.target_key, count + 1);
  }

  // Pick the target — prioritize those with fewest experiments
  eligible.sort((a: { key: string }, b: { key: string }) => {
    const aCount = generationCounts.get(a.key) || 0;
    const bCount = generationCounts.get(b.key) || 0;
    return aCount - bCount;
  });

  // Generate ONE challenger per run (conservative)
  const target = eligible[0] as {
    key: string;
    content: string;
    version: number;
    priority: number;
  };
  const generation = (generationCounts.get(target.key) || 0) + 1;

  logger.info(
    `[Optimizer] Generating challenger for '${target.key}' (generation ${generation})`,
    { category: LogCategory.GENERAL }
  );

  logger.info(
    `[Optimizer] Target content length: ${target.content?.length || 0}`,
    {
      category: LogCategory.GENERAL,
    }
  );

  if (!target.content || target.content.length < 50) {
    logger.warn(
      `[Optimizer] Target '${target.key}' has no/empty content in DB, skipping`,
      {
        category: LogCategory.GENERAL,
        contentLength: target.content?.length || 0,
      }
    );
    return 0;
  }

  const challenger = await generateChallenger(
    target.key,
    target.content,
    learningsContext,
    generation
  );

  if (!challenger) {
    logger.warn(`[Optimizer] Failed to generate challenger for ${target.key}`, {
      category: LogCategory.GENERAL,
    });
    return 0;
  }

  // Deploy challenger
  await deployChallenger(target, challenger, generation);
  return 1;
}

interface ChallengerResult {
  content: string;
  hypothesis: string;
  summary: string;
}

async function generateChallenger(
  targetKey: string,
  currentContent: string,
  learnings: string,
  generation: number
): Promise<ChallengerResult | null> {
  if (!OPENROUTER_API_KEY) {
    logger.error(
      "[Optimizer] OPENROUTER_API_KEY not set",
      new Error("Missing API key"),
      { category: LogCategory.GENERAL }
    );
    return null;
  }

  // For very large prompts (>15K chars), use a patch-based approach
  const isLargePrompt = currentContent.length > 15_000;

  const prompt = isLargePrompt
    ? `You are an AI prompt optimization expert. Your job is to create a SMALL, SURGICAL improvement to a system prompt used by Sophia, a WhatsApp real estate assistant.

## RULES
- Make ONE focused change using a find-and-replace patch
- Do NOT remove any required fields or safety rules
- Do NOT change the core identity or personality
- Focus on clarity, efficiency, and reducing ambiguity
- The goal is to reduce the number of back-and-forth messages needed to complete a task

## ACCUMULATED LEARNINGS FROM PREVIOUS EXPERIMENTS
${learnings || "No previous experiments yet. This is generation 1."}

## CURRENT PROMPT (target: "${targetKey}", generation: ${generation}, ${currentContent.length} chars)
\`\`\`
${currentContent}
\`\`\`

## YOUR TASK
This prompt is very large. Instead of rewriting it entirely, provide a PATCH — a specific find-and-replace. Respond in this EXACT JSON format:
{
  "hypothesis": "Brief explanation of what you changed and why it should improve performance",
  "summary": "One-line summary of the change",
  "find": "The EXACT text to find in the current prompt (copy-paste, must match exactly)",
  "replace": "The replacement text"
}

IMPORTANT: The "find" field must be an EXACT substring of the current prompt. If it doesn't match, the patch will fail.`
    : `You are an AI prompt optimization expert. Your job is to create a SMALL, SURGICAL improvement to a system prompt used by Sophia, a WhatsApp real estate assistant.

## RULES
- Make ONE focused change, not a rewrite
- Keep the same structure and sections
- Do NOT remove any required fields or safety rules
- Do NOT change the core identity or personality
- Focus on clarity, efficiency, and reducing ambiguity
- The goal is to reduce the number of back-and-forth messages needed to complete a task

## ACCUMULATED LEARNINGS FROM PREVIOUS EXPERIMENTS
${learnings || "No previous experiments yet. This is generation 1."}

## CURRENT PROMPT (target: "${targetKey}", generation: ${generation})
\`\`\`
${currentContent}
\`\`\`

## YOUR TASK
Create a challenger variant with a clear hypothesis. Respond in this EXACT JSON format:
{
  "hypothesis": "Brief explanation of what you changed and why it should improve performance",
  "summary": "One-line summary of the change",
  "content": "The complete modified prompt content (full text, not a diff)"
}

IMPORTANT: The "content" field must contain the COMPLETE prompt text, not just the changed parts. Keep everything that works, only modify what you're testing.`;

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPTIMIZER_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 65_000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      logger.error(
        `[Optimizer] OpenRouter error: ${response.status}: ${errBody.slice(0, 500)}`,
        new Error(errBody),
        { category: LogCategory.GENERAL }
      );
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      logger.warn(`[Optimizer] Empty response from LLM for '${targetKey}'`, {
        category: LogCategory.GENERAL,
        finishReason: data.choices?.[0]?.finish_reason,
        usage: data.usage,
        errorDetail: data.error,
      });
      return null;
    }

    logger.info(
      `[Optimizer] LLM response received for '${targetKey}' (${text.length} chars)`,
      {
        category: LogCategory.GENERAL,
      }
    );

    const parsed = JSON.parse(text);

    // Handle patch format for large prompts
    if (parsed.find && parsed.replace !== undefined) {
      if (!parsed.hypothesis || !parsed.summary) {
        logger.warn("[Optimizer] Invalid patch response structure", {
          category: LogCategory.GENERAL,
        });
        return null;
      }
      if (!currentContent.includes(parsed.find)) {
        logger.warn(
          "[Optimizer] Patch 'find' string not found in current content",
          {
            category: LogCategory.GENERAL,
            findLength: parsed.find.length,
            findPreview: parsed.find.slice(0, 100),
          }
        );
        return null;
      }
      const patchedContent = currentContent.replace(
        parsed.find,
        parsed.replace
      );
      logger.info(
        `[Optimizer] Applied patch for '${targetKey}': ${parsed.find.length} chars replaced with ${parsed.replace.length} chars`,
        {
          category: LogCategory.GENERAL,
        }
      );
      return {
        content: patchedContent,
        hypothesis: parsed.hypothesis,
        summary: parsed.summary,
      };
    }

    // Standard full-content format
    if (!parsed.content || !parsed.hypothesis || !parsed.summary) {
      logger.warn("[Optimizer] Invalid challenger response structure", {
        category: LogCategory.GENERAL,
      });
      return null;
    }

    // Safety check: content must be substantial (not empty or tiny)
    if (parsed.content.length < 100) {
      logger.warn("[Optimizer] Challenger content too short, rejecting", {
        category: LogCategory.GENERAL,
        contentLength: parsed.content.length,
      });
      return null;
    }

    return parsed as ChallengerResult;
  } catch (err) {
    logger.error("[Optimizer] Failed to generate challenger", err as Error, {
      category: LogCategory.GENERAL,
      targetKey,
      errorMessage: String(err),
    });
    return null;
  }
}

// ============================================================
// PHASE 3: DEPLOY — Push challenger to sophia_prompts
// ============================================================

async function deployChallenger(
  target: { key: string; content: string; version: number; priority: number },
  challenger: ChallengerResult,
  generation: number
): Promise<void> {
  // Create new version in sophia_prompts
  const newVersion = target.version + 1;

  // Mark current as not current
  await supabase
    .from("sophia_prompts")
    .update({
      is_current: false,
      replaced_at: new Date().toISOString(),
    })
    .eq("key", target.key)
    .eq("is_current", true);

  // Insert challenger as new current version
  const { error: insertError } = await supabase.from("sophia_prompts").insert({
    key: target.key,
    content: challenger.content,
    category: "behavior",
    description: `Autoresearch gen ${generation}: ${challenger.summary}`,
    priority: target.priority,
    is_active: true,
    is_current: true,
    version: newVersion,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: `autoresearch:gen${generation}`,
  });

  if (insertError) {
    logger.error(
      "[Optimizer] Failed to insert challenger prompt",
      new Error(insertError.message),
      { category: LogCategory.DATABASE }
    );
    return;
  }

  // Create content hashes
  const encoder = new TextEncoder();
  const baselineBytes = encoder.encode(target.content);
  const challengerBytes = encoder.encode(challenger.content);
  const baselineHash = await crypto.subtle
    .digest("SHA-256", baselineBytes)
    .then((h) =>
      Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16)
    );
  const challengerHash = await crypto.subtle
    .digest("SHA-256", challengerBytes)
    .then((h) =>
      Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16)
    );

  // Create experiment record
  const { error: expError } = await supabase.from("sophia_experiments").insert({
    target_key: target.key,
    status: "active",
    baseline_version: target.version,
    baseline_summary: "Current production prompt",
    baseline_hash: baselineHash,
    challenger_version: newVersion,
    challenger_summary: challenger.summary,
    challenger_hash: challengerHash,
    hypothesis: challenger.hypothesis,
    generation,
    min_sessions: 10,
    min_improvement: 0.1,
  });

  if (expError) {
    logger.error(
      "[Optimizer] Failed to create experiment record, reverting prompt",
      new Error(expError.message),
      { category: LogCategory.DATABASE }
    );
    // Roll back: mark challenger as not current and restore previous
    await supabase
      .from("sophia_prompts")
      .update({ is_current: false, replaced_at: new Date().toISOString() })
      .eq("key", target.key)
      .eq("version", newVersion);
    await supabase
      .from("sophia_prompts")
      .update({ is_current: true, replaced_at: null })
      .eq("key", target.key)
      .eq("version", target.version);
    return;
  }

  logger.info(
    `[Optimizer] Deployed challenger for '${target.key}' v${newVersion} (gen ${generation}): ${challenger.summary}`,
    { category: LogCategory.GENERAL }
  );
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  try {
    // Parse request body for debug flag
    let debug = false;
    try {
      const body = await req.json().catch(() => ({}));
      debug = body?.debug === true;
    } catch {
      /* empty body is fine */
    }

    logger.info("[Optimizer] Starting autoresearch cycle", {
      category: LogCategory.GENERAL,
    });

    // Phase 1: Harvest
    const harvested = await harvest();

    // Phase 2: Generate
    const generated = await generate();

    const result: Record<string, unknown> = {
      success: true,
      harvested,
      generated,
      timestamp: new Date().toISOString(),
    };

    // Debug: gather diagnostic info AFTER phases so it reflects current state
    if (debug) {
      const skip = await getSkipList();
      const { data: prompts } = await supabase
        .from("sophia_prompts")
        .select("key, version, priority")
        .eq("is_active", true)
        .eq("is_current", true)
        .order("priority", { ascending: true });
      const { data: activeExps } = await supabase
        .from("sophia_experiments")
        .select("id, target_key, status, baseline_version, challenger_version")
        .eq("status", "active");
      const { data: completedExps } = await supabase
        .from("sophia_experiments")
        .select("id, target_key, winner, win_reason")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10);
      const { data: learnings } = await supabase
        .from("sophia_experiment_learnings")
        .select("target_key, category, learning")
        .order("created_at", { ascending: false })
        .limit(10);
      const { data: skipRows } = await supabase
        .from("sophia_experiment_skip_list")
        .select("key, reason");

      const eligible = (prompts || []).filter(
        (p: { key: string }) =>
          !skip.has(p.key) &&
          !(activeExps || []).some(
            (e: { target_key: string }) => e.target_key === p.key
          )
      );

      // Get content lengths
      const { data: contentCheck } = await supabase
        .from("sophia_prompts")
        .select("key, content")
        .eq("is_active", true)
        .eq("is_current", true);
      const contentLengths = (contentCheck || []).map(
        (p: { key: string; content: string | null }) => ({
          key: p.key,
          contentLength: p.content?.length || 0,
        })
      );

      result.diagnostics = {
        allPrompts: prompts || [],
        contentLengths,
        skipList: skipRows || [],
        eligibleForExperiment: eligible.map((p: { key: string }) => p.key),
        activeExperiments: activeExps || [],
        recentCompleted: completedExps || [],
        recentLearnings: learnings || [],
      };
    }

    logger.info("[Optimizer] Autoresearch cycle complete", {
      category: LogCategory.GENERAL,
      harvested,
      generated,
    });

    return new Response(JSON.stringify(result), { headers, status: 200 });
  } catch (err) {
    logger.error("[Optimizer] Autoresearch cycle failed", err as Error, {
      category: LogCategory.GENERAL,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { headers, status: 500 }
    );
  }
});
