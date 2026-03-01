/**
 * SOPHIA Modular Prompt System
 *
 * This module provides lazy-loaded prompts based on detected user intent.
 * Only loads the template sections needed for the current request.
 *
 * Usage:
 *   import { buildPrompt, FULL_SYSTEM_PROMPT } from './prompts/index.ts';
 *
 *   // For lazy loading (recommended):
 *   const systemPrompt = buildPrompt(userMessage);
 *
 *   // For full prompt (backward compatible):
 *   const systemPrompt = FULL_SYSTEM_PROMPT;
 */

import { BASE_PROMPT, getDynamicContext } from "./base.ts";
import { detectIntent, type TemplateCategory } from "./template-registry.ts";
import { CLIENT_COMMS_PROMPT } from "./templates/client-comms.ts";
import { MARKETING_PROMPT } from "./templates/marketing.ts";
import { PROPERTY_UPLOAD_PROMPT } from "./templates/property-upload.ts";
import { REGISTRATIONS_PROMPT } from "./templates/registrations.ts";
import { VIEWING_FORMS_PROMPT } from "./templates/viewing-forms.ts";

/**
 * Map of template categories to their prompt content
 */
const TEMPLATE_PROMPTS: Record<TemplateCategory, string> = {
  registrations: REGISTRATIONS_PROMPT,
  viewing_forms: VIEWING_FORMS_PROMPT,
  reservations: VIEWING_FORMS_PROMPT, // Reservations are in the same file as viewing forms
  marketing: MARKETING_PROMPT,
  client_comms: CLIENT_COMMS_PROMPT,
  property_upload: PROPERTY_UPLOAD_PROMPT,
  calculators: "", // Calculator rules are in base prompt
  knowledge: "", // Knowledge rules are in base prompt
};

/**
 * Build a system prompt with only the templates needed for the user's intent
 *
 * @param userMessage - The user's message to detect intent from
 * @returns Assembled system prompt with relevant templates
 */
export const buildPrompt = (userMessage: string): string => {
  // Detect which categories are needed
  const categories = detectIntent(userMessage);

  // Start with base prompt
  let prompt = BASE_PROMPT;

  // Add only the needed template sections
  const addedCategories = new Set<string>();
  for (const category of categories) {
    const templatePrompt = TEMPLATE_PROMPTS[category];
    if (templatePrompt && !addedCategories.has(templatePrompt)) {
      prompt += "\n\n" + templatePrompt;
      addedCategories.add(templatePrompt);
    }
  }

  // Add dynamic context at the end (for cache optimization)
  prompt += getDynamicContext();

  return prompt;
};

/**
 * Build a system prompt for specific categories (for explicit selection)
 *
 * @param categories - Array of categories to include
 * @returns Assembled system prompt with specified templates
 */
export const buildPromptForCategories = (
  categories: TemplateCategory[]
): string => {
  let prompt = BASE_PROMPT;

  const addedCategories = new Set<string>();
  for (const category of categories) {
    const templatePrompt = TEMPLATE_PROMPTS[category];
    if (templatePrompt && !addedCategories.has(templatePrompt)) {
      prompt += "\n\n" + templatePrompt;
      addedCategories.add(templatePrompt);
    }
  }

  prompt += getDynamicContext();

  return prompt;
};

/**
 * Full system prompt with ALL templates (backward compatible)
 *
 * Use this for:
 * - Initial deployment while testing modular system
 * - Cases where you need all templates available
 * - Backward compatibility with existing code
 */
export const FULL_SYSTEM_PROMPT = (() => {
  let prompt = BASE_PROMPT;

  prompt += "\n\n" + REGISTRATIONS_PROMPT;
  prompt += "\n\n" + VIEWING_FORMS_PROMPT;
  prompt += "\n\n" + MARKETING_PROMPT;
  prompt += "\n\n" + CLIENT_COMMS_PROMPT;
  prompt += "\n\n" + PROPERTY_UPLOAD_PROMPT;

  prompt += getDynamicContext();

  return prompt;
})();

/**
 * Get just the base prompt without templates (for testing/debugging)
 */
export const getBasePrompt = (): string => {
  return BASE_PROMPT + getDynamicContext();
};

/**
 * Get available template categories
 */
export const getAvailableCategories = (): TemplateCategory[] => {
  return Object.keys(TEMPLATE_PROMPTS) as TemplateCategory[];
};

export { getDynamicContext } from "./base.ts";
// Re-export utilities
export { detectIntent, type TemplateCategory } from "./template-registry.ts";
