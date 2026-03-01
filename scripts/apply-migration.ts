import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260226_call_tracking.sql"
  );
  const sql = readFileSync(migrationPath, "utf-8");

  console.log("Applying migration: 20260226_call_tracking.sql");

  const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  console.log("Migration applied successfully");

  // Verify tables exist
  const { data: tables, error: verifyError } = await supabase
    .from("information_schema.tables")
    .select("table_name")
    .in("table_name", ["call_audit_runs", "call_records", "caller_alerts"])
    .eq("table_schema", "public");

  if (verifyError) {
    console.error("Verification failed:", verifyError);
    process.exit(1);
  }

  console.log("Tables created:", tables?.map((t) => t.table_name).join(", "));
}

applyMigration();
