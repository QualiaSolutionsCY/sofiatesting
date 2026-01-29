// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://78c4b01fd98abb3c2cff25b0439cdf7a@o4510184257814528.ingest.de.sentry.io/4510184259453008",

  // Only enable in production
  enabled: process.env.NODE_ENV === "production",

  // Environment tag for filtering
  environment: process.env.NODE_ENV,

  // Performance monitoring sample rate
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while setting up Sentry.
  debug: false,

  // Spotlight for development
  spotlight: process.env.NODE_ENV === "development",

  // Server-side tags
  initialScope: {
    tags: {
      service: "sofia-api",
    },
  },
});
