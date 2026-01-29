// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a page is loaded in the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://78c4b01fd98abb3c2cff25b0439cdf7a@o4510184257814528.ingest.de.sentry.io/4510184259453008",

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Environment tag for filtering
  environment: process.env.NODE_ENV,

  // Before send hook to enrich events
  beforeSend(event, _hint) {
    // Add breadcrumb for page URL
    if (typeof window !== "undefined") {
      Sentry.addBreadcrumb({
        category: "navigation",
        message: window.location.href,
        level: "info",
      });
    }
    return event;
  },

  // Adjust sampling rates for production
  // - tracesSampleRate: Performance monitoring sample rate (0.0 to 1.0)
  // - Use lower rate in production to reduce costs
  tracesSampleRate: 0.1,

  // Replay is useful for debugging UI issues
  // - Session replay sample rate
  replaysSessionSampleRate: 0.1,
  // - On-error replay sample rate (captures replays when errors occur)
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while setting up Sentry.
  debug: false,

  // Capture only errors from our domain
  allowUrls: [/https?:\/\/(.*\.)?vercel\.app/, /https?:\/\/localhost/],

  // Ignore common non-actionable errors
  ignoreErrors: [
    // Browser extensions
    /extensions\//i,
    /^chrome-extension:\/\//i,
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "Load failed",
    // User aborted
    "AbortError",
    // React hydration (common in development)
    "Hydration failed",
  ],

  integrations: [
    Sentry.replayIntegration({
      // Mask all text content for privacy
      maskAllText: true,
      // Block all media for performance
      blockAllMedia: true,
    }),
  ],
});
