import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isAuthorizedAgent } from "@/lib/invoices/constants";
import {
  type IntentParams,
  runIntent,
  type SophiaIntent,
} from "@/lib/invoices/sophia/intent-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.SOPHIA_BRIDGE_SECRET || "";

function verifySignature(raw: string, sig: string | null): boolean {
  if (!SECRET || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, "hex");
    b = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  // Wrap in a fresh Uint8Array<ArrayBuffer> — Buffer's ArrayBufferLike backing is
  // not assignable to the timingSafeEqual ArrayBufferView param under newer @types/node.
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}

export async function POST(req: Request) {
  if (!SECRET) {
    return NextResponse.json({ ok: false, error: "bridge not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-sophia-signature"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let payload: {
    actor?: { wa_number?: string };
    intent?: string;
    params?: IntentParams;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const waNumber = payload.actor?.wa_number || "";
  if (!isAuthorizedAgent(waNumber)) {
    // Generic deflection — never reveal the allowlist.
    return NextResponse.json(
      { ok: false, reply: "Sorry, I can't help with invoicing from this number." },
      { status: 403 }
    );
  }

  try {
    const result = await runIntent(payload.intent as SophiaIntent, payload.params || {});
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "intent failed" },
      { status: 500 }
    );
  }
}
