-- Migration: Add Telegram Lead Routing
-- Description: Add tables and columns for Telegram group lead routing

-- 1. Add columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS can_receive_leads BOOLEAN DEFAULT true;

-- 2. Create telegram_groups table for group configuration
CREATE TABLE IF NOT EXISTS telegram_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id BIGINT UNIQUE NOT NULL,
  group_name TEXT,
  group_type TEXT CHECK (group_type IN ('all', 'limassol', 'paphos', 'larnaca', 'nicosia', 'famagusta', 'others')),
  region TEXT,
  is_active BOOLEAN DEFAULT true,
  lead_routing_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create telegram_leads table for lead tracking
CREATE TABLE IF NOT EXISTS telegram_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_group_id BIGINT NOT NULL,
  source_group_name TEXT,
  original_message_id TEXT NOT NULL,
  original_message_text TEXT,
  sender_telegram_id BIGINT,
  sender_name TEXT,
  property_reference_id TEXT,
  property_region TEXT,
  forwarded_to_agent_id UUID REFERENCES agents(id),
  forwarded_to_telegram_id BIGINT,
  forwarded_message_id BIGINT,
  group_ack_message_id BIGINT,
  client_language TEXT,
  status TEXT DEFAULT 'forwarded' CHECK (status IN ('forwarded', 'contacted', 'closed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create lead_forwarding_rotation table for round-robin state
CREATE TABLE IF NOT EXISTS lead_forwarding_rotation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT UNIQUE NOT NULL,
  last_forwarded_to_agent_id UUID REFERENCES agents(id),
  forward_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_groups_group_id ON telegram_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_telegram_leads_source_group ON telegram_leads(source_group_id);
CREATE INDEX IF NOT EXISTS idx_telegram_leads_created ON telegram_leads(source_group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_leads_property ON telegram_leads(property_reference_id);
CREATE INDEX IF NOT EXISTS idx_agents_telegram ON agents(telegram_user_id) WHERE telegram_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_region_active ON agents(region, is_active) WHERE is_active = true;
