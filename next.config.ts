import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const securityHeaders = [
  {
    // Content Security Policy - prevents XSS and injection attacks
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.sentry.io https://cdn.jsdelivr.net",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: http:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.sentry.io https://openrouter.ai wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  {
    // Prevent clickjacking attacks
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Prevent MIME type sniffing
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Enable XSS filter (legacy browsers)
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    // Control referrer information
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Restrict browser features
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Add HSTS in production only
if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  eslint: {
    // Lint separately via `npm run lint`, not during `next build`
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        hostname: "images.squarespace-cdn.com",
      },
      {
        hostname: "i.ibb.co",
      },
    ],
  },
  trailingSlash: false,
  generateEtags: false,

  // Security headers for all routes
  // biome-ignore lint/suspicious/useAwait: Next.js headers config requires async
  headers: async () => {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Wrap with Sentry for error monitoring
// Trim env vars to handle trailing newlines from Vercel
const sentryOrg = (process.env.SENTRY_ORG || "qualia-solutions").trim();
const sentryProject = (process.env.SENTRY_PROJECT || "sophia").trim();

// Only enable source map uploads if auth token is configured
const hasSentryAuth = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: sentryOrg,
  project: sentryProject,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Disable telemetry to prevent build noise
  telemetry: false,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Source maps configuration - disable uploads if no auth token
  sourcemaps: {
    disable: !hasSentryAuth,
    deleteSourcemapsAfterUpload: true,
  },

  // Disable release creation if no auth - prevents "Project not found" errors
  release: {
    create: hasSentryAuth,
    finalize: hasSentryAuth,
  },

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },

  // Enables automatic instrumentation of Vercel Cron Monitors. (Requires Server Monitoring)
  automaticVercelMonitors: hasSentryAuth,
});
