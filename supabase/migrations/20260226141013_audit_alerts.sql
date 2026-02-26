-- Audit Alerts table for tracking missing-caller Telegram alerts
-- Phase 12, Plan 02

CREATE TABLE IF NOT EXISTS audit_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  call_date DATE NOT NULL,
  call_time TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'initial',
  telegram_message_id BIGINT,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_text TEXT,
  responded_by_telegram_id BIGINT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone_number, call_date, alert_type)
);

CREATE INDEX idx_audit_alerts_status ON audit_alerts(status);
CREATE INDEX idx_audit_alerts_phone ON audit_alerts(phone_number);
CREATE INDEX idx_audit_alerts_date ON audit_alerts(call_date);
CREATE INDEX idx_audit_alerts_message_id ON audit_alerts(telegram_message_id);

ALTER TABLE audit_alerts ENABLE ROW LEVEL SECURITY;
