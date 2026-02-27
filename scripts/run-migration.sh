#!/bin/bash

# Call Tracking Migration Runner
# This script guides you through running the migration

echo "================================================"
echo "Call Tracking Infrastructure Migration"
echo "================================================"
echo ""
echo "Please run the SQL migration in the Supabase Dashboard:"
echo ""
echo "1. Open: https://supabase.com/dashboard/project/vceeheaxcrhmpqueudqx/sql/new"
echo "2. Copy the contents of: supabase/migrations/20260226_call_tracking.sql"
echo "3. Paste into the SQL Editor"
echo "4. Click 'Run'"
echo ""
echo "Migration file location:"
echo "  $(pwd)/supabase/migrations/20260226_call_tracking.sql"
echo ""
echo "Tables to be created:"
echo "  - call_audit_runs"
echo "  - call_records"
echo "  - caller_alerts"
echo ""
echo "================================================"
echo ""

# Offer to open the file for copying
read -p "Open migration file in editor? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cat supabase/migrations/20260226_call_tracking.sql
fi
