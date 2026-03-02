-- Migration: Restore unique constraint on processed_webhooks.message_key
-- Reason: Constraint was incorrectly dropped in 20260301140100_optimize_indexes.sql
-- (comment said "duplicate of primary key" but PK is on `id`, not `message_key`)
-- Without this constraint, claimMessageForProcessing() never gets error 23505,
-- so duplicate webhooks both process → duplicate replies to users.

-- Remove any duplicate message_key rows first (keep one per message_key)
DELETE FROM processed_webhooks a
USING processed_webhooks b
WHERE a.id > b.id
  AND a.message_key = b.message_key;

-- Restore the unique constraint
ALTER TABLE processed_webhooks
  ADD CONSTRAINT processed_webhooks_message_key_key UNIQUE (message_key);
