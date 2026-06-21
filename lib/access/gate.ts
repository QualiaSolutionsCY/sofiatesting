/**
 * Access-code gate.
 *
 * Two areas of the app are protected by a shared access code each (entered at
 * /access): the admin panel (`ADMIN_ACCESS_CODE`) and the invoices page
 * (`INVOICES_ACCESS_CODE`). Codes live in env vars — never in source. A correct
 * code mints an HMAC-signed cookie (signed with AUTH_SECRET) so it can't be
 * forged client-side. Edge-runtime safe (uses Web Crypto, no Node APIs) so it
 * works inside middleware.
 */

export type AccessScope = "admin" | "invoices";

export const ACCESS_COOKIE = "qs_gate";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // No insecure default in production: a known fallback would let an attacker
  // forge HMAC-signed admin/invoices cookies. Fail closed instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET must be set: refusing to sign/verify access cookies with an insecure default."
    );
  }
  // Local development only (never reached when NODE_ENV === "production").
  return "insecure-dev-secret-change-me";
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Map a submitted code to the scope it unlocks, or null if it matches neither. */
export function codeToScope(code: string): AccessScope | null {
  const c = (code || "").trim();
  if (!c) return null;
  const admin = process.env.ADMIN_ACCESS_CODE;
  const invoices = process.env.INVOICES_ACCESS_CODE;
  if (admin && c === admin) return "admin";
  if (invoices && c === invoices) return "invoices";
  return null;
}

/** Produce the signed cookie value for a scope. */
export async function signScope(scope: AccessScope): Promise<string> {
  return `${scope}.${await hmacHex(scope)}`;
}

/** Verify a cookie value and return its scope, or null if missing/forged. */
export async function verifyAccessCookie(
  value: string | undefined | null
): Promise<AccessScope | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const scope = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (scope !== "admin" && scope !== "invoices") return null;
  const expected = await hmacHex(scope);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++)
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? (scope as AccessScope) : null;
}
