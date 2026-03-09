/**
 * Draft Email Creator
 *
 * Matches incoming emails to the best template from Gmail's Templates folder,
 * then creates a draft reply.
 */

import type { EmailMessage } from "./gmail.js";
import { fetchTemplates, createDraft } from "./gmail.js";

// Keywords that help match emails to templates
const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  viewing: ["viewing", "visit", "appointment", "schedule", "see the property", "tour"],
  inquiry: ["inquiry", "enquiry", "interested", "information", "details about"],
  pricing: ["price", "cost", "how much", "budget", "offer", "negotiat"],
  availability: ["available", "availability", "still on market", "sold"],
  rental: ["rent", "rental", "lease", "tenant", "monthly"],
  thankyou: ["thank", "thanks", "appreciate"],
  followup: ["follow up", "following up", "any update", "heard back", "status"],
};

/**
 * Score how well a template matches an email's content
 */
function scoreTemplateMatch(
  templateName: string,
  emailSubject: string,
  emailBody: string
): number {
  const combined = `${emailSubject}\n${emailBody}`.toLowerCase();
  let score = 0;

  for (const [category, keywords] of Object.entries(TEMPLATE_KEYWORDS)) {
    // Check if template name relates to this category
    const nameMatch = templateName.toLowerCase().includes(category);

    // Check if email content matches this category's keywords
    const contentMatches = keywords.filter((kw) => combined.includes(kw)).length;

    if (nameMatch && contentMatches > 0) {
      score += 10 + contentMatches * 2; // Strong match: template category matches content
    } else if (contentMatches > 0) {
      score += contentMatches; // Partial: content matches but template name doesn't
    }
  }

  return score;
}

/**
 * Find the best matching template for an email
 */
export async function findBestTemplate(
  email: EmailMessage
): Promise<{ name: string; subject: string; html: string; text: string } | null> {
  const templates = await fetchTemplates();

  if (templates.size === 0) {
    console.log("No templates found in Gmail");
    return null;
  }

  let bestMatch: { name: string; subject: string; html: string; text: string } | null = null;
  let bestScore = 0;

  for (const [name, template] of templates) {
    const score = scoreTemplateMatch(name, email.subject, email.textBody);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { name, ...template };
    }
  }

  // Only use template if score is meaningful (at least one keyword matched)
  if (bestScore < 2) {
    console.log(`No good template match for "${email.subject}" (best score: ${bestScore})`);
    return null;
  }

  console.log(`Best template for "${email.subject}": "${bestMatch?.name}" (score: ${bestScore})`);
  return bestMatch;
}

/**
 * Create a draft reply using the best matching template
 */
export async function createDraftReply(email: EmailMessage): Promise<{
  created: boolean;
  templateName: string | null;
}> {
  const template = await findBestTemplate(email);

  if (!template) {
    return { created: false, templateName: null };
  }

  const success = await createDraft(
    email,
    email.subject,
    template.html || `<p>${template.text}</p>`,
    template.text
  );

  return {
    created: success,
    templateName: template.name,
  };
}
