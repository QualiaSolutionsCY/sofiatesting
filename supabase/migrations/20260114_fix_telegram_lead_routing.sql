-- Migration: Fix Telegram Lead Routing
-- Date: 2026-01-14
-- Description: Add missing RPC functions and indexes for lead routing

-- 1. Create increment_forward_count RPC function (was missing, caused silent failures)
CREATE OR REPLACE FUNCTION increment_forward_count(p_region TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE lead_forwarding_rotation
  SET forward_count = forward_count + 1,
      updated_at = NOW()
  WHERE region = p_region;
END;
$$ LANGUAGE plpgsql;

-- 2. Create composite index for deduplication (CRITICAL for performance)
-- Speeds up duplicate checks from O(n) to O(log n)
CREATE INDEX IF NOT EXISTS idx_telegram_leads_dedup
ON telegram_leads (property_reference_id, source_group_id, created_at DESC)
WHERE property_reference_id IS NOT NULL;

-- 3. Create atomic round-robin selection function (fixes race condition)
-- This prevents two concurrent requests from selecting the same agent
CREATE OR REPLACE FUNCTION select_next_agent_atomic(
  p_region TEXT,
  p_agent_ids UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_last_agent_id UUID;
  v_next_index INT;
  v_selected_id UUID;
  v_array_length INT;
BEGIN
  -- Get array length
  v_array_length := array_length(p_agent_ids, 1);

  -- Handle empty or null array
  IF v_array_length IS NULL OR v_array_length = 0 THEN
    RETURN NULL;
  END IF;

  -- Handle single agent
  IF v_array_length = 1 THEN
    v_selected_id := p_agent_ids[1];
  ELSE
    -- Get current rotation state with row lock
    SELECT last_forwarded_to_agent_id INTO v_last_agent_id
    FROM lead_forwarding_rotation
    WHERE region = p_region
    FOR UPDATE;

    -- Find next agent in rotation
    IF v_last_agent_id IS NULL THEN
      v_selected_id := p_agent_ids[1];
    ELSE
      v_next_index := 1;
      FOR i IN 1..v_array_length LOOP
        IF p_agent_ids[i] = v_last_agent_id THEN
          v_next_index := (i % v_array_length) + 1;
          EXIT;
        END IF;
      END LOOP;
      v_selected_id := p_agent_ids[v_next_index];
    END IF;
  END IF;

  -- Update rotation state atomically (upsert)
  INSERT INTO lead_forwarding_rotation (region, last_forwarded_to_agent_id, forward_count, updated_at)
  VALUES (p_region, v_selected_id, 1, NOW())
  ON CONFLICT (region) DO UPDATE
  SET last_forwarded_to_agent_id = v_selected_id,
      forward_count = lead_forwarding_rotation.forward_count + 1,
      updated_at = NOW();

  RETURN v_selected_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Create batch duplicate check function
-- Reduces N queries to 1 query for checking multiple property IDs
CREATE OR REPLACE FUNCTION check_recent_duplicates(
  p_property_ids TEXT[],
  p_group_id BIGINT,
  p_window_minutes INT DEFAULT 10
)
RETURNS TEXT[] AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT property_reference_id
      FROM telegram_leads
      WHERE property_reference_id = ANY(p_property_ids)
        AND source_group_id = p_group_id
        AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL
    ),
    ARRAY[]::TEXT[]
  );
$$ LANGUAGE sql STABLE;

-- 5. Create registration state management functions
-- Used instead of in-memory Map (which is lost on cold start)

CREATE OR REPLACE FUNCTION get_registration_state(p_user_id BIGINT)
RETURNS TABLE (step VARCHAR(20), created_at TIMESTAMPTZ) AS $$
  SELECT step, created_at
  FROM telegram_registration_state
  WHERE telegram_user_id = p_user_id
    AND expires_at > NOW();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION set_registration_state(
  p_user_id BIGINT,
  p_step VARCHAR(20)
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO telegram_registration_state (telegram_user_id, step, created_at, expires_at)
  VALUES (p_user_id, p_step, NOW(), NOW() + INTERVAL '5 minutes')
  ON CONFLICT (telegram_user_id) DO UPDATE
  SET step = p_step,
      created_at = NOW(),
      expires_at = NOW() + INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION clear_registration_state(p_user_id BIGINT)
RETURNS VOID AS $$
  DELETE FROM telegram_registration_state
  WHERE telegram_user_id = p_user_id;
$$ LANGUAGE sql;

-- 6. Add index on telegram_registration_state for faster lookups
CREATE INDEX IF NOT EXISTS idx_telegram_registration_state_user
ON telegram_registration_state (telegram_user_id);

-- 7. Cleanup function for expired registration states
CREATE OR REPLACE FUNCTION cleanup_expired_registrations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM telegram_registration_state
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
