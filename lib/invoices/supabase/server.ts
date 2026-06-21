import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabasePersistenceMode = "supabase" | "fallback";

const SERVICE_ROLE_ENV = "INVOICE_SUPABASE_SERVICE_ROLE";

export function getSupabasePersistenceMode(): SupabasePersistenceMode {
  return hasSupabaseServerEnv() ? "supabase" : "fallback";
}

export function hasSupabaseServerEnv() {
  return Boolean(
    process.env.INVOICE_SUPABASE_URL && process.env[SERVICE_ROLE_ENV]
  );
}

export function createServiceSupabaseClient(): SupabaseClient | null {
  const url = process.env.INVOICE_SUPABASE_URL;
  const serviceRoleKey = process.env[SERVICE_ROLE_ENV];

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
