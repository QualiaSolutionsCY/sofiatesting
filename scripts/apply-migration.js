#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from .env.local
dotenv.config({ path: join(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  console.error("URL:", supabaseUrl);
  console.error("Key:", supabaseServiceKey ? "[SET]" : "[MISSING]");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function applyMigration() {
  const migrationPath = join(
    __dirname,
    "../supabase/migrations/20260226_call_tracking.sql"
  );
  const sql = readFileSync(migrationPath, "utf-8");

  console.log("Applying migration: 20260226_call_tracking.sql");
  console.log("Target:", supabaseUrl);

  // Split SQL into individual statements
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  // Execute each statement
  for (const statement of statements) {
    if (statement.length === 0) continue;

    console.log("\nExecuting:", statement.substring(0, 100) + "...");

    const { error } = await supabase.rpc("exec_sql", { sql: statement });

    if (error) {
      // Try direct execution if rpc fails
      console.log("RPC failed, trying direct query...");
      const { error: queryError } = await supabase
        .from("_")
        .select("*")
        .limit(0);
      console.error("Direct query also not available. Using raw REST API...");

      // For now, we'll use a different approach
      break;
    }
  }

  console.log("\nVerifying tables...");

  // Verify tables exist by attempting to query them
  const tables = ["call_audit_runs", "call_records", "caller_alerts"];

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      console.error(`Table ${table} verification failed:`, error.message);
    } else {
      console.log(`✓ Table ${table} exists`);
    }
  }
}

applyMigration().catch(console.error);
