-- Telegram Group Message Index
-- Stores group messages for phone number search (Telegram Bot API has no search endpoint)
-- Phase 12, Plan 01

CREATE TABLE IF NOT EXISTS telegram_group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id BIGINT NOT NULL,
  group_name TEXT,
  message_id BIGINT NOT NULL,
  sender_telegram_id BIGINT,
  sender_name TEXT,
  message_text TEXT,
  message_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_chat_id, message_id)
);

-- Index for phone number text search
CREATE INDEX idx_tgm_message_text ON telegram_group_messages USING gin(to_tsvector('english', message_text));
-- Index for group lookup
CREATE INDEX idx_tgm_group_chat_id ON telegram_group_messages(group_chat_id);
-- Index for date-based cleanup
CREATE INDEX idx_tgm_created_at ON telegram_group_messages(created_at);

ALTER TABLE telegram_group_messages ENABLE ROW LEVEL SECURITY;
