/**
 * SOPHIA Prompt Builder
 * Assembles modular prompts into the complete system prompt
 *
 * Architecture:
 * - core/       → Identity, safety rules
 * - behaviors/  → Document routing, property upload, response format
 * - knowledge/  → Cyprus real estate knowledge, calculators
 * - templates/  → Template registry (existing)
 */

// Behavior modules
import { ADMIN_AGENT_MANAGEMENT } from "./behaviors/admin-agent-management.ts";
import { DOCUMENT_ROUTING } from "./behaviors/document-routing.ts";
import { PROPERTY_UPLOAD } from "./behaviors/property-upload.ts";
import { RESPONSE_FORMAT } from "./behaviors/response-format.ts";
// Core modules
import { IDENTITY } from "./core/identity.ts";
import { SAFETY_RULES } from "./core/safety-rules.ts";
import { CALCULATOR_CAPABILITIES } from "./knowledge/calculators.ts";
// Knowledge modules
import { CYPRUS_KNOWLEDGE } from "./knowledge/cyprus-real-estate.ts";

// Templates module
import { TEMPLATES } from "./templates/content.ts";

/**
 * Build the complete SOPHIA system prompt
 * Templates are injected separately from the main prompts.ts file
 */
export function buildSystemPrompt(options: {
  agentName: string;
  agentPhone: string;
  currentDate: string;
  tomorrowDate: string;
  templates?: string;
}): string {
  const {
    agentName,
    agentPhone,
    currentDate,
    tomorrowDate,
    templates = TEMPLATES,
  } = options;

  // Agent context header
  const agentContext = `## Agent Context
**Agent Name:** ${agentName}
**Agent Phone:** ${agentPhone}
**Today's Date:** ${currentDate}
**Tomorrow:** ${tomorrowDate}

CRITICAL TEMPORAL RULES:
1. ALWAYS use the current date context above when interpreting relative dates
2. "tomorrow" = ${tomorrowDate}
3. "today at 5pm" = ${currentDate} at 17:00
4. NEVER use outdated dates - always reference the current date shown above
`;

  // Assemble prompt sections in priority order
  const sections = [
    // 1. Identity & Safety (highest priority)
    IDENTITY,
    SAFETY_RULES,

    // 2. Agent context (injected dynamically)
    agentContext,

    // 3. Document behaviors
    DOCUMENT_ROUTING,

    // 4. Property upload workflow
    PROPERTY_UPLOAD,

    // 5. Response formatting
    RESPONSE_FORMAT,

    // 5b. Admin: agent registry management (addAgent / removeAgent tools)
    ADMIN_AGENT_MANAGEMENT,

    // 6. Calculator capabilities
    CALCULATOR_CAPABILITIES,

    // 7. Cyprus knowledge base
    CYPRUS_KNOWLEDGE,

    // 8. Templates (injected from legacy prompts.ts)
    templates,
  ];

  return sections.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Get individual prompt sections for partial updates
 */
export const PromptSections = {
  identity: IDENTITY,
  safetyRules: SAFETY_RULES,
  documentRouting: DOCUMENT_ROUTING,
  propertyUpload: PROPERTY_UPLOAD,
  responseFormat: RESPONSE_FORMAT,
  adminAgentManagement: ADMIN_AGENT_MANAGEMENT,
  calculators: CALCULATOR_CAPABILITIES,
  cyprusKnowledge: CYPRUS_KNOWLEDGE,
};

/**
 * Export all modules for direct access if needed
 */
export {
  IDENTITY,
  SAFETY_RULES,
  DOCUMENT_ROUTING,
  PROPERTY_UPLOAD,
  RESPONSE_FORMAT,
  ADMIN_AGENT_MANAGEMENT,
  CALCULATOR_CAPABILITIES,
  CYPRUS_KNOWLEDGE,
  TEMPLATES,
};
