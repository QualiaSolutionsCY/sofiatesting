-- Add index on agent_phone for efficient upload history queries
-- Used by: supabase/functions/sophia-bot/tools/executor.ts (createPropertyListing tool)
-- Prevents full table scans when checking if agent has uploaded today
CREATE INDEX IF NOT EXISTS idx_listing_uploads_agent_phone
ON listing_uploads(agent_phone);

-- Add comment documenting the index purpose
COMMENT ON INDEX idx_listing_uploads_agent_phone IS
  'Supports upload history queries by agent phone number in createPropertyListing tool';
