-- Migration: Production Readiness - Data Cleanup
-- Date: 2026-01-14
-- Description: Add pg_cron cleanup jobs for data retention

-- ==========================================
-- 1. ENABLE PG_CRON EXTENSION
-- ==========================================
-- Note: pg_cron must be enabled in Supabase Dashboard > Database > Extensions
-- This CREATE EXTENSION will work if already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==========================================
-- 2. CREATE CLEANUP LOGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS cleanup_logs (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  cleaned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleanup_logs_cleaned_at
ON cleanup_logs (cleaned_at DESC);

-- ==========================================
-- 3. CREATE CLEANUP FUNCTIONS
-- ==========================================

-- Cleanup old processed messages (keep 7 days for debugging)
CREATE OR REPLACE FUNCTION cleanup_old_processed_messages()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_processed_messages
  WHERE created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Only log if something was deleted
  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('telegram_processed_messages', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old chat history (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_chat_history()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_chat_history
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('telegram_chat_history', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Update existing cleanup function to add logging
CREATE OR REPLACE FUNCTION cleanup_expired_registrations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_registration_state
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('telegram_registration_state', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old webhook health logs (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_health_logs
  WHERE checked_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    INSERT INTO cleanup_logs (table_name, deleted_count, cleaned_at)
    VALUES ('webhook_health_logs', deleted_count, NOW());
  END IF;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Self-cleanup: remove old cleanup logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_cleanup_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cleanup_logs
  WHERE cleaned_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 4. CREATE WEBHOOK HEALTH LOGS TABLE (for Phase 3)
-- ==========================================
CREATE TABLE IF NOT EXISTS webhook_health_logs (
  id SERIAL PRIMARY KEY,
  webhook_url TEXT,
  pending_updates INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'error')),
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_health_checked_at
ON webhook_health_logs (checked_at DESC);

-- ==========================================
-- 5. SCHEDULE CRON JOBS
-- ==========================================
-- Note: These will fail silently if pg_cron is not enabled
-- Run daily at 3 AM UTC (low traffic time)

-- Cleanup processed messages daily
SELECT cron.schedule(
  'cleanup-processed-messages',
  '0 3 * * *',
  $$SELECT cleanup_old_processed_messages()$$
);

-- Cleanup chat history daily
SELECT cron.schedule(
  'cleanup-chat-history',
  '0 3 * * *',
  $$SELECT cleanup_old_chat_history()$$
);

-- Cleanup registration states hourly
SELECT cron.schedule(
  'cleanup-registrations',
  '0 * * * *',
  $$SELECT cleanup_expired_registrations()$$
);

-- Cleanup webhook logs daily
SELECT cron.schedule(
  'cleanup-webhook-logs',
  '0 4 * * *',
  $$SELECT cleanup_old_webhook_logs()$$
);

-- Self-cleanup weekly (Sundays at 4 AM)
SELECT cron.schedule(
  'cleanup-cleanup-logs',
  '0 4 * * 0',
  $$SELECT cleanup_old_cleanup_logs()$$
);

-- ==========================================
-- 6. ADD STATS FUNCTIONS (for Phase 5)
-- ==========================================

CREATE OR REPLACE FUNCTION get_lead_stats_by_region(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  region TEXT,
  lead_count BIGINT,
  forwarded_count BIGINT,
  failed_count BIGINT
) AS $$
  SELECT
    COALESCE(property_region, 'unknown') as region,
    COUNT(*) as lead_count,
    COUNT(*) FILTER (WHERE status = 'forwarded') as forwarded_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count
  FROM telegram_leads
  WHERE created_at > NOW() - (days_back || ' days')::INTERVAL
  GROUP BY property_region
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_lead_stats_by_agent(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  region TEXT,
  lead_count BIGINT
) AS $$
  SELECT
    a.id as agent_id,
    a.full_name as agent_name,
    a.region,
    COUNT(l.id) as lead_count
  FROM agents a
  LEFT JOIN telegram_leads l ON l.forwarded_to_agent_id = a.id
    AND l.created_at > NOW() - (days_back || ' days')::INTERVAL
  WHERE a.is_active = true AND a.can_receive_leads = true
  GROUP BY a.id, a.full_name, a.region
  ORDER BY lead_count DESC;
$$ LANGUAGE sql STABLE;
