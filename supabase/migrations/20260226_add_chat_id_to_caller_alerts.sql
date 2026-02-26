-- Migration: Add chat_id column to caller_alerts table
-- Purpose: Enable response tracking to look up alerts by (alert_message_id, chat_id)
-- Phase 13, Plan 05

ALTER TABLE caller_alerts ADD COLUMN IF NOT EXISTS chat_id BIGINT;

-- Index for fast alert lookup by message ID + chat ID
CREATE INDEX IF NOT EXISTS idx_caller_alerts_message_lookup
  ON caller_alerts(alert_message_id, chat_id)
  WHERE alert_message_id IS NOT NULL;
