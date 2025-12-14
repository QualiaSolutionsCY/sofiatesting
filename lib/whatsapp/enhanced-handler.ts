/**
 * Enhanced WhatsApp Message Handler with Interactive Features
 */

import { getWhatsAppClient } from "./client";
import {
  getCalculatorMenu,
  getHelpMenu,
  getListingTypeMenu,
  parseWhatsAppCommand,
} from "./command-parser";

import {
  clearSession,
  getListingProgress,
  getSession,
  handleMenuSelection,
  updateSession,
} from "./session-manager";
import {
  formatTemplateMenu,
  getListingWorkflowStep,
  getQuickTemplateList,
  getTemplate,
  getTemplatePrompt,
} from "./template-manager";
import type { WaSenderMessageData } from "./types";

/**
 * Handle WhatsApp message with enhanced features
 */
export async function handleEnhancedWhatsAppMessage(
  messageData: WaSenderMessageData
): Promise<void> {
  const client = getWhatsAppClient();
  const phoneNumber = messageData.from;
  const userMessage = messageData.text || "";

  // Parse command/menu selection
  const parsed = parseWhatsAppCommand(userMessage);
  const session = await getSession(phoneNumber);

  try {
    // Handle commands first (slash commands like /help, /templates)
    if (parsed.type === "command") {
      await handleCommand(phoneNumber, parsed.command || "", parsed.args || []);
      return; // IMPORTANT: Stop here, don't fall through to AI
    }

    // Handle menu selections (single digits 1-9)
    if (parsed.type === "menu_selection" && parsed.selection) {
      const action = await handleMenuSelection(phoneNumber, parsed.selection);

      if (action) {
        await executeAction(phoneNumber, action);
        return; // IMPORTANT: Stop here, don't fall through to AI
      }
      // If no action matched, let AI handle it
    }

    // Handle ongoing workflows (listing upload, etc.)
    if (session.currentMenu === "listing" && session.listingData) {
      await handleListingWorkflow(phoneNumber, userMessage);
      return; // IMPORTANT: Stop here
    }

    // Natural language template matching BEFORE showing generic help
    const lowerMessage = userMessage.toLowerCase().trim();

    // Check for template-related requests in natural language
    const templateMatch = matchNaturalTemplateRequest(lowerMessage);
    if (templateMatch) {
      if (templateMatch.type === "show_menu") {
        await updateSession(phoneNumber, { currentMenu: "templates" });
        await client.sendMessage({
          to: phoneNumber,
          text: formatTemplateMenu(),
        });
        return;
      }
      if (templateMatch.type === "generate" && templateMatch.templateId) {
        await generateTemplate(phoneNumber, templateMatch.templateId);
        return;
      }
      if (templateMatch.type === "show_options" && templateMatch.message) {
        await client.sendMessage({
          to: phoneNumber,
          text: templateMatch.message,
        });
        return;
      }
    }

    // Check for EXPLICIT calculator menu requests (short commands only)
    // Conversational queries like "calculate VAT for €500,000" go to AI
    const isExplicitCalcRequest =
      lowerMessage === "calculator" ||
      lowerMessage === "calculators" ||
      lowerMessage === "calc" ||
      lowerMessage === "/calc" ||
      lowerMessage === "/calculator";

    if (isExplicitCalcRequest) {
      await updateSession(phoneNumber, { currentMenu: "calculator" });
      await client.sendMessage({
        to: phoneNumber,
        text: getCalculatorMenu(),
      });
      return;
    }

    // Check for EXPLICIT listing menu requests (short commands only)
    // Conversational queries like "help me list a property" go to AI
    const isExplicitListingRequest =
      lowerMessage === "listing" ||
      lowerMessage === "listings" ||
      lowerMessage === "upload" ||
      lowerMessage === "/listing" ||
      lowerMessage === "/upload" ||
      lowerMessage === "/property";

    if (isExplicitListingRequest) {
      await updateSession(phoneNumber, { currentMenu: "listing_type" });
      await client.sendMessage({
        to: phoneNumber,
        text: getListingTypeMenu(),
      });
      return;
    }

    // Only show help menu for explicit greetings - let AI handle rest
    if (
      lowerMessage === "hi" ||
      lowerMessage === "hello" ||
      lowerMessage === "hey" ||
      lowerMessage === "help" ||
      lowerMessage === "menu" ||
      lowerMessage === "start"
    ) {
      await client.sendMessage({
        to: phoneNumber,
        text: getHelpMenu(),
      });
      return; // IMPORTANT: Stop here, don't call AI for greetings
    }

    // For all other messages, let AI handle naturally
    // This includes conversational queries, follow-ups, etc.
    await processWithAI(phoneNumber, userMessage);
  } catch (error) {
    console.error("Error in enhanced handler:", error);
    await client.sendMessage({
      to: phoneNumber,
      text: "Sorry, I encountered an error. Type 'help' to see available options.",
    });
  }
}

