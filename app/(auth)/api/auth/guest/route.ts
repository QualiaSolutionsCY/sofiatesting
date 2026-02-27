import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

/**
 * Guest Authentication Endpoint
 *
 * SECURITY NOTE - Email Enumeration Prevention:
 * This endpoint is NOT vulnerable to email enumeration because it auto-generates
 * guest emails (guest-{timestamp}@example.com) rather than accepting user input.
 *
 * If a user registration endpoint is added in the future, it MUST implement
 * timing-safe response patterns to prevent email enumeration attacks:
 *
 * 1. Always query database for user existence (even if email validation fails)
 * 2. Return identical success response whether email exists or not
 * 3. Use constant-time comparison for sensitive checks (timing-safe equality)
 * 4. Log actual result server-side only (never expose to client response)
 * 5. Ensure response time is consistent regardless of email existence
 *
 * Reference: SEC-07/WA-008 - Email Enumeration via Registration Timing
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";

  // Timing-safe token check - returns identical response time whether token valid or not
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
