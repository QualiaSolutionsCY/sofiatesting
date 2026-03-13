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

import { LogCategory, logger } from "../../sophia-bot/utils/logger.ts";
import { AUDIT_CONFIG } from "../config.ts";
import type { ThreeCXClient } from "./client.ts";
import type { CallAuditResult, ThreeCXCallLogEntry } from "./types.ts";

/**
 * Extract today's call logs from 3CX system
 *
 * @param client Authenticated 3CX client
 * @returns Raw call log entries from 3CX API
 */
export async function extractTodayCalls(
  client: ThreeCXClient
): Promise<ThreeCXCallLogEntry[]> {
  logger.info("[Call Log Extractor] Starting call log extraction", {
    category: LogCategory.GENERAL,
    targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
    timezone: AUDIT_CONFIG.TIMEZONE,
  });

  // Calculate today's date range in Cyprus timezone
  const cyprusNow = new Date().toLocaleString("en-CA", {
    timeZone: AUDIT_CONFIG.TIMEZONE,
  });
  const todayDate = cyprusNow.split(",")[0]; // Extract YYYY-MM-DD part

  // Create start of day (00:00:00) and end of day (23:59:59) in Cyprus time
  const startOfDayLocal = new Date(`${todayDate}T00:00:00`);
  const endOfDayLocal = new Date(`${todayDate}T23:59:59`);

  // Convert to Cyprus timezone offset and then to UTC
  const now = new Date();
  const isDST = now.getMonth() >= 2 && now.getMonth() <= 9; // Rough DST check
  const actualOffset = isDST ? -3 : -2;

  const startOfDay = new Date(
    startOfDayLocal.getTime() - actualOffset * 60 * 60 * 1000
  ).toISOString();
  const endOfDay = new Date(
    endOfDayLocal.getTime() - actualOffset * 60 * 60 * 1000
  ).toISOString();

  logger.info("[Call Log Extractor] Date range calculated", {
    category: LogCategory.GENERAL,
    startOfDay,
    endOfDay,
    cyprusDate: todayDate,
  });

  // Try multiple 3CX API endpoints (versions vary)
  // IMPORTANT: v16 Admin Console API is the ONLY working endpoint on this instance
  const endpoints = [
    {
      name: "v16 Admin Console API",
      method: "GET",
      path: `/api/CallLog?TimeZoneName=Asia%2FNicosia&callState=All&dateRangeType=Today&numberOfRows=200&startRow=0&searchFilter=&fromFilter=&fromFilterType=Any&toFilter=&toFilterType=Any`,
    },
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

      let response: Response;
      let responseText: string;
      let data: any;

      try {
        response = await client.makeAuthenticatedRequest(
          endpoint.path,
          requestOptions
        );

        if (!response.ok) {
          if (response.status === 404) {
            logger.debug(
              `[Call Log Extractor] ${endpoint.name} not available (404)`,
              {
                category: LogCategory.GENERAL,
              }
            );
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        responseText = await response.text();
        logger.debug(
          `[Call Log Extractor] Raw response from ${endpoint.name}`,
          {
            category: LogCategory.GENERAL,
            responseLength: responseText.length,
            responseSample: responseText.substring(0, 200),
          }
        );
      } catch (networkError) {
        lastError =
          networkError instanceof Error
            ? networkError
            : new Error(String(networkError));
        logger.warn(`[Call Log Extractor] ${endpoint.name} network error`, {
          category: LogCategory.GENERAL,
          error: lastError.message,
        });
        continue;
      }

      // Parse JSON with detailed error handling
      try {
        // Check Content-Type before parsing
        const contentType = response.headers.get("content-type") || "";
        if (
          !contentType.includes("application/json") &&
          !contentType.includes("text/json")
        ) {
          if (
            responseText.includes("<html") ||
            responseText.includes("login")
          ) {
            throw new Error(
              `${endpoint.name} returned HTML login page - session expired`
            );
          }
          logger.warn(
            `[Call Log Extractor] Unexpected content type from ${endpoint.name}`,
            {
              category: LogCategory.GENERAL,
              contentType,
              responseSample: responseText.substring(0, 100),
            }
          );
        }

        data = JSON.parse(responseText);
      } catch (parseError) {
        const error = new Error(
          `Invalid JSON response from ${endpoint.name}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
        lastError = error;
        logger.warn(`[Call Log Extractor] ${endpoint.name} JSON parse failed`, {
          category: LogCategory.GENERAL,
          error: error.message,
          responseLength: responseText.length,
          responseSample: responseText.substring(0, 200),
        });
        continue;
      }

      // Parse response with graceful degradation
      let entries: ThreeCXCallLogEntry[];
      try {
        entries = parseCallLogResponse(data, endpoint.name);
      } catch (parseError) {
        const error = new Error(
          `Failed to parse call log format from ${endpoint.name}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
        lastError = error;
        logger.warn(
          `[Call Log Extractor] ${endpoint.name} response format parsing failed`,
          {
            category: LogCategory.GENERAL,
            error: error.message,
            dataKeys: Object.keys(data || {}),
            dataType: typeof data,
            endpoint: endpoint.name,
          }
        );
        continue;
      }

      // Success case
      if (entries.length === 0) {
        logger.info(
          `[Call Log Extractor] ${endpoint.name} succeeded but no calls found`,
          {
            category: LogCategory.GENERAL,
            endpoint: endpoint.name,
          }
        );
      } else {
        logger.info(
          `[Call Log Extractor] Successfully extracted calls via ${endpoint.name}`,
          {
            category: LogCategory.GENERAL,
            totalCalls: entries.length,
            endpoint: endpoint.name,
          }
        );
      }

      return entries;
    } catch (endpointError) {
      lastError =
        endpointError instanceof Error
          ? endpointError
          : new Error(String(endpointError));
      logger.warn(`[Call Log Extractor] ${endpoint.name} failed`, {
        category: LogCategory.GENERAL,
        error: lastError.message,
      });
    }
  }

  // All endpoints failed
  const availableEndpoints = endpoints.map((e) => e.name).join(", ");
  throw new Error(
    `All call log API endpoints failed (${availableEndpoints}). Last error: ${lastError?.message || "Unknown error"}`
  );
}

/**
 * Parse call log response from various 3CX API formats
 *
 * @param data Raw response data from 3CX API
 * @param endpointName Name of the endpoint (for logging)
 * @returns Parsed call log entries
 */
function parseCallLogResponse(
  data: any,
  endpointName: string
): ThreeCXCallLogEntry[] {
  const entries: ThreeCXCallLogEntry[] = [];

  // Handle different response formats
  let callList: any[] = [];

  if (Array.isArray(data)) {
    callList = data;
  } else if (data.CallLogRows && Array.isArray(data.CallLogRows)) {
    // v16 Admin Console API format
    callList = data.CallLogRows;
  } else if (data.list && Array.isArray(data.list)) {
    callList = data.list;
  } else if (data.calls && Array.isArray(data.calls)) {
    callList = data.calls;
  } else if (data.data && Array.isArray(data.data)) {
    callList = data.data;
  } else {
    const errorMsg = `Unknown response format from ${endpointName} - expected array or object with list/calls/data property`;
    logger.warn("[Call Log Extractor] Unknown response format", {
      category: LogCategory.GENERAL,
      endpoint: endpointName,
      dataType: typeof data,
      keys: Object.keys(data || {}),
      sampleData: JSON.stringify(data).substring(0, 200),
    });
    throw new Error(errorMsg);
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
      } else {
        // Log when entry is skipped due to missing required fields
        logger.debug(
          "[Call Log Extractor] Skipped call entry (missing required fields)",
          {
            category: LogCategory.GENERAL,
            index,
            entryKeys: Object.keys(entry || {}),
            endpoint: endpointName,
          }
        );
      }
    } catch (error) {
      logger.warn("[Call Log Extractor] Failed to parse call entry", {
        category: LogCategory.GENERAL,
        index,
        error: error instanceof Error ? error.message : String(error),
        entryKeys: Object.keys(entry || {}),
        endpoint: endpointName,
        entrySample: JSON.stringify(entry).substring(0, 150),
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
  if (!entry || typeof entry !== "object") {
    return null;
  }

  // Try different field name variations (3CX APIs vary)
  const getId = () =>
    entry.id ||
    entry.Id ||
    entry.CallId ||
    entry.call_id ||
    entry.rowId ||
    Date.now() + Math.random();

  const getCallTime = () =>
    entry.callTime ||
    entry.CallTime ||
    entry.Time ||
    entry.StartTime ||
    entry.start_time ||
    entry.timestamp ||
    entry.DateTime ||
    new Date().toISOString();

  const getCallerNumber = () =>
    entry.callerNumber ||
    entry.CallerNumber ||
    entry.CallerId ||    // v16 Admin Console API
    entry.Caller ||
    entry.from ||
    entry.From ||
    entry.caller ||
    entry.source ||
    entry.Source;

  const getCalledNumber = () =>
    entry.calledNumber ||
    entry.CalledNumber ||
    entry.Destination ||  // v16 Admin Console API
    entry.Called ||
    entry.to ||
    entry.To ||
    entry.called ||
    entry.destination;

  const getDuration = () => {
    const raw = entry.duration || entry.Duration || entry.CallDuration || entry.call_duration || 0;
    // v16 returns duration as "HH:MM:SS" string — convert to seconds
    if (typeof raw === "string" && raw.includes(":")) {
      const parts = raw.split(":").map(Number);
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    return Number(raw) || 0;
  };

  const getStatus = () => {
    // v16 uses Answered (boolean), not a status string
    if (typeof entry.Answered === "boolean") {
      return entry.Answered ? "Answered" : "Missed";
    }
    return entry.status ||
      entry.Status ||
      entry.CallStatus ||
      entry.call_status ||
      "Unknown";
  };

  const getDirection = () =>
    entry.direction ||
    entry.Direction ||
    entry.CallDirection ||
    entry.call_direction ||
    entry.Type ||
    entry.type ||
    "Inbound"; // v16 doesn't provide direction — default to Inbound

  const getAgentExtension = () =>
    entry.agentExtension ||
    entry.AgentExtension ||
    entry.Extension ||
    entry.extension ||
    entry.AgentId ||
    entry.agent_id ||
    undefined;

  const callerNumber = getCallerNumber();
  const calledNumber = getCalledNumber();
  const callTime = getCallTime();

  if (!callerNumber || !calledNumber) {
    // Skip entries without phone numbers - this is normal for system events
    return null;
  }

  // Handle malformed date strings with fallback
  let parsedCallTime: string;
  try {
    if (callTime && typeof callTime === "string") {
      // Try to parse and re-format the date
      const parsedDate = new Date(callTime);
      if (isNaN(parsedDate.getTime())) {
        // Try Date.parse fallback
        const fallbackParsed = new Date(Date.parse(callTime));
        if (isNaN(fallbackParsed.getTime())) {
          logger.warn(
            "[Call Log Extractor] Malformed date string, using current time",
            {
              category: LogCategory.GENERAL,
              originalDate: callTime,
            }
          );
          parsedCallTime = new Date().toISOString();
        } else {
          parsedCallTime = fallbackParsed.toISOString();
        }
      } else {
        parsedCallTime = parsedDate.toISOString();
      }
    } else {
      parsedCallTime = new Date().toISOString();
    }
  } catch (dateError) {
    logger.warn("[Call Log Extractor] Date parsing error, using current time", {
      category: LogCategory.GENERAL,
      originalDate: callTime,
      error: dateError instanceof Error ? dateError.message : String(dateError),
    });
    parsedCallTime = new Date().toISOString();
  }

  return {
    id: getId(),
    callTime: parsedCallTime,
    callerNumber: String(callerNumber),
    calledNumber: String(calledNumber),
    duration: Number(getDuration()) || 0,
    status: String(getStatus()),
    direction: String(getDirection()),
    agentExtension: getAgentExtension()
      ? String(getAgentExtension())
      : undefined,
    callType: entry.callType || entry.CallType || undefined,
  };
}

/**
 * Filter external callers from call log entries
 *
 * @param entries Raw call log entries
 * @returns Processed audit result with external caller list
 */
export function filterExternalCallers(
  entries: ThreeCXCallLogEntry[]
): CallAuditResult {
  const today = new Date()
    .toLocaleString("en-CA", {
      timeZone: AUDIT_CONFIG.TIMEZONE,
    })
    .split(",")[0];

  logger.info("[Call Log Extractor] Starting call filtering", {
    category: LogCategory.GENERAL,
    totalEntries: entries.length,
    targetNumber: AUDIT_CONFIG.TARGET_NUMBER,
    internalExtensions: AUDIT_CONFIG.INTERNAL_EXTENSIONS,
  });

  const externalCallerSet = new Set<string>();
  const callTimeMap: Record<string, string> = {};
  let internalFiltered = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      // Check if this is a call to our target number
      const isTargetCall =
        entry.calledNumber.includes(AUDIT_CONFIG.TARGET_NUMBER) ||
        entry.calledNumber === AUDIT_CONFIG.TARGET_NUMBER;

      if (!isTargetCall) {
        continue; // Not a call to our main line
      }

      // Check if this is an inbound call
      const isInbound =
        entry.direction.toLowerCase().includes("inbound") ||
        entry.direction.toLowerCase() === "in" ||
        entry.direction === "1"; // Some 3CX versions use numeric codes

      if (!isInbound) {
        continue; // Only track incoming calls
      }

      // Check if caller is an internal extension
      const isInternal =
        (AUDIT_CONFIG.INTERNAL_EXTENSIONS as readonly string[]).includes(
          entry.callerNumber
        ) ||
        AUDIT_CONFIG.INTERNAL_EXTENSIONS.some((ext) =>
          entry.callerNumber.endsWith(ext)
        );

      if (isInternal) {
        internalFiltered++;
        continue;
      }

      // Normalize and add external caller
      const normalizedNumber = normalizePhoneNumber(entry.callerNumber);
      if (normalizedNumber) {
        externalCallerSet.add(normalizedNumber);
        // Record call time (keep earliest call if multiple calls from same number)
        if (!callTimeMap[normalizedNumber]) {
          callTimeMap[normalizedNumber] = entry.callTime;
        }
      } else {
        // Log warning but don't fail the entire process
        const errorMsg = `Invalid phone number format: ${entry.callerNumber}`;
        errors.push(errorMsg);
        logger.debug("[Call Log Extractor] Skipped invalid phone number", {
          category: LogCategory.GENERAL,
          callerNumber: entry.callerNumber,
          entryId: entry.id,
        });
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
    callTimeMap,
  };
}

/**
 * Normalize phone number to consistent format
 *
 * @param phone Raw phone number string
 * @returns Normalized phone number with country code, or null if invalid
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== "string") {
    return null;
  }

  // Strip whitespace, dashes, parentheses, dots
  let cleaned = phone.replace(/[\s\-().+]/g, "");

  // Remove any remaining non-numeric characters except leading +
  if (phone.startsWith("+")) {
    cleaned = "+" + cleaned.replace(/[^0-9]/g, "");
  } else {
    cleaned = cleaned.replace(/[^0-9]/g, "");
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
  if (cleaned.startsWith("+357")) {
    // Already has Cyprus country code
    return cleaned;
  }

  if (cleaned.startsWith("357") && cleaned.length >= 11) {
    // Cyprus number without + prefix
    return "+" + cleaned;
  }

  if (cleaned.startsWith("0") && cleaned.length === 9) {
    // Cyprus local format with leading zero: "022032770"
    return "+357" + cleaned.substring(1);
  }

  if (
    cleaned.length === 8 &&
    (cleaned.startsWith("2") || cleaned.startsWith("9"))
  ) {
    // Cyprus local format without leading zero: "22032770" or "99123456"
    return "+357" + cleaned;
  }

  if (cleaned.startsWith("+")) {
    // International number with country code
    return cleaned;
  }

  if (cleaned.length >= 10 && !cleaned.startsWith("357")) {
    // Assume international number without + prefix
    return "+" + cleaned;
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
