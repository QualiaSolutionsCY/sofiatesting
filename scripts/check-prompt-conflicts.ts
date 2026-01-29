#!/usr/bin/env -S npx tsx
/**
 * Prompt Conflict Detection Script
 *
 * Scans all prompts in sophia_prompts table for duplicate instructions.
 * Run before deploy to catch conflicts like the January callback bug.
 *
 * Usage:
 *   npx tsx scripts/check-prompt-conflicts.ts
 *
 * Exit codes:
 *   0 - No conflicts found
 *   1 - Conflicts detected (blocks deploy)
 *   2 - Error (DB connection failed, etc.)
 */

import { createClient } from "@supabase/supabase-js";

// Keywords that indicate behavioral instructions (likely to conflict)
const CONFLICT_KEYWORDS = [
	// Document routing
	"callback",
	"viewing form",
	"docx",
	"document",
	// Response behavior
	"separate message",
	"one message",
	"single message",
	"all at once",
	"one at a time",
	// Template usage
	"template",
	"email",
	"whatsapp",
	// Field collection
	"required field",
	"collect",
	"ask for",
];

interface PromptRow {
	key: string;
	content: string;
	priority: number;
}

interface Conflict {
	keyword: string;
	prompts: Array<{ key: string; priority: number; snippet: string }>;
}

async function loadPrompts(): Promise<PromptRow[]> {
	const supabaseUrl =
		process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseKey) {
		console.error(
			"ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required",
		);
		process.exit(2);
	}

	const supabase = createClient(supabaseUrl, supabaseKey);

	const { data, error } = await supabase
		.from("sophia_prompts")
		.select("key, content, priority")
		.eq("is_active", true)
		.eq("is_current", true)
		.order("priority", { ascending: true });

	if (error) {
		console.error("ERROR: Failed to load prompts:", error.message);
		process.exit(2);
	}

	return data || [];
}

function findConflicts(prompts: PromptRow[]): Conflict[] {
	const conflicts: Conflict[] = [];

	for (const keyword of CONFLICT_KEYWORDS) {
		const matches: Array<{ key: string; priority: number; snippet: string }> =
			[];
		const keywordLower = keyword.toLowerCase();

		for (const prompt of prompts) {
			const contentLower = prompt.content.toLowerCase();
			const index = contentLower.indexOf(keywordLower);

			if (index !== -1) {
				// Extract snippet around the keyword (100 chars before/after)
				const start = Math.max(0, index - 50);
				const end = Math.min(
					prompt.content.length,
					index + keyword.length + 50,
				);
				const snippet = prompt.content
					.substring(start, end)
					.replace(/\n/g, " ")
					.trim();

				matches.push({
					key: prompt.key,
					priority: prompt.priority,
					snippet: `...${snippet}...`,
				});
			}
		}

		// If keyword appears in multiple prompts, it's a potential conflict
		if (matches.length > 1) {
			conflicts.push({
				keyword,
				prompts: matches,
			});
		}
	}

	return conflicts;
}

async function main() {
	console.log("=== Prompt Conflict Detection ===\n");

	const prompts = await loadPrompts();
	console.log(`Loaded ${prompts.length} active prompts from database\n`);

	const conflicts = findConflicts(prompts);

	if (conflicts.length === 0) {
		console.log("No conflicts detected. Safe to deploy.\n");
		process.exit(0);
	}

	console.log(`CONFLICTS DETECTED: ${conflicts.length}\n`);
	console.log("These keywords appear in multiple prompts, which may cause");
	console.log(
		"conflicting AI behavior (lower priority = AI follows this one):\n",
	);

	for (const conflict of conflicts) {
		console.log(`--- Keyword: "${conflict.keyword}" ---`);
		for (const prompt of conflict.prompts) {
			console.log(`  [priority ${prompt.priority}] ${prompt.key}`);
			console.log(`    ${prompt.snippet}`);
		}
		console.log("");
	}

	console.log("ACTION REQUIRED:");
	console.log("1. Review each conflict above");
	console.log("2. Consolidate instructions in ONE prompt (usually lowest priority)");
	console.log("3. Remove duplicate instructions from other prompts");
	console.log("4. Re-run this script to verify\n");

	process.exit(1);
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(2);
});
