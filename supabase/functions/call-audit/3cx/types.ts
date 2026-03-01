/**
 * TypeScript types for 3CX API integration
 *
 * Covers authentication, call log entries, and audit results
 * for the call audit system.
 */

/**
 * 3CX connection configuration
 */
export interface ThreeCXConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * 3CX login API response structure
 *
 * Different 3CX versions may return slightly different formats,
 * but Status and Token are standard across versions.
 */
export interface ThreeCXLoginResponse {
  Status: string; // "Ok" on success, "AuthenticationFailed" on error
  Token?: string; // Session token for API calls
  SessionId?: string; // Alternative session identifier
  ExpiresIn?: number; // Token expiration in seconds
  ErrorMessage?: string; // Error details if Status != "Ok"
}

/**
 * Individual call log entry from 3CX
 *
 * Based on typical 3CX call log API responses.
 * Field names may vary between 3CX versions.
 */
export interface ThreeCXCallLogEntry {
  id: number;
  callTime: string; // ISO timestamp or 3CX date format
  callerNumber: string; // Source phone number
  calledNumber: string; // Destination phone number
  duration: number; // Call duration in seconds
  status: string; // "Answered", "Missed", "Busy", etc.
  direction: string; // "Inbound", "Outbound", "Internal"
  agentExtension?: string; // Which internal extension handled the call
  callType?: string; // Additional call categorization
}

/**
 * 3CX call log API response structure
 */
export interface ThreeCXCallLogResponse {
  list: ThreeCXCallLogEntry[];
  totalCount: number;
  hasMore?: boolean;
  nextPageToken?: string;
}

/**
 * Result of processing a day's worth of calls
 */
export interface CallAuditResult {
  date: string; // YYYY-MM-DD format
  totalCalls: number; // Total calls processed
  externalCallers: string[]; // List of external phone numbers that called
  internalFiltered: number; // Count of internal calls filtered out
  errors: string[]; // Any errors encountered during processing
  callTimeMap: Record<string, string>; // phone -> ISO timestamp of earliest call
}

/**
 * Custom error for 3CX authentication failures
 */
export class ThreeCXAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "ThreeCXAuthError";
  }
}

/**
 * Custom error for 3CX API failures
 */
export class ThreeCXAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly endpoint?: string
  ) {
    super(message);
    this.name = "ThreeCXAPIError";
  }
}
