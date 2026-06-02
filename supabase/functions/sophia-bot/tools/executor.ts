/**
 * Tool Executor
 * Routes tool calls from OpenRouter to handler modules and returns results
 */

import type { Agent } from "../agents/identifier.ts";
import { RejectionError } from "../rules/reviewer-assignment.ts";
import {
  createTimer,
  trackDocumentGenerated,
  trackPropertyUploaded,
  trackToolUsed,
} from "../services/analytics.ts";
import {
  classifyError,
  getUserFriendlyMessage,
} from "../utils/error-mapper.ts";
import { LogCategory, logger } from "../utils/logger.ts";
import {
  handleCalculateCapitalGains,
  handleCalculateTransferFees,
  handleCalculateVAT,
} from "./handlers/calculators.ts";
import {
  handleExtractFromBazaraki,
  handleGetRegionalAgents,
  handleGetZyprusData,
} from "./handlers/data-retrieval.ts";
import { handleSendEmail } from "./handlers/email.ts";
import { handleCreateLandListing } from "./handlers/land-listing.ts";
import { handleCreatePropertyListing } from "./handlers/property-listing.ts";
import { handleManageInvoice } from "./handlers/invoice.ts";
import { validateToolArguments } from "./validation.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
  retryable?: boolean;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Execute a tool call with analytics tracking
 */
export async function executeTool(
  tool: ToolCall,
  agent: Agent | null,
  phoneNumber?: string
): Promise<ToolResult> {
  const timer = createTimer();

  logger.info("Tool execution started", {
    category: LogCategory.TOOL,
    toolName: tool.name,
    agentName: agent?.fullName,
  });

  // Validate tool arguments against schema (SEC-04)
  const validation = validateToolArguments(tool.name, tool.arguments);
  if (!validation.valid) {
    logger.warn("Tool validation failed", {
      category: LogCategory.TOOL,
      toolName: tool.name,
      error: validation.error,
      issues: validation.issues,
    });
    const detail = validation.issues?.length
      ? ` [${validation.issues.slice(0, 3).join("; ")}]`
      : "";
    // Use needsInput+question format so ai-chat.ts retry loop catches this
    // and gives the AI another chance to extract the fields from conversation context
    return {
      needsInput: true,
      retryable: true,
      question: `Tool validation failed for ${tool.name}: ${validation.error}${detail}. Re-read the conversation above carefully and call the tool again with ALL required fields filled in.`,
    };
  }

  // Use validated data (type-safe)
  const validArgs = validation.data;

  try {
    let result: ToolResult;

    switch (tool.name) {
      case "createPropertyListing":
        result = await handleCreatePropertyListing(validArgs, agent);
        // Track successful property upload
        if (result.success && phoneNumber) {
          trackPropertyUploaded(phoneNumber, agent?.id, {
            propertyType: validArgs.propertyType,
            location: validArgs.location,
          });
        }
        break;

      case "createLandListing":
        result = await handleCreateLandListing(validArgs, agent);
        // Track successful land upload
        if (result.success && phoneNumber) {
          trackPropertyUploaded(phoneNumber, agent?.id, {
            propertyType: "land",
            location: validArgs.location,
          });
        }
        break;

      case "getZyprusData":
        result = await handleGetZyprusData(validArgs);
        break;

      case "calculateVAT":
        result = handleCalculateVAT(validArgs);
        break;

      case "calculateTransferFees":
        result = handleCalculateTransferFees(validArgs);
        break;

      case "calculateCapitalGains":
        result = handleCalculateCapitalGains(validArgs);
        break;

      case "getRegionalAgents":
        result = await handleGetRegionalAgents(validArgs);
        break;

      case "extractFromBazaraki":
        result = await handleExtractFromBazaraki(validArgs, agent);
        break;

      case "sendEmail":
        result = await handleSendEmail(validArgs, agent, phoneNumber);
        // Track document sent via email
        if (
          result.success &&
          phoneNumber &&
          (validArgs.attachmentUrl ||
            (result.data as Record<string, unknown>)?.attachedDocument)
        ) {
          trackDocumentGenerated(phoneNumber, "email_with_document", agent?.id);
        }
        break;

      case "manageInvoice":
        result = await handleManageInvoice(validArgs, agent, phoneNumber);
        break;

      default:
        logger.warn("Unknown tool requested", {
          category: LogCategory.TOOL,
          toolName: tool.name,
        });
        return { error: `Unknown tool: ${tool.name}` };
    }

    // Track tool usage (fire-and-forget)
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: result.success ?? !result.error,
      });
    }

    return result;
  } catch (error) {
    // Track tool error
    if (phoneNumber) {
      trackToolUsed(phoneNumber, tool.name, timer.end(), agent?.id, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof RejectionError) {
      // RejectionError messages are already user-friendly
      return { error: error.message };
    }

    // Classify and log the error
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const errorType = classifyError(errorObj);

    logger.error("Tool execution failed", errorObj, {
      category: LogCategory.TOOL,
      toolName: tool.name,
      errorType,
    });

    // Return user-friendly message
    const userMessage = getUserFriendlyMessage(errorType, `while ${tool.name}`);
    return { error: userMessage };
  }
}
