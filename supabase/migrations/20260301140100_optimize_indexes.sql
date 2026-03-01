-- Migration: Database maintenance - drop duplicate constraint and update statistics
-- Date: 2026-03-01
-- Description: Drop duplicate constraint, update query planner statistics
-- Note: VACUUM operations must be run separately outside of migration transaction

-- Drop duplicate constraint and its associated index (confirmed in database advisor report)
-- Note: This is a duplicate unique constraint - the table already has a primary key
ALTER TABLE processed_webhooks DROP CONSTRAINT IF EXISTS processed_webhooks_message_key_key;

-- Update query planner statistics for all key tables
ANALYZE agents, upload_locks, webhook_debug_logs, chat_history;
