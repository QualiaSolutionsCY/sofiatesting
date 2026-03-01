/**
 * One-time migration function for call tracking tables
 * Run via: curl -X POST https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/migrate
 *
 * This creates the three tables needed for Phase 10: call_audit_runs, call_records, caller_alerts
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Use Supabase Management API to execute SQL
  // We'll use the REST API directly with a raw SQL query
  const migrationSQL = `
-- Table 1: call_audit_runs
CREATE TABLE IF NOT EXISTS call_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_calls INTEGER DEFAULT 0,
  missing_callers INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(audit_date)
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_date ON call_audit_runs(audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_runs_status ON call_audit_runs(status);

-- Table 2: call_records
CREATE TABLE IF NOT EXISTS call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id UUID NOT NULL REFERENCES call_audit_runs(id) ON DELETE CASCADE,
  caller_phone TEXT NOT NULL,
  call_time TIMESTAMPTZ NOT NULL,
  target_number TEXT NOT NULL DEFAULT '22032770',
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  found_in_telegram BOOLEAN DEFAULT NULL,
  telegram_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_records_audit_run ON call_records(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_call_records_phone ON call_records(caller_phone);
CREATE INDEX IF NOT EXISTS idx_call_records_found ON call_records(found_in_telegram) WHERE found_in_telegram IS NULL OR found_in_telegram = FALSE;

-- Table 3: caller_alerts
CREATE TABLE IF NOT EXISTS caller_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_phone TEXT NOT NULL,
  audit_run_id UUID NOT NULL REFERENCES call_audit_runs(id) ON DELETE CASCADE,
  call_record_id UUID REFERENCES call_records(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  alert_message_id TEXT,
  follow_up_message_id TEXT,
  resolution_type TEXT,
  resolution_note TEXT,
  alternative_phone TEXT,
  alerted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(caller_phone, audit_run_id)
);

CREATE INDEX IF NOT EXISTS idx_caller_alerts_status ON caller_alerts(status);
CREATE INDEX IF NOT EXISTS idx_caller_alerts_phone ON caller_alerts(caller_phone);
CREATE INDEX IF NOT EXISTS idx_caller_alerts_follow_up ON caller_alerts(status, alerted_at) WHERE status = 'alerted';

-- RLS
ALTER TABLE call_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE caller_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON call_audit_runs;
CREATE POLICY "Service role full access" ON call_audit_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON call_records;
CREATE POLICY "Service role full access" ON call_records FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON caller_alerts;
CREATE POLICY "Service role full access" ON caller_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
`;

  try {
    // Execute SQL via Supabase Management API query endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ query: migrationSQL }),
    });

    if (!response.ok) {
      // Try alternative: direct PostgREST doesn't support raw SQL
      // So we execute statements manually via fetch to Management API
      const mgmtResponse = await fetch(
        "https://api.supabase.com/v1/projects/vceeheaxcrhmpqueudqx/database/query",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ACCESS_TOKEN") || supabaseKey}`,
          },
          body: JSON.stringify({ query: migrationSQL }),
        }
      );

      if (!mgmtResponse.ok) {
        const error = await mgmtResponse.text();
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Cannot execute SQL - requires manual migration via Supabase Dashboard",
            details: error,
            instructions:
              "Run the SQL from supabase/migrations/20260226_call_tracking.sql in the SQL Editor at: https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/sql/new",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 500,
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Migration executed successfully",
        tables: ["call_audit_runs", "call_records", "caller_alerts"],
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        instructions:
          "Run the SQL from supabase/migrations/20260226_call_tracking.sql in the SQL Editor at: https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/sql/new",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
