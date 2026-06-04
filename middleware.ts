import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ACCESS_COOKIE, verifyAccessCookie } from "./lib/access/gate";
import { isDevelopmentEnvironment } from "./lib/constants";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Public surfaces: NextAuth callbacks, the legacy login, and the access-code gate.
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/access")
  ) {
    return NextResponse.next();
  }

  // API routes handle their own auth.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Access-code scope from the signed cookie (admin | invoices | null).
  const scope = await verifyAccessCookie(request.cookies.get(ACCESS_COOKIE)?.value);

  // Legacy NextAuth session (kept as a fallback so existing accounts still work).
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  const toAccess = (wanted: "admin" | "invoices") => {
    const url = new URL("/access", request.url);
    url.searchParams.set("scope", wanted);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  };

  // Invoices — separate area. The invoices code grants it; an admin code does too.
  if (pathname === "/invoices" || pathname.startsWith("/invoices/")) {
    if (scope === "invoices" || scope === "admin") return NextResponse.next();
    return toAccess("invoices");
  }

  // Admin panel — admin code, or a legacy NextAuth session (role is re-checked in the layout).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (scope === "admin" || token) return NextResponse.next();
    return toAccess("admin");
  }

  // Everything else under the matcher (e.g. "/") — allow with any auth, else gate to admin.
  if (scope || token) return NextResponse.next();
  return toAccess("admin");
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/admin/:path*",
    "/invoices/:path*",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|monitoring).*)",
  ],
};
