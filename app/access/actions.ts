"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE, codeToScope, signScope } from "@/lib/access/gate";

export type AccessState = { error?: string } | null;

export async function submitAccessCode(
  _prev: AccessState,
  formData: FormData
): Promise<AccessState> {
  const code = String(formData.get("code") || "");
  const callbackUrl = String(formData.get("callbackUrl") || "");

  const scope = codeToScope(code);
  if (!scope) {
    return { error: "That access code isn't recognised." };
  }

  const value = await signScope(scope);
  const store = await cookies();
  store.set(ACCESS_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // Honour a same-origin callback only when it's inside the scope just granted;
  // otherwise land on the scope's home so a code never bounces to a page it can't open.
  const home = scope === "invoices" ? "/invoices" : "/admin";
  const safe = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//");
  const inScope =
    safe &&
    (scope === "admin"
      ? callbackUrl === "/" ||
        callbackUrl.startsWith("/admin") ||
        callbackUrl.startsWith("/invoices")
      : callbackUrl.startsWith("/invoices"));
  redirect(inScope ? callbackUrl : home);
}
