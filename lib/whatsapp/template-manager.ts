/**
 * WhatsApp Template Manager
 * Handles template selection and generation based on config
 */

import templateConfig from "./template-config.json" with { type: "json" };

export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  deliveryMethod: "document" | "text";
  templateId: string;
  category: string;
  subject?: string;
};

type RawTemplate = {
  name: string;
  description: string;
  deliveryMethod: string;
  templateId: string;
  category: string;
  subject?: string;
};

/**
 * Get all templates by category
 */
export function getTemplatesByCategory(): Record<string, TemplateInfo[]> {
  const byCategory: Record<string, TemplateInfo[]> = {};

  for (const [id, template] of Object.entries(templateConfig.templates) as [
    string,
    RawTemplate,
  ][]) {
    if (!byCategory[template.category]) {
      byCategory[template.category] = [];
    }
    byCategory[template.category].push({
      id,
      name: template.name,
      description: template.description,
      deliveryMethod: template.deliveryMethod as "document" | "text",
      templateId: template.templateId,
      category: template.category,
      subject: template.subject,
    });
  }

  return byCategory;
}

/**
 * Get template by ID
 */
export function getTemplate(templateId: string): TemplateInfo | null {
  const template = templateConfig.templates[
    templateId as keyof typeof templateConfig.templates
  ] as RawTemplate | undefined;
  if (!template) return null;

  return {
    id: templateId,
    name: template.name,
    description: template.description,
    deliveryMethod: template.deliveryMethod as "document" | "text",
    templateId: template.templateId,
    category: template.category,
    subject: template.subject,
  };
}

/**
 * Format template menu for WhatsApp
 */
export function formatTemplateMenu(category?: string): string {
  const byCategory = getTemplatesByCategory();

  if (!category) {
    // Show category selection
    let menu = "📋 *Document & Email Templates*\n\n";
    let num = 1;

    for (const [catId, catInfo] of Object.entries(templateConfig.categories)) {
      const templates = byCategory[catId] || [];
      menu += `*${num}.* ${catInfo.icon} ${catInfo.name}\n`;
      menu += `   _${templates.length} templates available_\n\n`;
      num++;
    }

    menu += "_Reply with a number to see templates in that category_";
    return menu;
  }

  // Show templates in category
  const catInfo =
    templateConfig.categories[
      category as keyof typeof templateConfig.categories
    ];
  const templates = byCategory[category] || [];

  if (!catInfo || templates.length === 0) {
    return "No templates found in this category.";
  }

  let menu = `${catInfo.icon} *${catInfo.name}*\n\n`;

  templates.slice(0, 9).forEach((template, index) => {
    const num = index + 1;
    const methodIcon = template.deliveryMethod === "document" ? "📄" : "✉️";
    menu += `*${num}.* ${methodIcon} ${template.name}\n`;
    if (template.description) {
      menu += `   _${template.description}_\n`;
    }
    menu += "\n";
  });

  if (templates.length > 9) {
    menu +=
      "_Showing first 9 templates. Type 'more' to see additional options._\n\n";
  }

  menu += "_Reply with a number to select a template_";
  return menu;
}

/**
 * Get template prompt for AI generation
 */
export function getTemplatePrompt(templateId: string): string {
  const template = getTemplate(templateId);
  if (!template) return "";

  const isDocument = template.deliveryMethod === "document";

  let prompt = `Generate ${template.name} (Template ${template.templateId}).\n`;

  if (isDocument) {
    prompt += "Format: Generate as a formal document with proper structure.\n";
    prompt += "Output: Will be sent as a DOCX file attachment.\n";
  } else {
    prompt += "Format: Generate as an email template.\n";
    if (template.subject) {
      prompt += `Subject: ${template.subject}\n`;
    }
    prompt +=
      "Output: Will be sent as WhatsApp text messages (subject and body separately).\n";
  }

  return prompt;
}

/**
 * Check if template should be sent as document
 */
export function shouldSendAsDocument(templateId: string): boolean {
  const template = getTemplate(templateId);
  return template?.deliveryMethod === "document";
}

/**
 * Get listing workflow prompts
 */
export function getListingWorkflowStep(
  step: number,
  propertyType?: string
): string {
  const steps = {
    1: {
      prompt:
        "🏠 *Starting Property Listing Upload*\n\nFirst, what type of property is this?",
      options: [
        "1. 🏢 Apartment (flat, studio, penthouse)",
        "2. 🏡 House (villa, townhouse, bungalow)",
        "3. 🏗️ Land (plot for development)",
        "4. 🏪 Commercial (shop, office, warehouse)",
      ],
    },
    2: {
      prompt:
        "Great! Now I'll collect the property details.\n\n*Please provide the location:*\n(City, area, or share Google Maps link)",
    },
    3: {
      prompt: "*What's the asking price?*\n(In EUR, e.g., 250000 or €250,000)",
    },
    4: {
      prompt: `*Property specifications:*\n\nPlease provide:\n- Size in sqm\n${
        propertyType === "land"
          ? ""
          : "- Number of bedrooms\n- Number of bathrooms\n"
      }`,
    },
    5: {
      prompt:
        "*Property features:*\n\nDoes the property have:\n1. Swimming pool? (private/communal/no)\n2. Parking? (yes/no)\n3. Air conditioning? (yes/no)",
    },
    6: {
      prompt:
        "*Owner/Agent Details:*\n\nPlease provide:\n- Owner/Agent name\n- Contact phone number",
    },
    7: {
      prompt:
        "*Additional Information (Optional):*\n\n- Year built\n- Energy class\n- Any special features\n- Notes for review team\n\nType 'skip' if you want to submit now.",
    },
    8: {
      prompt:
        "📸 *Photos:*\n\nPlease send property photos (up to 10).\nOr type 'done' when ready to submit.",
    },
  };

  return steps[step as keyof typeof steps]?.prompt || "";
}

/**
 * Format template list for selection
 */
export function getQuickTemplateList(): string {
  const popular = [
    "seller_registration",
    "viewing_form",
    "marketing_agreement_exclusive",
    "followup_viewed",
    "valuation_report",
    "offer_submission",
  ];

  let message = "🔥 *Popular Templates*\n\n";

  popular.forEach((id, index) => {
    const template = getTemplate(id);
    if (template) {
      const icon = template.deliveryMethod === "document" ? "📄" : "✉️";
      message += `*${index + 1}.* ${icon} ${template.name}\n`;
    }
  });

  message += "\nType a number to select, or 'all' to see all categories.";
  return message;
}
