/**
 * 3CX Call Log Extraction and Filtering Service
 *
 * Handles fetching call logs from 3CX, filtering out internal calls,
 * and extracting external caller phone numbers for lead tracking.
 *
 * Features:
 * - Cyprus timezone-aware date range calculation
 * - Multiple 3CX API endpoint support (v18+ and legacy)
 * - Internal extension filtering (removes agent phones)
 * - Phone number normalization for Cyprus and international formats
 * - Deduplication of caller numbers
 * - Resilient parsing for different 3CX API versions
 */

import { logger, LogCategory } from "../../sophia-bot/utils/logger.ts";
import { ThreeCXClient } from "./client.ts";
import { ThreeCXCallLogEntry, CallAuditResult } from "./types.ts";
import { AUDIT_CONFIG } from "../config.ts";

/**
 * Extract today's call logs from 3CX system
 *
 * @param client Authenticated 3CX client
 * @returns Raw call log entries from 3CX API
 */
export async function extractTodayCalls(client: ThreeCXClient): Promise<ThreeCXCallLogEntry[]> {
  logger.info("[Call Log Extractor] Starting call log extraction", {
    category: LogCategory.GENERAL,
    targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
    timezone: AUDIT_CONFIG.TIMEZONE,
  });

  // Calculate today's date range in Cyprus timezone
  const cyprusNow = new Date().toLocaleString("en-CA", {
    timeZone: AUDIT_CONFIG.TIMEZONE
  });
  const todayDate = cyprusNow.split(',')[0]; // Extract YYYY-MM-DD part

  // Create start of day (00:00:00) and end of day (23:59:59) in Cyprus time
  const startOfDayLocal = new Date(`${todayDate}T00:00:00`);
  const endOfDayLocal = new Date(`${todayDate}T23:59:59`);

  // Convert to Cyprus timezone offset and then to UTC
  const cyprusOffset = -2; // Cyprus is UTC+2 (standard) or UTC+3 (DST)
  const now = new Date();
  const isDST = now.getMonth() >= 2 && now.getMonth() <= 9; // Rough DST check
  const actualOffset = isDST ? -3 : -2;

  const startOfDay = new Date(startOfDayLocal.getTime() - (actualOffset * 60 * 60 * 1000)).toISOString();
  const endOfDay = new Date(endOfDayLocal.getTime() - (actualOffset * 60 * 60 * 1000)).toISOString();

  logger.info("[Call Log Extractor] Date range calculated", {
    category: LogCategory.GENERAL,
    startOfDay,
    endOfDay,
    cyprusDate: todayDate,
  });

  // Try multiple 3CX API endpoints (versions vary)
  const endpoints = [
    {
      name: "v18+ REST API",
      method: "GET",
      path: `/api/calllog?dateFrom=${encodeURIComponent(startOfDay)}&dateTo=${encodeURIComponent(endOfDay)}&filter=${encodeURIComponent(AUDIT_CONFIG.TARGET_NUMBER)}`,
    },
    {
      name: "Legacy Call Log API",
      method: "POST",
      path: "/api/activeCalls/getCallLog",
      body: JSON.stringify({
        dateFrom: startOfDay,
        dateTo: endOfDay,
        filter: AUDIT_CONFIG.TARGET_NUMBER,
      }),
    },
    {
      name: "Web Client API",
      method: "GET",
      path: `/webclient/api/CallLog/GetCallHistory?from=${encodeURIComponent(startOfDay)}&to=${encodeURIComponent(endOfDay)}`,
    }
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      logger.info(`[Call Log Extractor] Trying ${endpoint.name}`, {
        category: LogCategory.GENERAL,
        path: endpoint.path,
      });

      const requestOptions: RequestInit = {
        method: endpoint.method,
      };

      if (endpoint.body) {
        requestOptions.body = endpoint.body;
        requestOptions.headers = {
          "Content-Type": "application/json",
        };
      }

      const response = await client.makeAuthenticatedRequest(endpoint.path, requestOptions);

      if (!response.ok) {
        if (response.status === 404) {
          logger.debug(`[Call Log Extractor] ${endpoint.name} not available (404)`, {
            category: LogCategory.GENERAL,
          });
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      logger.debug(`[Call Log Extractor] Raw response from ${endpoint.name}`, {
        category: LogCategory.GENERAL,
        responseLength: responseText.length,
        responseSample: responseText.substring(0, 200),
      });

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Parse response based on common 3CX API formats
      const entries = parseCallLogResponse(data, endpoint.name);

      logger.info(`[Call Log Extractor] Successfully extracted calls via ${endpoint.name}`, {
        category: LogCategory.GENERAL,
        totalCalls: entries.length,
      });

      return entries;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`[Call Log Extractor] ${endpoint.name} failed`, {
        category: LogCategory.GENERAL,
        error: lastError.message,
      });
    }
  }

  // All endpoints failed
  throw new Error(`All call log API endpoints failed. Last error: ${lastError?.message || "Unknown error"}`);
}

