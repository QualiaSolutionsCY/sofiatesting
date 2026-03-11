-- Add message_timestamp to pending_images for WhatsApp send-order preservation
-- UUID id has no sequential meaning, so ordering by id gives random photo order
-- message_timestamp stores the WhatsApp messageTimestamp (Unix epoch seconds)
ALTER TABLE pending_images ADD COLUMN IF NOT EXISTS message_timestamp bigint;

-- Index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_pending_images_msg_ts
  ON pending_images (phone_number, message_timestamp ASC NULLS LAST, created_at ASC);
