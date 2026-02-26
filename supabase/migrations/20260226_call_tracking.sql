-- Call Tracking Infrastructure for 3CX Call Log Audit System
-- Phase 10, Plan 01
-- Created: 2026-02-26

-- =====================================================
-- Table 1: call_audit_runs
-- Tracks each daily audit execution to prevent duplicate runs
-- =====================================================

CREATE TABLE call_audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_calls INTEGER DEFAULT 0,
  missing_callers INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(audit_date)
);

CREATE INDEX idx_audit_runs_date ON call_audit_runs(audit_date DESC);
CREATE INDEX idx_audit_runs_status ON call_audit_runs(status);

-- =====================================================
-- Table 2: call_records
-- Stores individual call records extracted from 3CX for each audit run
-- =====================================================

CREATE TABLE call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id UUID NOT NULL REFERENCES call_audit_runs(id) ON DELETE CASCADE,
  caller_phone TEXT NOT NULL,
  call_time TIMESTAMPTZ NOT NULL,
  target_number TEXT NOT NULL DEFAULT '22032770',
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  found_in_telegram BOOLEAN DEFAULT NULL,
  telegram_group TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_records_audit_run ON call_records(audit_run_id);
CREATE INDEX idx_call_records_phone ON call_records(caller_phone);
CREATE INDEX idx_call_records_found ON call_records(found_in_telegram) WHERE found_in_telegram IS NULL OR found_in_telegram = FALSE;

-- =====================================================
-- Table 3: caller_alerts
-- Tracks alert state and follow-up for each missing caller phone number
-- =====================================================

CREATE TABLE caller_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_phone TEXT NOT NULL,
  audit_run_id UUID NOT NULL REFERENCES call_audit_runs(id) ON DELETE CASCADE,
  call_record_id UUID REFERENCES call_records(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  alert_message_id TEXT,
  follow_up_message_id TEXT,
  resolution_type TEXT,
  resolution_note TEXT,
  alternative_phone TEXT,
  alerted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(caller_phone, audit_run_id)
);

CREATE INDEX idx_caller_alerts_status ON caller_alerts(status);
CREATE INDEX idx_caller_alerts_phone ON caller_alerts(caller_phone);
CREATE INDEX idx_caller_alerts_follow_up ON caller_alerts(status, alerted_at) WHERE status = 'alerted';

-- =====================================================
-- Row Level Security
-- =====================================================

ALTER TABLE call_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE caller_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON call_audit_runs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON call_records FOR ALL USING (true);
CREATE POLICY "Service role full access" ON caller_alerts FOR ALL USING (true);
