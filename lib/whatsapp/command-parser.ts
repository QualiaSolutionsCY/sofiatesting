/**
 * WhatsApp Command Parser
 * Handles slash-like commands and interactive menus
 */

export type WhatsAppCommand = {
  type: "command" | "menu_selection" | "text";
  command?: string;
  args?: string[];
  selection?: number;
  raw: string;
};

// Command definitions
export const COMMANDS = {
  help: {
    description: "Show available commands",
    aliases: ["?", "commands"],
  },
  templates: {
    description: "Show document templates menu",
    aliases: ["docs", "documents", "forms"],
  },
  listing: {
    description: "Start property listing upload",
    aliases: ["upload", "property", "add"],
  },
  calculator: {
    description: "Show calculator options",
    aliases: ["calc", "calculate"],
  },
  status: {
    description: "Check your listings status",
    aliases: ["my", "listings"],
  },
} as const;

/**
 * Parse incoming WhatsApp message for commands
 */
export function parseWhatsAppCommand(message: string): WhatsAppCommand {
  const trimmed = message.trim();

  // Check for slash command
  if (trimmed.startsWith("/")) {
    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return {
      type: "command",
      command,
      args,
      raw: trimmed,
    };
  }

  // Check for menu selection (single number 1-9)
  if (/^[1-9]$/.test(trimmed)) {
    return {
      type: "menu_selection",
      selection: Number.parseInt(trimmed, 10),
      raw: trimmed,
    };
  }

  // Check for common command keywords without slash
  const lowerMessage = trimmed.toLowerCase();
  const commandKeywords = [
    "help",
    "menu",
    "templates",
    "documents",
    "listing",
    "upload",
    "calculator",
    "calculate vat",
    "transfer fees",
  ];

  for (const keyword of commandKeywords) {
    if (lowerMessage === keyword || lowerMessage === `${keyword}?`) {
      // Convert to command format
      const cmdName = keyword.split(" ")[0];
      return {
        type: "command",
        command: cmdName,
        args: keyword.split(" ").slice(1),
        raw: trimmed,
      };
    }
  }

  // Regular text message
  return {
    type: "text",
    raw: trimmed,
  };
}

/**
 * Format a menu for WhatsApp display
 */
export function formatWhatsAppMenu(
  title: string,
  options: Array<{ id: string; label: string; description?: string }>
): string {
  let menu = `📋 *${title}*\n\n`;

  options.forEach((option, index) => {
    const num = index + 1;
    menu += `*${num}.* ${option.label}`;
    if (option.description) {
      menu += `\n   _${option.description}_`;
    }
    menu += "\n\n";
  });

  menu += "_Reply with a number (1-" + options.length + ") to select_";

  return menu;
}

/**
 * Generate template selection menu
 */
export function getTemplateMenu(): string {
  const templates = [
    {
      id: "seller_registration",
      label: "Seller Registration Form",
      description: "Register property for sale",
    },
    {
      id: "bank_registration",
      label: "Bank Registration",
      description: "Property or land bank forms",
    },
    {
      id: "viewing_form",
      label: "Viewing Request Form",
      description: "Schedule property viewing",
    },
    {
      id: "marketing_agreement",
      label: "Marketing Agreement",
      description: "Exclusive/Non-exclusive",
    },
    {
      id: "followup_email",
      label: "Client Follow-up Email",
      description: "Email template (text)",
    },
    {
      id: "valuation_email",
      label: "Valuation Email",
      description: "Property valuation template",
    },
    {
      id: "offer_submission",
      label: "Offer Submission",
      description: "Submit property offer",
    },
    {
      id: "other",
      label: "Other Templates",
      description: "See more options",
    },
  ];

  return formatWhatsAppMenu("Document Templates", templates);
}

/**
 * Generate calculator menu
 */
export function getCalculatorMenu(): string {
  const calculators = [
    {
      id: "vat",
      label: "VAT Calculator",
      description: "Calculate property VAT",
    },
    {
      id: "transfer_fees",
      label: "Transfer Fees",
      description: "Buyer transfer fees",
    },
    {
      id: "capital_gains",
      label: "Capital Gains Tax",
      description: "Seller CGT calculation",
    },
  ];

  return formatWhatsAppMenu("Calculators", calculators);
}

/**
 * Generate listing type menu
 */
export function getListingTypeMenu(): string {
  const types = [
    {
      id: "apartment",
      label: "Apartment",
      description: "Flat, studio, penthouse",
    },
    {
      id: "house",
      label: "House",
      description: "Villa, townhouse, bungalow",
    },
    {
      id: "land",
      label: "Land",
      description: "Plot for development",
    },
    {
      id: "commercial",
      label: "Commercial",
      description: "Shop, office, warehouse",
    },
  ];

  return formatWhatsAppMenu("Property Type", types);
}

/**
 * Main help menu
 */
export function getHelpMenu(): string {
  return `👋 *SOFIA WhatsApp Assistant*

I can help you with:

📝 *Documents & Forms*
Type "templates" or "1"

🏠 *Upload Property Listing*
Type "listing" or "2"

🧮 *Calculators*
Type "calculator" or "3"

📊 *Your Listings*
Type "status" or "4"

💬 *Ask Me Anything*
Just type your question!

_Tip: You can also use / commands like /help, /templates, /listing_`;
}
