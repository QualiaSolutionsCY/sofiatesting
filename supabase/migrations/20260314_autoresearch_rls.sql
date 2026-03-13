-- Enable RLS on autoresearch tables
-- These tables are only accessed by service_role (edge functions), never by client

ALTER TABLE sophia_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia_experiment_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sophia_experiment_skip_list ENABLE ROW LEVEL SECURITY;

-- No policies needed: service_role bypasses RLS
-- Authenticated/anon users should have zero access to these tables

-- Fix: drop duplicate index on email_forwards
DROP INDEX IF EXISTS idx_email_forwards_gmail_message_id;