/**
 * Match natural language template requests
 */
function matchNaturalTemplateRequest(message: string): {
  type: "show_menu" | "generate" | "show_options";
  templateId?: string;
  message?: string;
} | null {
  // Check for generic "templates" or "documents" request
  if (
    message === "templates" ||
    message === "documents" ||
    message === "forms" ||
    message === "docs"
  ) {
    return { type: "show_menu" };
  }

  // Marketing agreement variations
  if (
    message.includes("marketing agreement") ||
    message.includes("marketing")
  ) {
    if (message.includes("exclusive") && !message.includes("non")) {
      return { type: "generate", templateId: "marketing_agreement_exclusive" };
    }
    if (
      message.includes("non-exclusive") ||
      message.includes("nonexclusive") ||
      message.includes("non exclusive")
    ) {
      return {
        type: "generate",
        templateId: "marketing_agreement_nonexclusive",
      };
    }
    if (
      message.includes("off-market") ||
      message.includes("offmarket") ||
      message.includes("off market")
    ) {
      return { type: "generate", templateId: "marketing_agreement_offmarket" };
    }
    // Show options for generic "marketing" request
    return {
      type: "show_options",
      message:
        "📄 *Marketing Agreements*\n\nWhich type do you need?\n\n*1.* Exclusive Marketing Agreement\n*2.* Non-Exclusive Marketing Agreement\n*3.* Off-Market Agreement\n\n_Reply with a number or type the full name_",
    };
  }

  // Email templates
  if (message.includes("email")) {
    if (message.includes("introduction") || message.includes("intro")) {
      return { type: "generate", templateId: "introduction_email" };
    }
    if (message.includes("follow") || message.includes("followup")) {
      return { type: "generate", templateId: "followup_viewed" };
    }
    if (message.includes("valuation")) {
      return { type: "generate", templateId: "valuation_report" };
    }
    if (message.includes("welcome")) {
      return { type: "generate", templateId: "welcome_email" };
    }
    // Show email options
    return {
      type: "show_options",
      message:
        "✉️ *Email Templates*\n\nPopular options:\n\n*1.* Introduction Email\n*2.* Follow-up After Viewing\n*3.* Property Match Email\n*4.* Valuation Report\n*5.* Welcome Email\n\n_Reply with a number or describe what you need_",
    };
  }

  // Registration forms
  if (
    message.includes("seller registration") ||
    message.includes("seller form")
  ) {
    if (message.includes("exclusive")) {
      return { type: "generate", templateId: "seller_registration_exclusive" };
    }
    if (message.includes("non")) {
      return {
        type: "generate",
        templateId: "seller_registration_nonexclusive",
      };
    }
    return { type: "generate", templateId: "seller_registration" };
  }

  if (
    message.includes("bank") &&
    (message.includes("registration") || message.includes("form"))
  ) {
    if (message.includes("land")) {
      return { type: "generate", templateId: "bank_registration_land" };
    }
    return { type: "generate", templateId: "bank_registration_property" };
  }

  if (
    message.includes("viewing") &&
    (message.includes("form") || message.includes("request"))
  ) {
    return { type: "generate", templateId: "viewing_form" };
  }

  if (message.includes("booking") || message.includes("book")) {
    return { type: "generate", templateId: "booking_form" };
  }

  if (message.includes("reservation") || message.includes("reserve")) {
    return { type: "generate", templateId: "reservation_form" };
  }

  if (
    message.includes("offer") &&
    (message.includes("submission") || message.includes("submit"))
  ) {
    return { type: "generate", templateId: "offer_submission" };
  }

  return null;
}

