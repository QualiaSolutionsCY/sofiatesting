-- Autoresearch: Self-improving prompt optimization for Sophia
-- Tables for experiment tracking, learnings, and analytics tagging

-- 1. Experiments table: tracks baseline vs challenger prompt variants
CREATE TABLE IF NOT EXISTS sophia_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_key TEXT NOT NULL,                    -- sophia_prompts key being optimized (e.g., 'property_upload')
  status TEXT NOT NULL DEFAULT 'active',       -- active, completed, discarded

  -- Baseline
  baseline_version INTEGER NOT NULL,           -- sophia_prompts version number
  baseline_summary TEXT,                       -- short description
  baseline_hash TEXT,                          -- content hash for dedup

  -- Challenger
  challenger_version INTEGER NOT NULL,         -- sophia_prompts version number
  challenger_summary TEXT,                     -- what changed
  challenger_hash TEXT,
  hypothesis TEXT NOT NULL,                    -- why this change should improve the metric

  -- Metrics (populated during harvest)
  baseline_sessions INTEGER DEFAULT 0,         -- number of conversations measured
  baseline_metric NUMERIC,                     -- primary metric value (e.g., messages-to-upload)
  baseline_secondary NUMERIC,                  -- secondary metric (e.g., error rate)

  challenger_sessions INTEGER DEFAULT 0,
  challenger_metric NUMERIC,
  challenger_secondary NUMERIC,

  -- Results
  winner TEXT,                                 -- 'baseline' or 'challenger'
  win_reason TEXT,                             -- why it won
  learnings TEXT,                              -- what we learned (logged to learnings table too)

  -- Meta
  generation INTEGER NOT NULL DEFAULT 1,       -- how many experiments have run on this target
  min_sessions INTEGER NOT NULL DEFAULT 20,    -- minimum sessions before judging
  min_improvement NUMERIC NOT NULL DEFAULT 0.10, -- 10% minimum improvement threshold

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  UNIQUE(target_key, status) -- only one active experiment per target
);

CREATE INDEX idx_sophia_experiments_status ON sophia_experiments(status);
CREATE INDEX idx_sophia_experiments_target ON sophia_experiments(target_key);

-- 2. Learnings table: accumulated knowledge (the compounding resource)
CREATE TABLE IF NOT EXISTS sophia_experiment_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES sophia_experiments(id),
  target_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',     -- 'what_works', 'what_doesnt', 'general'
  learning TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sophia_learnings_target ON sophia_experiment_learnings(target_key);
CREATE INDEX idx_sophia_learnings_category ON sophia_experiment_learnings(category);

-- 3. Add experiment_id to whatsapp_analytics for tagging
ALTER TABLE whatsapp_analytics
  ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES sophia_experiments(id),
  ADD COLUMN IF NOT EXISTS experiment_variant TEXT; -- 'baseline' or 'challenger'

CREATE INDEX IF NOT EXISTS idx_analytics_experiment ON whatsapp_analytics(experiment_id) WHERE experiment_id IS NOT NULL;

-- 4. Skip list: prompt keys that should NEVER be experimented on
CREATE TABLE IF NOT EXISTS sophia_experiment_skip_list (
  key TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sophia_experiment_skip_list (key, reason) VALUES
  ('identity', 'Core brand identity - must not drift'),
  ('safety_rules', 'Safety and behavioral rules - non-negotiable')
ON CONFLICT (key) DO NOTHING;

-- 5. pg_cron schedule: run optimizer every 6 hours
-- NOTE: Run this manually in Supabase SQL editor (pg_cron extension required):
--
-- SELECT cron.schedule(
--   'prompt-optimizer',
--   '0 */6 * * *',
--   $$SELECT net.http_post(
--     url := 'https://vceeheaxcrhmpqueudqx.supabase.co/functions/v1/prompt-optimizer',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );$$
-- );