/**
 * Parse call log response from various 3CX API formats
 *
 * @param data Raw response data from 3CX API
 * @param endpointName Name of the endpoint (for logging)
 * @returns Parsed call log entries
 */
function parseCallLogResponse(data: any, endpointName: string): ThreeCXCallLogEntry[] {
  const entries: ThreeCXCallLogEntry[] = [];

  // Handle different response formats
  let callList: any[] = [];

  if (Array.isArray(data)) {
    callList = data;
  } else if (data.list && Array.isArray(data.list)) {
    callList = data.list;
  } else if (data.calls && Array.isArray(data.calls)) {
    callList = data.calls;
  } else if (data.data && Array.isArray(data.data)) {
    callList = data.data;
  } else {
    logger.warn("[Call Log Extractor] Unknown response format", {
      category: LogCategory.GENERAL,
      endpoint: endpointName,
      dataType: typeof data,
      keys: Object.keys(data || {}),
    });
    return [];
  }

  logger.debug("[Call Log Extractor] Parsing call entries", {
    category: LogCategory.GENERAL,
    endpoint: endpointName,
    entryCount: callList.length,
  });

  for (const [index, entry] of callList.entries()) {
    try {
      const parsedEntry = parseCallEntry(entry);
      if (parsedEntry) {
        entries.push(parsedEntry);
      }
    } catch (error) {
      logger.warn("[Call Log Extractor] Failed to parse call entry", {
        category: LogCategory.GENERAL,
        index,
        error: error instanceof Error ? error.message : String(error),
        entryKeys: Object.keys(entry || {}),
      });
    }
  }

  return entries;
}

/**
 * Parse individual call entry with field name variation handling
 *
 * @param entry Raw call entry from 3CX API
 * @returns Parsed call entry or null if invalid
 */
function parseCallEntry(entry: any): ThreeCXCallLogEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  // Try different field name variations (3CX APIs vary)
  const getId = () =>
    entry.id || entry.Id || entry.CallId || entry.call_id || entry.rowId || Date.now() + Math.random();

  const getCallTime = () =>
    entry.callTime || entry.CallTime || entry.Time || entry.StartTime ||
    entry.start_time || entry.timestamp || entry.DateTime || new Date().toISOString();

  const getCallerNumber = () =>
    entry.callerNumber || entry.CallerNumber || entry.Caller || entry.from ||
    entry.From || entry.caller || entry.source || entry.Source;

  const getCalledNumber = () =>
    entry.calledNumber || entry.CalledNumber || entry.Called || entry.to ||
    entry.To || entry.called || entry.destination || entry.Destination;

  const getDuration = () =>
    entry.duration || entry.Duration || entry.CallDuration || entry.call_duration || 0;

  const getStatus = () =>
    entry.status || entry.Status || entry.CallStatus || entry.call_status || "Unknown";

  const getDirection = () =>
    entry.direction || entry.Direction || entry.CallDirection || entry.call_direction ||
    entry.Type || entry.type || "Unknown";

  const getAgentExtension = () =>
    entry.agentExtension || entry.AgentExtension || entry.Extension || entry.extension ||
    entry.AgentId || entry.agent_id || undefined;

  const callerNumber = getCallerNumber();
  const calledNumber = getCalledNumber();

  if (!callerNumber || !calledNumber) {
    // Skip entries without phone numbers
    return null;
  }

  return {
    id: getId(),
    callTime: getCallTime(),
    callerNumber: String(callerNumber),
    calledNumber: String(calledNumber),
    duration: Number(getDuration()) || 0,
    status: String(getStatus()),
    direction: String(getDirection()),
    agentExtension: getAgentExtension() ? String(getAgentExtension()) : undefined,
    callType: entry.callType || entry.CallType || undefined,
  };
}

/**
 * Filter external callers from call log entries
 *
 * @param entries Raw call log entries
 * @returns Processed audit result with external caller list
 */