/**
 * Handle slash commands
 */
async function handleCommand(
  phoneNumber: string,
  command: string,
  args: string[]
): Promise<void> {
  const client = getWhatsAppClient();

  switch (command) {
    case "help":
    case "?":
    case "menu":
      await client.sendMessage({
        to: phoneNumber,
        text: getHelpMenu(),
      });
      break;

    case "templates":
    case "docs":
    case "documents":
      await updateSession(phoneNumber, { currentMenu: "templates" });
      await client.sendMessage({
        to: phoneNumber,
        text: formatTemplateMenu(),
      });
      break;

    case "listing":
    case "upload":
    case "property":
      await updateSession(phoneNumber, { currentMenu: "listing_type" });
      await client.sendMessage({
        to: phoneNumber,
        text: getListingTypeMenu(),
      });
      break;

    case "calculator":
    case "calc":
      await updateSession(phoneNumber, { currentMenu: "calculator" });
      await client.sendMessage({
        to: phoneNumber,
        text: getCalculatorMenu(),
      });
      break;

    case "status":
    case "my":
    case "listings":
      await showListingsStatus(phoneNumber);
      break;

    case "clear":
    case "reset":
      await clearSession(phoneNumber);
      await client.sendMessage({
        to: phoneNumber,
        text: "Session cleared. Type 'help' to start fresh.",
      });
      break;

    case "quick":
      await client.sendMessage({
        to: phoneNumber,
        text: getQuickTemplateList(),
      });
      break;

    default:
      await client.sendMessage({
        to: phoneNumber,
        text: `Unknown command: ${command}\n\nType 'help' to see available commands.`,
      });
  }
}

/**
 * Execute menu action
 */
async function executeAction(
  phoneNumber: string,
  action: { action: string; data?: any }
): Promise<void> {
  const client = getWhatsAppClient();

  switch (action.action) {
    case "show_templates":
      await client.sendMessage({
        to: phoneNumber,
        text: formatTemplateMenu(),
      });
      break;

    case "show_calculators":
      await client.sendMessage({
        to: phoneNumber,
        text: getCalculatorMenu(),
      });
      break;

    case "start_listing":
      await client.sendMessage({
        to: phoneNumber,
        text: getListingWorkflowStep(1),
      });
      break;

    case "continue_listing":
      await updateSession(phoneNumber, { currentMenu: "listing" });
      await client.sendMessage({
        to: phoneNumber,
        text: getListingWorkflowStep(2, action.data?.type),
      });
      break;

    case "generate_document":
    case "generate_email_template": {
      const template = action.data?.template;
      if (template) {
        await generateTemplate(phoneNumber, template);
      }
      break;
    }

    case "start_calculator": {
      const calcType = action.data?.type;
      if (calcType) {
        await startCalculator(phoneNumber, calcType);
      }
      break;
    }

    case "show_status":
      await showListingsStatus(phoneNumber);
      break;

    default:
      await client.sendMessage({
        to: phoneNumber,
        text: "Processing your request...",
      });
  }
}

/**
 * Generate template (document or email)
 */
async function generateTemplate(
  phoneNumber: string,
  templateId: string
): Promise<void> {
  const client = getWhatsAppClient();
  const template = getTemplate(templateId);

  if (!template) {
    await client.sendMessage({
      to: phoneNumber,
      text: "Template not found. Type 'templates' to see available options.",
    });
    return;
  }

  // Get the prompt for AI generation
  const prompt = getTemplatePrompt(templateId);

  // For now, send a message explaining what would happen
  // In production, this would call your AI to generate the actual template
  if (template.deliveryMethod === "document") {
    await client.sendMessage({
      to: phoneNumber,
      text: `📄 *Generating ${template.name}*\n\nI'll need some information to complete this document:\n\n${prompt}\n\nPlease provide the required details.`,
    });
  } else {
    await client.sendMessage({
      to: phoneNumber,
      text: `✉️ *Preparing ${template.name}*\n\nI'll create an email template for you.\n\n${prompt}\n\nPlease provide any specific details you'd like to include.`,
    });
  }

  // Store pending template generation in session
  await updateSession(phoneNumber, {
    pendingAction: {
      type: "generate_template",
      data: { templateId },
    },
  });
}

