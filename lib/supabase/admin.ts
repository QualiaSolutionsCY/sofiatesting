import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Get admin Supabase client with service role key.
 *
 * SECURITY: import "server-only" ensures build-time error if imported in client component.
 * Lazy initialization prevents key exposure at module scope.
 *
 * @returns Supabase client with service role privileges (bypasses RLS)
 */
export function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
