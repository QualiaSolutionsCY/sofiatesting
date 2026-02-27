/**
 * Tool Executor
 * Routes tool calls from OpenRouter to handler modules and returns results
 */

import { Agent } from "../agents/identifier.ts";
import { RejectionError } from "../rules/reviewer-assignment.ts";
import { logger, LogCategory } from "../utils/logger.ts";
import { classifyError, getUserFriendlyMessage, ErrorType } from "../utils/error-mapper.ts";
import { trackToolUsed, trackPropertyUploaded, trackDocumentGenerated, createTimer } from "../services/analytics.ts";
import { handleCreatePropertyListing } from "./handlers/property-listing.ts";
import { handleCalculateVAT, handleCalculateTransferFees, handleCalculateCapitalGains } from "./handlers/calculators.ts";
import { handleGetZyprusData, handleGetRegionalAgents, handleExtractFromBazaraki } from "./handlers/data-retrieval.ts";
import { handleSendEmail } from "./handlers/email.ts";

export interface ToolResult {
  success?: boolean;
  error?: string;
  needsInput?: boolean;
  question?: string;
  message?: string;
  data?: unknown;
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
  supabaseUrl: string,
  supabaseKey: string,
  phoneNumber?: string
): Promise<ToolResult> {
  const timer = createTimer();

  logger.info("Tool execution started", {
    category: LogCategory.TOOL,
    toolName: tool.name,
    agentName: agent?.fullName,
  });

  try {
    let result: ToolResult;

    switch (tool.name) {
      case "createPropertyListing":
        result = await handleCreatePropertyListing(tool.arguments, agent, supabaseUrl, supabaseKey);
        // Track successful property upload
        if (result.success && phoneNumber) {
          trackPropertyUploaded(phoneNumber, agent?.id, {
            propertyType: tool.arguments.propertyType,
            location: tool.arguments.location,
          });
        }
        break;

      case "getZyprusData":
        result = await handleGetZyprusData(tool.arguments);
        break;

      case "calculateVAT":
        result = handleCalculateVAT(tool.arguments);
        break;

      case "calculateTransferFees":
        result = handleCalculateTransferFees(tool.arguments);
        break;

      case "calculateCapitalGains":
        result = handleCalculateCapitalGains(tool.arguments);
        break;

      case "getRegionalAgents":
        result = await handleGetRegionalAgents(tool.arguments);
        break;

      case "extractFromBazaraki":
        result = await handleExtractFromBazaraki(tool.arguments);
        break;

      case "sendEmail":
        result = await handleSendEmail(tool.arguments, agent, phoneNumber);
        // Track document sent via email
        if (result.success && phoneNumber && (tool.arguments.attachmentUrl || result.data?.attachedDocument)) {
          trackDocumentGenerated(phoneNumber, "email_with_document", agent?.id);
        }
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
