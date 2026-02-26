---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260226_call_audit_cron.sql
autonomous: true
must_haves:
  truths:
    - "3CX credentials are set as Supabase secrets"
    - "call-audit Edge Function is deployed with valid config"
    - "pg_cron job 'call-audit-daily' is scheduled Mon-Fri 5PM Cyprus time"
    - "Health check returns healthy with connectivity test"
  artifacts:
    - path: "supabase/migrations/20260226_call_audit_cron.sql"
      provides: "pg_cron migration with real service_role key"
      contains: "Bearer ey"
  key_links:
    - from: "cron.job (call-audit-daily)"
      to: "invoke_call_audit() -> pg_net -> call-audit Edge Function"
      via: "pg_cron schedule at 0 17 * * 1-5 Europe/Nicosia"
---

<objective>
Set up 3CX credentials, apply pg_cron migration, deploy call-audit Edge Function, and verify end-to-end.

Purpose: The call-audit code is complete but not operational. This plan wires up credentials, scheduling, and deploys.
Output: Fully operational call-audit system running on schedule.
</objective>

<execution_context>
@/home/qualia/.claude/get-shit-done/workflows/execute-plan.md
@/home/qualia/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@supabase/functions/call-audit/index.ts
@supabase/functions/call-audit/config.ts
@supabase/migrations/20260226_call_audit_cron.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Set 3CX secrets and deploy Edge Function</name>
  <files>supabase/migrations/20260226_call_audit_cron.sql</files>
  <action>
    1. Set 3CX credentials as Supabase secrets via CLI:
       ```
       supabase secrets set CX3_BASE_URL=https://185.162.18.158:5001 CX3_USERNAME=000 CX3_PASSWORD=5zFdWsMBWN --project-ref vceeheaxcrhmpqueudqx
       ```

    2. Get the service_role key using Supabase MCP tool `get_project_api_keys` for project ref `vceeheaxcrhmpqueudqx`.

    3. Update `supabase/migrations/20260226_call_audit_cron.sql`:
       - Replace BOTH occurrences of `<SERVICE_ROLE_KEY>` with the actual service_role key value.
       - The first is in the `invoke_call_audit()` function body (line ~79).
       - The second is in the comment block showing how to update (line ~14 area) - update this too for documentation accuracy.

    4. Deploy the call-audit Edge Function:
       ```
       supabase functions deploy call-audit --no-verify-jwt --project-ref vceeheaxcrhmpqueudqx
       ```

    5. Verify deployment with health check (no connectivity yet, just config validation):
       ```
       curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?health" | jq .
       ```
       Expected: configStatus = "valid", threeCXConfigured = true
  </action>
  <verify>
    - `supabase secrets list --project-ref vceeheaxcrhmpqueudqx` shows CX3_BASE_URL, CX3_USERNAME, CX3_PASSWORD
    - Health check endpoint returns `{"configStatus": "valid", ...}`
    - Migration file no longer contains `<SERVICE_ROLE_KEY>` placeholder
  </verify>
  <done>3CX secrets set, Edge Function deployed, health check confirms valid config</done>
</task>

<task type="auto">
  <name>Task 2: Apply pg_cron migration and verify scheduling</name>
  <files>supabase/migrations/20260226_call_audit_cron.sql</files>
  <action>
    1. Apply the pg_cron migration via Supabase MCP `execute_sql` tool. Execute the FULL contents of `supabase/migrations/20260226_call_audit_cron.sql` (which now has the real service_role key from Task 1).

       IMPORTANT: The migration does 5 things:
       - Enables pg_cron and pg_net extensions
       - Creates cron_execution_log table with RLS
       - Creates invoke_call_audit() wrapper function
       - Schedules 'call-audit-daily' cron job (Mon-Fri 5PM)
       - Schedules 'cron-log-cleanup' weekly job

       If pg_cron extension creation fails (already exists), that's fine - CREATE EXTENSION IF NOT EXISTS handles it.
       If cron_execution_log table already exists, also fine - CREATE TABLE IF NOT EXISTS.
       If cron.schedule fails with "job already exists", drop it first:
       ```sql
       SELECT cron.unschedule('call-audit-daily');
       SELECT cron.unschedule('cron-log-cleanup');
       ```
       Then re-run the schedule commands.

    2. Verify cron job is scheduled:
       ```sql
       SELECT jobid, jobname, schedule, command, timezone FROM cron.job WHERE jobname IN ('call-audit-daily', 'cron-log-cleanup');
       ```
       Expected: call-audit-daily with schedule '0 17 * * 1-5' and timezone 'Europe/Nicosia'

    3. Verify invoke_call_audit function exists:
       ```sql
       SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_name = 'invoke_call_audit';
       ```

    4. Verify cron_execution_log table exists:
       ```sql
       SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cron_execution_log' ORDER BY ordinal_position;
       ```
  </action>
  <verify>
    - `SELECT * FROM cron.job WHERE jobname = 'call-audit-daily'` returns one row with schedule '0 17 * * 1-5' and timezone 'Europe/Nicosia'
    - `SELECT * FROM cron.job WHERE jobname = 'cron-log-cleanup'` returns one row
    - invoke_call_audit function exists in information_schema.routines
    - cron_execution_log table has expected columns
  </verify>
  <done>pg_cron migration applied, both cron jobs scheduled, wrapper function and log table verified</done>
</task>

<task type="auto">
  <name>Task 3: End-to-end verification with connectivity and dry-run</name>
  <files></files>
  <action>
    1. Run health check with connectivity test to verify Edge Function can reach 3CX:
       ```
       curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?health&connectivity=true" | jq .
       ```
       Expected: status = "healthy", connectivity.reachable = true
       NOTE: The 3CX server uses a self-signed cert on an IP address. If connectivity fails with TLS error, that's expected in Edge Functions (Deno strict TLS). Document the result either way.

    2. Run dry-run to test 3CX authentication end-to-end:
       ```
       curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?dry-run=true" | jq .
       ```
       Expected: success = true, message includes "authentication working"
       If auth fails, document the error category and message for debugging.

    3. Report results clearly:
       - If both pass: System is fully operational, will auto-run Mon-Fri 5PM Cyprus time.
       - If connectivity fails but dry-run works: 3CX may have intermittent reachability.
       - If dry-run fails: Document error for Fawzi to troubleshoot credentials/network.
  </action>
  <verify>
    - Health check response captured and analyzed
    - Dry-run response captured and analyzed
    - Clear status report produced
  </verify>
  <done>End-to-end verification complete. System status confirmed (healthy or issues documented).</done>
</task>

</tasks>

<verification>
1. `supabase secrets list --project-ref vceeheaxcrhmpqueudqx` includes CX3_BASE_URL, CX3_USERNAME, CX3_PASSWORD
2. `curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?health&connectivity=true"` returns status
3. `SELECT jobname, schedule, timezone FROM cron.job WHERE jobname = 'call-audit-daily'` returns expected row
4. `curl -s "https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/call-audit?dry-run=true"` returns success status
</verification>

<success_criteria>
- 3CX credentials stored as Supabase secrets
- call-audit Edge Function deployed and responding to health checks
- pg_cron job scheduled for Mon-Fri 5PM Cyprus time (Europe/Nicosia)
- Migration file updated with real service_role key (no more placeholders)
- Dry-run test executed with results documented
</success_criteria>

<output>
After completion, create `.planning/quick/2-set-up-3cx-credentials-and-pg-cron-for-a/2-SUMMARY.md`
</output>
