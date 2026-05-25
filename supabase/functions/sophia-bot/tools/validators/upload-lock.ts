/**
 * Upload Lock Management
 * Provides atomic locking mechanism to prevent duplicate uploads
 */

import { getSupabaseAdmin } from "../../../_shared/db.ts";
import { UPLOAD_LOCK_DURATION_MS } from "../../config/business-rules.ts";

/**
 * Atomically acquire a DB-based upload lock for a property.
 * Uses INSERT ... ON CONFLICT to guarantee only ONE concurrent caller wins.
 * Returns { locked: true } if another upload is already in progress.
 */
export async function acquireUploadLock(
  lockKey: string,
  agentPhone: string
): Promise<{ acquired: boolean; remainingSeconds?: number }> {
  const sb = getSupabaseAdmin();

  // First clean up expired locks (older than UPLOAD_LOCK_DURATION_MS)
  const expiryTime = new Date(
    Date.now() - UPLOAD_LOCK_DURATION_MS
  ).toISOString();
  await sb.from("upload_locks").delete().lt("created_at", expiryTime);

  // Try to insert — if fingerprint already exists, the INSERT fails (PRIMARY KEY conflict)
  const { error } = await sb.from("upload_locks").insert({
    fingerprint: lockKey,
    agent_phone: agentPhone,
  });

  if (error) {
    // Lock already exists — check how old it is
    const { data: existing } = await sb
      .from("upload_locks")
      .select("created_at")
      .eq("fingerprint", lockKey)
      .single();

    if (existing) {
      const elapsed = Date.now() - new Date(existing.created_at).getTime();
      if (elapsed < UPLOAD_LOCK_DURATION_MS) {
        const remaining = Math.ceil((UPLOAD_LOCK_DURATION_MS - elapsed) / 1000);
        return { acquired: false, remainingSeconds: remaining };
      }
      // Lock expired — delete and retry insert
      await sb.from("upload_locks").delete().eq("fingerprint", lockKey);
      const { error: retryError } = await sb.from("upload_locks").insert({
        fingerprint: lockKey,
        agent_phone: agentPhone,
      });
      if (retryError) {
        // Another concurrent caller grabbed it — we lose
        return {
          acquired: false,
          remainingSeconds: Math.ceil(UPLOAD_LOCK_DURATION_MS / 1000),
        };
      }
    }
  }

  return { acquired: true };
}

/**
 * Release an upload lock after upload completes (success or failure).
 * This allows immediate re-upload instead of waiting for expiry.
 */
export async function releaseUploadLock(lockKey: string): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from("upload_locks").delete().eq("fingerprint", lockKey);
}
