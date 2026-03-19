/**
 * Lightweight Sentry integration for Supabase Edge Functions
 * Uses Sentry ingest API directly (no SDK dependencies)
 */

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");

interface SentryException {
  type: string;
  value: string;
  stacktrace?: {
    frames: Array<{
      filename: string;
      function: string;
      lineno?: number;
      colno?: number;
    }>;
  };
}

interface SentryEvent {
  event_id: string;
  timestamp: string;
  platform: string;
  level: "fatal" | "error" | "warning" | "info" | "debug";
  logger?: string;
  transaction?: string;
  server_name?: string;
  environment?: string;
  message?: string;
  exception?: {
    values: SentryException[];
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: {
    id?: string;
    username?: string;
    email?: string;
  };
}

/**
 * Parse Sentry DSN to extract ingest URL
 */
const parseDsn = (
  dsn: string
): { ingestUrl: string; publicKey: string; projectId: string } | null => {
  try {
    // DSN format: https://<public_key>@<host>/<project_id>
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.slice(1);
    const host = url.host;

    return {
      ingestUrl: `https://${host}/api/${projectId}/store/`,
      publicKey,
      projectId,
    };
  } catch {
    console.error("[Sentry] Invalid DSN format");
    return null;
  }
};

/**
 * Generate a UUID v4 for event IDs
 */
const generateEventId = (): string => {
  return crypto.randomUUID().replace(/-/g, "");
};

/**
 * Parse error stack trace into Sentry frames
 */
const parseStackTrace = (
  error: Error
): Array<{ filename: string; function: string; lineno?: number }> => {
  const frames: Array<{ filename: string; function: string; lineno?: number }> = [];

  if (!error.stack) return frames;

  const lines = error.stack.split("\n").slice(1); // Skip first line (error message)

  for (const line of lines) {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+)(?::\d+)?\)/);
    if (match) {
      frames.push({
        function: match[1],
        filename: match[2],
        lineno: parseInt(match[3]),
      });
    }
  }

  // Sentry expects frames in reverse order (most recent last)
  return frames.reverse();
};

/**
 * Send event to Sentry (fire-and-forget)
 */
const sendToSentry = async (event: SentryEvent): Promise<void> => {
  if (!SENTRY_DSN) {
    console.log("[Sentry] No DSN configured, skipping error capture");
    return;
  }

  const parsed = parseDsn(SENTRY_DSN);
  if (!parsed) return;

  try {
    const response = await fetch(parsed.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error(`[Sentry] Failed to send event: ${response.status}`);
    }
  } catch (err) {
    console.error("[Sentry] Failed to send event:", err);
  }
};

/**
 * Capture an exception and send to Sentry
 */
export const captureException = (
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; username?: string };
    transaction?: string;
  }
): void => {
  const event: SentryEvent = {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    logger: "telegram-sophia",
    server_name: "supabase-edge",
    environment: Deno.env.get("ENVIRONMENT") || "production",
    transaction: context?.transaction,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: {
            frames: parseStackTrace(error),
          },
        },
      ],
    },
    tags: {
      runtime: "deno",
      function: "telegram-sophia",
      ...context?.tags,
    },
    extra: context?.extra,
    user: context?.user,
  };

  // Send async (don't await)
  sendToSentry(event).catch(console.error);
};

/**
 * Capture a message (non-exception event)
 */
export const captureMessage = (
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): void => {
  const event: SentryEvent = {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level,
    logger: "telegram-sophia",
    server_name: "supabase-edge",
    environment: Deno.env.get("ENVIRONMENT") || "production",
    message,
    tags: {
      runtime: "deno",
      function: "telegram-sophia",
      ...context?.tags,
    },
    extra: context?.extra,
  };

  sendToSentry(event).catch(console.error);
};

/**
 * Check if Sentry is configured
 */
export const isSentryEnabled = (): boolean => {
  return !!SENTRY_DSN;
};