/**
 * Start calculator workflow
 */
async function startCalculator(
  phoneNumber: string,
  calcType: string
): Promise<void> {
  const client = getWhatsAppClient();

  const prompts = {
    vat: "🧮 *VAT Calculator*\n\nPlease provide:\n- Property price (EUR)\n- Property size (sqm)\n- Is it your main residence? (yes/no)",
    transfer_fees:
      "🧮 *Transfer Fees Calculator*\n\nPlease provide:\n- Property price (EUR)\n- Is it in joint names? (yes/no)",
    capital_gains:
      "🧮 *Capital Gains Calculator*\n\nFor accurate calculation, please visit:\nhttps://www.zyprus.com/capital-gains-calculator\n\nOr provide your selling price and I'll give you an estimate.",
  };

  const prompt = prompts[calcType as keyof typeof prompts];
  if (prompt) {
    await client.sendMessage({
      to: phoneNumber,
      text: prompt,
    });

    await updateSession(phoneNumber, {
      pendingAction: {
        type: "calculator",
        data: { calcType },
      },
    });
  }
}

/**
 * Handle listing workflow steps
 */
async function handleListingWorkflow(
  phoneNumber: string,
  userMessage: string
): Promise<void> {
  const client = getWhatsAppClient();
  const session = await getSession(phoneNumber);
  const listingData = session.listingData || {};

  // Determine what field we're collecting
  if (!listingData.location) {
    await updateSession(phoneNumber, {
      listingData: { ...listingData, location: userMessage },
    });
    await client.sendMessage({
      to: phoneNumber,
      text: getListingWorkflowStep(3),
    });
  } else if (!listingData.price) {
    const price = userMessage.replace(/[€,]/g, "").trim();
    await updateSession(phoneNumber, {
      listingData: { ...listingData, price },
    });
    await client.sendMessage({
      to: phoneNumber,
      text: getListingWorkflowStep(4, listingData.type),
    });
  } else if (listingData.size) {
    // Continue with remaining steps...
    await client.sendMessage({
      to: phoneNumber,
      text: await getListingProgress(phoneNumber),
    });
  } else {
    // Parse the specifications message
    const lines = userMessage.split("\n");
    const updates: Record<string, string | number> = {};
    const digitPattern = /\d+/;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes("size") || lower.includes("sqm")) {
        const match = line.match(digitPattern);
        if (match) {
          updates.size = match[0];
        }
      }
      if (lower.includes("bedroom")) {
        const match = line.match(digitPattern);
        if (match) {
          updates.bedrooms = Number.parseInt(match[0], 10);
        }
      }
      if (lower.includes("bathroom")) {
        const match = line.match(digitPattern);
        if (match) {
          updates.bathrooms = Number.parseInt(match[0], 10);
        }
      }
    }

    await updateSession(phoneNumber, {
      listingData: { ...listingData, ...updates },
    });
    await client.sendMessage({
      to: phoneNumber,
      text: getListingWorkflowStep(5),
    });
  }
}

/**
 * Show user's listings status
 */
async function showListingsStatus(phoneNumber: string): Promise<void> {
  const client = getWhatsAppClient();

  // In production, this would query the database
  await client.sendMessage({
    to: phoneNumber,
    text: "📊 *Your Listings Status*\n\nNo active listings found.\n\nType 'listing' to upload a new property.",
  });
}

/**
 * Process message with AI (fallback to existing handler)
 */
async function processWithAI(
  phoneNumber: string,
  userMessage: string
): Promise<void> {
  // Import and call your existing handleWhatsAppMessage
  const { handleWhatsAppMessage } = await import("./message-handler");

  await handleWhatsAppMessage({
    id: Date.now().toString(),
    from: phoneNumber,
    to: "",
    type: "text",
    text: userMessage,
    timestamp: Date.now(),
    isGroup: false,
  });
}
