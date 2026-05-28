-- Queue table for delayed Paphos-only forwarding from info@zyprus.com.
--
-- The email-router service (services/email-router) enqueues Paphos leads here
-- with a future forward_at timestamp instead of forwarding immediately. Each
-- poll cycle drains rows where status='pending' AND forward_at <= now() and
-- sends them via Resend. Failures are marked 'failed' for manual handling;
-- there is no automatic retry loop in this iteration.
--
-- RLS: intentionally OFF — only the service-role-keyed email-router writes/reads
-- this table, matching the pattern of the existing email_forwards and
-- email_forwarding_rotation tables.

CREATE TABLE IF NOT EXISTS pending_email_forwards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL UNIQUE,
  imap_uid         bigint,
  from_email       text NOT NULL,
  from_name        text,
  subject          text,
  text_body        text,
  html_body        text,
  region           text NOT NULL,
  agent_id         uuid NOT NULL,
  agent_email      text NOT NULL,
  routing_reason   text,
  forward_at       timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at          timestamptz,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_email_forwards_due_idx
  ON pending_email_forwards (forward_at)
  WHERE status = 'pending';
