-- Fix sophia_prompts unique constraint to allow multiple versions per key
-- The original UNIQUE(key) prevented autoresearch from creating challenger versions
ALTER TABLE sophia_prompts DROP CONSTRAINT IF EXISTS sophia_prompts_key_key;
ALTER TABLE sophia_prompts ADD CONSTRAINT sophia_prompts_key_version_key UNIQUE (key, version);
