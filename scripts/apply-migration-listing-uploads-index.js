#!/usr/bin/env node

/**
 * Apply migration: Create index on listing_uploads.agent_phone
 *
 * This script applies the 20260227_listing_uploads_agent_phone_index migration
 * to the production database using the service role key.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationPath = path.join(__dirname, '../supabase/migrations/20260227_listing_uploads_agent_phone_index.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('Applying migration: 20260227_listing_uploads_agent_phone_index.sql');
console.log('SQL:', sql);

// Supabase JS client doesn't support raw SQL execution directly
// We need to use the RPC or REST API approach
async function applyMigration() {
  try {
    // Execute SQL via the Supabase REST API using raw fetch
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('✓ Migration applied successfully');
    console.log('✓ Index idx_listing_uploads_agent_phone created');
  } catch (error) {
    console.error('Error applying migration:', error.message);
    process.exit(1);
  }
}

applyMigration();
