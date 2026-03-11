-- Email router tables for deduplication and rotation tracking
-- Used by the email-router Railway service (services/email-router/)

-- Email forwarding log — deduplication + audit trail
CREATE TABLE IF NOT EXISTS email_forwards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL,
  from_email text NOT NULL,
  subject text,
  body_preview text,
  forwarded_to_agent_id text,
  forwarded_to_email text,
  region text,
  routing_reason text,
  draft_created boolean DEFAULT false,
  draft_template_name text,
  skipped boolean DEFAULT false,
  skip_reason text,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_forwards_gmail_message_id
  ON email_forwards (gmail_message_id);

-- Index for querying by region and date
CREATE INDEX IF NOT EXISTS idx_email_forwards_region_created
  ON email_forwards (region, created_at DESC);

-- Email forwarding rotation — round-robin state per region
CREATE TABLE IF NOT EXISTS email_forwarding_rotation (
  region text PRIMARY KEY,
  last_forwarded_to_agent_id text NOT NULL,
  forward_count integer DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);

-- RLS: service_role only (these are internal tables, not user-facing)
ALTER TABLE email_forwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_forwarding_rotation ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service_role can read/write (which is correct —
-- the email-router uses service_role key, no end users access these tables)
