/**
 * Invoice Bridge
 *
 * Outbound adapter from sophia-bot (Supabase Edge) to the embedded invoicing
 * control plane on Vercel (sofiatesting `/api/sophia/intent`). HMAC-signs the
 * body with SOPHIA_BRIDGE_SECRET so the receiver can authenticate the caller.
 *
 * This is the ONLY place sophia-bot talks to the invoicing system.
 */

import { LogCategory, logger } from "../utils/logger.ts";

const BRIDGE_URL =
  Deno.env.get("SOPHIA_BRIDGE_URL") ||
  "https://sofiatesting.vercel.app/api/sophia/intent";
const BRIDGE_SECRET = Deno.env.get("SOPHIA_BRIDGE_SECRET") || "";

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(BRIDGE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface BridgeResult {
  ok: boolean;
  reply: string;
  documentId?: string;
  pdfUrl?: string;
  filename?: string;
  error?: string;
}

export async function callInvoiceIntent(
  intent: string,
  params: Record<string, unknown>,
  waNumber: string,
  messageId?: string
): Promise<BridgeResult> {
  if (!BRIDGE_SECRET) {
    return { ok: false, reply: "Invoicing isn't connected yet." };
  }

  const body = JSON.stringify({
    actor: { wa_number: waNumber },
    intent,
    params,
    context: {
      whatsapp_message_id: messageId || "",
      received_at: new Date().toISOString(),
    },
  });

  try {
    const signature = await sign(body);
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sophia-Signature": signature,
        "X-Sophia-Idempotency-Key": messageId || "",
      },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      logger.warn("invoice-bridge non-2xx", {
        category: LogCategory.TOOL,
        status: res.status,
      });
      return {
        ok: false,
        reply: typeof data.reply === "string" ? data.reply : "Invoicing request failed.",
        error: typeof data.error === "string" ? data.error : undefined,
      };
    }
    return {
      ok: true,
      reply: typeof data.reply === "string" ? data.reply : "Done.",
      documentId: typeof data.documentId === "string" ? data.documentId : undefined,
      pdfUrl: typeof data.pdfUrl === "string" ? data.pdfUrl : undefined,
      filename: typeof data.filename === "string" ? data.filename : undefined,
    };
  } catch (e) {
    logger.error(
      "invoice-bridge call failed",
      e instanceof Error ? e : undefined,
      { category: LogCategory.TOOL }
    );
    return { ok: false, reply: "I couldn't reach the invoicing system just now." };
  }
}
