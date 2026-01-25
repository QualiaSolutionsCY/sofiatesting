/**
 * DEPRECATED - This file kept only for backward compatibility
 *
 * The actual prompt system now uses:
 * - services/prompt-loader.ts (hybrid DB + file loader)
 * - prompts/ directory (modular prompt files)
 * - sophia_prompts table (editable via Supabase Dashboard)
 *
 * DO NOT add new prompts here. Edit via Dashboard or modular files instead.
 */

// Re-export logo for backward compatibility with existing imports
export { ZYPRUS_LOGO_BASE64 } from "./assets/zyprus-logo.ts";