export function filterExternalCallers(entries: ThreeCXCallLogEntry[]): CallAuditResult {
  const today = new Date().toLocaleString("en-CA", {
    timeZone: AUDIT_CONFIG.TIMEZONE
  }).split(',')[0];

  logger.info("[Call Log Extractor] Starting call filtering", {
    category: LogCategory.GENERAL,
    totalEntries: entries.length,
    targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
    internalExtensions: AUDIT_CONFIG.INTERNAL_EXTENSIONS,
  });

  const externalCallerSet = new Set<string>();
  let internalFiltered = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      // Check if this is a call to our target number
      const isTargetCall = entry.calledNumber.includes(AUDIT_CONFIG.TARGET_NUMBER) ||
        entry.calledNumber === AUDIT_CONFIG.TARGET_NUMBER;

      if (!isTargetCall) {
        continue; // Not a call to our main line
      }

      // Check if this is an inbound call
      const isInbound = entry.direction.toLowerCase().includes('inbound') ||
        entry.direction.toLowerCase() === 'in' ||
        entry.direction === '1'; // Some 3CX versions use numeric codes

      if (!isInbound) {
        continue; // Only track incoming calls
      }

      // Check if caller is an internal extension
      const isInternal = AUDIT_CONFIG.INTERNAL_EXTENSIONS.includes(entry.callerNumber) ||
        AUDIT_CONFIG.INTERNAL_EXTENSIONS.some(ext => entry.callerNumber.endsWith(ext));

      if (isInternal) {
        internalFiltered++;
        continue;
      }

      // Normalize and add external caller
      const normalizedNumber = normalizePhoneNumber(entry.callerNumber);
      if (normalizedNumber) {
        externalCallerSet.add(normalizedNumber);
      } else {
        errors.push(`Invalid phone number format: ${entry.callerNumber}`);
      }

    } catch (error) {
      const errorMsg = `Failed to process entry ${entry.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.warn("[Call Log Extractor] Entry processing error", {
        category: LogCategory.GENERAL,
        entryId: entry.id,
        error: errorMsg,
      });
    }
  }

  const externalCallers = Array.from(externalCallerSet).sort();

  logger.info("[Call Log Extractor] Call filtering completed", {
    category: LogCategory.GENERAL,
    totalCalls: entries.length,
    externalCallers: externalCallers.length,
    internalFiltered,
    errors: errors.length,
  });

  return {
    date: today,
    totalCalls: entries.length,
    externalCallers,
    internalFiltered,
    errors,
  };
}

/**
 * Normalize phone number to consistent format
 *
 * @param phone Raw phone number string
 * @returns Normalized phone number with country code, or null if invalid
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Strip whitespace, dashes, parentheses, dots
  let cleaned = phone.replace(/[\s\-\(\)\.\+]/g, '');

  // Remove any remaining non-numeric characters except leading +
  if (phone.startsWith('+')) {
    cleaned = '+' + cleaned.replace(/[^0-9]/g, '');
  } else {
    cleaned = cleaned.replace(/[^0-9]/g, '');
  }

  if (cleaned.length < 7) {
    logger.warn("[Call Log Extractor] Phone number too short", {
      category: LogCategory.GENERAL,
      originalPhone: phone,
      cleaned,
    });
    return null;
  }

  // Handle different formats
  if (cleaned.startsWith('+357')) {
    // Already has Cyprus country code
    return cleaned;
  }

  if (cleaned.startsWith('357') && cleaned.length >= 11) {
    // Cyprus number without + prefix
    return '+' + cleaned;
  }

  if (cleaned.startsWith('0') && cleaned.length === 9) {
    // Cyprus local format with leading zero: "022032770"
    return '+357' + cleaned.substring(1);
  }

  if (cleaned.length === 8 && (cleaned.startsWith('2') || cleaned.startsWith('9'))) {
    // Cyprus local format without leading zero: "22032770" or "99123456"
    return '+357' + cleaned;
  }

  if (cleaned.startsWith('+')) {
    // International number with country code
    return cleaned;
  }

  if (cleaned.length >= 10 && !cleaned.startsWith('357')) {
    // Assume international number without + prefix
    return '+' + cleaned;
  }

  // If we can't determine the format, log warning and skip
  logger.warn("[Call Log Extractor] Could not normalize phone number", {
    category: LogCategory.GENERAL,
    originalPhone: phone,
    cleaned,
    length: cleaned.length,
  });

  return null;
}