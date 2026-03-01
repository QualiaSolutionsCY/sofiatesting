-- Migration: Add missing fields to agents table
-- Date: 2026-03-01
-- Description: Add whatsapp_phone_number, user_id, last_active_at fields for agent identification and activity tracking

-- Add WhatsApp identification field
ALTER TABLE agents ADD COLUMN IF NOT EXISTS whatsapp_phone_number VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_agents_whatsapp_phone ON agents(whatsapp_phone_number) WHERE whatsapp_phone_number IS NOT NULL;

-- Add Supabase auth user link
ALTER TABLE agents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id) WHERE user_id IS NOT NULL;

-- Add activity tracking
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_agents_last_active ON agents(last_active_at) WHERE last_active_at IS NOT NULL;

-- Add column comments for documentation
COMMENT ON COLUMN agents.whatsapp_phone_number IS 'WhatsApp phone number for agent identification (E.164 format)';
COMMENT ON COLUMN agents.user_id IS 'Link to Supabase auth user for web login';
COMMENT ON COLUMN agents.last_active_at IS 'Last activity timestamp for agent tracking';
