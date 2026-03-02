-- Token Usage Tracking Views for AI Cost Monitoring
-- Created: 2026-03-02
-- Purpose: Enable per-agent cost tracking and budget controls (OBS-02)

-- 1. Agent Daily Token Usage View
CREATE OR REPLACE VIEW agent_daily_token_usage AS
SELECT
  agent_id,
  DATE(created_at) as usage_date,
  COUNT(*) as message_count,
  SUM(token_count) as total_tokens,
  AVG(token_count) as avg_tokens_per_message,
  MAX(token_count) as max_tokens
FROM whatsapp_analytics
WHERE event_type = 'message_sent' AND token_count IS NOT NULL
GROUP BY agent_id, DATE(created_at)
ORDER BY usage_date DESC, total_tokens DESC;

-- 2. Agent Monthly Cost Summary
CREATE OR REPLACE VIEW agent_monthly_token_usage AS
SELECT
  agent_id,
  DATE_TRUNC('month', created_at) as usage_month,
  COUNT(*) as message_count,
  SUM(token_count) as total_tokens,
  ROUND(SUM(token_count) * 0.000001, 4) as estimated_cost_usd
FROM whatsapp_analytics
WHERE event_type = 'message_sent' AND token_count IS NOT NULL
GROUP BY agent_id, DATE_TRUNC('month', created_at)
ORDER BY usage_month DESC, total_tokens DESC;

COMMENT ON VIEW agent_monthly_token_usage IS
  'Estimated costs assume $1.00 per 1M tokens (approximate OpenRouter pricing for Gemini 3 Flash). Actual costs vary by model and input/output ratio.';

-- 3. Performance Index for Token Usage Queries
CREATE INDEX IF NOT EXISTS whatsapp_analytics_agent_date_idx
  ON whatsapp_analytics(agent_id, created_at)
  WHERE event_type = 'message_sent' AND token_count IS NOT NULL;

COMMENT ON INDEX whatsapp_analytics_agent_date_idx IS
  'Optimizes agent-level token usage and cost aggregation queries';
