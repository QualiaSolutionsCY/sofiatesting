/**
 * OpenRouter API TypeScript Interfaces
 *
 * Strongly typed interfaces for OpenRouter API requests and responses.
 * Eliminates `any` types and provides compile-time safety for AI chat integration.
 */

/**
 * Function call within a tool call
 */
export interface OpenRouterFunctionCall {
  name: string;
  arguments: string; // JSON string of function arguments
}

/**
 * Tool call from assistant message
 */
export interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: OpenRouterFunctionCall;
}

/**
 * Message in OpenRouter chat format
 */
export interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string; // For tool role messages
  name?: string; // Optional name for tool messages
}

/**
 * Choice in OpenRouter response
 */
export interface OpenRouterChoice {
  message: OpenRouterMessage;
  finish_reason?: string;
  index: number;
}

/**
 * Usage statistics in OpenRouter response
 */
export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * OpenRouter API response
 */
export interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices: OpenRouterChoice[];
  usage?: OpenRouterUsage;
}

/**
 * OpenRouter API error response
 */
export interface OpenRouterError {
  error: {
    status: number;
    message?: string;
    code?: string;
  };
}

/**
 * Tool definition for OpenRouter function calling
 */
export interface OpenRouterTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * OpenRouter API request body
 */
export interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: OpenRouterTool[];
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
}
